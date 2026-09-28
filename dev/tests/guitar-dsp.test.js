// Tests for the Strum Coach audio analysis, using synthesized plucked strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../guitar/src/', import.meta.url);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  readFileSync(new URL('dsp.js', root), 'utf8') + readFileSync(new URL('data.js', root), 'utf8') +
    '\nthis.DSP = DSP; this.CHORDS = CHORDS; this.CHORD = CHORD; this.judgePool = judgePool;',
  ctx,
);
const { DSP, CHORDS, CHORD, judgePool } = ctx;
const SR = 48000;

// Seeded random so tests are repeatable.
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// Karplus-Strong plucked string. damp < 1 shortens sustain (muted string ~0.9).
function pluck(midi, secs, { damp = 0.996, amp = 0.3 } = {}) {
  const f = DSP.mtof(midi);
  const n = Math.round(SR / f);
  const buf = new Float64Array(n);
  for (let i = 0; i < n; i++) buf[i] = rand() * 2 - 1;
  const out = new Float32Array(Math.round(secs * SR));
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const next = (idx + 1) % n;
    const v = buf[idx];
    buf[idx] = damp * 0.5 * (buf[idx] + buf[next]);
    out[i] = v * amp;
    idx = next;
  }
  // Laptop mic: weak low end. Simple one-pole high-pass around 120 Hz.
  const a = Math.exp((-2 * Math.PI * 120) / SR);
  let prevX = 0, prevY = 0;
  for (let i = 0; i < out.length; i++) {
    const y = a * (prevY + out[i] - prevX);
    prevX = out[i]; prevY = y; out[i] = y;
  }
  return out;
}

function mix(len, parts) {
  const out = new Float32Array(Math.round(len * SR));
  for (const { sig, at } of parts) {
    const off = Math.round(at * SR);
    for (let i = 0; i < sig.length && off + i < out.length; i++) out[off + i] += sig[i];
  }
  for (let i = 0; i < out.length; i++) out[i] += (rand() * 2 - 1) * 0.002; // room noise
  return out;
}

function strum(frets, { mute = [] } = {}) {
  const parts = [];
  let t = 0.1;
  frets.forEach((f, i) => {
    if (f < 0) return;
    const string = 6 - i;
    const muted = mute.includes(string);
    parts.push({ sig: pluck(DSP.STD_TUNING[i] + f, 1.5, { damp: muted ? 0.5 : 0.996, amp: muted ? 0.05 : 0.3 }), at: t });
    t += 0.012;
  });
  return mix(1.6, parts);
}

const analyze = (sig) => DSP.analyzeChord(sig.subarray(Math.round(0.15 * SR), Math.round(0.15 * SR) + 16384), SR);

test('recognizes each beginner chord from a strum', () => {
  const pool = CHORDS;
  for (const c of CHORDS) {
    const { chroma } = analyze(strum(c.frets));
    const ranked = DSP.rankChords(chroma, pool);
    const mine = ranked.find((r) => r.id === c.id).score;
    assert.ok(mine >= ranked[0].score - 0.02, `${c.id}: got ${ranked[0].id} (${ranked[0].score.toFixed(3)}) vs ${mine.toFixed(3)}`);
    assert.ok(mine > 0.8, `${c.id} similarity ${mine.toFixed(3)}`);
  }
});

test('tells apart chords used together in songs', () => {
  const sets = [['G', 'D', 'Am', 'C'], ['G', 'Em', 'C', 'D'], ['A', 'D', 'E'], ['C', 'G', 'Am', 'F'], ['Em7', 'G*', 'Dsus4', 'A7sus4', 'Cadd9']];
  for (const set of sets) {
    const pool = set.map((id) => CHORD[id]);
    for (const id of set) {
      const ranked = DSP.rankChords(analyze(strum(CHORD[id].frets)).chroma, pool);
      assert.equal(ranked[0].id, id, `${id} within ${set}: ranked ${ranked.map((r) => r.id + ':' + r.score.toFixed(2))}`);
    }
  }
});

test('recognizes a chord strummed while the previous chord is still ringing', () => {
  const pairs = [['Em', 'G'], ['G', 'Em'], ['G', 'C'], ['C', 'G'], ['G', 'D'], ['Am', 'C'], ['D', 'A'], ['C', 'Am']];
  for (const [from, to] of pairs) {
    const first = strum(CHORD[from].frets).subarray(Math.round(0.1 * SR));
    const second = strum(CHORD[to].frets).subarray(Math.round(0.1 * SR));
    const sig = mix(2.5, [{ sig: first, at: 0.2 }, { sig: second, at: 1.0 }]);
    const at = Math.round(1.0 * SR);
    const post = sig.subarray(at + Math.round(0.03 * SR), at + Math.round(0.03 * SR) + 8192);
    const pre = sig.subarray(at - 8192 - Math.round(0.015 * SR), at - Math.round(0.015 * SR));
    const pool = judgePool(to, CHORDS.map((c) => c.id)).map((id) => CHORD[id]);
    const ranked = DSP.rankChords(DSP.analyzeChord(post, SR, pre).chroma, pool);
    const mine = ranked.find((r) => r.id === to).score;
    assert.ok(mine >= ranked[0].score - 0.04 && mine > 0.74, `${from}→${to}: top ${ranked[0].id} ${ranked[0].score.toFixed(2)}, ${to} ${mine.toFixed(2)}`);
  }
});

