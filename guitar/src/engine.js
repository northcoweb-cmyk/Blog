// Strum Coach — live engine: microphone, metronome, camera, saved progress.

// ---------- Saved progress (this browser only) ----------
const Store = (() => {
  const KEY = 'strumcoach.v1';
  const blank = () => ({
    v: 1,
    lessons: {},
    chords: {},
    changes: {},
    songs: {},
    riffs: {},
    rhythm: {},
    practice: {},
    tunedOn: null,
    settings: { lefty: false, swapHands: false, latency: 0.04, sensitivity: 1, clickVol: 0.6, micId: '', camId: '' },
  });
  let data;
  try {
    data = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}'));
    data.settings = Object.assign(blank().settings, data.settings);
  } catch {
    data = blank();
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };
  const today = () => new Date().toLocaleDateString('en-CA');
  return {
    get data() { return data; },
    save,
    today,
    set(fn) { fn(data); save(); },
    chord(id) { return (data.chords[id] ||= { tries: 0, clean: 0, issues: {}, strings: 0 }); },
    addPractice(secs) {
      const d = today();
      data.practice[d] = (data.practice[d] || 0) + secs;
      save();
    },
    practiceToday() { return data.practice[today()] || 0; },
    streak() {
      let n = 0;
      const d = new Date();
      if (!(data.practice[d.toLocaleDateString('en-CA')] >= 60)) d.setDate(d.getDate() - 1);
      while ((data.practice[d.toLocaleDateString('en-CA')] || 0) >= 60) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    reset() { data = blank(); save(); },
    import(json) {
      const parsed = JSON.parse(json);
      if (!parsed || parsed.v !== 1) throw new Error('Not a Strum Coach backup file');
      data = Object.assign(blank(), parsed);
      data.settings = Object.assign(blank().settings, parsed.settings);
      save();
    },
  };
})();

// ---------- Tiny event helper ----------
function Emitter() {
  const map = {};
  return {
    on(evt, fn) { (map[evt] ||= new Set()).add(fn); return () => map[evt].delete(fn); },
    emit(evt, arg) { map[evt]?.forEach((fn) => { try { fn(arg); } catch (e) { console.error(e); } }); },
  };
}

// ---------- Microphone ----------
const Mic = (() => {
  const ev = Emitter();
  const BUF = 2048;
  const self = {
    ...ev,
    ctx: null, stream: null, running: false, sr: 48000,
    ring: null, size: 0, total: 0, hopEnd: 1024, t0: 0,
    det: null, level: 0, lastOnsetPerf: 0, waits: [], error: null,

    ensureCtx() {
      if (!self.ctx) self.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      if (self.ctx.state === 'suspended') self.ctx.resume();
      return self.ctx;
    },

    async start(deviceId) {
      if (self.running) return true;
      self.error = null;
      try {
        const ctx = self.ensureCtx();
        const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
        if (deviceId) audio.deviceId = { exact: deviceId };
        self.stream = await navigator.mediaDevices.getUserMedia({ audio });
        self.sr = ctx.sampleRate;
        self.size = Math.round(self.sr * 6);
        self.ring = new Float32Array(self.size);
        self.total = 0;
        self.hopEnd = 1024;
        self.det = new DSP.OnsetDetector(self.sr);
        self.det.sensitivity = Store.data.settings.sensitivity;
        self.src = ctx.createMediaStreamSource(self.stream);
        self.proc = ctx.createScriptProcessor(BUF, 1, 1);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        self.src.connect(self.proc);
        self.proc.connect(mute).connect(ctx.destination);
        self.proc.onaudioprocess = (e) => self._chunk(e.inputBuffer.getChannelData(0), e.playbackTime);
        self.running = true;
        ev.emit('state', true);
        return true;
      } catch (e) {
        self.error = e.name === 'NotAllowedError'
          ? 'Microphone permission was blocked. Click the lock/camera icon in the address bar and allow the microphone, then try again.'
          : e.name === 'NotFoundError' ? 'No microphone found. Plug one in or check your system sound settings.' : String(e.message || e);
        ev.emit('state', false);
        return false;
      }
    },

    stop() {
      if (!self.running) return;
      self.proc.disconnect();
      self.src.disconnect();
      self.stream.getTracks().forEach((t) => t.stop());
      self.running = false;
      ev.emit('state', false);
    },

    _chunk(data, playbackTime) {
      if (self.total === 0) {
        // Input samples arrive roughly one buffer before their output slot.
        self.t0 = playbackTime - (2 * BUF) / self.sr;
      }
      for (let i = 0; i < data.length; i++) self.ring[(self.total + i) % self.size] = data[i];
      self.total += data.length;
      self.level = DSP.rms(data);
      while (self.hopEnd <= self.total) {
        const frame = self.read(self.hopEnd - 1024, 1024);
        const strength = self.det.push(frame);
        if (strength) {
          const abs = self.hopEnd - 768;
          self.lastOnsetPerf = performance.now();
          ev.emit('onset', { abs, time: self.timeOf(abs), strength });
        }
        self.hopEnd += 512;
      }
      if (self.waits.length) {
        const due = self.waits.filter((w) => w.at <= self.total);
        self.waits = self.waits.filter((w) => w.at > self.total);
        due.forEach((w) => w.fn());
      }
      ev.emit('level', self.level);
    },

    read(absStart, len) {
      const out = new Float32Array(len);
      const oldest = self.total - self.size;
      for (let i = 0; i < len; i++) {
        const a = absStart + i;
        out[i] = a < 0 || a < oldest || a >= self.total ? 0 : self.ring[a % self.size];
      }
      return out;
    },
    latest(len) { return self.read(self.total - len, len); },
    timeOf(abs) { return self.t0 + abs / self.sr; },
    // Resolve with `len` samples starting `delay` seconds after an onset, once they've arrived.
    capture(abs, delay, len) {
      const start = abs + Math.round(delay * self.sr);
      return new Promise((res) => self.waits.push({ at: start + len, fn: () => res(self.read(start, len)) }));
    },
    setSensitivity(v) { if (self.det) self.det.sensitivity = v; },
  };
  return self;
})();

