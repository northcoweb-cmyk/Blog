import {
  $, esc, cachedApi, api, initChrome, leadCard, storyCard, rowStory, hlItem, deskCard, deskRow, storyHref,
  SECTIONS, sectionById, timeAgo, sparkline, fmtPrice, fmtPct, dirCls, marketStatus, editionName, greeting, ICON,
} from './site.js';

initChrome({ active: 'home' });

const now = new Date();
$('#dateline-left').innerHTML = `<b>${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</b> · ${editionName(now)}`;

// ── Markets panel ────────────────────────────────────────────────────────
function renderMarkets(m) {
  const el = $('#markets-panel');
  if (!m || !m.ok) {
    el.innerHTML = `<div class="panel"><div class="mkt-head"><div><div class="label">TS AI Index</div><div class="big num">—</div><div class="sub">Market data unavailable right now</div></div></div><div class="mkt-foot">Prices refresh automatically.</div></div>`;
    return;
  }
  const idx = m.aiIndex;
  // Index sparkline: average of each member's % move through the day.
  const sparks = m.stocks.map((s) => s.spark).filter((sp) => sp?.length > 1);
  const len = Math.min(...sparks.map((sp) => sp.length));
  const idxSpark = sparks.length ? Array.from({ length: len }, (_, i) => sparks.reduce((a, sp) => a + sp[Math.floor((i * (sp.length - 1)) / (len - 1))] / sp[0], 0) / sparks.length) : [];
  const status = marketStatus();
  el.innerHTML = `<div class="panel">
    <div class="mkt-head">
      <div class="label"><span class="dot${status.open ? '' : ' closed'}"></span>TS AI Index · ${esc(status.label)}</div>
      <div class="row"><div class="big num ${dirCls(idx?.changePct)}">${fmtPct(idx?.changePct)}</div>${sparkline(idxSpark, { w: 96, h: 40 })}</div>
      <div class="sub">Equal-weight basket of ${idx?.members || 0} AI leaders, today</div>
    </div>
    <ul class="mkt-list">${m.stocks
      .filter((s) => s.price != null)
      .slice(0, 8)
      .map((s) => `<li><a href="/search?q=${encodeURIComponent(s.name)}"><div><span class="sym">${esc(s.symbol)}</span><span class="nm">${esc(s.name)}</span></div>${sparkline(s.spark)}<div class="chg"><span class="num">${fmtPrice(s.price)}</span><span class="chg-badge ${dirCls(s.changePct)}">${fmtPct(s.changePct)}</span></div></a></li>`)
      .join('')}</ul>
    <div class="mkt-foot">${m.indexes.filter((i) => i.price != null).map((i) => `${esc(i.name)} <span class="${dirCls(i.changePct)} num">${fmtPct(i.changePct)}</span>`).join(' · ')}<br>Data may be delayed. Not investment advice.</div>
  </div>`;
}
document.addEventListener('markets', (e) => renderMarkets(e.detail));

// ── News ─────────────────────────────────────────────────────────────────
let stories = [];

async function load() {
  let news;
  try {
    news = await cachedApi('/api/news');
  } catch (e) {
    $('#lead').innerHTML = `<div class="empty">The wire is reconnecting. Refresh in a moment.<br><small>${esc(e.message)}</small></div>`;
    return;
  }
  stories = news.stories;
  $('#updated').innerHTML = `<span class="dot"></span>Updated ${timeAgo(news.generatedAt).toLowerCase()} · ${news.sourcesOk} sources`;
  if (!stories.length) {
    $('#lead').innerHTML = `<div class="empty">No stories yet. The wire refreshes every few minutes.</div>`;
    return;
  }

  const used = new Set();
  const take = (pred, n) => {
    const out = [];
    for (const s of stories) {
      if (out.length >= n) break;
      if (!used.has(s.id) && pred(s)) {
        used.add(s.id);
        out.push(s);
      }
    }
    return out;
  };

  // Lead: highest-ranked story, preferring one with a real photo.
  const lead = stories.slice(0, 5).find((s) => s.image) || stories[0];
  used.add(lead.id);
  $('#lead').innerHTML = leadCard(lead);
  const second = take((s) => s.section !== lead.section || s.image, 3);
  $('#second').innerHTML = second.map((s, i) => (i === 0 ? storyCard(s, { summary: false }) : rowStory(s))).join('');

  $('#trending').innerHTML = [...stories]
    .filter((s) => s.id !== lead.id)
    .sort((a, b) => b.coverage - a.coverage || b.rank - a.rank)
    .slice(0, 6)
    .map((s, i) => hlItem(s, i + 1))
    .join('');

  renderLatest('all');
  renderSections(used);
}

