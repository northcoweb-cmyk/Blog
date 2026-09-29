// Strum Coach — exercises. Each one renders into `root` and returns a cleanup function.

// ---------- Small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fingerName = (f) => FINGER_NAMES[f] || 'a';
const stringLabel = (s) => `string ${s} (${STRING_NAMES[s]})`;
const openMidi = (s) => DSP.STD_TUNING[6 - s];

function toast(msg, ms = 2200) {
  let t = $('#toast');
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

function chordSVG(chord, { w = 180, status = {}, fingers = true } = {}) {
  const lefty = Store.data.settings.lefty;
  const played = chord.frets.filter((f) => f > 0);
  const maxF = Math.max(3, ...played);
  const minF = played.length ? Math.min(...played) : 1;
  const base = maxF > 4 ? minF : 1;
  const rows = Math.max(4, maxF - base + 1);
  const pad = w * 0.14, top = w * 0.2, sp = (w - pad * 2) / 5, fh = sp * 1.2;
  const h = top + rows * fh + w * 0.06;
  const X = (i) => pad + (lefty ? 5 - i : i) * sp;
  const col = (s) => ({ ok: 'var(--ok)', bad: 'var(--bad)', cur: 'var(--accent)' })[status[s]];
  let g = '';
  for (let r = 0; r <= rows; r++) {
    const y = top + r * fh;
    const nut = r === 0 && base === 1;
    g += `<line x1="${pad}" x2="${w - pad}" y1="${y}" y2="${y}" style="stroke:${nut ? 'var(--text)' : 'var(--line)'};stroke-width:${nut ? w * 0.03 : 2}" />`;
  }
  if (base > 1) g += `<text x="${pad - 8}" y="${top + fh * 0.62}" text-anchor="end" style="fill:var(--muted);font-size:${w * 0.09}px;font-weight:700">${base}fr</text>`;
  chord.frets.forEach((f, i) => {
    const s = 6 - i, x = X(i), c = col(s);
    g += `<line x1="${x}" x2="${x}" y1="${top}" y2="${top + rows * fh}" style="stroke:${c || 'var(--muted)'};stroke-width:${c ? 3.5 : 1 + (5 - i) * 0.35}" />`;
    const my = top - w * 0.08;
    if (f < 0) g += `<text x="${x}" y="${my + w * 0.035}" text-anchor="middle" style="fill:${c || 'var(--dim)'};font-size:${w * 0.1}px;font-weight:800">×</text>`;
    else if (f === 0) g += `<circle cx="${x}" cy="${my}" r="${w * 0.035}" style="fill:${c || 'none'};stroke:${c || 'var(--muted)'};stroke-width:2" />`;
    else {
      const y = top + (f - base + 0.5) * fh;
      g += `<circle cx="${x}" cy="${y}" r="${sp * 0.38}" style="fill:${c || 'var(--accent)'}" />`;
      if (fingers && chord.fingers?.[i]) g += `<text x="${x}" y="${y + sp * 0.14}" text-anchor="middle" style="fill:#1b1206;font-size:${sp * 0.42}px;font-weight:900">${chord.fingers[i]}</text>`;
    }
  });
  return `<svg class="diagram" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(chord.name || chord.id)} chord diagram">${g}</svg>`;
}

function diagramBlock(chord, opts = {}) {
  return `<div class="diagram-wrap ${opts.next ? 'next' : ''}"><div class="label">${esc(chord.id)}</div>${chordSVG(chord, opts)}${opts.caption ? `<div class="small muted">${opts.caption}</div>` : ''}</div>`;
}

// 6-line tab (high e on top). statuses: per note index 'ok' | 'bad'
function tabHTML(notes, cur = -1, statuses = {}) {
  let html = '<div class="tab">';
  for (let s = 1; s <= 6; s++) {
    html += `<div class="line"><span class="sname">${['e', 'B', 'G', 'D', 'A', 'E'][s - 1]}</span>`;
    notes.forEach((n, i) => {
      const cls = i === cur ? 'cur' : statuses[i] || '';
      html += `<span class="cell ${n.s === s ? cls : ''}">${n.s === s ? `<b>${n.f}</b>` : ''}</span>`;
    });
    html += '</div>';
  }
  return html + '</div>';
}

// ---------- Judging what was heard ----------
// Samples from just before a strum, so the previous chord's ringing can be subtracted.
const preOnset = (o, len) => Mic.read(o.abs - len - Math.round(0.015 * Mic.sr), len);

function judgeChord(samples, expectedId, poolIds, { strict = true, pre = null } = {}) {
  if (DSP.rms(samples) < 0.002) return { quiet: true };
  const an = DSP.analyzeChord(samples, Mic.sr, pre);
  const pool = judgePool(expectedId, [...new Set([expectedId, ...poolIds])]).map((id) => CHORD[id]);
  const ranked = DSP.rankChords(an.chroma, pool);
  const mine = ranked.find((r) => r.id === expectedId);
  const top = ranked[0];
  const ok = mine.score >= (strict ? 0.8 : 0.74) && mine.score >= top.score - (strict ? 0.02 : 0.04);
  const diag = DSP.diagnoseChord(an, CHORD[expectedId].frets);
  return { ok, clean: ok && !diag.issues.length, score: mine.score, heard: top.id, issues: diag.issues, notes: an.notes };
}

function firstString(chord) { return 6 - chord.frets.findIndex((f) => f >= 0); }

function mutedAdvice(chord, s) {
  const i = 6 - s, f = chord.frets[i], fg = chord.fingers?.[i];
  if (f > 0) return `Press your ${fingerName(fg)} finger down on its very tip, right behind fret ${f}. If it still thuds, another finger is touching this string.`;
  const nb = [s + 1, s - 1].filter((n) => n >= 1 && n <= 6).map((n) => ({ n, fg: chord.fingers?.[6 - n] })).find((x) => x.fg > 0);
  if (nb) return `It's an open string, so something is leaning on it. Probably your ${fingerName(nb.fg)} finger on string ${nb.n}: curl it so it comes straight down on its tip, like a claw.`;
  return "It's an open string, so nothing should touch it. Check that your palm or a finger isn't resting on it.";
}

function issueText(chord, issue) {
  if (issue.type === 'missing') return `<b>${cap(stringLabel(issue.string))} isn't ringing.</b> ${mutedAdvice(chord, issue.string)}`;
  const fs = firstString(chord);
  return `<b>Don't play string ${issue.string} (${STRING_NAMES[issue.string]}) on ${chord.id}.</b> Start your strum from ${stringLabel(fs)}.`;
}

function chordFeedback(chord, j) {
  if (j.quiet) return { cls: 'warn', html: '<b>Too quiet.</b> Strum a bit harder or move closer to the computer.' };
  if (j.clean) return { cls: 'ok', html: `<b>Clean ${esc(chord.id)}! ✓</b> Every string I can check rang out.` };
  if (j.issues.length) return { cls: 'bad', html: issueText(chord, j.issues[0]) };
  if (j.notes <= 1) return { cls: 'warn', html: '<b>That sounded like a single string.</b> Strum across all the strings in one smooth motion.' };
  if (j.heard !== chord.id && j.score < 0.8) return { cls: 'bad', html: `<b>That sounded more like ${esc(j.heard)}.</b> Compare each finger with the diagram: right string, right fret?` };
  return { cls: 'bad', html: "<b>Not quite clean.</b> Something's off. Try the string-by-string check to find exactly which string." };
}

// Verdict for a single plucked string (string check, riffs).
function noteVerdict(s, expectedFret, r, chord) {
  const expMidi = openMidi(s) + expectedFret;
  if (r.energy < 0.0015) return { ok: false, cls: 'warn', html: `<b>Too quiet.</b> Pluck ${stringLabel(s)} a bit harder.` };
  if (r.fret === null || r.pitched < 0.3) {
    return { ok: false, cls: 'bad', html: `<b>${cap(stringLabel(s))} sounds muted.</b> ` + (chord ? mutedAdvice(chord, s) : 'Press firmly on your fingertip, right behind the fret wire.') };
  }
  if (r.fret === expectedFret) {
    return { ok: true, cls: 'ok', html: `<b>Clean ${DSP.noteName(expMidi)}! ✓</b>` + (r.pitched < 0.5 ? ' Slightly buzzy: press a little closer to the fret wire.' : '') };
  }
  const fg = chord?.fingers?.[6 - s];
  if (expectedFret > 0 && r.fret === 0) {
    return { ok: false, cls: 'bad', html: `<b>That's the open string.</b> Your finger isn't holding it down. ${fg ? `Put your ${fingerName(fg)} finger` : 'Press'} on fret ${expectedFret}, right behind the fret wire.` };
  }
  const diff = r.fret - expectedFret;
  if (Math.abs(diff) <= 2) {
    return { ok: false, cls: 'bad', html: `<b>You're on fret ${r.fret}. It should be fret ${expectedFret}.</b> Move ${plural(Math.abs(diff), 'fret')} toward the ${diff > 0 ? 'headstock (away from the body)' : 'guitar body'}.` };
  }
  return { ok: false, cls: 'bad', html: `<b>I heard ${DSP.noteName(r.midi)}, but wanted ${DSP.noteName(expMidi)}.</b> Make sure you're plucking ${stringLabel(s)}, ${expectedFret ? `fretted at fret ${expectedFret}` : 'open (no finger)'}.` };
}

function listenBadge() {
  return '<span class="listen"><span class="wave"><i></i><i></i><i></i><i></i></span>Listening…</span>';
}
function animateListen(root) {
  return Mic.on('level', (l) => {
    const bars = $$('.listen .wave i', root);
    bars.forEach((b, i) => (b.style.height = Math.min(100, 20 + Math.sqrt(l) * 300 * (0.6 + ((i * 7) % 5) / 5)) + '%'));
  });
}

// Wraps an exercise so it first asks for the microphone if needed.
function needMic(root, start) {
  let inner = null;
  const go = () => { root.innerHTML = ''; inner = start(); };
  if (Mic.running) { go(); return () => inner?.(); }
  root.innerHTML = `<div class="card flat center stack">
    <div style="font-size:3rem">🎤</div>
    <h2>I need to hear you</h2>
    <p class="muted">This exercise listens to your guitar. Turn on the microphone and allow it when your browser asks.</p>
    <div><button class="btn primary big" data-go>Turn on microphone</button></div>
    <div class="feedback bad hidden" data-err></div></div>`;
  $('[data-go]', root).onclick = async () => {
    if (await Mic.start(Store.data.settings.micId)) go();
    else { const e = $('[data-err]', root); e.classList.remove('hidden'); e.textContent = Mic.error; }
  };
  return () => inner?.();
}

// ---------- Setup steps ----------
function MicSetup(root, { onPass }) {
  const offs = [];
  root.innerHTML = `<div class="stack">
    <p class="big">Click the button, then allow the microphone when your browser asks.</p>
    <div><button class="btn primary big" data-go>🎤 Turn on microphone</button></div>
    <div data-live class="hidden stack">
      <div class="row"><div class="meter" style="width:260px;height:14px"><i></i></div><span class="muted">Input level</span></div>
      <div class="feedback" data-fb>Now pluck any string on your guitar…</div>
    </div>
    <div class="feedback bad hidden" data-err></div></div>`;
  const live = () => {
    $('[data-go]', root).classList.add('hidden');
    $('[data-live]', root).classList.remove('hidden');
    offs.push(Mic.on('level', (l) => ($('.meter i', root).style.width = Math.min(100, Math.sqrt(l) * 260) + '%')));
    offs.push(Mic.on('onset', () => {
      const fb = $('[data-fb]', root);
      fb.className = 'feedback ok';
      fb.innerHTML = "<b>Heard you! ✓</b> The microphone works. If the level bar barely moves when you play, move the guitar closer to the computer.";
      onPass?.();
    }));
  };
  if (Mic.running) live();
  $('[data-go]', root).onclick = async () => {
    if (await Mic.start(Store.data.settings.micId)) live();
    else { const e = $('[data-err]', root); e.classList.remove('hidden'); e.textContent = Mic.error; }
  };
  return () => offs.forEach((f) => f());
}

function CameraSetup(root, { onPass, needBoth = false }) {
  root.innerHTML = `<div class="stack">
    <p class="big">${needBoth ? 'Sit with your guitar like you are about to play.' : 'The camera watches your hands to catch flat fingers and check your strumming direction.'}</p>
    <div class="tip"><div class="ico">💡</div><div class="grow"><p><b>Set it up like this:</b> laptop about an arm's length away, camera at chest height, a lamp or window <b>in front of</b> you (not behind). Both hands and the guitar neck should be in the picture. A basic webcam is fine.</p></div></div>
    <div><button class="btn primary big" data-go>📷 Turn on camera</button></div>
    <div class="feedback" data-fb>${Camera.active ? 'Camera is on. Look at the panel in the bottom-right corner.' : ''}</div>
    <p class="small dim">The video never leaves your computer. Hand tracking runs right in your browser.</p></div>`;
  const fb = $('[data-fb]', root);
  let seenSince = 0;
  const offs = [
    Camera.on('frame', () => {
      const fret = Camera.seen('fret', 400), strum = Camera.seen('strum', 400);
      const good = needBoth ? fret && strum : fret || strum;
      if (!good) {
        seenSince = 0;
        fb.className = 'feedback warn';
        fb.innerHTML = needBoth
          ? `<b>${fret ? "I see your fretting hand, but not your strumming hand." : strum ? "I see your strumming hand, but not your fretting hand." : "I can't see your hands yet."}</b> Shift until both hands are in the picture. The labels in the camera panel show which is which. If they're backwards, press ⇄ in the panel.`
          : '<b>Looking for your hands…</b> Hold them up where the camera can see them.';
        return;
      }
      if (!seenSince) seenSince = performance.now();
      if (performance.now() - seenSince > 1500) {
        fb.className = 'feedback ok';
        fb.innerHTML = needBoth ? '<b>Got both hands ✓</b> Keep this position when you practice.' : '<b>I can see you ✓</b> Hand tracking works.';
        onPass?.();
      }
    }),
    Camera.on('state', () => {
      if (Camera.error) { fb.className = 'feedback bad'; fb.textContent = Camera.error; }
      else if (Camera.loading) { fb.className = 'feedback'; fb.textContent = 'Starting camera and loading hand tracking…'; }
    }),
  ];
  const btn = $('[data-go]', root);
  if (Camera.active) btn.classList.add('hidden');
  btn.onclick = async () => { if (await Camera.start(Store.data.settings.camId)) btn.classList.add('hidden'); };
  return () => offs.forEach((f) => f());
}

// ---------- Tuner ----------
function Tuner(root, { onPass, requireAll = false } = {}) {
  return needMic(root, () => {
    const done = new Set();
    let target = 6, manual = false, readings = [], inTune = 0, alive = true;
    const names = { 6: 'E', 5: 'A', 4: 'D', 3: 'G', 2: 'B', 1: 'e' };
    root.innerHTML = `<div class="card flat tuner">
      <div class="tune-strings">${[6, 5, 4, 3, 2, 1].map((s) => `<button data-s="${s}">${names[s]}<small>string ${s}</small></button>`).join('')}</div>
      <div style="height:18px"></div>
      <div class="note" data-note>–</div>
      <div class="cents" data-cents>Pluck ${stringLabel(target)}</div>
      <div class="gauge"><div class="scale"></div><div class="zero"></div><div class="needle" data-needle></div></div>
      <div class="feedback center" data-fb>Pluck one string and let it ring.</div>
      ${requireAll ? '<div style="margin-top:12px"><button class="btn small" data-tuned>My guitar is already tuned →</button></div>' : ''}
      <p class="small dim" style="margin-top:12px">Tip: tune <b>up</b> to the note. If you're too high, loosen below it and come back up; strings hold their tuning better that way.</p>
    </div>`;
    const paint = () => $$('[data-s]', root).forEach((b) => {
      const s = +b.dataset.s;
      b.classList.toggle('cur', s === target);
      b.classList.toggle('done', done.has(s));
    });
    paint();
    $$('[data-s]', root).forEach((b) => (b.onclick = () => { target = +b.dataset.s; manual = true; inTune = 0; readings = []; paint(); }));
    const fb = $('[data-fb]', root), needle = $('[data-needle]', root);
    const tunedBtn = $('[data-tuned]', root);
    if (tunedBtn) tunedBtn.onclick = () => { Store.set((d) => (d.tunedOn = Store.today())); fb.className = 'feedback ok'; fb.innerHTML = '<b>Got it ✓</b> Skipping the tuner.'; onPass?.(); };
    const iv = setInterval(() => {
      if (!alive) return;
      if (Mic.level < 0.003) { readings = []; inTune = 0; return; }
      const r = DSP.yin(Mic.latest(4096), Mic.sr, 70, 700);
      if (!r || r.clarity < 0.85) return;
      readings.push(r.midi);
      if (readings.length > 5) readings.shift();
      const midi = readings.slice().sort((a, b) => a - b)[readings.length >> 1];
      if (!manual && !requireAll) {
        // Free mode: follow whichever string is closest.
        target = [6, 5, 4, 3, 2, 1].reduce((best, s) => (Math.abs(midi - openMidi(s)) < Math.abs(midi - openMidi(best)) ? s : best), 6);
        paint();
      }
      const want = openMidi(target);
      // Allow octave confusion (laptop mics often hear the low strings an octave up).
      let cents = (midi - want) * 100;
      for (const o of [-1200, 1200]) if (Math.abs(cents + o) < Math.abs(cents)) cents += o;
      $('[data-note]', root).textContent = DSP.noteName(midi);
      $('[data-cents]', root).textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents · target ${names[target]} (${stringLabel(target)})`;
      needle.style.left = 50 + Math.max(-50, Math.min(50, cents)) + '%';
      const ok = Math.abs(cents) <= 7;
      needle.classList.toggle('in', ok);
      if (Math.abs(cents) > 300) {
        fb.className = 'feedback warn';
        fb.innerHTML = `<b>That's ${DSP.noteName(midi)}, way off from ${names[target]}.</b> Are you plucking ${stringLabel(target)}? If yes, turn its peg slowly ${cents < 0 ? 'to tighten (raise the pitch)' : 'to loosen (lower the pitch)'}.`;
      } else if (ok) {
        fb.className = 'feedback ok';
        fb.innerHTML = '<b>In tune ✓</b> Hold it…';
      } else {
        fb.className = 'feedback';
        fb.innerHTML = cents < 0 ? '<b>Too low ↑</b> Tighten the peg a little (tune up).' : '<b>Too high ↓</b> Loosen the peg a little (tune down).';
      }
      inTune = ok ? inTune + 1 : 0;
      if (inTune === 10 && !done.has(target)) {
        done.add(target);
        toast(`String ${target} (${STRING_NAMES[target]}) is in tune ✓`);
        if (done.size === 6 || (!requireAll && done.size >= 1)) Store.set((d) => (d.tunedOn = Store.today()));
        if (requireAll) {
          const nextS = [6, 5, 4, 3, 2, 1].find((s) => !done.has(s));
          if (nextS) { target = nextS; manual = true; readings = []; inTune = 0; $('[data-cents]', root).textContent = `Now pluck ${stringLabel(target)}`; }
          else { fb.className = 'feedback ok'; fb.innerHTML = '<b>All six strings are in tune! ✓</b>'; onPass?.(); }
        }
        paint();
      }
    }, 50);
    if (requireAll) manual = true;
    return () => { alive = false; clearInterval(iv); };
  });
}

