import { $, esc, api, initChrome, LOGO_MARK, mediaHtml, photoCard, sectionById, timeAgo, fmtDate, shareButtons, signupHtml, wireSignups, ICON } from './site.js';
import { readingProgress } from './progress.js';

const slugTopic = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const WHY = {
  models: 'Every frontier release resets the price-performance curve. Competitors now have to match it, undercut it, or explain why they can’t.',
  markets: 'AI capex is the single largest driver of tech earnings right now. Moves like this reprice the whole sector, not just one ticker.',
  policy: 'The rules being written now decide who gets to build frontier AI, who gets to sell it, and what it costs to comply.',
  startups: 'Capital is the clearest signal in AI. Where it flows shows which business models investors expect to survive the shakeout.',
  mainstreet: 'This is AI reaching the real economy, where productivity gains either show up on the P&L or they don’t.',
  research: 'Today’s research result is next year’s product feature. This is where the next capability jump comes from.',
  tech: 'AI is being rebuilt into the platforms people already use every day, and the distribution advantage is enormous.',
  ai: 'It is one more data point on how fast AI is moving from demo to deployment across the economy.',
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
  } catch {
    initChrome();
    root.innerHTML = `<div class="page-head" style="border:0;text-align:center;padding:60px 0"><h1>This story has rolled off the wire.</h1><p style="margin:0 auto 20px">Stories stay on the live desk for a few days. Here’s what’s moving now.</p><a class="btn btn-primary" href="/">Today’s top stories</a></div>`;
    return;
  }
  const { story: s, more = [], aiAvailable } = data;
  const sec = sectionById(s.section);
  initChrome({ active: s.section });
  document.title = `${s.title} | Kelvane Club`;

  const others = (s.related || []).map((r) => r.source).filter((x, i, a) => x && x !== s.source && a.indexOf(x) === i);
  root.innerHTML = `
    <div class="crumbs"><a href="/">Home</a> / <a href="/section/${esc(s.section)}">${esc(sec.long)}</a></div>
    <header class="article-head" style="margin-top:18px">
      <span class="chip solid">${esc(sec.name)}</span>${s.breaking ? ' <span class="pill live" style="margin-left:6px"><span class="dot red"></span>Developing</span>' : ''}
      <h1 id="hl">${esc(s.title)}</h1>
      ${s.summary ? `<p class="dek" id="dek">${esc(s.summary)}</p>` : '<p class="dek" id="dek" hidden></p>'}
    </header>
    <div class="byline">
      <div class="avatar logo-av" aria-hidden="true">${LOGO_MARK}</div>
      <div><div class="who">Kelvane Club Desk</div><div class="when">${fmtDate(s.date, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${timeAgo(s.date)}<span id="rt"></span></div></div>
      <div class="share">${shareButtons(location.origin + location.pathname + location.search, s.title)}</div>
    </div>
    <div class="src-line"><span class="dot"></span><span>Source: reporting by <b>${esc(s.source)}</b>${others.length ? `, also covered by ${others.slice(0, 3).map((o) => `<b>${esc(o)}</b>`).join(', ')}` : ''}.</span></div>
    <figure class="article-figure">${mediaHtml(s)}${s.image ? `<figcaption>Image: ${esc(s.source)}</figcaption>` : ''}</figure>
    <div id="full" aria-live="polite">${
      aiAvailable
        ? `<div class="writing"><span class="pulse"></span>The Kelvane Club desk is writing up this story…</div><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:85%"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:70%"></div>`
        : briefHtml(s, sec)
    }</div>
    ${s.tags?.length ? `<div class="tags" style="margin:32px 0">${s.tags.map((t) => `<a href="/topic/${esc(slugTopic(t))}">${esc(t)}</a>`).join('')}</div>` : ''}
    <div id="subscribe">${signupHtml()}</div>`;
  wireSignups(root);
  readingProgress(root);

  if (more.length) {
    $('#more').innerHTML = `<div class="keep-reading"><div class="sec-head"><h2><span class="bar"></span>Keep reading</h2><a class="more" href="/section/${esc(s.section)}">More ${esc(sec.name)} ${ICON.arrow}</a></div><div class="cards-3">${more.slice(0, 6).map(photoCard).join('')}</div></div>`;
  }

  if (!aiAvailable) return;
  const full = $('#full');
  try {
    const params = new URLSearchParams({ id: s.id, u: s.url, s: s.sig, full: '1' });
    const { article: a } = await api(`/api/story?${params}`, { timeout: 60000 });
    if (!a) throw new Error('none');
    $('#hl').textContent = a.headline;
    if (a.dek) {
      $('#dek').textContent = a.dek;
      $('#dek').hidden = false;
    }
    document.title = `${a.headline} | Kelvane Club`;
    const words = String(a.body || '').split(/\s+/).length;
    $('#rt').textContent = ` · ${Math.max(2, Math.round(words / 220))} min read`;
    full.innerHTML = `${a.keyPoints?.length ? `<section class="keypoints"><h4>The short version</h4><ul>${a.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></section>` : ''}
      <div class="prose">${a.html}</div>
      <p class="meta" style="margin-top:28px">Written by the Kelvane Club desk with AI assistance from reporting by ${esc(s.source)}${others.length ? ` and ${others.slice(0, 2).map(esc).join(', ')}` : ''}.</p>`;
  } catch {
    full.innerHTML = briefHtml(s, sec);
  }
}

function briefHtml(s, sec) {
  return `<section class="keypoints"><h4>The short version</h4><ul>${s.summary ? `<li>${esc(s.summary)}</li>` : `<li>${esc(s.title)}</li>`}<li>${esc(s.source)} first reported the story${s.coverage > 1 ? `; ${s.coverage} outlets are now covering it` : ''}.</li></ul></section>
    <div class="prose"><h2>Why it matters</h2><p>${esc(WHY[s.section] || WHY.ai)}</p></div>`;
}

main();
