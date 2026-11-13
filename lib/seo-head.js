// <head> tags for search engines and social previews: title, description,
// canonical link, Open Graph, Twitter cards, robots and JSON-LD (structured data).
// Pure functions with no network or file access, so the page builder and the
// server can both use them.

import { SITE } from './site.js';

export const ROBOTS_INDEX = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
export const ROBOTS_NOINDEX = 'noindex,follow';

export const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Collapse whitespace and cut to `n` characters at a word boundary. */
export function trunc(s = '', n = 160) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  return cut.replace(/\s+\S*$/, '').replace(/[\s,;:.\-–—]+$/, '') + '…';
}

/** Google shows roughly 60 characters of a title: add the brand only if it still fits. */
export function fitTitle(title) {
  const t = String(title || SITE.name).replace(/\s+/g, ' ').trim();
  const withBrand = `${t} | ${SITE.name}`;
  if (withBrand.length <= 62) return withBrand;
  return t.length > 68 ? trunc(t, 68) : t;
}

export const abs = (origin, u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : origin + (u.startsWith('/') ? u : '/' + u));

const ld = (nodes) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c')}</script>`;

/** Publisher + site nodes, included in every page's structured data. */
export function orgGraph(origin) {
  const same = [`https://instagram.com/${SITE.instagram}`, SITE.x && `https://x.com/${SITE.x}`].filter(Boolean);
  return [
    {
      '@type': 'NewsMediaOrganization',
      '@id': `${origin}/#organization`,
      name: SITE.name,
      alternateName: SITE.alternateNames,
      url: `${origin}/`,
      description: SITE.description,
      logo: { '@type': 'ImageObject', url: `${origin}/assets/brand/icon-512.png`, width: 512, height: 512 },
      sameAs: same,
      publishingPrinciples: `${origin}/about`,
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      url: `${origin}/`,
      name: SITE.name,
      alternateName: SITE.alternateNames,
      description: SITE.tagline,
      inLanguage: 'en-US',
      publisher: { '@id': `${origin}/#organization` },
      potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${origin}/search?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
    },
  ];
}

/** items: [{ name, path }] from the home page down to the current page. */
export function breadcrumb(origin, items, id) {
  return {
    '@type': 'BreadcrumbList',
    ...(id ? { '@id': id } : {}),
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(origin, it.path) })),
  };
}

/**
 * Everything that goes in <head> for one page.
 * opts: { origin, path, title, description, image, imageAlt, type, robots, graph[], published, modified, section, tags[] }
 */
export function headBlock(opts) {
  const { origin = '', path = '/', description, image, imageAlt, type = 'website', robots = ROBOTS_INDEX, graph = [], published, modified, section, tags = [] } = opts;
  const url = origin + path;
  const title = opts.exactTitle ? opts.title : fitTitle(opts.title);
  const desc = trunc(description || SITE.description, 158);
  const img = image ? abs(origin, image) : origin ? `${origin}/assets/brand/og-image.png` : '/assets/brand/og-image.png';
  const L = [];
  L.push(`<title>${esc(title)}</title>`);
  L.push(`<meta name="description" content="${esc(desc)}">`);
  L.push(`<meta name="robots" content="${esc(robots)}">`);
  L.push(`<meta name="application-name" content="${esc(SITE.name)}"><meta name="apple-mobile-web-app-title" content="${esc(SITE.name)}">`);
  if (process.env.GOOGLE_SITE_VERIFICATION) L.push(`<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}">`);
  if (process.env.BING_SITE_VERIFICATION) L.push(`<meta name="msvalidate.01" content="${esc(process.env.BING_SITE_VERIFICATION)}">`);
  if (origin) L.push(`<link rel="canonical" href="${esc(url)}">`);
  L.push(`<meta property="og:site_name" content="${esc(SITE.name)}">`);
  L.push(`<meta property="og:locale" content="en_US">`);
  L.push(`<meta property="og:type" content="${esc(type)}">`);
  L.push(`<meta property="og:title" content="${esc(opts.ogTitle || title.replace(` | ${SITE.name}`, ''))}">`);
  L.push(`<meta property="og:description" content="${esc(desc)}">`);
  if (origin) L.push(`<meta property="og:url" content="${esc(url)}">`);
  L.push(`<meta property="og:image" content="${esc(img)}">`);
  if (!image) L.push('<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">');
  if (imageAlt || opts.title) L.push(`<meta property="og:image:alt" content="${esc(imageAlt || opts.title)}">`);
  if (type === 'article') {
    if (published) L.push(`<meta property="article:published_time" content="${esc(published)}">`);
    if (modified) L.push(`<meta property="article:modified_time" content="${esc(modified)}">`);
    if (section) L.push(`<meta property="article:section" content="${esc(section)}">`);
    for (const t of tags.slice(0, 8)) L.push(`<meta property="article:tag" content="${esc(t)}">`);
  }
  L.push('<meta name="twitter:card" content="summary_large_image">');
  L.push(`<meta name="twitter:title" content="${esc(opts.ogTitle || title.replace(` | ${SITE.name}`, ''))}">`);
  L.push(`<meta name="twitter:description" content="${esc(desc)}">`);
  L.push(`<meta name="twitter:image" content="${esc(img)}">`);
  if (graph.length) L.push(ld(graph));
  return L.join('\n');
}

/** Swap a page's existing title/description/robots/canonical/social tags for `block`. */
export function injectHead(html, block) {
  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="(?:description|robots|twitter:[^"]*)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="(?:og|article):[^"]*"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, '')
    .replace('<!--SEO-->', '')
    .replace('<!--POST_META-->', '');
  return cleaned.replace('</head>', `${block}\n</head>`);
}

export const jsonForScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