// ---------- String-by-string check ----------
function StringCheck(root, { chord, onPass, onStat }) {
  return needMic(root, () => {
    const strings = chord.frets.map((f, i) => ({ s: 6 - i, f })).filter((x) => x.f >= 0);
    const skipped = chord.frets.map((f, i) => ({ s: 6 - i, f })).filter((x) => x.f < 0).map((x) => x.s);
    const state = {};
    let cur = 0, busy = false, alive = true;
    const isOpen = chord.id === 'open';
    root.innerHTML = `<div class="ex">
      <div data-diag></div>
      <div class="stack">
        <div><div class="prompt" data-prompt></div><div class="muted" data-sub></div></div>
        <div class="feedback" data-fb>${listenBadge()}</div>
        <div class="string-list" data-list></div>
        <div class="row"><button class="btn small ghost" data-skip>Skip this string</button><button class="btn small ghost" data-restart>Start over</button></div>
        ${skipped.length ? `<p class="small muted">Don't play ${skipped.map((s) => `string ${s}`).join(' or ')} on this chord.</p>` : ''}
      </div></div>`;
    const render = () => {
      const status = {};
      strings.forEach((x, i) => (status[x.s] = state[x.s]?.ok ? 'ok' : state[x.s] ? 'bad' : i === cur ? 'cur' : undefined));
      $('[data-diag]', root).innerHTML = isOpen
        ? `<div class="diagram-wrap"><div class="label">E A D G B E</div>${chordSVG(chord, { status, w: 200 })}</div>`
        : diagramBlock(chord, { status, w: 220 });
      const x = strings[cur];
      if (x) {
        const fg = chord.fingers?.[6 - x.s];
        $('[data-prompt]', root).textContent = `Pluck ${stringLabel(x.s)}`;
        $('[data-sub]', root).innerHTML = x.f === 0
          ? `Open string, no finger on it. Should sound <b>${DSP.noteName(openMidi(x.s))}</b>.`
          : `Fret ${x.f} with your ${fingerName(fg)} finger. Should sound <b>${DSP.noteName(openMidi(x.s) + x.f)}</b>.`;
      } else {
        $('[data-prompt]', root).textContent = 'All strings checked';
        $('[data-sub]', root).textContent = '';
      }
      $('[data-list]', root).innerHTML = strings.map((y, i) => {
        const st = state[y.s];
        const cls = st?.ok ? 'ok' : st ? 'bad' : i === cur ? 'cur' : '';
        return `<div class="string-row ${cls}"><span class="n">${y.s}</span><span class="what">${esc(STRING_NAMES[y.s])} ${y.f ? `· fret ${y.f}` : '· open'}</span><span class="res">${st ? (st.ok ? 'clean' : esc(st.short)) : i === cur ? 'now' : ''}</span></div>`;
      }).join('');
    };
    render();
    const fb = $('[data-fb]', root);
    const advance = () => {
      cur = strings.findIndex((x) => !state[x.s]?.ok);
      if (cur < 0) {
        cur = strings.length;
        render();
        fb.className = 'feedback ok';
        fb.innerHTML = `<b>Every string rings clean! ✓</b> ${isOpen ? '' : 'Your fingers are in the right spots.'}`;
        Store.set((d) => { if (!isOpen) Store.chord(chord.id).strings++; });
        onPass?.();
        return;
      }
      render();
    };
    const offs = [animateListen(root), Mic.on('onset', async (o) => {
      if (busy || cur >= strings.length) return;
      busy = true;
      const x = strings[cur];
      const pre = Mic.read(o.abs - 16384 - Math.round(0.015 * Mic.sr), 16384);
      const post = await Mic.capture(o.abs, 0.02, 16384);
      if (!alive) return;
      const r = DSP.checkString(post, pre, Mic.sr, openMidi(x.s), 12);
      const v = noteVerdict(x.s, x.f, r, isOpen ? null : chord);
      fb.className = 'feedback ' + v.cls;
      fb.innerHTML = v.html;
      if (v.cls === 'warn') { busy = false; return; }
      state[x.s] = { ok: v.ok, short: v.ok ? 'clean' : r.fret === null || r.pitched < 0.3 ? 'muted' : `heard fret ${r.fret}` };
      if (!v.ok && !isOpen) Store.set(() => { const c = Store.chord(chord.id); c.issues[x.s] = (c.issues[x.s] || 0) + 1; });
      onStat?.(x.s, v.ok);
      render();
      if (v.ok) setTimeout(() => { if (alive) { advance(); busy = false; } }, 500);
      else setTimeout(() => (busy = false), 400);
    })];
    $('[data-skip]', root).onclick = () => { if (strings[cur]) { state[strings[cur].s] = { ok: true, short: 'skipped' }; advance(); } };
    $('[data-restart]', root).onclick = () => { Object.keys(state).forEach((k) => delete state[k]); cur = 0; fb.className = 'feedback'; fb.innerHTML = listenBadge(); render(); };
    return () => { alive = false; offs.forEach((f) => f()); };
  });
}

// ---------- Strum check ----------
function StrumCheck(root, { chord, need = 3, onPass, onStuck }) {
  return needMic(root, () => {
    let clean = 0, fails = 0, busy = false, alive = true;
    const fs = firstString(chord);
    Camera.context = { type: 'chord', chord };
    root.innerHTML = `<div class="ex">
      <div>${diagramBlock(chord, { w: 220 })}</div>
      <div class="stack">
        <div><div class="prompt">Strum ${esc(chord.id)} ${need > 1 ? `${need} times clean` : ''}</div>
        <div class="muted">${fs < 6 ? `Start your strum from ${stringLabel(fs)}. ` : 'Strum all six strings. '}One strum at a time, let it ring.</div></div>
        <div class="dots" data-dots>${'<i></i>'.repeat(need)}</div>
        <div class="feedback" data-fb>${listenBadge()}</div>
        <div class="row"><button class="btn small ghost hidden" data-stuck>🔍 Check string by string</button></div>
        <p class="small dim">${esc(chord.tip || '')}</p>
      </div></div>`;
    const fb = $('[data-fb]', root);
    const offs = [animateListen(root), Mic.on('onset', async (o) => {
      if (busy || clean >= need) return;
      busy = true;
      const pre = preOnset(o, 16384);
      const samples = await Mic.capture(o.abs, 0.03, 16384);
      if (!alive) return;
      const j = judgeChord(samples, chord.id, CHORDS.map((c) => c.id), { pre });
      const f = chordFeedback(chord, j);
      fb.className = 'feedback ' + f.cls;
      fb.innerHTML = f.html;
      if (!j.quiet) {
        Store.set(() => {
          const c = Store.chord(chord.id);
          c.tries++;
          if (j.clean) c.clean++;
          j.issues?.forEach((i) => { if (i.type === 'missing') c.issues[i.string] = (c.issues[i.string] || 0) + 1; });
        });
        if (j.clean) {
          clean++;
          $$('[data-dots] i', root).forEach((d, i) => d.classList.toggle('ok', i < clean));
          if (clean >= need) {
            fb.innerHTML = `<b>${need} clean ${esc(chord.id)} strums! ✓</b> You've got this chord.`;
            onPass?.();
          }
        } else if (++fails >= 2) $('[data-stuck]', root).classList.remove('hidden');
      }
      setTimeout(() => (busy = false), 250);
    })];
    $('[data-stuck]', root).onclick = () => onStuck?.();
    return () => { alive = false; Camera.context = null; offs.forEach((f) => f()); };
  });
}

