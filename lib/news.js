import { SOURCES } from './sources.js';
import { parseFeed, decodeEntities } from './parse-feed.js';
import { classify, isAiStory, isMajor, tagsFor } from './classify.js';
import { fetchText, fetchHead, hashId, sign, isPublicHttpUrl } from './http.js';
import { attachTopicImages } from './images.js';
import { listEditions, getEdition } from './content.js';

const MAX_AGE_H = 96; // ignore anything older than 4 days
const PER_FEED = 25;

// Warm-instance memory cache (the CDN cache in front of /api/news does most of the work).
let memo = { at: 0, data: null, pending: null };
const MEMO_MS = 5 * 60 * 1000;

export async function getNews({ force = false } = {}) {
  const now = Date.now();
  if (!force && memo.data && now - memo.at < MEMO_MS) return memo.data;
  if (memo.pending) return memo.pending;
  memo.pending = buildNews()
    .then((data) => {
      memo = { at: Date.now(), data, pending: null };
      return data;
    })
    .catch((err) => {
      memo.pending = null;
      if (memo.data) return memo.data; // serve last good copy
      throw err;
    });
  return memo.pending;
}

async function loadSource(src) {
  const started = Date.now();
  try {
    const xml = await fetchText(src.url, {
      timeout: 7000,
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' },
    });
    const items = parseFeed(xml).slice(0, PER_FEED);
    return { src, items, ok: true, ms: Date.now() - started };
  } catch (err) {
    return { src, items: [], ok: false, error: String(err.message || err).slice(0, 160), ms: Date.now() - started };
  }
}

// ── Normalisation ────────────────────────────────────────────────────────

function cleanTitle(title, src) {
  let t = decodeEntities(title).replace(/\s+/g, ' ').trim();
  let publisher = '';
  // Google News: "Headline - Publisher"
  if (src.aggregator && src.id.startsWith('gn-')) {
    const m = t.match(/^(.*\S)\s+[-–—|]\s+([^-–—|]{2,60})$/);
    if (m) {
      t = m[1];
      publisher = m[2].trim();
    }
    t = t.replace(/\s+\|\s+[^|]{2,40}$/, ''); // "Headline | Site Name"
  }
  return { title: t, publisher };
}

function canonicalUrl(link) {
  try {
    const u = new URL(link);
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|guccounter|guce_|mc_|cmpid|ref$|src$|taid|mod$|fbclid|gclid)/i.test(p)) u.searchParams.delete(p);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return link;
  }
}

const STOP = new Set('a an the of to in on for and or but with at by from as is are was were be been it its this that these those after over into amid says said new how why what who will can could may just more than about up out not its their his her your our we you they has have had'.split(' '));

