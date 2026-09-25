// Shared front-end: brand, data fetching, card renderers, and the site chrome
// (ticker tape, header, footer, search). Every page imports this.

export const SITE = {
  name: 'Tensor Street',
  tagline: 'The daily briefing on the AI economy',
  instagram: 'tensorstreet',
};

export const SECTIONS = [
  { id: 'ai', name: 'AI', long: 'Artificial Intelligence', blurb: 'The biggest moves across the AI industry.' },
  { id: 'models', name: 'Models', long: 'Models & Launches', blurb: 'New models, releases and product launches from the labs.' },
  { id: 'markets', name: 'Markets', long: 'AI & Markets', blurb: 'Where AI meets money: stocks, chips, earnings and capex.' },
  { id: 'policy', name: 'Policy', long: 'Policy & Politics', blurb: 'Regulation, government and the politics of AI.' },
  { id: 'startups', name: 'Startups', long: 'Startups & Funding', blurb: 'Who is raising, building and winning.' },
  { id: 'mainstreet', name: 'Main Street', long: 'Main Street AI', blurb: 'How small businesses are actually putting AI to work.' },
  { id: 'research', name: 'Research', long: 'Research & Science', blurb: 'Papers, breakthroughs and the science behind the systems.' },
  { id: 'tech', name: 'Tech', long: 'Tech', blurb: 'The wider technology story, through an AI lens.' },
];
export const sectionById = (id) => SECTIONS.find((s) => s.id === id) || { id: 'desk', name: 'The Desk', long: 'From the Desk' };

const SEC_COLORS = { ai: ['#2f54ff', '#0b1a66'], models: ['#7a4dff', '#22106b'], markets: ['#0c9a68', '#05382a'], policy: ['#e08a0b', '#4a2a02'], startups: ['#0891b2', '#053342'], mainstreet: ['#e8590c', '#4a1b04'], research: ['#d6336c', '#4a0b22'], tech: ['#5b6b86', '#141b2a'], desk: ['#2f54ff', '#0a0e1a'] };

// ── Utilities ────────────────────────────────────────────────────────────

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s = '') {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export async function api(path, { timeout = 15000, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(path, { ...opts, signal: ctrl.signal, headers: { accept: 'application/json', ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
    return data;
  } finally {
    clearTimeout(t);
  }
}

// De-duplicate identical requests made by different widgets on the same page.
const inflight = new Map();
export function cachedApi(path) {
  if (!inflight.has(path)) inflight.set(path, api(path).catch((e) => (inflight.delete(path), Promise.reject(e))));
  return inflight.get(path);
}

export function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDate(iso, opts = { month: 'long', day: 'numeric', year: 'numeric' }) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', opts) : '';
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)), ((s ^= s >>> 16) >>> 0) / 4294967296);
}

export const storyHref = (s) => `/story/${s.id}?u=${encodeURIComponent(s.url)}&s=${s.sig}`;
export const postHref = (p) => `/p/${p.slug}`;

// ── Generated cover art (used when a story has no photo) ─────────────────