// ---------- Chord trainer: string check, then strums ----------
function ChordTrainer(root, { chord, strums = 3, onPass, startWith = 'strings' }) {
  let inner = null;
  root.innerHTML = `<div class="stack">
    <div class="row between"><div class="seg" data-seg><button data-p="strings">1 · Each string</button><button data-p="strum">2 · Strum it</button></div>
    <span class="small muted" data-hint></span></div><div data-body></div></div>`;
  const show = (phase) => {
    inner?.();
    $$('[data-p]', root).forEach((b) => b.classList.toggle('on', b.dataset.p === phase));
    const body = $('[data-body]', root);
    Camera.context = { type: 'chord', chord };
    if (phase === 'strings') {
      $('[data-hint]', root).textContent = 'Place your fingers, then pluck one string at a time.';
      inner = StringCheck(body, { chord, onPass: () => setTimeout(() => show('strum'), 1400) });
    } else {
      $('[data-hint]', root).textContent = 'Now strum the whole chord.';
      inner = StrumCheck(body, { chord, need: strums, onPass, onStuck: () => show('strings') });
    }
  };
  $$('[data-p]', root).forEach((b) => (b.onclick = () => show(b.dataset.p)));
  show(startWith);
  return () => { inner?.(); Camera.context = null; };
}