// Latest feed with desk tabs
const PAGE = 12;
let latestFilter = 'all';
let latestShown = PAGE;
function renderLatest(filter) {
  latestFilter = filter;
  const tabs = $('#latest-tabs');
  tabs.innerHTML = [{ id: 'all', name: 'All' }, ...SECTIONS.slice(1, 6)].map((s) => `<button role="tab" aria-selected="${s.id === filter}" data-f="${s.id}">${esc(s.name)}</button>`).join('');
  tabs.onclick = (e) => {
    const b = e.target.closest('button');
    if (b) {
      latestShown = PAGE;
      renderLatest(b.dataset.f);
    }
  };
  const list = [...stories].filter((s) => filter === 'all' || s.section === filter).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  $('#latest').innerHTML = list.length
    ? list.slice(0, latestShown).map((s) => rowStory(s, { big: true })).join('') + (list.length > latestShown ? `<div style="text-align:center;padding-top:16px"><button class="btn" id="more-latest">Load more stories</button></div>` : '')
    : `<div class="empty">Nothing on this desk yet today.</div>`;
  $('#more-latest')?.addEventListener('click', () => {
    latestShown += PAGE;
    renderLatest(latestFilter);
  });
}

function renderSections(used) {
  const out = [];
  for (const sec of SECTIONS) {
    const list = stories.filter((s) => s.section === sec.id);
    if (list.length < 2) continue;
    const pick = [...list.filter((s) => !used.has(s.id)), ...list.filter((s) => used.has(s.id))].slice(0, 4);
    out.push(`<section data-sec="${sec.id}" style="margin-top:48px" aria-label="${esc(sec.long)}">
      <div class="sec-head"><h2><span class="bar"></span>${esc(sec.long)}</h2><a class="more" href="/section/${sec.id}">More ${esc(sec.name)} ${ICON.arrow}</a></div>
      <div class="cards-4">${pick.map((s) => storyCard(s)).join('')}</div></section>`);
  }
  $('#sections').innerHTML = out.join('');
}

// ── The Brief ────────────────────────────────────────────────────────────
async function loadBrief() {
  try {
    const b = await api('/api/brief');
    if (!b.items?.length) return;
    const title = { morning: 'Morning', midday: 'Midday', evening: 'Evening' }[b.slot] || '';
    $('#brief').innerHTML = `<div class="brief">
      <div class="brief-top"><div><div class="kicker"><span class="dot"></span>The Brief · ${esc(b.title)}</div><h2>${esc(greeting())}. <em>${b.items.length} things</em> to know this ${title.toLowerCase() === 'midday' ? 'afternoon' : title.toLowerCase()}.</h2></div><p class="intro">${esc(b.intro)}</p></div>
      <div class="brief-grid">${b.items
        .map(
          (s, i) => `<a class="brief-item" href="${storyHref(s)}"><div class="n"><span>${String(i + 1).padStart(2, '0')}</span><span class="chip" data-sec="${esc(s.section)}">${esc(sectionById(s.section).name)}</span></div>
          <h3>${esc(s.headline || s.title)}</h3><p>${esc((s.aiSummary || s.summary || '').slice(0, 220))}</p><div class="why"><b>Why it matters</b>${esc(s.why)}</div></a>`,
        )
        .join('')}</div>
    </div>`;
  } catch {
    /* the rest of the page still works */
  }
}

// ── From the Desk (your own posts) ───────────────────────────────────────
async function loadDesk() {
  try {
    const { posts } = await api('/api/posts?limit=8');
    const rail = $('#desk-rail');
    if (!posts.length) {
      rail.remove();
      return;
    }
    rail.innerHTML = `<div class="sec-head"><h2><span class="bar"></span>From the Desk</h2></div>${posts.slice(0, 4).map(deskRow).join('')}`;
    const featured = posts.find((p) => p.featured) || posts[0];
    const others = posts.filter((p) => p !== featured).slice(0, 3);
    $('#desk-feature').innerHTML = `<section style="margin-top:48px" aria-label="From the Desk"><div class="sec-head"><h2><span class="bar"></span>From the Desk · Original reporting & analysis</h2></div>
      <div class="grid"><div class="col-6">${deskCard(featured)}</div><div class="col-6"><div class="cards-3" style="grid-template-columns:1fr;gap:0">${others.map((p) => `<div style="border-top:1px solid var(--line)">${deskRow(p)}</div>`).join('')}</div></div></div></section>`;
  } catch {
    $('#desk-rail')?.remove();
  }
}

load();
loadBrief();
loadDesk();
// Keep the page fresh for people who leave it open all day.
setInterval(() => location.pathname === '/' && document.visibilityState === 'visible' && fetch('/api/news').then((r) => r.json()).then((n) => {
  if (n.stories?.[0]?.id !== stories[0]?.id) $('#updated').innerHTML = `<span class="dot red"></span><a href="/" style="color:var(--live);font-weight:600">New stories. Refresh</a>`;
}).catch(() => {}), 5 * 60 * 1000);