function tokens(title) {
  return new Set(
    title
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9.\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function similarity(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size || 1, b.size || 1);
}

// ── Build ────────────────────────────────────────────────────────────────

async function buildNews() {
  const started = Date.now();
  const results = await Promise.all(SOURCES.map(loadSource));
  const cutoff = Date.now() - MAX_AGE_H * 3600e3;

  const seenUrl = new Set();
  const raw = [];
  for (const { src, items } of results) {
    for (const it of items) {
      if (!it.link || !isPublicHttpUrl(it.link)) continue;
      const url = canonicalUrl(it.link);
      if (seenUrl.has(url)) continue;
      const { title, publisher } = cleanTitle(it.title, src);
      if (title.length < 12) continue;
      const summary = it.summary && !/^(the post|appeared first|article url:)/i.test(it.summary) ? it.summary.replace(/\s*The post .* appeared first on .*$/i, '') : '';
      if (src.aiOnly && !isAiStory(title, summary)) continue;
      const date = it.date ? Date.parse(it.date) : NaN;
      if (Number.isFinite(date) && date < cutoff) continue;
      if (Number.isFinite(date) && date > Date.now() + 3600e3) continue; // bogus future dates
      seenUrl.add(url);
      raw.push({
        title,
        url,
        summary: summary.slice(0, 420),
        image: it.image && isPublicHttpUrl(it.image) ? it.image : '',
        author: it.author || '',
        source: publisher || it.sourceName || src.name,
        via: src.id,
        lab: !!src.lab,
        weight: src.weight || 1,
        date: Number.isFinite(date) ? new Date(date).toISOString() : new Date().toISOString(),
        section: classify(title, summary, src.section),
        tags: tagsFor(title, summary),
      });
    }
  }

  // Cluster near-duplicate headlines (same story from several outlets).
  raw.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const clusters = [];
  for (const item of raw) {
    item._tok = tokens(item.title);
    let home = null;
    for (const c of clusters) {
      if (similarity(item._tok, c.lead._tok) >= 0.6 && Math.abs(Date.parse(c.lead.date) - Date.parse(item.date)) < 48 * 3600e3) {
        home = c;
        break;
      }
    }
    if (home) home.items.push(item);
    else clusters.push({ lead: item, items: [item] });
  }

  const now = Date.now();
  const stories = clusters.map((c) => {
    // Lead with the version that has an image + summary, prefer higher-weight outlets.
    const lead = [...c.items].sort((a, b) => score(b) - score(a))[0];
    const sources = [...new Set(c.items.map((i) => i.source))];
    const newest = Math.max(...c.items.map((i) => Date.parse(i.date)));
    const ageH = (now - newest) / 3600e3;
    const coverage = sources.length;
    const major = isMajor(lead.title);
    // Hacker-News-style gravity: newer + more coverage + trusted source = higher.
    const rank = ((lead.weight * (1 + Math.log2(coverage)) * (major ? 1.25 : 1) * (lead.image ? 1.08 : 1)) / Math.pow(ageH + 2, 1.35)) * 100;
    const id = hashId(lead.url);
    return {
      id,
      title: lead.title,
      url: lead.url,
      sig: sign(lead.url),
      summary: lead.summary || c.items.find((i) => i.summary)?.summary || '',
      image: lead.image || c.items.find((i) => i.image)?.image || '',
      source: lead.source,
      author: lead.author,
      date: new Date(newest).toISOString(),
      section: lead.section,
      tags: [...new Set(c.items.flatMap((i) => i.tags))].slice(0, 4),
      lab: c.items.some((i) => i.lab),
      coverage,
      related: c.items
        .filter((i) => i !== lead)
        .slice(0, 5)
        .map((i) => ({ title: i.title, url: i.url, source: i.source, date: i.date })),
      breaking: ageH < 3 && (coverage >= 3 || (major && (coverage >= 2 || lead.lab))),
      rank: Math.round(rank * 1000) / 1000,
    };
  });

  stories.sort((a, b) => b.rank - a.rank);

  // Never show an empty front page: if the feeds are down on a cold start,
  // fill in from the most recent archived edition.
  if (stories.length < 8) {
    try {
      const [latest] = await listEditions();
      const ed = latest && (await getEdition(latest.date));
      const have = new Set(stories.map((s) => s.url));
      for (const t of ed?.top || []) if (!have.has(t.url)) stories.push({ ...t, sig: sign(t.url), tags: [], related: [], coverage: 1, rank: 0, archived: true });
    } catch {}
  }

  await enrichImages(stories.slice(0, 80));
  await attachTopicImages(stories);

  return {
    generatedAt: new Date().toISOString(),
    buildMs: Date.now() - started,
    count: stories.length,
    sources: results.map((r) => ({ id: r.src.id, name: r.src.name, section: r.src.section, ok: r.ok, items: r.items.length, ms: r.ms, error: r.error })),
    stories,
  };
}

function score(i) {
  return i.weight + (i.image ? 0.5 : 0) + (i.summary ? 0.3 : 0) - (i.via.startsWith('gn-') ? 0.4 : 0);
}

// ── Image enrichment: grab og:image for top stories whose feed had none ──

export function extractMeta(html) {
  const meta = {};
  const re = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = (tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (key && val != null && !(key.toLowerCase() in meta)) meta[key.toLowerCase()] = decodeEntities(val);
  }
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
  if (title) meta['<title>'] = decodeEntities(title.trim());
  return meta;
}

// url -> { image, summary } — survives between refreshes on a warm instance.
const ogCache = new Map();

async function enrichImages(stories) {
  const need = stories.filter((s) => !s.image && !/news\.google\.com/.test(s.url)).slice(0, 50);
  const one = async (s) => {
    let hit = ogCache.get(s.url);
    if (!hit) {
      hit = { image: '', summary: '' };
      try {
        const { html, finalUrl } = await fetchHead(s.url, { timeout: 2500 });
        const meta = extractMeta(html);
        let img = meta['og:image'] || meta['og:image:url'] || meta['og:image:secure_url'] || meta['twitter:image'] || meta['twitter:image:src'] || '';
        if (img) img = new URL(img, finalUrl).toString();
        if (img && isPublicHttpUrl(img) && !/logo|favicon|default|placeholder/i.test(img.split('/').pop())) hit.image = img;
        hit.summary = (meta['og:description'] || meta.description || '').slice(0, 420);
      } catch {
        /* the topic image below covers it */
      }
      if (ogCache.size > 2000) ogCache.clear();
      ogCache.set(s.url, hit);
    }
    if (hit.image) s.image = hit.image;
    if (!s.summary && hit.summary) s.summary = hit.summary;
  };
  // 12 at a time so we stay well inside the function time limit.
  for (let i = 0; i < need.length; i += 12) await Promise.all(need.slice(i, i + 12).map(one));
}

// Test hook
export function _resetNewsCache() {
  memo = { at: 0, data: null, pending: null };
}