export function coverSvg(key, section = 'ai', label = '') {
  const [c1, c2] = SEC_COLORS[section] || SEC_COLORS.ai;
  const r = rng(hash(key));
  const kind = Math.floor(r() * 4);
  const W = 1600;
  const Hh = 900;
  let art = '';
  if (kind === 0) {
    // network graph
    const pts = Array.from({ length: 16 }, () => [100 + r() * 1400, 90 + r() * 640]);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d < 380) art += `<line x1="${pts[i][0]|0}" y1="${pts[i][1]|0}" x2="${pts[j][0]|0}" y2="${pts[j][1]|0}" stroke="#fff" stroke-opacity="${(0.28 - d / 1800).toFixed(2)}" stroke-width="2"/>`;
      }
    pts.forEach(([x, y], i) => (art += `<circle cx="${x|0}" cy="${y|0}" r="${i % 5 === 0 ? 11 : 6}" fill="${i % 5 === 0 ? '#fff' : c1}" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>`));
  } else if (kind === 1) {
    // candlesticks
    let y = 520;
    for (let i = 0; i < 26; i++) {
      const x = 90 + i * 56;
      const d = (r() - 0.42) * 110;
      const o = y;
      y = Math.max(160, Math.min(720, y - d));
      const top = Math.min(o, y);
      const h = Math.max(8, Math.abs(o - y));
      const up = y < o;
      art += `<line x1="${x + 14}" x2="${x + 14}" y1="${top - 20 - r() * 40}" y2="${top + h + 20 + r() * 40}" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><rect x="${x}" y="${top}" width="28" height="${h}" rx="3" fill="${up ? '#fff' : 'none'}" fill-opacity="${up ? 0.85 : 0}" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>`;
    }
  } else if (kind === 2) {
    // concentric rings
    const cx = 900 + r() * 500;
    const cy = 300 + r() * 300;
    for (let i = 1; i < 14; i++) art += `<circle cx="${cx|0}" cy="${cy|0}" r="${i * 58}" fill="none" stroke="#fff" stroke-opacity="${(0.34 - i * 0.022).toFixed(2)}" stroke-width="${i % 4 === 0 ? 3 : 1.5}"/>`;
    art += `<circle cx="${cx|0}" cy="${cy|0}" r="18" fill="#fff"/>`;
  } else {
    // wave field
    for (let k = 0; k < 18; k++) {
      let d = `M0 ${220 + k * 30}`;
      const amp = 40 + r() * 70;
      const ph = r() * 6;
      for (let x = 0; x <= W; x += 40) d += ` L${x} ${(220 + k * 30 + Math.sin(x / 190 + ph + k * 0.25) * amp).toFixed(1)}`;
      art += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${(0.08 + (k % 6) * 0.04).toFixed(2)}" stroke-width="2"/>`;
    }
  }
  const id = `g${hash(key + 'g')}`;
  return `<svg class="cover" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label || sectionById(section).name)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><pattern id="${id}p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity=".06"/></pattern></defs><rect width="${W}" height="${Hh}" fill="url(#${id})"/><rect width="${W}" height="${Hh}" fill="url(#${id}p)"/>${art}<text x="72" y="${Hh - 64}" font-family="Geist Mono, monospace" font-size="30" letter-spacing="4" fill="#fff" fill-opacity=".75">TENSOR STREET · ${esc(sectionById(section).name.toUpperCase())}</text></svg>`;
}

/** Image with automatic fallbacks: publisher photo → topic photo → generated cover art. */
export function mediaHtml(item, { cls = '', badge = '' } = {}) {
  const section = item.section || 'ai';
  const src = item.cover?.url || item.image || '';
  const cover = coverSvg(item.id || item.slug || item.title || 'x', section, item.title);
  const logo = !item.cover?.url && item.imageKind === 'logo' ? ' logo' : '';
  const fb = item.fallbackImage ? ` data-fb="${esc(item.fallbackImage)}" data-fbkind="${esc(item.fallbackKind || '')}"` : '';
  const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"${fb} onerror="tsImgFail(this)">` : '';
  return `<div class="media ${cls}${logo}" data-cover="${esc(cover)}">${img || cover}${badge}</div>`;
}

// Called by <img onerror>. Tries the topic photo once, then falls back to cover art.
globalThis.tsImgFail = (img) => {
  const box = img.parentNode;
  if (img.dataset.fb) {
    const fb = img.dataset.fb;
    box.classList.toggle('logo', img.dataset.fbkind === 'logo');
    delete img.dataset.fb;
    img.src = fb;
    return;
  }
  box.classList.remove('logo');
  img.replaceWith(document.createRange().createContextualFragment(box.dataset.cover));
};

// ── Cards ────────────────────────────────────────────────────────────────

const chip = (section, solid = false) => `<span class="chip${solid ? ' solid' : ''}" data-sec="${esc(section)}">${esc(sectionById(section).name)}</span>`;

export function metaHtml(s, { related = false } = {}) {
  return `<div class="meta"><span class="src">${esc(s.source || s.author || '')}</span><span class="sep"></span><time datetime="${esc(s.date || s.publishedAt)}">${timeAgo(s.date || s.publishedAt)}</time>${related && s.coverage > 1 ? `<span class="sep"></span><span>${s.coverage} sources</span>` : ''}</div>`;
}