// ---------- One-minute chord changes ----------
function ChangeDrill(root, { a, b, goal = 10, secs = 60, onPass }) {
  return needMic(root, () => {
    const A = CHORD[a], B = CHORD[b];
    const key = [a, b].sort().join('|');
    let target = 0, count = 0, running = false, endAt = 0, busy = false, alive = true, iv = null;
    const best = Store.data.changes[key]?.best || 0;
    root.innerHTML = `<div class="stack">
      <div class="row between">
        <div><div class="prompt">${esc(a)} ↔ ${esc(b)}: one-minute changes</div>
        <div class="muted">Strum ${esc(a)}, switch, strum ${esc(b)}, switch… Every clean chord counts. Goal: ${goal}. ${best ? `Your best: ${best}.` : ''}</div></div>
      </div>
      <div class="player">
        <div class="row" style="justify-content:center;gap:30px" data-diags></div>
        <div class="center stack">
          <div class="counter" data-count>0</div>
          <div class="timer" data-timer>${secs}s</div>
          <div><button class="btn primary big" data-start>Start</button></div>
        </div>
      </div>
      <div class="feedback" data-fb>Put your fingers on <b>${esc(a)}</b>, then press Start.</div>
    </div>`;
    const fb = $('[data-fb]', root);
    const paint = () => {
      $('[data-diags]', root).innerHTML = [A, B].map((c, i) => `<div style="opacity:${i === target ? 1 : 0.35};transform:scale(${i === target ? 1 : 0.9});transition:all .2s">${diagramBlock(c, { w: 170, caption: i === target ? 'play this' : 'next' })}</div>`).join('');
      Camera.context = { type: 'chord', chord: target ? B : A };
    };
    paint();
    const finish = () => {
      running = false;
      clearInterval(iv);
      $('[data-start]', root).textContent = 'Go again';
      $('[data-start]', root).disabled = false;
      const prev = Store.data.changes[key];
      Store.set((d) => {
        const c = (d.changes[key] ||= { best: 0, history: [] });
        c.best = Math.max(c.best, count);
        c.history = [...(c.history || []), count].slice(-12);
      });
      const pb = !prev || count > prev.best;
      fb.className = 'feedback ' + (count >= goal ? 'ok' : 'warn');
      fb.innerHTML = count >= goal
        ? `<b>${count} changes in a minute! ✓ ${pb && prev ? 'New personal best!' : ''}</b> Keep doing this daily. Players who can do 30 a minute play songs without stopping.`
        : `<b>${count} changes.</b> Goal is ${goal}. Tip: lift all fingers together and land them as one shape. Don't place them one at a time. Speed comes from repetition, not from rushing.`;
      if (count >= goal) onPass?.();
    };
    $('[data-start]', root).onclick = () => {
      count = 0; target = 0; running = true;
      $('[data-count]', root).textContent = '0';
      $('[data-start]', root).disabled = true;
      endAt = performance.now() + secs * 1000;
      paint();
      fb.className = 'feedback';
      fb.innerHTML = `${listenBadge()} Go! Strum <b>${esc(a)}</b>.`;
      iv = setInterval(() => {
        const left = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
        $('[data-timer]', root).textContent = left + 's';
        if (left <= 0) finish();
      }, 200);
    };
    const offs = [animateListen(root), Mic.on('onset', async (o) => {
      if (!running || busy) return;
      busy = true;
      const want = target ? b : a;
      const pre = preOnset(o, 8192);
      const samples = await Mic.capture(o.abs, 0.03, 8192);
      if (!alive || !running) { busy = false; return; }
      const j = judgeChord(samples, want, CHORDS.map((c) => c.id), { strict: false, pre });
      if (j.ok) {
        count++;
        target = 1 - target;
        $('[data-count]', root).textContent = count;
        paint();
        fb.className = 'feedback ok';
        fb.innerHTML = `<b>${esc(want)} ✓</b> Now ${esc(target ? b : a)}!`;
        Store.set(() => { const c = Store.chord(want); c.tries++; if (j.clean) c.clean++; });
      } else if (!j.quiet) {
        const f = chordFeedback(CHORD[want], j);
        fb.className = 'feedback bad';
        fb.innerHTML = f.html;
      }
      setTimeout(() => (busy = false), 150);
    })];
    return () => { alive = false; clearInterval(iv); Camera.context = null; offs.forEach((f) => f()); };
  });
}

