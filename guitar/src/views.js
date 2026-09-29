// Strum Coach — song player, screens, camera panel and navigation.

// ---------- Song player ----------
function SongPlayer(root, { song, onPass }) {
  return needMic(root, () => {
    const { segs, totalBeats } = songTimeline(song);
    const pool = songChords(song);
    // Practice mode steps through each chord *change* (repeats collapsed).
    const steps = [];
    segs.forEach((s, i) => { if (!steps.length || steps[steps.length - 1].chord !== s.chord) steps.push({ chord: s.chord, segs: [i] }); else steps[steps.length - 1].segs.push(i); });
    let mode = 'step', cur = 0, fails = 0, busy = false, alive = true, playing = false, speed = 0.7;
    let start = 0, spb = 1, iv = null, raf = 0, modal = null;
    const hits = new Array(segs.length).fill(null);
    const saved = Store.data.songs[song.id] || {};

    root.innerHTML = `<div class="stack">
      <div class="row between">
        <div class="seg" data-mode><button data-m="step" class="on">🐢 Practice (waits for you)</button><button data-m="play">🎵 Play along (keeps the beat)</button></div>
        <div class="row small muted">${esc(PATTERNS[song.pattern].name)} strum · ${song.bpm} BPM · ${song.beats}/4 ${saved.best != null ? `· best ${saved.best}%` : ''}</div>
      </div>
      <div class="card flat"><div class="player">
        <div class="row" style="justify-content:center;gap:28px" data-now></div>
        <div class="stack center" data-side></div>
      </div></div>
      <div class="feedback" data-fb></div>
      <div class="chart" data-chart></div>
      <div class="card flat"><h3>Chords in this song</h3><div class="row" style="gap:18px" data-chords></div><p class="small dim" style="margin:10px 0 0">Click a chord to check it string by string.</p></div>
    </div>`;
    const fb = $('[data-fb]', root);

    // Chart grouped into bars
    const drawChart = (nowSeg = -1) => {
      let html = '', sec = null, barBeats = 0;
      segs.forEach((s, i) => {
        const header = `${s.section}`;
        if (header !== sec || (i > 0 && segs[i - 1].section === s.section && s.start === 0)) {
          if (sec !== null) html += '</div></div></div>';
          const repeatStart = sec === header;
          sec = header;
          html += `<div class="sec"><h3>${esc(header)}${repeatStart ? ' (again)' : ''}</h3><div class="bars"><div class="barbox">`;
          barBeats = 0;
        } else if (barBeats >= song.beats) {
          html += '</div><div class="barbox">';
          barBeats = 0;
        }
        const cls = i === nowSeg ? 'now' : hits[i] === true ? 'hit' : hits[i] === false ? 'miss' : '';
        html += `<span class="c ${cls}" style="flex:${s.beats}">${esc(s.chord)}</span>`;
        barBeats += s.beats;
      });
      html += '</div></div></div>';
      $('[data-chart]', root).innerHTML = html;
    };

    $('[data-chords]', root).innerHTML = pool.map((id) => `<button class="btn ghost" data-chord="${esc(id)}" style="padding:8px">${chordSVG(CHORD[id], { w: 90 })}<b>${esc(id)}</b></button>`).join('');
    $$('[data-chord]', root).forEach((b) => (b.onclick = () => openChordModal(CHORD[b.dataset.chord])));

    const openChordModal = (chord) => {
      stopPlay();
      modal?.close();
      modal = showModal(`<div class="row between"><h2>Check ${esc(chord.id)}</h2><button class="btn small" data-close>Done</button></div><div data-body></div>`, (m) => {
        const c = ChordTrainer($('[data-body]', m), { chord, strums: 2 });
        return () => c();
      });
    };

    const showStep = () => {
      const st = steps[cur];
      const nextC = steps[cur + 1]?.chord;
      drawChart(st ? st.segs[0] : -1);
      if (!st) return;
      $('[data-now]', root).innerHTML = diagramBlock(CHORD[st.chord], { w: 200 }) + (nextC ? diagramBlock(CHORD[nextC], { w: 130, next: true, caption: 'next' }) : '');
      $('[data-side]', root).innerHTML = `<div class="prompt">Strum ${esc(st.chord)}</div><div class="muted">Chord ${cur + 1} of ${steps.length} · ${esc(segs[st.segs[0]].section)}</div>
        <div class="row" style="justify-content:center"><button class="btn small ghost" data-back>← Back</button><button class="btn small ghost" data-skip>Skip →</button><button class="btn small ghost" data-restart>Restart</button></div>`;
      $('[data-back]', root).onclick = () => { cur = Math.max(0, cur - 1); fails = 0; showStep(); };
      $('[data-skip]', root).onclick = () => { steps[cur].segs.forEach((i) => (hits[i] = false)); cur++; fails = 0; cur >= steps.length ? stepFinish() : showStep(); };
      $('[data-restart]', root).onclick = () => { cur = 0; fails = 0; hits.fill(null); showStep(); fb.className = 'feedback'; fb.innerHTML = listenBadge(); };
      Camera.context = { type: 'chord', chord: CHORD[st.chord] };
    };

    const stepFinish = () => {
      drawChart();
      const ok = hits.filter((h) => h === true).length;
      $('[data-now]', root).innerHTML = '<div class="celebrate"><div class="emoji">🎉</div></div>';
      $('[data-side]', root).innerHTML = `<div class="prompt">You played the whole song!</div><div class="muted">Next: switch to <b>Play along</b> and do it in time with the beat.</div>`;
      fb.className = 'feedback ok';
      fb.innerHTML = `<b>Song complete ✓</b> ${ok} of ${segs.length} chords clean on the first go.`;
      Store.set((d) => { (d.songs[song.id] ||= {}).practiced = true; });
      Camera.context = null;
      onPass?.();
    };

    const stopPlay = () => {
      if (!playing) return;
      playing = false;
      Metro.stop();
      clearInterval(iv);
      cancelAnimationFrame(raf);
    };

    const setupPlay = () => {
      stopPlay();
      hits.fill(null);
      drawChart();
      const bpm = Math.round(song.bpm * speed);
      $('[data-now]', root).innerHTML = diagramBlock(CHORD[segs[0].chord], { w: 200 }) + (segs[1] ? diagramBlock(CHORD[segs.find((s) => s.chord !== segs[0].chord)?.chord || segs[1].chord], { w: 130, next: true, caption: 'next' }) : '');
      $('[data-side]', root).innerHTML = `
        <div class="stack">
          <div><span class="muted">Speed: </span><b data-speedlbl>${Math.round(speed * 100)}% (${bpm} BPM)</b><input type="range" min="40" max="100" step="5" value="${speed * 100}" data-speed></div>
          <div class="beats" data-beats>${Array.from({ length: song.beats }, (_, i) => `<div class="beat-light ${i === 0 ? 'accent' : ''}"></div>`).join('')}</div>
          <div class="muted" data-count>You get one bar of clicks to count you in.</div>
          <div><button class="btn primary big" data-play>▶ Start</button></div>
        </div>`;
      $('[data-speed]', root).oninput = (e) => {
        speed = e.target.value / 100;
        $('[data-speedlbl]', root).textContent = `${e.target.value}% (${Math.round(song.bpm * speed)} BPM)`;
      };
      $('[data-play]', root).onclick = () => (playing ? (stopPlay(), setupPlay()) : play());
      fb.className = 'feedback';
      fb.innerHTML = `Strum the <b>${esc(PATTERNS[song.pattern].name.toLowerCase())}</b> pattern (or just one strum per beat) and change chords when the chart moves. The coach listens for each chord.`;
    };

    const play = () => {
      playing = true;
      hits.fill(null);
      const bpm = song.bpm * speed;
      spb = 60 / bpm;
      $('[data-play]', root).textContent = '■ Stop';
      const lights = $$('[data-beats] .beat-light', root);
      const segHeard = segs.map(() => ({ tries: 0, good: 0 }));
      Camera.context = { type: 'rhythm' };
      Metro.start({
        bpm, beatsPerBar: song.beats, totalBeats: song.beats + totalBeats,
        onStart: (t0) => (start = t0 + song.beats * spb),
        onBeat: (b) => {
          lights.forEach((l, i) => l.classList.toggle('on', i === b % song.beats));
          const cnt = $('[data-count]', root);
          if (cnt) cnt.textContent = b < song.beats ? `Count-in: ${b + 1}` : `Bar ${Math.floor((b - song.beats) / song.beats) + 1}`;
        },
        onEnd: () => setTimeout(() => alive && playing && playFinish(), 300),
      });
      let lastSeg = -1, lastHits = 0;
      iv = setInterval(() => {
        // Listen: grab the last ~170 ms and check it against the chord that should be sounding.
        const now = Mic.ctx.currentTime - Store.data.settings.latency;
        const beat = (now - start) / spb;
        const i = segs.findIndex((s) => beat >= s.start && beat < s.start + s.beats);
        if (i < 0 || hits[i] === true) return;
        const windowStart = now - 8192 / Mic.sr;
        if (windowStart < start + segs[i].start * spb + 0.05) return;
        if (Mic.level < 0.004) return;
        const j = judgeChord(Mic.latest(8192), segs[i].chord, pool, { strict: false });
        if (j.quiet) return;
        segHeard[i].tries++;
        if (j.ok) { segHeard[i].good++; if (segHeard[i].good >= 1) hits[i] = true; }
      }, 110);
      const loop = () => {
        if (!playing) return;
        const now = Mic.ctx.currentTime;
        const beat = (now - start) / spb;
        const i = segs.findIndex((s) => beat >= s.start && beat < s.start + s.beats);
        let changed = false;
        segs.forEach((s, k) => { if (hits[k] === null && beat >= s.start + s.beats + 0.3) { hits[k] = false; changed = true; } });
        if (changed || hits.filter(Boolean).length !== lastHits) { lastHits = hits.filter(Boolean).length; drawChart(i); }
        if (i !== lastSeg) {
          lastSeg = i;
          drawChart(i);
          if (i >= 0) {
            const nextSeg = segs.slice(i + 1).find((s) => s.chord !== segs[i].chord);
            $('[data-now]', root).innerHTML = diagramBlock(CHORD[segs[i].chord], { w: 200 }) + (nextSeg ? diagramBlock(CHORD[nextSeg.chord], { w: 130, next: true, caption: 'next' }) : '');
          }
        } else if (i >= 0 && hits[i] === true) {
          const c = $('.chart .c.now', root);
          if (c && !c.dataset.g) { c.dataset.g = 1; c.style.boxShadow = '0 0 0 2px var(--ok)'; }
        }
        if (i >= 0) {
          const nextSeg = segs.slice(i + 1).find((s) => s.chord !== segs[i].chord);
          if (nextSeg) {
            const beatsLeft = Math.ceil(nextSeg.start - beat);
            fb.className = 'feedback';
            fb.innerHTML = beatsLeft <= 2 ? `<b>Get ready: ${esc(nextSeg.chord)} in ${beatsLeft}…</b>` : `${listenBadge()} ${hits[i] ? `<b style="display:inline;color:var(--ok)">${esc(segs[i].chord)} ✓</b>` : `Playing <b style="display:inline">${esc(segs[i].chord)}</b>`}`;
          }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    const playFinish = () => {
      stopPlay();
      segs.forEach((s, k) => { if (hits[k] === null) hits[k] = false; });
      drawChart();
      const ok = hits.filter(Boolean).length;
      const pct = Math.round((ok / segs.length) * 100);
      // What went wrong: which chords and which changes
      const missByChord = {}, missByChange = {};
      segs.forEach((s, k) => {
        if (hits[k]) return;
        missByChord[s.chord] = (missByChord[s.chord] || 0) + 1;
        const prev = segs.slice(0, k).reverse().find((p) => p.chord !== s.chord);
        if (prev) { const key = `${prev.chord}→${s.chord}`; missByChange[key] = (missByChange[key] || 0) + 1; }
      });
      const worstChange = Object.entries(missByChange).sort((a, b) => b[1] - a[1])[0];
      const worstChord = Object.entries(missByChord).sort((a, b) => b[1] - a[1])[0];
      const prevBest = Store.data.songs[song.id]?.best;
      Store.set((d) => {
        const s = (d.songs[song.id] ||= {});
        s.best = Math.max(s.best || 0, pct);
        s.plays = (s.plays || 0) + 1;
        s.lastSpeed = speed;
        if (worstChange) s.trouble = worstChange[0];
      });
      let tips = '';
      if (pct >= 85) tips = speed < 1 ? `Great! Bump the speed up to ${Math.round(Math.min(1, speed + 0.1) * 100)}%.` : "You can play this song. Seriously. Go play it for someone!";
      else if (worstChange && worstChange[1] >= 2) {
        const [x, y] = worstChange[0].split('→');
        tips = `You mostly lost it on the <b>${esc(x)} → ${esc(y)}</b> change (${worstChange[1]} misses). <a href="#/drill/${encodeURIComponent(x)}/${encodeURIComponent(y)}">Drill ${esc(x)} ↔ ${esc(y)} for a minute</a>, then come back.`;
      } else if (worstChord) tips = `<b>${esc(worstChord[0])}</b> was missed most. <a href="#/chord/${encodeURIComponent(worstChord[0])}">Check it string by string</a>.`;
      if (pct < 50 && speed > 0.5) tips += ' Also try a slower speed.';
      fb.className = 'feedback ' + (pct >= 60 ? 'ok' : 'warn');
      fb.innerHTML = `<b>${pct}% of chords heard clean ${pct >= 60 ? '✓' : ''} ${prevBest != null && pct > prevBest ? '· New best!' : ''}</b> ${tips}`;
      $('[data-play]', root).textContent = '▶ Play again';
      $('[data-play]', root).onclick = () => { setupPlay(); play(); };
      Camera.context = null;
      if (pct >= 60) onPass?.();
    };

    $$('[data-m]', root).forEach((b) => (b.onclick = () => {
      mode = b.dataset.m;
      $$('[data-m]', root).forEach((x) => x.classList.toggle('on', x === b));
      stopPlay();
      if (mode === 'step') { cur = 0; fails = 0; hits.fill(null); fb.className = 'feedback'; fb.innerHTML = listenBadge(); showStep(); }
      else setupPlay();
    }));

    const offs = [animateListen(root), Mic.on('onset', async (o) => {
      if (mode !== 'step' || busy || cur >= steps.length || modal?.open) return;
      busy = true;
      const st = steps[cur];
      const pre = preOnset(o, 16384);
      const samples = await Mic.capture(o.abs, 0.03, 16384);
      if (!alive || mode !== 'step') { busy = false; return; }
      const j = judgeChord(samples, st.chord, pool, { strict: false, pre });
      if (j.quiet) { busy = false; return; }
      if (j.ok) {
        st.segs.forEach((i) => (hits[i] = fails === 0));
        fb.className = 'feedback ok';
        fb.innerHTML = `<b>${esc(st.chord)} ✓</b>`;
        cur++;
        fails = 0;
        if (cur >= steps.length) stepFinish(); else showStep();
      } else {
        fails++;
        const f = chordFeedback(CHORD[st.chord], j);
        fb.className = 'feedback bad';
        fb.innerHTML = f.html + (fails >= 3 ? ` <button class="btn small" data-fix>🔍 Check ${esc(st.chord)} string by string</button>` : '');
        const fix = $('[data-fix]', fb);
        if (fix) fix.onclick = () => openChordModal(CHORD[st.chord]);
      }
      setTimeout(() => (busy = false), 200);
    })];

    fb.innerHTML = listenBadge() + ' Strum each chord once. The song moves on when it hears the right chord.';
    showStep();
    return () => { alive = false; stopPlay(); modal?.close(); Camera.context = null; offs.forEach((f) => f()); };
  });
}

function showModal(html, mount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal card">${html}</div>`;
  document.body.appendChild(bg);
  let cleanup = null;
  const api = {
    open: true,
    close() { if (!api.open) return; api.open = false; cleanup?.(); bg.remove(); },
  };
  cleanup = mount?.(bg) || null;
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) api.close(); });
  return api;
}