export function leadCard(s) {
  const also = s.related?.length ? `<div class="also">Also covered by ${s.related.slice(0, 3).map((r) => `<span class="pill">${esc(r.source)}</span>`).join('')}</div>` : '';
  return `<a class="lead" href="${storyHref(s)}" data-sec="${esc(s.section)}">
    ${mediaHtml(s, { badge: s.breaking ? '<span class="badge pill live"><span class="dot red"></span>Developing</span>' : '' })}
    <div>${chip(s.section)}<h2>${esc(s.title)}</h2></div>
    ${s.summary ? `<p class="sum">${esc(s.summary)}</p>` : ''}
    ${metaHtml(s, { related: true })}
    ${also}
  </a>`;
}

export function storyCard(s, { summary = true, ratio = '' } = {}) {
  return `<a class="story" href="${storyHref(s)}" data-sec="${esc(s.section)}">
    ${mediaHtml(s, { cls: ratio })}
    ${chip(s.section)}
    <h3>${esc(s.title)}</h3>
    ${summary && s.summary ? `<p class="sum">${esc(s.summary)}</p>` : ''}
    ${metaHtml(s)}
  </a>`;
}

export function rowStory(s, { big = false } = {}) {
  return `<a class="row-story${big ? ' big' : ''}" href="${storyHref(s)}" data-sec="${esc(s.section)}">
    <div>${chip(s.section)}<h3>${esc(s.title)}</h3>${big && s.summary ? `<p class="sum">${esc(s.summary)}</p>` : ''}${metaHtml(s, { related: true })}</div>
    ${mediaHtml(s)}
  </a>`;
}

export function hlItem(s, n) {
  return `<li><a href="${storyHref(s)}"><span class="n">${String(n).padStart(2, '0')}</span><div><h4>${esc(s.title)}</h4>${metaHtml(s)}</div></a></li>`;
}

export function deskCard(p) {
  return `<a class="desk-card" href="${postHref(p)}" data-sec="${esc(p.section || 'desk')}">
    ${mediaHtml({ ...p, id: p.slug }, { cls: 'r32' })}
    <span class="chip" data-sec="desk">From the Desk</span>
    <h3>${esc(p.title)}</h3>
    ${p.dek ? `<p class="dek">${esc(p.dek)}</p>` : ''}
    <div class="meta"><span class="src">${esc(p.author)}</span><span class="sep"></span><span>${fmtDate(p.publishedAt, { month: 'short', day: 'numeric' })}</span><span class="sep"></span><span>${p.readingTime || 3} min read</span></div>
  </a>`;
}

export function deskRow(p) {
  return `<a class="desk-row" href="${postHref(p)}">${mediaHtml({ ...p, id: p.slug })}<div><h4>${esc(p.title)}</h4><div class="meta"><span>${fmtDate(p.publishedAt, { month: 'short', day: 'numeric' })}</span><span class="sep"></span><span>${p.readingTime || 3} min</span></div></div></a>`;
}

export function skeletonCards(n = 4) {
  return Array.from({ length: n }, () => `<div class="story"><div class="media sk"></div><div class="sk sk-line" style="width:30%"></div><div class="sk sk-title"></div><div class="sk sk-line" style="width:70%"></div></div>`).join('');
}

// ── Markets ──────────────────────────────────────────────────────────────

export function sparkline(values = [], { w = 64, h = 26, color } = {}) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - ((y - min) / span) * (h - 4)).toFixed(1)}`);
  const up = v[v.length - 1] >= v[0];
  const c = color || (up ? 'var(--up)' : 'var(--down)');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

export const fmtPrice = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
export const fmtPct = (n) => (Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
export const dirCls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');

export function marketStatus(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  const mins = Number(p.hour) * 60 + Number(p.minute);
  const weekend = p.weekday === 'Sat' || p.weekday === 'Sun';
  if (weekend) return { open: false, label: 'Markets closed' };
  if (mins >= 570 && mins < 960) return { open: true, label: 'Markets open' };
  if (mins >= 240 && mins < 570) return { open: false, label: 'Pre-market' };
  if (mins >= 960 && mins < 1200) return { open: false, label: 'After hours' };
  return { open: false, label: 'Markets closed' };
}

export function editionName(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Morning Edition' : h < 17 ? 'Midday Edition' : 'Evening Edition';
}
export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Late edition' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ── Icons ────────────────────────────────────────────────────────────────

export const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.9 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.5c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9V21H9z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  rss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1.5" fill="currentColor"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
};

export const LOGO_MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lm" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#5b7bff"/><stop offset="1" stop-color="#2ee6c5"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="#0a0e1a"/><rect x=".5" y=".5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" stroke-opacity=".1"/><path d="M7 24.5h18" stroke="#fff" stroke-opacity=".18" stroke-width="1.4" stroke-linecap="round"/><polyline points="7,20.5 12.5,14.5 17.5,17.5 25,8.5" fill="none" stroke="url(#lm)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="20.5" r="2.1" fill="#fff"/><circle cx="12.5" cy="14.5" r="2.1" fill="#fff"/><circle cx="17.5" cy="17.5" r="2.1" fill="#fff"/><circle cx="25" cy="8.5" r="2.6" fill="#2ee6c5"/></svg>`;