// ---------- Metronome ----------
const Metro = (() => {
  let timer = null, next = 0, beat = 0, opts = null;
  const timeouts = [];
  function click(time, accent) {
    const ctx = Mic.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    // High-pitched click, well above the guitar range the strum detector listens to.
    o.frequency.value = accent ? 5200 : 4400;
    const vol = Store.data.settings.clickVol;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol * (accent ? 0.5 : 0.32), time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(time);
    o.stop(time + 0.06);
  }
  function tick() {
    const ctx = Mic.ctx;
    while (next < ctx.currentTime + 0.15) {
      const b = beat;
      if (!opts.silent) click(next, b % opts.beatsPerBar === 0);
      const delay = Math.max(0, (next - ctx.currentTime) * 1000);
      const t = next;
      timeouts.push(setTimeout(() => opts.onBeat?.(b, t), delay));
      next += 60 / opts.bpm;
      beat++;
      if (opts.totalBeats && beat >= opts.totalBeats) {
        const endAt = next;
        timeouts.push(setTimeout(() => { stop(); opts.onEnd?.(endAt); }, Math.max(0, (endAt - ctx.currentTime) * 1000)));
        clearInterval(timer);
        timer = null;
        return;
      }
    }
  }
  function start(o) {
    stop();
    const ctx = Mic.ensureCtx();
    opts = o;
    beat = 0;
    next = ctx.currentTime + 0.25;
    o.onStart?.(next);
    timer = setInterval(tick, 25);
    tick();
    return next;
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    timeouts.splice(0).forEach(clearTimeout);
  }
  return { start, stop, get running() { return !!timer; } };
})();