// ---------- Progress helpers ----------
const lessonDone = (id) => !!Store.data.lessons[id];
const nextLesson = () => LESSONS.find((l) => !lessonDone(l.id));
const totalMins = LESSONS.reduce((a, l) => a + l.mins, 0);
const doneMins = () => LESSONS.filter((l) => lessonDone(l.id)).reduce((a, l) => a + l.mins, 0);
const chordLearned = (id) => (Store.data.chords[id]?.clean || 0) >= 3;
const fmtMins = (secs) => (secs < 3600 ? `${Math.round(secs / 60)} min` : `${(secs / 3600).toFixed(1)} h`);

function coachSuggestions() {
  const d = Store.data;
  const out = [];
  const next = nextLesson();
  if (!Mic.running) out.push({ ico: '🎤', html: '<b>Turn on your microphone</b> so I can hear you play.', btn: 'Turn on', act: () => Mic.start(d.settings.micId).then(() => route()) });
  if (d.tunedOn !== Store.today()) out.push({ ico: '🎯', html: "<b>Tune up first.</b> You haven't tuned today, and an out-of-tune guitar makes even perfect fingers sound wrong.", btn: 'Tune (1 min)', href: '#/tuner' });
  if (Store.practiceToday() >= 40 * 60) out.push({ ico: '🧊', html: `<b>You've played ${fmtMins(Store.practiceToday())} today.</b> Nice! Fingertips toughen up during rest. Take a 10-minute break before more.` });
  const trouble = Object.entries(d.chords)
    .map(([id, c]) => ({ id, ...c, rate: c.tries ? c.clean / c.tries : 1 }))
    .filter((c) => c.tries >= 4 && c.rate < 0.6 && CHORD[c.id])
    .sort((a, b) => a.rate - b.rate)[0];
  if (trouble) {
    const worst = Object.entries(trouble.issues || {}).sort((a, b) => b[1] - a[1])[0];
    out.push({
      ico: '🔍',
      html: `<b>${esc(trouble.id)} is clean ${Math.round(trouble.rate * 100)}% of the time.</b> ${worst ? `${cap(stringLabel(+worst[0]))} is usually the problem (${plural(worst[1], 'time')}). ${mutedAdvice(CHORD[trouble.id], +worst[0])}` : 'Run the string-by-string check to find the problem string.'}`,
      btn: `Fix ${trouble.id}`, href: `#/chord/${encodeURIComponent(trouble.id)}`,
    });
  }
  const slow = Object.entries(d.changes).filter(([, v]) => v.best < 25).sort((a, b) => a[1].best - b[1].best)[0];
  if (slow) {
    const [x, y] = slow[0].split('|');
    out.push({ ico: '⏱️', html: `<b>${esc(x)} ↔ ${esc(y)} is your slowest change</b> (best ${slow[1].best} per minute). Songs flow at about 25+. One minute of this a day fixes it fast.`, btn: 'Drill it', href: `#/drill/${encodeURIComponent(x)}/${encodeURIComponent(y)}` });
  }
  const songTrouble = Object.entries(d.songs).filter(([id, s]) => s.best != null && s.best < 70 && SONGS.find((x) => x.id === id)).sort((a, b) => a[1].best - b[1].best)[0];
  if (songTrouble) {
    const s = SONGS.find((x) => x.id === songTrouble[0]);
    out.push({ ico: '🎵', html: `<b>${esc(s.title)}: best ${songTrouble[1].best}%.</b> ${songTrouble[1].trouble ? `The ${esc(songTrouble[1].trouble)} change trips you up.` : ''} Try it at a slower speed until it's 80%+.`, btn: 'Play it', href: `#/song/${s.id}` });
  }
  if (next) out.push({ ico: '👉', html: `<b>Next lesson: ${esc(next.title)}</b> (${next.mins} min) in "${esc(next.moduleTitle)}".`, btn: 'Start', href: `#/lesson/${next.id}` });
  else {
    const untried = SONGS.find((s) => !d.songs[s.id]?.best);
    if (untried) out.push({ ico: '🎸', html: `<b>Quickstart complete!</b> Learn a new song: <b>${esc(untried.title)}</b>.`, btn: 'Go', href: `#/song/${untried.id}` });
  }
  return out.slice(0, 5);
}

