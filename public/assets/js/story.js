import { $, esc, api, initChrome, mediaHtml, storyCard, sectionById, timeAgo, fmtDate, shareButtons, signupHtml, wireSignups, ICON } from './site.js';

const WHY = {
  models: 'New model releases reset what products can do, what they cost, and what competitors have to match.',
  markets: 'AI spending has become one of the biggest forces moving stocks, and moves like this ripple through the whole sector.',
  policy: 'The rules being written now will decide who can build AI, who can sell it, and how it can be used.',
  startups: 'Where investors put money is the clearest signal of which AI businesses they expect to last.',
  mainstreet: 'This is AI showing up in everyday businesses, where the real productivity gains (or disappointments) happen.',
  research: 'Today’s research results tend to become next year’s product features.',
  tech: 'AI is reshaping the devices and platforms people already use every day.',
  ai: 'It’s one of the moves shaping how fast AI spreads through the economy.',
};

const id = location.pathname.split('/').filter(Boolean)[1] || '';
const qs = new URLSearchParams(location.search);
const root = $('#story');

async function main() {
  let data;
  try {
    const params = new URLSearchParams({ id });
    if (qs.get('u')) params.set('u', qs.get('u'));
    if (qs.get('s')) params.set('s', qs.get('s'));
    data = await api(`/api/story?${params}`);
  } catch (e) {
    initChrome();
    root.innerHTML = `<div class="page-head" style="border:0;text-align:center;padding:60px 0"><h1 style="font-size:36px">This story has rolled off the wire.</h1><p style="margin:0 auto 20px">Stories stay on the live desk for a few days. Here's what's happening now.</p><a class="btn btn-primary" href="/">See today's top stories</a>${qs.get('u') ? ` <a class="btn" href="${esc(qs.get('u'))}" target="_blank" rel="noopener">Open original article</a>` : ''}</div>`;
    return;
  }
  const { story: s, more, aiAvailable } = data;
  const sec = sectionById(s.section);
  initChrome({ active: s.section });
  document.title = `${s.title} · Tensor Street`;
  document.querySelector('meta[name=description]')?.setAttribute('content', s.summary || s.title);

  const initials = (s.source || '?').replace(/^The /, '').slice(0, 1).toUpperCase();
  root.innerHTML = `
    <div class="crumbs"><a href="/">Home</a> / <a href="/section/${esc(s.section)}">${esc(sec.long)}</a></div>
    <header class="article-head" data-sec="${esc(s.section)}" style="margin-top:18px">
      <span class="chip solid">${esc(sec.name)}</span>${s.breaking ? ' <span class="pill live" style="margin-left:6px"><span class="dot red"></span>Developing</span>' : ''}
      <h1>${esc(s.title)}</h1>
    </header>
    <div class="byline">
      <div class="avatar" aria-hidden="true">${esc(initials)}</div>
      <div><div class="who">${esc(s.source)}${s.author ? ` <span style="color:var(--muted);font-weight:400">· ${esc(s.author)}</span>` : ''}</div><div class="when">${fmtDate(s.date, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${timeAgo(s.date)}${s.coverage > 1 ? ` · Covered by ${s.coverage} outlets` : ''}</div></div>
      <div class="share">${shareButtons(location.href, s.title)}</div>
    </div>
    <figure class="article-figure">${mediaHtml(s)}${s.image ? `<figcaption>Image via ${esc(s.source)}</figcaption>` : ''}</figure>
    ${aiAvailable ? `<div class="credit">Originally reported by <a href="${esc(s.url)}" target="_blank" rel="noopener"><b>${esc(s.source)}</b> ${ICON.ext}</a></div>
    <div id="full" aria-live="polite"><p class="meta" style="margin-bottom:12px">The Tensor Street desk is writing this story up…</p><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:85%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:70%"></div></div>` : ''}
    <section class="takebox" id="take"${aiAvailable ? ' hidden' : ''}>
      <div class="takebox-head"><span>The Brief</span><span>${aiAvailable ? 'Desk analysis' : esc(sec.long)}</span></div>
      <div class="takebox-body">
        ${s.summary ? `<p>${esc(s.summary)}</p>` : `<p>${esc(s.source)} is reporting: <strong>${esc(s.title)}</strong>.</p>`}
        <div><h4>Why it matters</h4><p>${esc(WHY[s.section] || WHY.ai)}</p></div>
      </div>
    </section>
    <div class="readout"><div><div class="t">${aiAvailable ? 'Want the original reporting?' : 'Read the full report'}</div><div class="s">${esc(s.source)}</div></div><a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">Continue reading ${ICON.ext}</a></div>
    ${
      s.related?.length
        ? `<section style="margin-bottom:32px"><div class="sec-head"><h2><span class="bar"></span>Also covering this story</h2></div><ul class="coverage">${s.related
            .map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><div class="meta" style="margin-top:4px"><span class="src">${esc(r.source)}</span><span class="sep"></span><span>${timeAgo(r.date)}</span></div></li>`)
            .join('')}</ul></section>`
        : ''
    }
    ${s.tags?.length ? `<div class="tags" style="margin-bottom:32px">${s.tags.map((t) => `<a href="/search?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
    <div id="subscribe">${signupHtml()}</div>`;
  wireSignups(root);

  if (more?.length) {
    $('#more').innerHTML = `<div data-sec="${esc(s.section)}"><div class="sec-head"><h2><span class="bar"></span>More in ${esc(sec.long)}</h2><a class="more" href="/section/${esc(s.section)}">See all ${ICON.arrow}</a></div><div class="cards-3">${more.slice(0, 3).map((m) => storyCard(m)).join('')}</div></div>`;
  }

  if (aiAvailable) {
    const params = new URLSearchParams({ id: s.id, u: s.url, s: s.sig, full: '1' });
    const full = $('#full');
    try {
      const { article: a } = await api(`/api/story?${params}`, { timeout: 60000 });
      if (!a) throw new Error('none');
      root.querySelector('.article-head h1').textContent = a.headline;
      if (a.dek) root.querySelector('.article-head h1').insertAdjacentHTML('afterend', `<p class="dek">${esc(a.dek)}</p>`);
      document.title = `${a.headline} · Tensor Street`;
      root.querySelector('.byline .who').innerHTML = `Tensor Street Desk <span style="color:var(--muted);font-weight:400">· based on reporting by ${esc(s.source)}</span>`;
      root.querySelector('.byline .avatar').textContent = 'TS';
      full.innerHTML = `${a.keyPoints?.length ? `<section class="takebox"><div class="takebox-head"><span>Key points</span><span>${esc(sec.long)}</span></div><div class="takebox-body"><ul>${a.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div></section>` : ''}
        <div class="prose">${a.html}</div>
        <div class="ai-note" style="margin:28px 0">${ICON.spark.replace('<svg', '<svg width="15" height="15" style="flex:none;margin-top:2px"')}<span>Written by the Tensor Street desk with AI assistance, based on <a href="${esc(s.url)}" target="_blank" rel="noopener" style="text-decoration:underline">original reporting by ${esc(s.source)}</a>${s.related?.length ? ' and other outlets' : ''}. Facts are theirs; the words are ours.</span></div>`;
    } catch {
      // No AI article right now → show the short brief instead.
      full.remove();
      $('#take').hidden = false;
    }
  }
}

main();
