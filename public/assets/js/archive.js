import { $, esc, api, initChrome, storyHref, sectionById, fmtDate, storyCard } from './site.js';

initChrome({ active: 'archive' });
const date = location.pathname.split('/').filter(Boolean)[1];
const root = $('#archive');

async function list() {
  document.title = 'Daily archive · Tensor Street';
  root.innerHTML = `<header class="page-head"><div class="crumbs"><a href="/">Home</a> / <span>Archive</span></div><h1>The daily archive</h1><p>Every edition of The Brief, saved each morning.</p></header><div id="eds"><div class="sk sk-line"></div><div class="sk sk-line"></div></div>`;
  const { editions = [] } = await api('/api/editions').catch(() => ({}));
  $('#eds').innerHTML = editions.length
    ? `<div class="panel panel-pad"><ul class="hl-list">${editions
        .map((e) => `<li><a href="/archive/${e.date}" style="grid-template-columns:150px 1fr"><span class="n" style="font-size:13px">${fmtDate(e.date + 'T12:00:00', { month: 'short', day: 'numeric', year: 'numeric' })}</span><div><h4>${esc(e.headline || e.title)}</h4><div class="meta">${esc(e.title)} · ${e.count} stories</div></div></a></li>`)
        .join('')}</ul></div>`
    : `<div class="empty">The first edition will be archived tomorrow morning. Today’s live desk is on the <a href="/" style="color:var(--brand)">front page</a>.</div>`;
}

async function one() {
  root.innerHTML = `<div class="sk sk-title"></div>`;
  try {
    const { edition: e } = await api(`/api/editions?date=${encodeURIComponent(date)}`);
    const nice = fmtDate(e.date + 'T12:00:00', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    document.title = `${nice} · Tensor Street`;
    root.innerHTML = `<header class="page-head"><div class="crumbs"><a href="/">Home</a> / <a href="/archive">Archive</a> / <span>${esc(e.date)}</span></div><h1>${esc(nice)}</h1><p>${esc(e.intro || '')}</p></header>
      <div class="brief" style="margin-bottom:40px"><div class="kicker"><span class="dot"></span>The Brief · ${esc(e.title)}</div><div class="brief-grid" style="margin-top:18px">${e.items
        .map((s, i) => `<a class="brief-item" href="${storyHref(s)}"><div class="n"><span>${String(i + 1).padStart(2, '0')}</span><span class="chip" data-sec="${esc(s.section)}">${esc(sectionById(s.section).name)}</span></div><h3>${esc(s.headline || s.title)}</h3><p>${esc(s.aiSummary || s.summary || '')}</p><div class="why"><b>Why it matters</b>${esc(s.why)}</div></a>`)
        .join('')}</div></div>
      ${e.top?.length ? `<div class="sec-head"><h2><span class="bar"></span>Top of the wire that day</h2></div><div class="cards-4">${e.top.slice(0, 12).map((s) => storyCard(s)).join('')}</div>` : ''}`;
  } catch {
    root.innerHTML = `<div class="empty" style="margin-top:40px">No edition saved for that date. <a href="/archive" style="color:var(--brand)">See all editions</a>.</div>`;
  }
}

date ? one() : list();