function tipsHTML(list) {
  return list.map((t, i) => `<div class="tip"><div class="ico">${t.ico}</div><div class="grow"><p>${t.html}</p></div>${t.btn ? (t.href ? `<a class="btn small" href="${t.href}">${esc(t.btn)}</a>` : `<button class="btn small" data-act="${i}">${esc(t.btn)}</button>`) : ''}</div>`).join('');
}
function bindTips(root, list) {
  $$('[data-act]', root).forEach((b) => (b.onclick = () => list[+b.dataset.act].act()));
}

// ---------- Screens ----------
const Views = {
  home(root) {
    const d = Store.data;
    const next = nextLesson();
    const pct = Math.round((doneMins() / totalMins) * 100);
    const learned = CHORDS.filter((c) => chordLearned(c.id)).length;
    const tips = coachSuggestions();
    const slowPair = Object.entries(d.changes).sort((a, b) => a[1].best - b[1].best)[0]?.[0]?.split('|') || ['G', 'C'];
    const songForToday = SONGS.find((s) => d.songs[s.id]?.practiced && (d.songs[s.id].best || 0) < 85) || SONGS.find((s) => !d.songs[s.id]) || SONGS[0];
    root.innerHTML = `
      <div class="card hero">
        <div class="row between" style="align-items:flex-start">
          <div class="grow" style="min-width:260px">
            <div class="chip accent">4-hour Quickstart</div>
            <h1 style="margin-top:12px">${next ? (doneMins() ? 'Welcome back. Keep going.' : "Let's get you playing.") : "You're a guitar player now. 🎸"}</h1>
            <p class="muted big">${next ? `From zero to strumming real songs. ${pct}% done.` : 'Quickstart complete. Keep practicing daily with the workout below.'}</p>
            <div class="bar" style="max-width:520px"><i style="width:${pct}%"></i></div>
            <div class="row" style="margin-top:18px">
              ${next ? `<a class="btn primary big" href="#/lesson/${next.id}">${doneMins() ? 'Continue' : 'Start'}: ${esc(next.title)} →</a>` : '<a class="btn primary big" href="#/songs">Pick a song →</a>'}
              <a class="btn big ghost" href="#/lessons">See all lessons</a>
            </div>
          </div>
          <div style="font-size:5.5rem;line-height:1">🎸</div>
        </div>
      </div>
      <div class="grid four" style="margin-top:16px">
        <div class="stat"><b>${fmtMins(Store.practiceToday())}</b><span>played today</span></div>
        <div class="stat"><b>${Store.streak()} 🔥</b><span>day streak</span></div>
        <div class="stat"><b>${learned}/${CHORDS.length}</b><span>chords learned</span></div>
        <div class="stat"><b>${Object.values(d.songs).filter((s) => s.practiced || s.best).length}</b><span>songs played</span></div>
      </div>
      <div class="section-title"><h2>Your coach says</h2></div>
      <div data-tips>${tipsHTML(tips)}</div>
      <div class="section-title"><h2>Today's 20-minute workout</h2><span class="muted small">do this every day</span></div>
      <div class="grid three">
        <a class="card lesson" href="#/tuner"><span class="check">1</span><span><span class="t">Tune up</span><br><span class="m">1 min</span></span></a>
        <a class="card lesson" href="#/drill/${encodeURIComponent(slowPair[0])}/${encodeURIComponent(slowPair[1])}"><span class="check">2</span><span><span class="t">Changes: ${esc(slowPair[0])} ↔ ${esc(slowPair[1])}</span><br><span class="m">3 × 1 min, your slowest pair</span></span></a>
        <a class="card lesson" href="#/rhythm/campfire"><span class="check">3</span><span><span class="t">Strumming: campfire</span><br><span class="m">5 min</span></span></a>
        <a class="card lesson" href="#/song/${songForToday.id}"><span class="check">4</span><span><span class="t">Song: ${esc(songForToday.title)}</span><br><span class="m">10 min</span></span></a>
      </div>`;
    bindTips(root, tips);
  },

  lessons(root) {
    const next = nextLesson();
    root.innerHTML = `<h1>The 4-hour Quickstart</h1>
      <p class="muted big">About ${Math.round(totalMins / 60 * 10) / 10} hours total. Do it in one day or spread it over a week: 20–30 minutes at a time is kindest to your fingertips. Progress saves automatically.</p>
      <div class="bar" style="margin:14px 0 30px"><i style="width:${Math.round((doneMins() / totalMins) * 100)}%"></i></div>
      ${MODULES.map((m, mi) => `<div class="module"><h2><span class="num">${mi + 1}</span>${esc(m.title)}</h2>
        <div class="lesson-list">${m.lessons.map((l) => `<a class="lesson ${lessonDone(l.id) ? 'done' : ''} ${next?.id === l.id ? 'next' : ''}" href="#/lesson/${l.id}">
          <span class="check">${lessonDone(l.id) ? '✓' : ''}</span><span><span class="t">${esc(l.title)}</span><br><span class="m">${l.mins} min${next?.id === l.id ? ' · up next' : ''}</span></span></a>`).join('')}</div></div>`).join('')}`;
  },

  lesson(root, id) {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) return Views.notFound(root);
    let step = 0, inner = null;
    const passed = new Set();
    root.innerHTML = `<div class="row between"><a href="#/lessons" class="muted small">← All lessons</a><span class="muted small">${esc(lesson.moduleTitle)} · ${lesson.mins} min</span></div>
      <h1 style="margin-top:10px">${esc(lesson.title)}</h1>
      <div class="steps-dots" data-dots></div>
      <div class="card" style="margin-top:18px">
        <h2 data-title></h2>
        <div class="lesson-body" data-body></div>
        <div class="lesson-foot">
          <button class="btn ghost" data-back>← Back</button>
          <span class="grow"></span>
          <button class="btn ghost" data-skip>Skip for now</button>
          <button class="btn primary" data-next>Next →</button>
        </div>
      </div>`;
    const setPass = () => { passed.add(step); $('[data-next]', root).disabled = false; $('[data-skip]', root).classList.add('hidden'); };
    const show = () => {
      inner?.();
      inner = null;
      Metro.stop();
      Camera.context = null;
      const s = lesson.steps[step];
      $('[data-dots]', root).innerHTML = lesson.steps.map((_, i) => `<i class="${i < step || passed.has(i) ? 'done' : i === step ? 'cur' : ''}"></i>`).join('');
      const body = $('[data-body]', root);
      const titles = { mic: 'Turn on the microphone', camera: 'Turn on the camera (optional)', tuner: 'Tune up', strings: 'Pluck each string', latency: 'Sync the timing' };
      const chordTitle = s.chord && CHORD[s.chord] ? `${CHORD[s.chord].name} (${s.chord})` : '';
      $('[data-title]', root).textContent = s.title || titles[s.type] || chordTitle || (s.type === 'change' ? `Switch ${s.a} ↔ ${s.b}` : s.type === 'song' ? SONGS.find((x) => x.id === s.song)?.title : '');
      $('[data-back]', root).style.visibility = step ? 'visible' : 'hidden';
      $('[data-next]', root).textContent = step === lesson.steps.length - 1 ? 'Finish lesson ✓' : 'Next →';
      $('[data-next]', root).disabled = !passed.has(step);
      $('[data-skip]', root).classList.toggle('hidden', passed.has(step));
      const onPass = setPass;
      switch (s.type) {
        case 'read': body.innerHTML = `<div class="prose">${s.html}</div>`; setPass(); break;
        case 'mic': inner = MicSetup(body, { onPass }); if (Mic.running) setPass(); break;
        case 'camera': inner = CameraSetup(body, { onPass }); break;
        case 'camera-check': inner = CameraSetup(body, { onPass, needBoth: true }); break;
        case 'tuner': inner = Tuner(body, { onPass, requireAll: s.requireAll }); if (Store.data.tunedOn === Store.today()) setPass(); break;
        case 'strings': inner = StringCheck(body, { chord: s.chord === 'open' ? OPEN_STRINGS : CHORD[s.chord], onPass }); break;
        case 'chord': inner = ChordTrainer(body, { chord: CHORD[s.chord], strums: s.strums, onPass }); break;
        case 'change': inner = ChangeDrill(body, { a: s.a, b: s.b, goal: s.goal, onPass }); break;
        case 'latency': inner = Latency(body, { onPass }); break;
        case 'rhythm': inner = Rhythm(body, { ...s, onPass }); break;
        case 'riff': inner = Riff(body, { riff: RIFFS.find((r) => r.id === s.riff), tempo: s.tempo, onPass }); break;
        case 'song': inner = SongPlayer(body, { song: SONGS.find((x) => x.id === s.song), onPass }); break;
      }
    };
    const complete = () => {
      inner?.();
      inner = null;
      Store.set((d) => (d.lessons[lesson.id] = Store.today()));
      const next = nextLesson();
      $('[data-title]', root).textContent = '';
      $('[data-dots]', root).innerHTML = lesson.steps.map(() => '<i class="done"></i>').join('');
      $('[data-body]', root).innerHTML = `<div class="celebrate"><div class="emoji">🎉</div><h2>Lesson complete!</h2>
        <p class="muted big">${next ? `Up next: <b>${esc(next.title)}</b> (${next.mins} min)` : "That's the whole Quickstart. You did it!"}</p>
        <div class="row" style="justify-content:center">${next ? `<a class="btn primary big" href="#/lesson/${next.id}">Next lesson →</a>` : '<a class="btn primary big" href="#/songs">Play songs →</a>'}<a class="btn big ghost" href="#/">Home</a></div>
        <p class="small dim" style="margin-top:18px">Fingers sore? That's normal. Take a break; your progress is saved.</p></div>`;
      root.querySelector('.lesson-foot').classList.add('hidden');
    };
    $('[data-back]', root).onclick = () => { if (step > 0) { step--; show(); } };
    const advance = () => { if (step < lesson.steps.length - 1) { step++; show(); } else complete(); };
    $('[data-next]', root).onclick = advance;
    $('[data-skip]', root).onclick = () => { passed.add(step); advance(); };
    show();
    return () => inner?.();
  },

  chords(root) {
    const levels = { 1: 'Start here', 2: 'Core chords', 3: 'A bit harder' };
    root.innerHTML = `<h1>Chords</h1><p class="muted big">Click a chord to learn it. The coach checks every string, then your strum.</p>
      ${[1, 2, 3].map((lv) => `<div class="section-title"><h2>${levels[lv]}</h2></div><div class="grid four">${CHORDS.filter((c) => c.level === lv).map((c) => {
        const st = Store.data.chords[c.id];
        return `<a class="card chord-card" href="#/chord/${encodeURIComponent(c.id)}"><div class="name">${esc(c.id)}</div><div class="small muted">${esc(c.name)}</div>${chordSVG(c, { w: 120 })}
          <div style="margin-top:8px">${chordLearned(c.id) ? '<span class="chip ok">✓ learned</span>' : st?.tries ? `<span class="chip">${st.clean}/${st.tries} clean</span>` : '<span class="chip">new</span>'}</div></a>`;
      }).join('')}</div>`).join('')}`;
  },

  chord(root, id) {
    const chord = CHORD[id];
    if (!chord) return Views.notFound(root);
    const others = CHORDS.filter((c) => c.id !== id && c.level <= 2).map((c) => c.id);
    const songs = SONGS.filter((s) => songChords(s).includes(id));
    root.innerHTML = `<a href="#/chords" class="muted small">← All chords</a>
      <h1 style="margin-top:10px">${esc(chord.name)} <span class="muted">(${esc(chord.id)})</span></h1>
      <p class="muted big">${esc(chord.tip)}</p>
      <div class="card" data-trainer></div>
      <div class="section-title"><h2>Practice switching to…</h2></div>
      <div class="row">${others.map((o) => `<a class="btn small" href="#/drill/${encodeURIComponent(id)}/${encodeURIComponent(o)}">${esc(id)} ↔ ${esc(o)}</a>`).join('')}</div>
      ${songs.length ? `<div class="section-title"><h2>Songs with ${esc(id)}</h2></div><div class="row">${songs.map((s) => `<a class="btn small ghost" href="#/song/${s.id}">${esc(s.title)}</a>`).join('')}</div>` : ''}`;
    return ChordTrainer($('[data-trainer]', root), { chord, strums: 3, onPass: () => toast(`${chord.id} learned ✓`) });
  },

  drill(root, a, b) {
    if (!CHORD[a] || !CHORD[b]) return Views.notFound(root);
    root.innerHTML = `<a href="#/chords" class="muted small">← Chords</a><h1 style="margin-top:10px">Chord changes</h1><div class="card" data-x></div>`;
    return ChangeDrill($('[data-x]', root), { a, b, goal: 15 });
  },

  rhythm(root, pattern) {
    if (!PATTERNS[pattern]) return Views.notFound(root);
    root.innerHTML = `<h1>Strumming practice</h1>
      <div class="row" style="margin-bottom:16px">${Object.entries(PATTERNS).filter(([k]) => k !== 'waltz').map(([k, p]) => `<a class="btn small ${k === pattern ? 'primary' : ''}" href="#/rhythm/${k}">${esc(p.name)}</a>`).join('')}</div>
      <div class="card" data-x></div>`;
    return Rhythm($('[data-x]', root), { pattern, chords: ['G', 'C', 'D', 'G'], bpm: 65, bars: 4 });
  },

  songs(root) {
    const stars = (n) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(3 - n) + '</span>';
    root.innerHTML = `<h1>Songs</h1><p class="muted big">Chord charts are built in. Practice mode waits for you to get each chord right; play-along keeps the beat and scores you.</p>
      <div class="section-title"><h2>Riffs (single notes)</h2></div>
      <div class="grid three">${RIFFS.filter((r) => !r.hidden).map((r) => {
        const st = Store.data.riffs[r.id];
        return `<a class="card song-card" href="#/riff/${r.id}"><div class="title">${esc(r.title)}</div><div class="muted small">${esc(r.artist)}</div><p class="small" style="margin:8px 0 0">${esc(r.note)}</p>
          <div class="chips">${st?.done ? '<span class="chip ok">✓ learned</span>' : ''}${st?.best ? `<span class="chip">best ${st.best}%</span>` : ''}</div></a>`;
      }).join('')}</div>
      <div class="section-title"><h2>Strumming songs</h2></div>
      <div class="grid three">${SONGS.map((s) => {
        const st = Store.data.songs[s.id];
        return `<a class="card song-card" href="#/song/${s.id}"><div class="row between"><div class="title">${esc(s.title)}</div><span class="stars small">${stars(s.difficulty)}</span></div>
          <div class="muted small">${esc(s.artist)} · ${s.bpm} BPM</div><p class="small" style="margin:8px 0 0">${esc(s.note)}</p>
          <div class="chips">${songChords(s).map((c) => `<span class="chip ${chordLearned(c) ? 'ok' : ''}">${esc(c)}</span>`).join('')}${st?.best != null ? `<span class="chip accent">best ${st.best}%</span>` : ''}</div></a>`;
      }).join('')}</div>`;
  },

  song(root, id) {
    const song = SONGS.find((s) => s.id === id);
    if (!song) return Views.notFound(root);
    root.innerHTML = `<a href="#/songs" class="muted small">← All songs</a><h1 style="margin-top:10px">${esc(song.title)} <span class="muted" style="font-weight:500">· ${esc(song.artist)}</span></h1><p class="muted">${esc(song.note)}</p><div data-x></div>`;
    return SongPlayer($('[data-x]', root), { song, onPass: () => {} });
  },

  riff(root, id) {
    const riff = RIFFS.find((r) => r.id === id);
    if (!riff) return Views.notFound(root);
    root.innerHTML = `<a href="#/songs" class="muted small">← Songs & riffs</a><h1 style="margin-top:10px">${esc(riff.title)} <span class="muted" style="font-weight:500">· ${esc(riff.artist)}</span></h1><div class="card" data-x></div>`;
    return Riff($('[data-x]', root), { riff, tempo: true });
  },

  tuner(root) {
    root.innerHTML = `<h1>Tuner</h1><p class="muted big">Pluck a string. It finds the closest string automatically, or click one to lock it.</p><div data-x></div>`;
    return Tuner($('[data-x]', root), {});
  },

  settings(root) {
    const s = Store.data.settings;
    root.innerHTML = `<h1>Settings</h1><div class="card">
      <div class="setting"><div class="d"><b>Microphone</b><div class="small muted">Use the mic closest to your guitar. A USB or headset mic beats a laptop mic.</div></div><select data-mic><option value="">Default</option></select></div>
      <div class="setting"><div class="d"><b>Camera</b></div><select data-cam><option value="">Default</option></select></div>
      <div class="setting"><div class="d"><b>Left-handed</b><div class="small muted">Flips chord diagrams and swaps which hand the camera treats as your strumming hand.</div></div><label class="toggle"><input type="checkbox" data-lefty ${s.lefty ? 'checked' : ''}> Lefty</label></div>
      <div class="setting"><div class="d"><b>Camera mixes up my hands</b><div class="small muted">If the camera labels your fretting hand as "strumming", turn this on.</div></div><label class="toggle"><input type="checkbox" data-swap ${s.swapHands ? 'checked' : ''}> Swap hands</label></div>
      <div class="setting"><div class="d"><b>Listening sensitivity</b><div class="small muted">Raise it if the coach misses soft strums. Lower it if it reacts to noise or talking.</div></div><input type="range" min="0.5" max="2" step="0.1" value="${s.sensitivity}" data-sens style="max-width:220px"></div>
      <div class="setting"><div class="d"><b>Metronome volume</b></div><input type="range" min="0.1" max="1" step="0.05" value="${s.clickVol}" data-vol style="max-width:220px"></div>
      <div class="setting"><div class="d"><b>Timing delay: <span data-lat>${Math.round(s.latency * 1000)} ms</span></b><div class="small muted">Measured so rhythm scores are fair. Re-run if you change headphones or speakers.</div></div><a class="btn small" href="#/calibrate">Measure again</a></div>
      <div class="setting"><div class="d"><b>Your progress</b><div class="small muted">Saved in this browser on this computer. Download a backup to move it to another computer.</div></div>
        <div class="row"><button class="btn small" data-export>Download backup</button><label class="btn small">Restore backup<input type="file" accept=".json" data-import hidden></label><button class="btn small danger" data-reset>Reset everything</button></div></div>
    </div>`;
    navigator.mediaDevices?.enumerateDevices?.().then((list) => {
      const fill = (sel, kind, cur) => list.filter((d) => d.kind === kind).forEach((d, i) => sel.insertAdjacentHTML('beforeend', `<option value="${esc(d.deviceId)}" ${d.deviceId === cur ? 'selected' : ''}>${esc(d.label || `${kind === 'audioinput' ? 'Microphone' : 'Camera'} ${i + 1}`)}</option>`));
      fill($('[data-mic]', root), 'audioinput', s.micId);
      fill($('[data-cam]', root), 'videoinput', s.camId);
    });
    $('[data-mic]', root).onchange = async (e) => { Store.set((d) => (d.settings.micId = e.target.value)); if (Mic.running) { Mic.stop(); await Mic.start(e.target.value); } toast('Microphone changed'); };
    $('[data-cam]', root).onchange = async (e) => { Store.set((d) => (d.settings.camId = e.target.value)); if (Camera.active) { Camera.stop(); await Camera.start(e.target.value); } toast('Camera changed'); };
    $('[data-lefty]', root).onchange = (e) => Store.set((d) => (d.settings.lefty = e.target.checked));
    $('[data-swap]', root).onchange = (e) => Store.set((d) => (d.settings.swapHands = e.target.checked));
    $('[data-sens]', root).oninput = (e) => { Store.set((d) => (d.settings.sensitivity = +e.target.value)); Mic.setSensitivity(+e.target.value); };
    $('[data-vol]', root).oninput = (e) => Store.set((d) => (d.settings.clickVol = +e.target.value));
    $('[data-export]', root).onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' }));
      a.download = `strum-coach-backup-${Store.today()}.json`;
      a.click();
    };
    $('[data-import]', root).onchange = async (e) => {
      try { Store.import(await e.target.files[0].text()); toast('Progress restored ✓'); route(); }
      catch (err) { toast('That file didn’t work: ' + esc(err.message)); }
    };
    $('[data-reset]', root).onclick = () => { if (confirm('Erase all your progress? This cannot be undone.')) { Store.reset(); toast('Progress reset'); route(); } };
  },

  calibrate(root) {
    root.innerHTML = `<a href="#/settings" class="muted small">← Settings</a><h1 style="margin-top:10px">Measure timing delay</h1><div class="card" data-x></div>`;
    return Latency($('[data-x]', root), { onPass: () => {} });
  },

  notFound(root) {
    root.innerHTML = '<h1>Not found</h1><p><a href="#/">Go home</a></p>';
  },
};