// ---------- Camera + hand tracking ----------
const Camera = (() => {
  const ev = Emitter();
  const MP_VER = '0.10.14';
  const self = {
    ...ev,
    active: false, loading: false, error: null, video: null, stream: null, landmarker: null,
    fret: null, strum: null, trail: [], hist: { fret: [], strum: [] }, context: null, lastSeen: { fret: 0, strum: 0 },
    arch: {},

    async start(deviceId) {
      if (self.active || self.loading) return true;
      self.loading = true;
      self.error = null;
      ev.emit('state');
      try {
        const video = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };
        if (deviceId) video.deviceId = { exact: deviceId };
        self.stream = await navigator.mediaDevices.getUserMedia({ video });
        self.video = document.createElement('video');
        self.video.muted = true;
        self.video.playsInline = true;
        self.video.srcObject = self.stream;
        await self.video.play();
        if (!self.landmarker) {
          const vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`);
          const files = await vision.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`);
          const opts = (delegate) => ({
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate,
            },
            runningMode: 'VIDEO', numHands: 2,
            minHandDetectionConfidence: 0.65, minHandPresenceConfidence: 0.65, minTrackingConfidence: 0.5,
          });
          try { self.landmarker = await vision.HandLandmarker.createFromOptions(files, opts('GPU')); }
          catch { self.landmarker = await vision.HandLandmarker.createFromOptions(files, opts('CPU')); }
        }
        self.active = true;
        self.loading = false;
        ev.emit('state');
        self._loop();
        return true;
      } catch (e) {
        self.loading = false;
        self.stream?.getTracks().forEach((t) => t.stop());
        self.error = e.name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow the camera in the address bar and try again.'
          : e.name === 'NotFoundError' ? 'No camera found.'
          : 'Could not start hand tracking (needs an internet connection the first time). ' + (e.message || e);
        ev.emit('state');
        return false;
      }
    },

    stop() {
      self.active = false;
      self.stream?.getTracks().forEach((t) => t.stop());
      self.fret = self.strum = null;
      ev.emit('state');
    },

    _loop() {
      let lastT = -1, lastRun = 0;
      const step = () => {
        if (!self.active) return;
        const now = performance.now();
        if (self.video.currentTime !== lastT && now - lastRun > 40) {
          lastT = self.video.currentTime;
          lastRun = now;
          try {
            const res = self.landmarker.detectForVideo(self.video, now);
            self._process(res, now);
          } catch (e) { console.warn(e); }
        }
        ev.emit('frame');
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    _process(res, now) {
      const s = Store.data.settings;
      // MediaPipe labels hands as if the image were mirrored; a raw webcam frame isn't,
      // so its "Left" is the player's right hand.
      let strumLabel = s.lefty ? 'Right' : 'Left';
      if (s.swapHands) strumLabel = strumLabel === 'Left' ? 'Right' : 'Left';
      let fret = null, strum = null;
      (res.landmarks || []).forEach((lm, i) => {
        const cat = res.handednesses?.[i]?.[0] || res.handedness?.[i]?.[0];
        const world = res.worldLandmarks?.[i];
        // Webcams sometimes see a mouth or face as a hand. Real hands get a confident
        // label and have hand-sized proportions.
        if (!cat || cat.score < 0.8 || !self._handShaped(world)) return;
        const hand = { lm, world, score: cat.score };
        if (cat.categoryName === strumLabel) { if (!strum || hand.score > strum.score) strum = hand; }
        else if (!fret || hand.score > fret.score) fret = hand;
      });
      // Only trust a hand after it has shown up in most recent frames (false hits flicker).
      self.hist.fret = [...self.hist.fret, !!fret].slice(-8);
      self.hist.strum = [...self.hist.strum, !!strum].slice(-8);
      const steady = (h) => h.filter(Boolean).length >= 5;
      if (!steady(self.hist.fret)) fret = null;
      if (!steady(self.hist.strum)) strum = null;
      self.fret = fret;
      self.strum = strum;
      if (fret) { self.lastSeen.fret = now; self._arch(fret); }
      if (strum) {
        self.lastSeen.strum = now;
        const y = (strum.lm[0].y + strum.lm[9].y) / 2;
        self.trail.push({ t: now, y });
      }
      while (self.trail.length && self.trail[0].t < now - 3000) self.trail.shift();
    },

    // Palm and finger lengths (in metres, from 3D landmarks) must look like a real hand.
    _handShaped(w) {
      if (!w) return true;
      const d = (a, b) => Math.hypot(w[a].x - w[b].x, w[a].y - w[b].y, w[a].z - w[b].z);
      const palm = d(0, 9), width = d(5, 17), index = d(5, 6) + d(6, 7) + d(7, 8);
      return palm > 0.05 && palm < 0.14 && width > 0.035 && width < 0.12 && index > 0.035 && index < 0.13;
    },

    // How curled each fretting finger is (from 3D joint angles). Flat fingers mute strings.
    _arch(hand) {
      const w = hand.world || hand.lm;
      const v = (a, b) => [w[b].x - w[a].x, w[b].y - w[a].y, w[b].z - w[a].z];
      const ang = (p, q) => {
        const d = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
        const m = Math.hypot(...p) * Math.hypot(...q) || 1;
        return (Math.acos(Math.max(-1, Math.min(1, d / m))) * 180) / Math.PI;
      };
      const F = { 1: [5, 6, 7, 8], 2: [9, 10, 11, 12], 3: [13, 14, 15, 16], 4: [17, 18, 19, 20] };
      for (const [f, [a, b, c, d]] of Object.entries(F)) {
        const bend = ang(v(a, b), v(b, c)) + ang(v(b, c), v(c, d));
        const prev = self.arch[f] ?? bend;
        self.arch[f] = prev * 0.7 + bend * 0.3;
      }
    },

    seen(which, withinMs = 700) { return performance.now() - self.lastSeen[which] < withinMs; },

    fingerState(f) {
      const b = self.arch[f];
      if (b == null) return null;
      return b >= 55 ? 'curled' : b < 35 ? 'flat' : 'ok';
    },

    // Which way was the strumming hand moving when a strum was heard? ('D', 'U' or null)
    directionAt(audioTime) {
      if (!self.active || !self.seen('strum', 500) || !Mic.ctx) return null;
      const perf = performance.now() + (audioTime - Mic.ctx.currentTime) * 1000;
      const pts = self.trail.filter((p) => p.t >= perf - 140 && p.t <= perf + 60);
      if (pts.length < 2) return null;
      const dy = pts[pts.length - 1].y - pts[0].y;
      if (Math.abs(dy) < 0.012) return null;
      return dy > 0 ? 'D' : 'U';
    },

    // Is the strumming hand still moving (pendulum), or has it stopped?
    strumMotion() {
      const now = performance.now();
      const pts = self.trail.filter((p) => p.t > now - 700);
      if (pts.length < 4) return null;
      const ys = pts.map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys);
    },
  };
  return self;
})();

// Practice-time tracker: counts time while you're actually playing.
setInterval(() => {
  if (Mic.running && performance.now() - Mic.lastOnsetPerf < 20000) Store.addPractice(5);
}, 5000);