// ---------- Latency calibration ----------
function Latency(root, { onPass }) {
  return needMic(root, () => {
    let onsets = [], clicks = [], alive = true;
    root.innerHTML = `<div class="stack">
      <p class="big">Every computer has a small delay between sound and microphone. Let's measure yours so the coach judges your timing fairly.</p>
      <p>Lay your fretting hand lightly across the strings to mute them. After 4 count-in clicks, <b>strum on each of the next 8 clicks</b>.</p>
      <div class="row"><button class="btn primary big" data-go>Start</button><div class="beat-light" data-light></div></div>
      <div class="feedback" data-fb>Current setting: ${Math.round(Store.data.settings.latency * 1000)} ms</div></div>`;
    const fb = $('[data-fb]', root);
    const off = Mic.on('onset', (o) => onsets.push(o.time));
    $('[data-go]', root).onclick = () => {
      onsets = []; clicks = [];
      $('[data-go]', root).disabled = true;
      fb.innerHTML = 'Count-in: 1… 2… 3… 4… then strum on every click.';
      Metro.start({
        bpm: 80, beatsPerBar: 4, totalBeats: 12,
        onBeat: (b, t) => {
          clicks.push(t);
          const l = $('[data-light]', root);
          if (l) { l.classList.add('on'); setTimeout(() => l.classList.remove('on'), 120); }
          if (b === 4) fb.innerHTML = '<b>Strum now, on every click!</b>';
        },
        onEnd: () => {
          if (!alive) return;
          setTimeout(() => {
            $('[data-go]', root).disabled = false;
            const offsets = clicks.slice(4).map((c) => {
              const near = onsets.filter((t) => Math.abs(t - c) < 0.3).sort((x, y) => Math.abs(x - c) - Math.abs(y - c))[0];
              return near === undefined ? null : near - c;
            }).filter((x) => x !== null).sort((x, y) => x - y);
            if (offsets.length < 4) {
              fb.className = 'feedback warn';
              fb.innerHTML = `<b>Only heard ${offsets.length} strums.</b> Strum a bit harder, right on each click, and try again.`;
              return;
            }
            const lat = Math.max(0, Math.min(0.35, offsets[offsets.length >> 1]));
            Store.set((d) => (d.settings.latency = lat));
            fb.className = 'feedback ok';
            fb.innerHTML = `<b>Done ✓ Your delay is about ${Math.round(lat * 1000)} ms.</b> The coach will take that into account.`;
            onPass?.();
          }, 400);
        },
      });
    };
    return () => { alive = false; off(); Metro.stop(); };
  });
}

