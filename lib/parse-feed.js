import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  cdataPropName: false,
});

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? '');
  return '';
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', trade: '™', copy: '©', reg: '®' };

export function decodeEntities(s = '') {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML fragment → clean plain text. */
export function htmlToText(html = '') {
  return decodeEntities(
    String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h\d)>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function firstImgInHtml(html = '') {
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]) : '';
}

function pickImage(item) {
  const candidates = [];
  const pushMedia = (m) => {
    for (const x of arr(m)) {
      if (!x) continue;
      const url = x['@url'];
      const medium = x['@medium'] || '';
      const type = x['@type'] || '';
      if (url && (medium === 'image' || type.startsWith('image') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url) || (!medium && !type))) {
        candidates.push({ url, w: Number(x['@width']) || 0 });
      }
      if (x['media:thumbnail']) pushMedia(x['media:thumbnail']);
    }
  };
  pushMedia(item['media:content']);
  for (const g of arr(item['media:group'])) pushMedia(g?.['media:content']);
  pushMedia(item['media:thumbnail']);
  for (const e of arr(item.enclosure)) {
    if (e?.['@url'] && String(e['@type'] || '').startsWith('image')) candidates.push({ url: e['@url'], w: 0 });
  }
  if (item['itunes:image']?.['@href']) candidates.push({ url: item['itunes:image']['@href'], w: 0 });
  candidates.sort((a, b) => b.w - a.w);
  if (candidates[0]) return candidates[0].url;
  const html = text(item['content:encoded']) || text(item.content) || text(item.description) || text(item.summary);
  return firstImgInHtml(html);
}

function pickLink(item) {
  const links = arr(item.link);
  for (const l of links) {
    if (typeof l === 'string' && l) return l;
    if (l && typeof l === 'object') {
      const rel = l['@rel'] || 'alternate';
      if (l['@href'] && rel === 'alternate') return l['@href'];
      if (l['#text']) return l['#text'];
    }
  }
  const firstHref = links.find((l) => l?.['@href']);
  if (firstHref) return firstHref['@href'];
  const guid = item.guid;
  if (guid && (guid['@isPermaLink'] !== 'false') && /^https?:/.test(text(guid))) return text(guid);
  return item.id && /^https?:/.test(text(item.id)) ? text(item.id) : '';
}

function pickDate(item) {
  const raw = text(item.pubDate) || text(item.published) || text(item.updated) || text(item['dc:date']) || text(item.issued);
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function pickAuthor(item) {
  const a = item['dc:creator'] ?? item.author;
  if (!a) return '';
  if (typeof a === 'object' && !Array.isArray(a)) return text(a.name) || text(a);
  return htmlToText(text(a)).replace(/^[^(]*\(([^)]+)\)$/, '$1');
}

/**
 * Parse an RSS 2.0 / Atom / RDF document into a flat list of items.
 * Returns [{ title, link, date, summary, image, author, sourceName, sourceUrl, categories }]
 */
export function parseFeed(xml) {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? doc?.['rdf:RDF']?.channel ?? null;
  const rawItems = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  const feedTitle = htmlToText(text(channel?.title ?? doc?.feed?.title));

  return arr(rawItems)
    .map((item) => {
      const body = text(item['content:encoded']) || text(item.content) || '';
      const desc = text(item.description) || text(item.summary) || '';
      let summary = htmlToText(desc || body);
      const title = htmlToText(text(item.title));
      // Google News descriptions just repeat the headline + source — drop them.
      const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const head = norm(title.split(/\s[-–—|]\s/)[0]).slice(0, 30);
      if (summary && head && norm(summary).startsWith(head)) summary = '';
      const src = item.source;
      return {
        title,
        link: pickLink(item).trim(),
        date: pickDate(item),
        summary: summary.slice(0, 600),
        image: pickImage(item),
        author: pickAuthor(item),
        sourceName: src ? htmlToText(text(src)) : '',
        sourceUrl: src?.['@url'] || '',
        categories: arr(item.category).map((c) => htmlToText(text(c) || c?.['@term'] || '')).filter(Boolean),
        feedTitle,
      };
    })
    .filter((i) => i.title && i.link);
}