export const logoHtml = () => `<a class="logo" href="/" aria-label="${SITE.name} home">${LOGO_MARK}<span>Tensor<span class="street">Street</span></span></a>`;

// ── Theme ────────────────────────────────────────────────────────────────

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('ts-theme', next);
  } catch {}
  $$('.theme-btn').forEach((b) => (b.innerHTML = next === 'dark' ? ICON.sun : ICON.moon));
}

export function toast(msg) {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── Newsletter signup ────────────────────────────────────────────────────

let configPromise;
export const getConfig = () => (configPromise ||= api('/api/config').catch(() => ({ features: {} })));

export function signupHtml({ title = 'Get the Brief in your inbox', text = 'The five AI stories that matter, every morning. Free, two minutes, no noise.' } = {}) {
  return `<div class="signup" data-signup>
    <h3>${esc(title)}</h3><p>${esc(text)}</p>
    <form novalidate>
      <label class="sr-only" for="su-${(Math.random() * 1e6) | 0}">Email address</label>
      <input type="email" name="email" placeholder="you@email.com" autocomplete="email" required>
      <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit">Subscribe</button>
    </form>
    <div class="msg" aria-live="polite"></div>
  </div>`;
}

export async function wireSignups(root = document) {
  const cfg = await getConfig();
  $$('[data-signup]', root).forEach((box) => {
    if (box._wired) return;
    box._wired = true;
    if (!cfg.features?.newsletter) {
      // No email provider connected yet → offer the channels that do work.
      box.querySelector('form').outerHTML = `<div class="alt"><a href="https://instagram.com/${esc(cfg.site?.instagram || SITE.instagram)}" target="_blank" rel="noopener">${ICON.instagram.replace('<svg', '<svg width="15" height="15"')} Follow on Instagram</a><a href="/rss.xml">${ICON.rss.replace('<svg', '<svg width="15" height="15"')} RSS feed</a></div>`;
      box.querySelector('p').textContent = 'Email edition launching soon. Follow along for the daily headlines.';
      return;
    }
    const form = box.querySelector('form');
    const msg = box.querySelector('.msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        msg.textContent = 'Please enter a valid email.';
        return;
      }
      const btn = form.querySelector('button');
      btn.disabled = true;
      msg.textContent = 'Subscribing…';
      try {
        await api('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, website: form.website.value }) });
        form.reset();
        msg.textContent = 'You’re in. Check your inbox to confirm.';
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  });
}

// ── Chrome: tape, header, footer ─────────────────────────────────────────

const NAV = [{ href: '/', label: 'Top Stories', key: 'home' }, ...SECTIONS.map((s) => ({ href: `/section/${s.id}`, label: s.name, key: s.id })), { href: '/learn', label: 'Learn AI', key: 'learn' }];

export function initChrome({ active = '' } = {}) {
  const top = $('#site-top');
  if (top) {
    top.innerHTML = `
    <a class="skip" href="#main">Skip to content</a>
    <div class="tape" role="region" aria-label="AI stocks">
      <div class="wrap tape-inner">
        <div class="tape-label"><span class="dot" id="mkt-dot"></span><b>AI TAPE</b><span class="full" id="mkt-status">Markets</span></div>
        <div class="tape-track"><div class="tape-rail" id="tape-rail"><span class="tq"><span class="px">Loading markets…</span></span></div></div>
        <div class="tape-clock" id="tape-clock"></div>
      </div>
    </div>
    <header class="masthead">
      <div class="wrap mast-row">
        ${logoHtml()}
        <nav class="nav" aria-label="Sections">${NAV.map((n) => `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}</nav>
        <div class="mast-actions">
          <button class="icon-btn" data-search aria-label="Search">${ICON.search}</button>
          <button class="icon-btn theme-btn" aria-label="Toggle dark mode">${currentTheme() === 'dark' ? ICON.sun : ICON.moon}</button>
          <a class="btn btn-primary btn-sm btn-subscribe" href="#subscribe" data-subscribe>Subscribe</a>
          <button class="icon-btn menu-btn" aria-label="Menu" data-menu>${ICON.menu}</button>
        </div>
      </div>
    </header>
    <div id="breaking-slot"></div>`;
  }
  const foot = $('#site-foot');
  if (foot) {
    foot.innerHTML = `<footer class="site-footer">
      <div class="wrap">
        <div class="foot-grid">
          <div>${logoHtml()}<p style="max-width:34ch;margin:14px 0 0">${esc(SITE.tagline)}. Model launches, AI markets, policy and the businesses putting AI to work. Updated all day.</p>
            <div class="socials"><a href="https://instagram.com/${SITE.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${ICON.instagram}</a><a href="/rss.xml" aria-label="RSS">${ICON.rss}</a><a href="#subscribe" data-subscribe aria-label="Newsletter">${ICON.mail}</a></div></div>
          <div><h4>Desks</h4><ul>${SECTIONS.slice(0, 4).map((s) => `<li><a href="/section/${s.id}">${s.long}</a></li>`).join('')}</ul></div>
          <div><h4>More desks</h4><ul>${SECTIONS.slice(4).map((s) => `<li><a href="/section/${s.id}">${s.long}</a></li>`).join('')}</ul></div>
          <div><h4>Tensor Street</h4><ul><li><a href="/about">About</a></li><li><a href="/learn">Learn AI: Glossary</a></li><li><a href="/archive">Daily archive</a></li><li><a href="/search">Search</a></li><li><a href="/rss.xml">RSS</a></li></ul></div>
        </div>
        <div class="foot-note"><span>© ${new Date().getFullYear()} ${SITE.name}. Headlines and summaries link to the original publishers.</span><span>Not investment advice. Market data may be delayed.</span></div>
      </div>
    </footer>
    <div class="drawer" id="drawer"><div class="drawer-bg" data-close></div><div class="drawer-panel" role="dialog" aria-label="Menu">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">${logoHtml()}<button class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>
      ${NAV.map((n) => `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}
      <a href="/about">About</a><a href="/archive">Archive</a>
      <div style="margin-top:14px">${signupHtml({ title: 'The Brief, daily', text: 'Five stories. Every morning. Free.' })}</div>
    </div></div>
    <div class="search-overlay" id="search-overlay"><div class="search-box" role="dialog" aria-label="Search">
      <form action="/search" method="get">${ICON.search.replace('<svg', '<svg width="20" height="20" style="color:var(--muted)"')}<input name="q" placeholder="Search AI news, companies, models…" autocomplete="off" aria-label="Search"><kbd>esc</kbd></form>
      <div class="hint">Try: <a href="/search?q=nvidia">Nvidia</a><a href="/search?q=openai">OpenAI</a><a href="/search?q=anthropic">Anthropic</a><a href="/search?q=small+business">Small business</a><a href="/search?q=regulation">Regulation</a></div>
    </div></div>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-search],[data-menu],[data-close],.theme-btn,[data-subscribe]');
    if (!t) {
      if (e.target.id === 'search-overlay') closeSearch();
      return;
    }
    if (t.matches('[data-search]')) openSearch();
    else if (t.matches('[data-menu]')) $('#drawer')?.classList.add('open');
    else if (t.matches('[data-close]')) $('#drawer')?.classList.remove('open');
    else if (t.matches('.theme-btn')) toggleTheme();
    else if (t.matches('[data-subscribe]')) {
      const box = $('main [data-signup]');
      if (box) {
        e.preventDefault();
        $('#drawer')?.classList.remove('open');
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => box.querySelector('input[type=email]')?.focus(), 400);
      } else {
        e.preventDefault();
        $('#drawer')?.classList.add('open');
      }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      $('#drawer')?.classList.remove('open');
    }
    if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
      e.preventDefault();
      openSearch();
    }
  });

  tickClock();
  setInterval(tickClock, 30_000);
  loadTape();
  setInterval(loadTape, 120_000);
  loadBreaking();
  $$('[data-signup-slot]').forEach((el) => (el.innerHTML = signupHtml()));
  wireSignups();
}

function openSearch() {
  const o = $('#search-overlay');
  if (!o) return (location.href = '/search');
  o.classList.add('open');
  setTimeout(() => o.querySelector('input').focus(), 20);
}
function closeSearch() {
  $('#search-overlay')?.classList.remove('open');
}

function tickClock() {
  const el = $('#tape-clock');
  const ms = marketStatus();
  if (el) el.textContent = `NYC ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}`;
  const st = $('#mkt-status');
  if (st) st.textContent = ms.label;
  $('#mkt-dot')?.classList.toggle('closed', !ms.open);
}

export async function loadTape() {
  const rail = $('#tape-rail');
  if (!rail) return;
  try {
    const m = await api('/api/markets', { timeout: 12000 });
    if (!m.ok) throw new Error('no data');
    const q = (x, cls = '') => `<span class="tq ${cls}"><span class="sym">${esc(x.name && cls ? x.name : x.symbol)}</span><span class="px">${fmtPrice(x.price)}</span><span class="${dirCls(x.changePct)}">${fmtPct(x.changePct)}</span>${sparkline(x.spark, { w: 44, h: 16, color: x.changePct >= 0 ? '#2fd08f' : '#ff6b71' })}</span>`;
    const ai = m.aiIndex ? `<span class="tq index"><span class="sym">TS AI INDEX</span><span class="${dirCls(m.aiIndex.changePct)}">${fmtPct(m.aiIndex.changePct)}</span></span>` : '';
    const once = ai + m.indexes.filter((x) => x.price != null).map((x) => q(x, 'index')).join('') + m.stocks.filter((x) => x.price != null).map((x) => q(x)).join('');
    rail.innerHTML = once + once; // duplicated for a seamless loop
    document.dispatchEvent(new CustomEvent('markets', { detail: m }));
  } catch {
    rail.innerHTML = `<span class="tq"><span class="px">Market data is taking a breather. Headlines below are live.</span></span>`;
    document.dispatchEvent(new CustomEvent('markets', { detail: null }));
  }
}

async function loadBreaking() {
  const slot = $('#breaking-slot');
  if (!slot) return;
  try {
    const news = await cachedApi('/api/news');
    const b = news.breaking?.[0];
    let dismissed = '';
    try {
      dismissed = sessionStorage.getItem('ts-bk') || '';
    } catch {}
    if (!b || dismissed === b.id) return;
    slot.innerHTML = `<div class="breaking" role="region" aria-label="Breaking news"><div class="wrap breaking-row">
      <span class="breaking-tag"><span class="dot"></span>BREAKING</span>
      <a class="bk-title" href="${storyHref(b)}">${esc(b.title)}</a>
      <span class="bk-meta">${esc(b.source)} · ${timeAgo(b.date)}${b.coverage > 1 ? ` · ${b.coverage} sources` : ''}</span>
      <button class="icon-btn" aria-label="Dismiss">${ICON.close}</button></div></div>`;
    slot.querySelector('button').onclick = () => {
      try {
        sessionStorage.setItem('ts-bk', b.id);
      } catch {}
      slot.innerHTML = '';
    };
  } catch {}
}

export function shareButtons(url, title) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return `<button class="icon-btn" data-copy="${esc(url)}" aria-label="Copy link">${ICON.link}</button>
  <a class="icon-btn" href="https://x.com/intent/post?url=${u}&text=${t}" target="_blank" rel="noopener" aria-label="Share on X">${ICON.x}</a>
  <a class="icon-btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" target="_blank" rel="noopener" aria-label="Share on LinkedIn">${ICON.linkedin}</a>`;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try {
    if (navigator.share && matchMedia('(pointer:coarse)').matches) await navigator.share({ url: b.dataset.copy });
    else {
      await navigator.clipboard.writeText(b.dataset.copy);
      toast('Link copied');
    }
  } catch {}
});