// ---------- Camera panel ----------
const HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

function CameraPanel() {
  const panel = $('#campanel');
  const cv = $('canvas', panel);
  const g = cv.getContext('2d');
  const coach = $('.coach', panel);
  let lastCoach = 0;
  $('[data-min]', panel).onclick = () => document.body.classList.toggle('cam-min', panel.classList.toggle('min'));
  $('[data-swap]', panel).onclick = () => { Store.set((d) => (d.settings.swapHands = !d.settings.swapHands)); toast('Swapped which hand is which'); };
  $('[data-off]', panel).onclick = () => Camera.stop();
  Camera.on('state', () => {
    panel.classList.toggle('hidden', !Camera.active);
    document.body.classList.toggle('cam-on', Camera.active);
  });

  const drawHand = (hand, color, label) => {
    const W = cv.width, H = cv.height;
    const P = (p) => [(1 - p.x) * W, p.y * H];
    g.strokeStyle = color; g.lineWidth = 2.5;
    HAND_LINKS.forEach(([a, b]) => { const [x1, y1] = P(hand.lm[a]); const [x2, y2] = P(hand.lm[b]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); });
    hand.lm.forEach((p, i) => {
      const [x, y] = P(p);
      let c = color;
      if (label === 'fretting' && [8, 12, 16, 20].includes(i)) {
        const st = Camera.fingerState(i / 4 - 1);
        c = st === 'flat' ? '#ff6b5b' : st === 'curled' ? '#3ecf8e' : color;
      }
      g.fillStyle = c; g.beginPath(); g.arc(x, y, [4, 8, 12, 16, 20].includes(i) ? 5 : 3, 0, Math.PI * 2); g.fill();
    });
    const [wx, wy] = P(hand.lm[0]);
    g.font = 'bold 13px system-ui'; g.fillStyle = 'rgba(0,0,0,.6)';
    const tw = g.measureText(label).width;
    g.fillRect(wx - tw / 2 - 5, wy + 8, tw + 10, 20);
    g.fillStyle = color; g.fillText(label, wx - tw / 2, wy + 23);
  };

  Camera.on('frame', () => {
    if (!Camera.video) return;
    const v = Camera.video;
    if (cv.width !== v.videoWidth && v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
    g.save(); g.scale(-1, 1); g.drawImage(v, -cv.width, 0, cv.width, cv.height); g.restore();
    if (Camera.fret) drawHand(Camera.fret, '#f5a524', 'fretting');
    if (Camera.strum) drawHand(Camera.strum, '#6fb6ff', 'strumming');
    const now = performance.now();
    if (now - lastCoach > 250) { lastCoach = now; coach.innerHTML = cameraCoach(); }
  });
}

function cameraCoach() {
  const line = (cls, ico, html) => `<div class="status ${cls}"><span class="s-ico">${ico}</span><span>${html}</span></div>`;
  const fret = Camera.seen('fret'), strum = Camera.seen('strum');
  const ctx = Camera.context;
  if (!fret && !strum) return line('warn', '👀', "I can't see your hands. Get both hands and the guitar neck in the picture, with light in front of you.");
  let out = '';
  if (!fret) out += line('warn', '✋', "I can't see your fretting hand. Turn the neck a little toward the camera.");
  if (ctx?.type === 'chord' && fret) {
    const used = [...new Set(ctx.chord.fingers.filter((f) => f > 0))];
    const states = used.map((f) => ({ f, st: Camera.fingerState(f) }));
    out += `<div class="fingers">${states.map(({ f, st }) => `<span class="chip ${st === 'flat' ? '' : st ? 'ok' : ''}" style="${st === 'flat' ? 'color:var(--bad);border-color:#6b2b24' : ''}">${cap(fingerName(f))} ${st === 'flat' ? 'flat ✗' : st ? '✓' : '?'}</span>`).join('')}</div>`;
    const flat = states.find((x) => x.st === 'flat');
    out += flat
      ? line('bad', '☝️', `Your <b>${fingerName(flat.f)}</b> finger looks flat. Curl it so the tip comes straight down, like a claw. Flat fingers mute the string below.`)
      : line('ok', '✓', 'Finger shape looks good. Thumb behind the neck, wrist relaxed.');
  } else if (ctx?.type === 'rhythm') {
    if (!strum) out += line('warn', '✋', "I can't see your strumming hand.");
    else {
      const m = Camera.strumMotion();
      if (m !== null && m < 0.015 && Mic.running && performance.now() - Mic.lastOnsetPerf < 3000) out += line('warn', '〰️', 'Keep your strumming hand moving like a pendulum, even on skipped beats.');
      const last = ctx.last;
      if (last?.got) out += line(last.got === last.want ? 'ok' : 'bad', last.got === 'D' ? '↓' : '↑', `Last strum: ${last.got === 'D' ? 'down' : 'up'}${last.got === last.want ? ' ✓' : `, should be ${last.want === 'D' ? 'down' : 'up'}`}`);
      else out += line('ok', '✓', 'Watching your strumming direction.');
    }
  } else {
    out += line('ok', '✓', `Tracking ${fret && strum ? 'both hands' : 'your hand'}.`);
  }
  return out;
}

// ---------- Header + navigation ----------
function Header() {
  const micPill = $('#micpill'), camPill = $('#campill');
  const paint = () => {
    micPill.classList.toggle('on', Mic.running);
    camPill.classList.toggle("on", Camera.active);
    $('.lbl', camPill).textContent = Camera.loading ? 'Loading…' : 'Camera';
  };
  micPill.onclick = async () => {
    if (Mic.running) Mic.stop();
    else if (!(await Mic.start(Store.data.settings.micId))) toast(esc(Mic.error), 5000);
  };
  camPill.onclick = async () => {
    if (Camera.active) Camera.stop();
    else if (!(await Camera.start(Store.data.settings.camId))) toast(esc(Camera.error), 6000);
  };
  Mic.on('state', paint);
  Camera.on('state', paint);
  Mic.on('level', (l) => ($('.meter i', micPill).style.width = Math.min(100, Math.sqrt(l) * 260) + '%'));
  paint();
}

let cleanupView = null;
function route() {
  cleanupView?.();
  cleanupView = null;
  Metro.stop();
  Camera.context = null;
  const main = $('#main');
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [name = '', ...args] = hash.split('/');
  const view = { '': 'home', lessons: 'lessons', lesson: 'lesson', chords: 'chords', chord: 'chord', drill: 'drill', rhythm: 'rhythm', songs: 'songs', song: 'song', riff: 'riff', tuner: 'tuner', settings: 'settings', calibrate: 'calibrate' }[name] || 'notFound';
  const tab = { home: '', lessons: 'lessons', lesson: 'lessons', chords: 'chords', chord: 'chords', drill: 'chords', rhythm: 'chords', songs: 'songs', song: 'songs', riff: 'songs', tuner: 'tuner', settings: 'settings', calibrate: 'settings' }[view];
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  main.innerHTML = '';
  cleanupView = Views[view](main, ...args) || null;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => {
  Header();
  CameraPanel();
  route();
  if (!window.isSecureContext) toast('Open this page over https (or as a local file) so the microphone and camera can work.', 8000);
});