// ---------- Rhythm / strumming patterns ----------
function Rhythm(root, { pattern = 'quarters', chords = ['G'], bpm = 60, bars = 4, onPass }) {
  return needMic(root, () => {
    const P = PATTERNS[pattern];
    const spb = P.slots.length; // slots per bar
    const beatsPerBar = spb / 2;
    let tempo = bpm, running = false, start = 0, events = [], extras = [], alive = true, raf = 0;
    const key = pattern;
    root.innerHTML = `<div class="stack">
      <div class="row between">
        <div><div class="prompt">${esc(P.name)}</div><div class="muted">Count: ${esc(P.count)} · ↓ = down, ↑ = up, · = skip (hand still moves)</div></div>
        <div class="row">
          <button class="btn small" data-slow>−</button><b data-bpm>${tempo} BPM</b><button class="btn small" data-fast>+</button>
          <button class="btn primary" data-go>▶ Start</button>
        </div>
      </div>
      <div class="row" data-lights>${Array.from({ length: beatsPerBar }, (_, i) => `<div class="beat-light ${i === 0 ? 'accent' : ''}"></div>`).join('')}<span class="muted small" data-state>Press start. You get one bar of clicks to count you in.</span></div>
      <div class="rgrid" data-grid></div>
      <div class="feedback" data-fb>Headphones help: then the microphone only hears your guitar.</div>
    </div>`;
    const grid = $('[data-grid]', root), fb = $('[data-fb]', root);
    const drawGrid = () => {
      grid.innerHTML = Array.from({ length: bars }, (_, b) => `<div class="rbar" style="grid-template-columns:repeat(${spb},1fr)"><span class="cname">${esc(chords[b % chords.length])}</span>${[...P.slots].map((c, j) =>
        `<div class="slot ${c === '-' ? 'rest' : c === 'U' ? 'up' : ''}" data-i="${b * spb + j}">${c === 'D' ? '↓' : c === 'U' ? '↑' : '·'}<span class="cnt">${j % 2 ? '&' : j / 2 + 1}</span></div>`).join('')}</div>`).join('');
    };
    drawGrid();
    const slotDur = () => 60 / tempo / 2;
    const setTempo = (v) => { tempo = Math.max(40, Math.min(160, v)); $('[data-bpm]', root).textContent = tempo + ' BPM'; };
    $('[data-slow]', root).onclick = () => setTempo(tempo - 5);
    $('[data-fast]', root).onclick = () => setTempo(tempo + 5);
    const slotEl = (i) => $(`[data-i="${i}"]`, grid);

    const finish = () => {
      running = false;
      cancelAnimationFrame(raf);
      $('[data-go]', root).textContent = '▶ Again';
      const total = events.length;
      const good = events.filter((e) => e.off !== null && Math.abs(e.off) <= 0.07).length;
      const near = events.filter((e) => e.off !== null && Math.abs(e.off) > 0.07).length;
      const missed = events.filter((e) => e.off === null);
      const score = Math.round(((good + near * 0.5) / total) * 100);
      const offs = events.filter((e) => e.off !== null).map((e) => e.off);
      const mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
      const tips = [];
      if (mean < -0.035) tips.push(`You're <b>rushing</b> (about ${Math.round(-mean * 1000)} ms early). Wait for the click; let it pull you.`);
      if (mean > 0.045) tips.push(`You're <b>dragging</b> (about ${Math.round(mean * 1000)} ms late). Start each strum a hair sooner.`);
      const upMiss = missed.filter((e) => e.type === 'U').length, upTotal = events.filter((e) => e.type === 'U').length;
      if (upTotal && upMiss / upTotal > 0.4) tips.push('Your <b>upstrokes</b> are too light or missing. Catch the thinnest 3 strings on the way up.');
      const restHits = extras.filter((x) => x.rest).length;
      if (restHits >= 2) tips.push(`You hit the strings ${restHits} times on a <b>skip</b>. On "·" slots keep moving your hand but miss the strings.`);
      const wrongDir = events.filter((e) => e.dir && e.dir !== e.type).length;
      const dirKnown = events.filter((e) => e.dir).length;
      if (dirKnown >= 4 && wrongDir / dirKnown > 0.3) tips.push(`The camera saw ${wrongDir} strums going the <b>wrong direction</b>. Down on the numbers, up on the "&".`);
      if (!tips.length && score >= 85) tips.push('Rock solid. Bump the tempo up 5 BPM and go again.');
      Store.set((d) => (d.rhythm[key] = Math.max(d.rhythm[key] || 0, score)));
      fb.className = 'feedback ' + (score >= 70 ? 'ok' : 'warn');
      fb.innerHTML = `<b>${score}% on the beat ${score >= 70 ? '✓' : ''}</b> ${good} right on, ${near} a bit off, ${missed.length} missed.<br>${tips.join('<br>')}`;
      if (score >= 70) onPass?.();
      Camera.context = null;
    };

    $('[data-go]', root).onclick = () => {
      if (running) { Metro.stop(); finish(); return; }
      drawGrid();
      events = []; extras = [];
      running = true;
      $('[data-go]', root).textContent = '■ Stop';
      fb.className = 'feedback';
      fb.innerHTML = 'Count-in… get ready.';
      Camera.context = { type: 'rhythm' };
      const lights = $$('[data-lights] .beat-light', root);
      Metro.start({
        bpm: tempo, beatsPerBar, totalBeats: beatsPerBar * (bars + 1),
        onStart: (t0) => {
          start = t0 + beatsPerBar * (60 / tempo);
          for (let i = 0; i < bars * spb; i++) {
            const c = P.slots[i % spb];
            if (c !== '-') events.push({ i, type: c, t: start + i * slotDur(), off: null, dir: null });
          }
        },
        onBeat: (b) => {
          lights.forEach((l, i) => l.classList.toggle('on', i === b % beatsPerBar));
          $('[data-state]', root).textContent = b < beatsPerBar ? `Count-in: ${b + 1}` : `Bar ${Math.floor(b / beatsPerBar)} of ${bars}`;
          if (b === beatsPerBar) fb.innerHTML = `${listenBadge()} Play!`;
        },
        onEnd: () => setTimeout(() => alive && running && finish(), 300),
      });
      const loop = () => {
        if (!running) return;
        const now = Mic.ctx.currentTime;
        const idx = Math.floor((now - start) / slotDur());
        $$('.slot.now', grid).forEach((s) => s.classList.remove('now'));
        if (idx >= 0) slotEl(idx)?.classList.add('now');
        events.forEach((e) => {
          if (e.off === null && !e.marked && now - e.t > slotDur() * 0.5 + Store.data.settings.latency + 0.05) {
            e.marked = true;
            slotEl(e.i)?.classList.add('miss');
          }
        });
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    const offs = [animateListen(root), Mic.on('onset', (o) => {
      if (!running) return;
      const t = o.time - Store.data.settings.latency;
      const sd = slotDur();
      if (t < start - sd * 0.5) return;
      let best = null;
      for (const e of events) if (e.off === null && Math.abs(t - e.t) < sd * 0.5 && (!best || Math.abs(t - e.t) < Math.abs(t - best.t))) best = e;
      if (best) {
        best.off = t - best.t;
        best.dir = Camera.directionAt(o.time);
        const el = slotEl(best.i);
        el?.classList.remove('miss');
        el?.classList.add(Math.abs(best.off) <= 0.07 ? 'hit' : 'near');
        if (Camera.context) Camera.context.last = { want: best.type, got: best.dir };
      } else {
        const i = Math.round((t - start) / sd);
        if (i >= 0 && i < bars * spb) {
          const rest = P.slots[i % spb] === '-';
          extras.push({ i, rest });
          if (rest) slotEl(i)?.classList.add('extra');
        }
      }
    })];
    return () => { alive = false; running = false; Metro.stop(); cancelAnimationFrame(raf); Camera.context = null; offs.forEach((f) => f()); };
  });
}

// ---------- Riffs (single notes) ----------
function Riff(root, { riff, tempo = false, onPass }) {
  return needMic(root, () => {
    let cur = 0, busy = false, alive = true, mode = 'step', statuses = {}, mistakes = 0;
    let playing = false, notesT = [], speed = 0.7, raf = 0;
    root.innerHTML = `<div class="stack">
      <div class="row between"><div><div class="prompt">${esc(riff.title)}</div><div class="muted">${esc(riff.note)}</div></div>
      ${tempo ? `<div class="seg" data-mode><button data-m="step" class="on">Note by note</button><button data-m="time">In time</button></div>` : ''}</div>
      <div class="card flat" data-tab></div>
      <div data-controls></div>
      <div class="feedback" data-fb>${listenBadge()}</div>
      <p class="small dim">How to read tab: each line is a string (thin high e on top, thick low E on the bottom). The number is the fret. 0 = open string.</p>
    </div>`;
    const fb = $('[data-fb]', root);
    const drawTab = () => ($('[data-tab]', root).innerHTML = tabHTML(riff.notes, mode === 'step' ? cur : -1, statuses));
    const prompt = () => {
      if (mode !== 'step') return;
      const n = riff.notes[cur];
      $('[data-controls]', root).innerHTML = n
        ? `<div class="row"><span class="big">Next: <b>${stringLabel(n.s)}</b>, ${n.f ? `<b>fret ${n.f}</b>` : '<b>open</b>'} → ${DSP.noteName(openMidi(n.s) + n.f)}</span><span class="grow"></span><button class="btn small ghost" data-restart>Start over</button></div>`
        : '';
      const r = $('[data-restart]', root);
      if (r) r.onclick = () => { cur = 0; statuses = {}; mistakes = 0; drawTab(); prompt(); };
    };
    drawTab();
    prompt();

    const stepDone = () => {
      fb.className = 'feedback ok';
      fb.innerHTML = `<b>You played the whole riff! ✓</b> ${mistakes ? `${plural(mistakes, 'wrong note')} along the way. ` : 'No mistakes! '}${tempo ? 'Now try it <b>in time</b> with the metronome (top right).' : ''}`;
      Store.set((d) => { (d.riffs[riff.id] ||= {}).done = true; });
      onPass?.();
    };

    const startTime = () => {
      statuses = {};
      drawTab();
      playing = true;
      const bpm = riff.bpm * speed;
      const spbeat = 60 / bpm;
      let beat = 0;
      const offsets = riff.notes.map((n) => { const b = beat; beat += n.b; return b; });
      const totalBeats = Math.ceil(beat) + 4;
      fb.className = 'feedback';
      fb.innerHTML = 'Count-in: 4 clicks, then play.';
      Metro.start({
        bpm, beatsPerBar: 4, totalBeats,
        onStart: (t0) => { notesT = offsets.map((b, i) => ({ i, t: t0 + (4 + b) * spbeat, got: null })); },
        onBeat: (b) => { if (b === 4) fb.innerHTML = `${listenBadge()} Play!`; },
        onEnd: () => setTimeout(() => {
          if (!alive) return;
          playing = false;
          cancelAnimationFrame(raf);
          const hits = notesT.filter((n) => n.got === 'ok').length;
          const pct = Math.round((hits / notesT.length) * 100);
          Store.set((d) => { const r = (d.riffs[riff.id] ||= {}); r.best = Math.max(r.best || 0, pct); });
          fb.className = 'feedback ' + (pct >= 70 ? 'ok' : 'warn');
          fb.innerHTML = `<b>${pct}% of notes right and on time.</b> ${pct >= 85 ? 'Try a faster speed!' : pct >= 50 ? 'Getting there. Go again.' : 'Try "Note by note" a few more times, or slow it down.'}`;
          drawTab();
        }, 400),
      });
      const loop = () => {
        if (!playing) return;
        const now = Mic.ctx.currentTime - Store.data.settings.latency;
        notesT.forEach((n) => { if (!n.got && now - n.t > 0.35) { n.got = 'miss'; statuses[n.i] = 'bad'; drawTab(); } });
        const next = notesT.find((n) => n.t > now - 0.1);
        $$('.tab .cell.cur', root).forEach((c) => c.classList.remove('cur'));
        if (next) $$(`.tab .line`, root).forEach((line) => line.children[next.i + 1]?.classList.add('cur'));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    if (tempo) {
      $$('[data-m]', root).forEach((b) => (b.onclick = () => {
        mode = b.dataset.m;
        $$('[data-m]', root).forEach((x) => x.classList.toggle('on', x === b));
        Metro.stop(); playing = false; statuses = {}; cur = 0;
        drawTab();
        if (mode === 'step') { prompt(); fb.className = 'feedback'; fb.innerHTML = listenBadge(); }
        else {
          $('[data-controls]', root).innerHTML = `<div class="row"><span class="muted">Speed</span><div class="seg" data-speed>${[0.5, 0.7, 0.85, 1].map((s) => `<button data-v="${s}" class="${s === speed ? 'on' : ''}">${Math.round(s * 100)}%</button>`).join('')}</div><button class="btn primary" data-play>▶ Play along</button></div>`;
          $$('[data-v]', root).forEach((x) => (x.onclick = () => { speed = +x.dataset.v; $$('[data-v]', root).forEach((y) => y.classList.toggle('on', y === x)); }));
          $('[data-play]', root).onclick = startTime;
          fb.className = 'feedback';
          fb.innerHTML = 'Press play. You get 4 clicks, then the highlighted note moves with the beat.';
        }
      }));
    }

    const offs = [animateListen(root), Mic.on('onset', async (o) => {
      if (busy) return;
      if (mode === 'step') {
        const n = riff.notes[cur];
        if (!n) return;
        busy = true;
        const pre = Mic.read(o.abs - 8192 - Math.round(0.01 * Mic.sr), 8192);
        const post = await Mic.capture(o.abs, 0.015, 8192);
        if (!alive) return;
        const r = DSP.checkString(post, pre, Mic.sr, openMidi(n.s), 15);
        const v = noteVerdict(n.s, n.f, r, null);
        fb.className = 'feedback ' + v.cls;
        fb.innerHTML = v.html;
        if (v.ok) {
          statuses[cur] = 'ok';
          cur++;
          drawTab();
          prompt();
          if (cur >= riff.notes.length) stepDone();
        } else if (v.cls === 'bad') mistakes++;
        setTimeout(() => (busy = false), 120);
      } else if (playing) {
        const t = o.time - Store.data.settings.latency;
        const n = notesT.filter((x) => !x.got && Math.abs(x.t - t) < 0.22).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
        if (!n) return;
        busy = true;
        const note = riff.notes[n.i];
        const pre = Mic.read(o.abs - 4096 - Math.round(0.01 * Mic.sr), 4096);
        const post = await Mic.capture(o.abs, 0.015, 8192);
        if (!alive) return;
        const r = DSP.checkString(post, pre.length ? pre : null, Mic.sr, openMidi(note.s), 15);
        n.got = r.fret === note.f && r.pitched >= 0.3 ? 'ok' : 'bad';
        statuses[n.i] = n.got === 'ok' ? 'ok' : 'bad';
        drawTab();
        busy = false;
      }
    })];
    return () => { alive = false; playing = false; Metro.stop(); cancelAnimationFrame(raf); offs.forEach((f) => f()); };
  });
}