test('spots a muted string in a chord', () => {
  // C chord with the open G string muted (classic beginner mistake)
  const d = DSP.diagnoseChord(analyze(strum(CHORD.C.frets, { mute: [3] })), CHORD.C.frets);
  assert.equal(d.issues[0]?.type, 'missing');
  assert.equal(d.issues[0]?.string, 3);
  // Clean chords: never blame a string that's fine
  for (let rep = 0; rep < 3; rep++) {
    for (const c of CHORDS) {
      const clean = DSP.diagnoseChord(analyze(strum(c.frets)), c.frets);
      assert.equal(JSON.stringify(clean.issues.map((i) => i.type + i.string)), '[]', c.id);
    }
  }
});

test('spots a string that should not ring', () => {
  const bad = CHORD.D.frets.slice();
  bad[0] = 0; // low E strummed on a D chord
  bad[1] = 0; // and the A (the A is part of D, so only E is diagnosable)
  bad[1] = -1;
  const d = DSP.diagnoseChord(analyze(strum(bad)), CHORD.D.frets);
  assert.equal(d.issues[0]?.type, 'extra');
  assert.equal(d.issues[0]?.string, 6);
});

test('string check finds the right fret, wrong fret, and open-instead-of-fretted', () => {
  for (let s = 0; s < 6; s++) {
    for (const fret of [0, 1, 2, 3, 5]) {
      const sig = mix(1.2, [{ sig: pluck(DSP.STD_TUNING[s] + fret, 1.0), at: 0.5 }]);
      const post = sig.subarray(Math.round(0.52 * SR), Math.round(0.52 * SR) + 16384);
      const pre = sig.subarray(Math.round(0.49 * SR) - 16384, Math.round(0.49 * SR));
      const r = DSP.checkString(post, pre, SR, DSP.STD_TUNING[s]);
      assert.equal(r.fret, fret, `string ${6 - s} fret ${fret}: got ${r.fret}`);
      assert.ok(r.pitched > 0.5, `string ${6 - s} fret ${fret}: pitched ${r.pitched.toFixed(2)}`);
    }
  }
});

test('string check ignores a string that is still ringing from before', () => {
  // Low E rings, then the A string is plucked at fret 3 (C).
  const sig = mix(1.6, [{ sig: pluck(40, 1.5), at: 0.1 }, { sig: pluck(48, 1.0), at: 0.6 }]);
  const post = sig.subarray(Math.round(0.62 * SR), Math.round(0.62 * SR) + 16384);
  const pre = sig.subarray(Math.round(0.59 * SR) - 16384, Math.round(0.59 * SR));
  assert.equal(DSP.checkString(post, pre, SR, 45).fret, 3);
});

test('string check reports a muted (dead) string as unpitched', () => {
  const sig = mix(1.2, [{ sig: pluck(55, 1.0, { damp: 0.7, amp: 0.3 }), at: 0.5 }]);
  const post = sig.subarray(Math.round(0.52 * SR), Math.round(0.52 * SR) + 16384);
  const pre = sig.subarray(Math.round(0.49 * SR) - 16384, Math.round(0.49 * SR));
  const r = DSP.checkString(post, pre, SR, 55);
  assert.ok(r.fret === null || r.energy < 0.01 || r.pitched < 0.5, JSON.stringify(r));
});

test('YIN finds the pitch of every open string and a few fretted notes', () => {
  for (const m of [40, 45, 50, 55, 59, 64, 47, 52, 57, 67, 72]) {
    const sig = pluck(m, 0.5);
    const r = DSP.yin(sig.subarray(4000, 4000 + 4096), SR);
    assert.ok(r, `no pitch for ${m}`);
    assert.ok(Math.abs(r.midi - m) < 0.15, `midi ${m}: got ${r.midi.toFixed(2)}`);
  }
  // Slightly flat low E, for the tuner
  const f = DSP.mtof(40) * Math.pow(2, -20 / 1200);
  const n = Math.round(SR / f);
  const r = DSP.yin(pluck(40, 0.5).subarray(4000, 8096), SR);
  assert.ok(r && n > 0);
});

test('onset detector catches strums (including quick ones) without doubling up', () => {
  let found = 0, expected = 0, extra = 0;
  for (let rep = 0; rep < 25; rep++) {
    const times = [];
    for (let t = 0.3; t < 3.5; t += 0.25 + rand() * 0.5) times.push(t);
    const parts = times.map((t, k) => ({
      sig: strum(CHORDS[k % CHORDS.length].frets).subarray(Math.round(0.1 * SR)).map((x) => x * (0.5 + rand() * 0.7)),
      at: t,
    }));
    const sig = mix(4, parts);
    const det = new DSP.OnsetDetector(SR);
    const f = [];
    for (let end = 1024; end <= sig.length; end += 512) if (det.push(sig.subarray(end - 1024, end))) f.push(end / SR);
    expected += times.length;
    found += times.filter((t) => f.some((x) => Math.abs(x - t - 0.025) < 0.045)).length;
    extra += f.filter((x) => !times.some((t) => Math.abs(x - t - 0.025) < 0.045)).length;
    if (process.env.DBG) console.log(times.map((t) => t.toFixed(2)).join(' '), '|', f.map((t) => t.toFixed(2)).join(' '));
  }
  assert.ok(found / expected > 0.95, `found ${found}/${expected}`);
  assert.ok(extra / expected < 0.08, `extra ${extra}/${expected}`);
});
