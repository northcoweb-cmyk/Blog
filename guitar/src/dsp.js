// Strum Coach — audio analysis ("the ears").
// Pure functions only: every function takes raw samples and returns numbers,
// so the whole thing can be tested in Node with synthesized guitar sounds.

const DSP = (() => {
  const STD_TUNING = [40, 45, 50, 55, 59, 64]; // MIDI, string 6 (low E) -> string 1 (high e)
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ftom = (f) => 69 + 12 * Math.log2(f / 440);
  const noteName = (m) => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12];
  const noteNameOct = (m) => noteName(m) + (Math.floor(Math.round(m) / 12) - 1);

  // ---------- FFT ----------
  const hannCache = new Map();
  function hann(n) {
    if (!hannCache.has(n)) {
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      hannCache.set(n, w);
    }
    return hannCache.get(n);
  }

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const cr = Math.cos(ang * k), ci = Math.sin(ang * k);
        for (let i = k; i < n; i += len) {
          const b = i + half;
          const tr = re[b] * cr - im[b] * ci;
          const ti = re[b] * ci + im[b] * cr;
          re[b] = re[i] - tr; im[b] = im[i] - ti;
          re[i] += tr; im[i] += ti;
        }
      }
    }
  }

  // Magnitude spectrum (length n/2) of a Hann-windowed frame.
  function magSpectrum(samples) {
    const n = samples.length;
    const w = hann(n);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = samples[i] * w[i];
    fft(re, im);
    const mag = new Float64Array(n >> 1);
    for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]) / n;
    return mag;
  }

  function rms(samples, start = 0, end = samples.length) {
    let s = 0;
    for (let i = start; i < end; i++) s += samples[i] * samples[i];
    return Math.sqrt(s / Math.max(1, end - start));
  }

  // ---------- Spectral peaks ----------
  // Local maxima above a local floor, with parabolic interpolation for accurate frequency.
  function peaks(mag, sr, n, fmin = 65, fmax = 1600) {
    const binHz = sr / n;
    const k0 = Math.max(2, Math.floor(fmin / binHz));
    const k1 = Math.min(mag.length - 3, Math.ceil(fmax / binHz));
    const out = [];
    let max = 0;
    for (let k = k0; k <= k1; k++) if (mag[k] > max) max = mag[k];
    if (max <= 0) return out;
    const floorWin = Math.max(4, Math.round(40 / binHz)); // ~±40 Hz neighbourhood
    for (let k = k0; k <= k1; k++) {
      const b = mag[k];
      if (!(b > mag[k - 1] && b >= mag[k + 1])) continue;
      if (b < max * 0.02) continue;
      let sum = 0, cnt = 0;
      for (let j = Math.max(1, k - floorWin); j <= Math.min(mag.length - 1, k + floorWin); j++) {
        if (Math.abs(j - k) <= 2) continue;
        sum += mag[j]; cnt++;
      }
      const floor = cnt ? sum / cnt : 0;
      if (b < floor * 2.5) continue;
      const a = mag[k - 1], g = mag[k + 1];
      const den = a - 2 * b + g;
      const p = den !== 0 ? (0.5 * (a - g)) / den : 0;
      const f = (k + p) * binHz;
      out.push({ f, midi: ftom(f), amp: b - floor });
    }
    return out;
  }

  // ---------- Chroma (which of the 12 notes are sounding) ----------
  function chromaFromPeaks(pk) {
    const c = new Float64Array(12);
    for (const p of pk) {
      const n = Math.round(p.midi);
      const dev = Math.abs(p.midi - n);
      if (dev > 0.4) continue;
      c[((n % 12) + 12) % 12] += Math.sqrt(p.amp) * (1 - dev);
    }
    return normalize(c);
  }

  function normalize(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    s = Math.sqrt(s) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= s;
    return v;
  }

  function cosine(a, b) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += a[i] * b[i];
    return s;
  }

  const HARM_W = [1, 0.8, 0.6, 0.45, 0.35, 0.3, 0.25, 0.2];
  // Expected chroma for a set of sounding MIDI notes, including overtones.
  function templateFromMidis(midis) {
    const c = new Float64Array(12);
    for (const m of midis) {
      for (let h = 1; h <= HARM_W.length; h++) {
        if (mtof(m) * h > 1600) break;
        const pc = (((m + Math.round(12 * Math.log2(h))) % 12) + 12) % 12;
        c[pc] += Math.sqrt(HARM_W[h - 1]);
      }
    }
    return normalize(c);
  }

  function chordMidis(frets, tuning = STD_TUNING) {
    const out = [];
    frets.forEach((f, i) => { if (f >= 0) out.push(tuning[i] + f); });
    return out;
  }

  // Rank candidate chords ({id, frets}) against a chroma vector.
  function rankChords(chroma, chords) {
    return chords
      .map((c) => ({ id: c.id, score: cosine(chroma, c._tpl || (c._tpl = templateFromMidis(chordMidis(c.frets)))) }))
      .sort((a, b) => b.score - a.score);
  }

  // Figure out *which string* is the problem when a chord sounds wrong.
  // Each string is checked at the exact frequencies only it produces (its fundamental and
  // overtones that no other string in the chord shares). A string with no energy there is
  // muted; a should-be-silent string with energy there is ringing when it shouldn't.
  function diagnoseChord(an, frets, snrMissing = 8) {
    const { mag, sr, n } = an;
    const binHz = sr / n;
    const sounding = [];
    frets.forEach((f, i) => { if (f >= 0) sounding.push({ string: 6 - i, midi: STD_TUNING[i] + f }); });
    const harmonicsOf = (m) => [1, 2, 3, 4, 5].map((h) => mtof(m) * h).filter((f) => f < 1600);
    // Peak-to-floor ratio right at one frequency: ~1 = nothing there, big = a note is ringing.
    const snrAt = (f) => {
      const c = f / binHz, w = Math.max(1, Math.round(c * 0.012)); // ±~0.2 semitone
      let pkv = 0;
      for (let k = Math.round(c) - w; k <= Math.round(c) + w; k++) {
        // Only a real peak counts, not the slope of a neighbouring note.
        if ((mag[k] || 0) > pkv && mag[k] >= (mag[k - 1] || 0) && mag[k] >= (mag[k + 1] || 0)) pkv = mag[k];
      }
      const lo = Math.max(1, Math.round(c * 0.9)), hi = Math.round(c * 1.1);
      const around = [];
      for (let k = lo; k <= hi; k++) if (Math.abs(k - c) > w + 1) around.push(mag[k] || 0);
      around.sort((a, b) => a - b);
      const floor = around[Math.floor(around.length * 0.3)] || 1e-9;
      return pkv ? pkv / Math.max(floor, 1e-9) : 1;
    };
    const uniqueEvidence = (m, others) => {
      const otherH = others.flatMap((o) => [1, 2, 3, 4, 5, 6].map((h) => ftom(mtof(o) * h)));
      const mine = harmonicsOf(m).filter((f) => f > 125 && !otherH.some((o) => Math.abs(o - ftom(f)) < 0.6));
      // Need two separate overtones to judge: one alone can vanish depending on where you pick.
      if (mine.length < 2) return null;
      return Math.max(...mine.map(snrAt));
    };
    const ev = sounding.map((s) => ({ ...s, e: uniqueEvidence(s.midi, sounding.filter((o) => o !== s).map((o) => o.midi)) }));
    const issues = [];
    for (const x of ev) if (x.e !== null && x.e < snrMissing) issues.push({ type: 'missing', string: x.string, snr: x.e });
    frets.forEach((f, i) => {
      if (f >= 0) return;
      const e = uniqueEvidence(STD_TUNING[i], sounding.map((o) => o.midi));
      if (e !== null && e > 12) issues.push({ type: 'extra', string: 6 - i, snr: e });
    });
    issues.sort((a, b) => (a.type === 'missing' ? a.snr : 100 / a.snr) - (b.type === 'missing' ? b.snr : 100 / b.snr));
    return { issues, checked: ev.filter((x) => x.e !== null).map((x) => x.string), evidence: ev };
  }

  // Count distinct notes clearly present (to tell a strum from a single plucked string).
  function distinctNotes(chroma) {
    let n = 0;
    for (let i = 0; i < 12; i++) if (chroma[i] > 0.3) n++;
    return n;
  }

  // Full chord analysis of a frame of samples (use ~8192–16384 samples, starting just after the strum).
  // Pass `pre` (samples from just before the strum) to ignore whatever was still ringing
  // from the previous chord.
  function analyzeChord(samples, sr, pre = null) {
    const mag = magSpectrum(samples);
    if (pre && pre.length === samples.length) {
      const mp = magSpectrum(pre);
      for (let i = 0; i < mag.length; i++) mag[i] = Math.max(0, mag[i] - mp[i] * 0.9);
    }
    const pk = peaks(mag, sr, samples.length);
    const chroma = chromaFromPeaks(pk);
    return { chroma, peaks: pk, notes: distinctNotes(chroma), mag, sr, n: samples.length };
  }

  // ---------- Single-string check (was the right note played on this string?) ----------
  // post: samples after the pluck, pre: samples just before it (so strings still ringing
  // from earlier plucks are subtracted out). Returns the most likely fret on that string.
  function checkString(post, pre, sr, openMidi, maxFret = 12) {
    const n = post.length;
    const mPost = magSpectrum(post);
    const mPre = pre ? magSpectrum(pre) : null;
    const diff = new Float64Array(mPost.length);
    for (let i = 0; i < diff.length; i++) diff[i] = Math.max(0, mPost[i] - (mPre ? mPre[i] * 1.05 : 0));
    const pk = peaks(diff, sr, n, 60, 2500);
    let total = 0;
    for (const p of pk) total += p.amp;
    if (!pk.length || total <= 0) return { fret: null, confidence: 0, pitched: 0, energy: rms(post) };

    const scoreFor = (m) => {
      let s = 0;
      for (let h = 1; h <= 6; h++) {
        const target = ftom(mtof(m) * h);
        let bestAmp = 0, bestIdx = -1;
        pk.forEach((p, idx) => {
          if (Math.abs(p.midi - target) < 0.35 && p.amp > bestAmp) { bestAmp = p.amp; bestIdx = idx; }
        });
        if (bestIdx >= 0) s += Math.sqrt(HARM_W[h - 1]) * Math.sqrt(bestAmp);
      }
      // How much of the new sound is explained by this note's harmonic series.
      const f0 = mtof(m);
      let explained = 0;
      for (const p of pk) {
        const h = Math.round(p.f / f0);
        if (h >= 1 && Math.abs(ftom(p.f) - ftom(f0 * h)) < 0.35) explained += p.amp;
      }
      // Peaks halfway between harmonics mean the real note is an octave lower
      // (laptop mics barely pick up the low E's fundamental, so this matters).
      let sub = 0;
      for (let h = 1; h <= 3; h++) {
        const target = ftom(mtof(m) * (h + 0.5));
        for (const p of pk) if (Math.abs(p.midi - target) < 0.35) sub = Math.max(sub, Math.sqrt(p.amp));
      }
      return { s: s - sub * 1.2, explained };
    };

    let best = null, second = null;
    for (let fret = 0; fret <= maxFret; fret++) {
      const r = scoreFor(openMidi + fret);
      const cand = { fret, ...r };
      if (!best || cand.s > best.s) { second = best; best = cand; }
      else if (!second || cand.s > second.s) second = cand;
    }
    const pitched = best.explained / total; // how much of the new sound is a clean note
    const confidence = second && best.s > 0 ? 1 - second.s / best.s : 1;
    return { fret: best.fret, midi: openMidi + best.fret, confidence, pitched, energy: rms(post) };
  }

  // ---------- Pitch (tuner / single notes): YIN ----------
  function yin(buf, sr, fmin = 70, fmax = 1100, threshold = 0.12) {
    const maxTau = Math.min(Math.floor(sr / fmin), buf.length >> 1);
    const minTau = Math.max(2, Math.floor(sr / fmax));
    const W = buf.length - maxTau;
    const d = new Float64Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const x = buf[i] - buf[i + tau];
        s += x * x;
      }
      d[tau] = s;
    }
    const cmnd = new Float64Array(maxTau + 1);
    cmnd[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      run += d[tau];
      cmnd[tau] = run > 0 ? (d[tau] * tau) / run : 1;
    }
    let tau = -1;
    for (let t = minTau; t < maxTau; t++) {
      if (cmnd[t] < threshold) {
        while (t + 1 < maxTau && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      let minV = Infinity;
      for (let t = minTau; t < maxTau; t++) if (cmnd[t] < minV) { minV = cmnd[t]; tau = t; }
      if (minV > 0.35) return null;
    }
    const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau];
    const den = a - 2 * b + c;
    const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
    const f = sr / (tau + shift);
    return { freq: f, midi: ftom(f), clarity: 1 - b };
  }

  // ---------- Onsets (a string was plucked / strummed) ----------
  // Feed hops of 512 samples; returns true when a new attack starts.
  class OnsetDetector {
    constructor(sr) {
      this.sr = sr;
      this.n = 1024;
      this.prev = null;
      this.hist = [];
      this.lastOnset = -Infinity;
      this.hopIndex = 0;
      this.noise = 0.002;
      this.sensitivity = 1;
      this.frames = [];
      this.rmsWin = [];
    }
    // frame: last 1024 samples ending at this hop. Returns strength (>0) on onset, else 0.
    push(frame) {
      this.hopIndex++;
      const r = rms(frame);
      // Background noise: follows quiet moments down instantly, creeps up slowly (~15 s to
      // double), so continuous playing doesn't get mistaken for background noise.
      this.noise = Math.max(0.0003, Math.min(this.noise * 1.0005, r));
      const mag = magSpectrum(frame);
      const binHz = this.sr / this.n;
      const k0 = Math.floor(70 / binHz), k1 = Math.ceil(3000 / binHz);
      const lm = new Float64Array(k1 - k0 + 1);
      for (let k = k0; k <= k1; k++) lm[k - k0] = Math.log1p(1000 * mag[k]);
      // SuperFlux: compare with a frequency-max-filtered frame from 2 hops ago, so the
      // wobble of strings that are already ringing doesn't look like a new strum.
      this.frames.push(lm);
      if (this.frames.length > 3) this.frames.shift();
      let flux = 0;
      if (this.frames.length === 3) {
        const ref = this.frames[0];
        for (let i = 0; i < lm.length; i++) {
          const r = Math.max(ref[i], ref[i - 1] ?? 0, ref[i + 1] ?? 0);
          flux += Math.max(0, lm[i] - r);
        }
      }
      // Loudness jump versus ~50 ms ago also counts (helps soft upstrokes).
      this.rmsWin.push(r);
      if (this.rmsWin.length > 6) this.rmsWin.shift();
      const jump = this.rmsWin.length === 6 ? r / Math.max(1e-6, this.rmsWin[0]) : 1;
      const h = this.hist;
      const sorted = h.slice().sort((a, b) => a - b);
      const med = sorted.length ? sorted[sorted.length >> 1] : 0;
      h.push(flux);
      if (h.length > 24) h.shift();
      const thr = med * 1.4 + 4.5 / this.sensitivity;
      const gate = Math.max(0.003, this.noise * 4) / this.sensitivity;
      const minGapHops = Math.round((0.12 * this.sr) / 512);
      const hit = flux > thr || (jump > 1.7 && flux > thr * 0.5);
      if (hit && r > gate && this.hopIndex - this.lastOnset >= minGapHops) {
        this.lastOnset = this.hopIndex;
        return flux;
      }
      return 0;
    }
  }

  return {
    STD_TUNING, NOTE_NAMES, mtof, ftom, noteName, noteNameOct,
    fft, magSpectrum, rms, peaks, chromaFromPeaks, templateFromMidis, chordMidis,
    rankChords, diagnoseChord, analyzeChord, checkString, yin, cosine, distinctNotes, OnsetDetector,
  };
})();
