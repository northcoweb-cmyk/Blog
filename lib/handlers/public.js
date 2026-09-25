import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNews, extractMeta } from '../news.js';
import { getMarkets } from '../markets.js';
import { getBrief, storyTake } from '../brief.js';
import { llmEnabled } from '../llm.js';
import { listPosts, getPost, readMedia, listEditions, getEdition } from '../content.js';
import { SECTIONS, SECTION_IDS } from '../sources.js';
import { SITE } from '../site.js';
import { cache, json, getQuery, readJson, verify, fetchHead, fetchWithTimeout, isPublicHttpUrl, siteOrigin, hashId, sign, noStore } from '../http.js';
import { renderMarkdown, markdownToText, escapeHtml } from '../../public/assets/js/md.js';
import { newsletterEnabled, subscribe } from '../newsletter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const publicRoutes = {
  // GET /api/news?section=models&q=nvidia&limit=40
  async news(req, res) {
    const q = getQuery(req);
    const data = await getNews();
    let stories = data.stories;
    if (q.section && SECTION_IDS.has(q.section)) stories = stories.filter((s) => s.section === q.section);
    if (q.q) {
      const terms = String(q.q).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
      stories = stories.filter((s) => {
        const hay = `${s.title} ${s.summary} ${s.source} ${s.tags.join(' ')}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 120));
    cache(res, 300, 3600);
    json(res, 200, {
      generatedAt: data.generatedAt,
      count: stories.length,
      sourcesOk: data.sources.filter((s) => s.ok).length,
      sourcesTotal: data.sources.length,
      breaking: data.stories.filter((s) => s.breaking).slice(0, 3),
      stories: stories.slice(0, limit),
    });
  },

  async markets(req, res) {
    const data = await getMarkets();
    cache(res, data.ok ? 120 : 30, 600);
    json(res, 200, data);
  },

  async brief(req, res) {
    const data = await getBrief();
    cache(res, data.ai ? 1800 : 600, 7200);
    json(res, 200, data);
  },

  // GET /api/story?id=abc  or  /api/story?u=<url>&s=<sig>  (+ &take=1 for the AI note)
  async story(req, res) {
    const q = getQuery(req);
    const news = await getNews();
    let story = q.id ? news.stories.find((s) => s.id === q.id) : null;
    if (!story && q.u && verify(q.u, q.s) && isPublicHttpUrl(q.u)) {
      story = news.stories.find((s) => s.url === q.u) || (await storyFromUrl(q.u));
    }
    if (!story) {
      cache(res, 60);
      return json(res, 404, { error: 'This story has rolled off the wire.' });
    }
    if (q.take) {
      if (!llmEnabled()) {
        cache(res, 3600);
        return json(res, 200, { take: null });
      }
      try {
        const take = await storyTake(story);
        cache(res, 86400, 86400 * 3);
        return json(res, 200, { take });
      } catch (e) {
        cache(res, 120);
        return json(res, 200, { take: null, error: e.message });
      }
    }
    const more = news.stories.filter((s) => s.id !== story.id && s.section === story.section).slice(0, 6);
    cache(res, 600, 86400);
    json(res, 200, { story, more, aiAvailable: llmEnabled() });
  },

  // Signed image proxy — lets the Social Studio draw news photos onto a canvas.
  async img(req, res) {
    const q = getQuery(req);
    if (!q.u || !verify(q.u, q.s) || !isPublicHttpUrl(q.u)) return json(res, 403, { error: 'Bad signature' });
    const got = await fetchImage(q.u);
    if (!got) return json(res, 502, { error: 'Image unavailable' });
    res.setHeader('Content-Type', got.type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.end(got.buf);
  },

  // GET /api/posts  |  /api/posts?slug=my-post  |  /api/posts?section=markets
  async posts(req, res) {
    const q = getQuery(req);
    if (q.slug) {
      const post = await getPost(q.slug);
      cache(res, 60, 600);
      if (!post) return json(res, 404, { error: 'Not found' });
      return json(res, 200, { post: { ...post, html: renderMarkdown(post.body) } });
    }
    let posts = await listPosts();
    if (q.section) posts = posts.filter((p) => p.section === q.section);
    cache(res, 60, 600);
    json(res, 200, { posts: posts.slice(0, Math.min(100, parseInt(q.limit, 10) || 50)) });
  },

  // GET /media/2026/09/abc.jpg  → uploaded image
  async media(req, res) {
    const q = getQuery(req);
    const rel = String(q.path || '').replace(/^\/+/, '');
    const file = await readMedia(rel);
    if (!file) return json(res, 404, { error: 'Not found' });
    res.setHeader('Content-Type', file.type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(file.buf);
  },

  async editions(req, res) {
    const q = getQuery(req);
    cache(res, 300, 3600);
    if (q.date) {
      const ed = await getEdition(q.date);
      return ed ? json(res, 200, { edition: ed }) : json(res, 404, { error: 'No edition for that date' });
    }
    json(res, 200, { editions: await listEditions() });
  },

  async config(req, res) {
    cache(res, 300);
    json(res, 200, { site: SITE, sections: SECTIONS, features: { ai: llmEnabled(), newsletter: newsletterEnabled() } });
  },

  async subscribe(req, res) {
    noStore(res);
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    const body = await readJson(req).catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return json(res, 400, { error: 'Please enter a valid email address.' });
    if (body.website) return json(res, 200, { ok: true }); // honeypot
    try {
      await subscribe(email);
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, e.status || 500, { error: e.message });
    }
  },

  async health(req, res) {
    const [news, markets] = await Promise.all([getNews(), getMarkets()]);
    noStore(res);
    json(res, 200, {
      ok: news.sources.some((s) => s.ok),
      newsGeneratedAt: news.generatedAt,
      stories: news.count,
      sources: news.sources,
      markets: { ok: markets.ok, provider: markets.provider, errors: markets.errors },
      ai: llmEnabled(),
      newsletter: newsletterEnabled(),
    });
  },

  // Server-rendered article page: /p/:slug (real meta tags for Google, iMessage, Instagram link previews)
  async p(req, res) {
    const q = getQuery(req);
    const origin = siteOrigin(req);
    const post = q.slug ? await getPost(String(q.slug)) : null;
    let tpl = await fs.readFile(path.join(ROOT, 'public/post.html'), 'utf8').catch(() => null);
    if (!tpl) tpl = await fetchWithTimeout(`${origin}/post`, { timeout: 5000 }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
    if (!tpl) return json(res, 500, { error: 'Template missing' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!post) {
      res.statusCode = 404;
      cache(res, 30);
      return res.end(tpl.replace('<!--POST_JSON-->', '<script>window.__POST__=null</script>'));
    }
    const html = renderMarkdown(post.body);
    const desc = post.dek || markdownToText(post.body).slice(0, 200);
    const img = post.cover?.url ? new URL(post.cover.url, origin).toString() : `${origin}/assets/brand/og-image.png`;
    const url = `${origin}/p/${post.slug}`;
    const meta = `
<title>${escapeHtml(post.title)} · ${escapeHtml(SITE.name)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(post.title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${escapeHtml(img)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="${escapeHtml(SITE.name)}">
<meta property="article:published_time" content="${escapeHtml(post.publishedAt || '')}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: post.title,
      description: desc,
      image: [img],
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: [{ '@type': 'Person', name: post.author }],
      publisher: { '@type': 'Organization', name: SITE.name, logo: { '@type': 'ImageObject', url: `${origin}/assets/brand/icon-512.png` } },
      mainEntityOfPage: url,
    }).replace(/</g, '\\u003c')}</script>`;
    const payload = JSON.stringify({ ...post, html }).replace(/</g, '\\u003c');
    const out = tpl
      .replace(/<title>[\s\S]*?<\/title>/, '')
      .replace('<!--POST_META-->', meta)
      .replace('<!--POST_JSON-->', `<script>window.__POST__=${payload}</script>`)
      .replace('<!--POST_BODY-->', `<noscript><article class="prose"><h1>${escapeHtml(post.title)}</h1>${html}</article></noscript>`);
    cache(res, 60, 3600);
    res.end(out);
  },

  async rss(req, res) {
    const origin = siteOrigin(req);
    const [posts, news] = await Promise.all([listPosts(), getNews()]);
    const items = [
      ...posts.slice(0, 20).map((p) => ({ title: p.title, link: `${origin}/p/${p.slug}`, desc: p.dek, date: p.publishedAt, cat: p.section })),
      ...news.stories.slice(0, 30).map((s) => ({ title: s.title, link: `${origin}/story/${s.id}?u=${encodeURIComponent(s.url)}&s=${s.sig}`, desc: `${s.summary} (via ${s.source})`, date: s.date, cat: s.section })),
    ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const x = (s) => escapeHtml(s || '');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${x(SITE.name)}</title>
<link>${origin}</link>
<atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml"/>
<description>${x(SITE.tagline)}</description>
<language>en-us</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.map((i) => `<item><title>${x(i.title)}</title><link>${x(i.link)}</link><guid isPermaLink="false">${hashId(i.link)}</guid><description>${x(i.desc)}</description><category>${x(i.cat)}</category><pubDate>${new Date(i.date).toUTCString()}</pubDate></item>`).join('\n')}
</channel>
</rss>`;
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    cache(res, 600, 3600);
    res.end(xml);
  },

  async sitemap(req, res) {
    const origin = siteOrigin(req);
    const [posts, editions] = await Promise.all([listPosts(), listEditions()]);
    const urls = [
      { loc: `${origin}/`, freq: 'hourly', pri: '1.0' },
      ...SECTIONS.map((s) => ({ loc: `${origin}/section/${s.id}`, freq: 'hourly', pri: '0.8' })),
      { loc: `${origin}/learn`, freq: 'monthly', pri: '0.6' },
      { loc: `${origin}/archive`, freq: 'daily', pri: '0.5' },
      { loc: `${origin}/about`, freq: 'monthly', pri: '0.4' },
      ...posts.map((p) => ({ loc: `${origin}/p/${p.slug}`, mod: p.updatedAt, freq: 'weekly', pri: '0.9' })),
      ...editions.slice(0, 60).map((e) => ({ loc: `${origin}/archive/${e.date}`, freq: 'yearly', pri: '0.4' })),
    ];
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    cache(res, 3600);
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${escapeHtml(u.loc)}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>`);
  },
};

// Publishers' image CDNs often reject bot-looking requests, so ask like a browser
// first (with the site's own referer), then fall back to a plain request.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

function sniffImageType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  if (buf.slice(4, 12).toString().includes('ftypavif')) return 'image/avif';
  return '';
}

export async function fetchImage(url) {
  const origin = new URL(url).origin;
  const attempts = [
    { 'user-agent': BROWSER_UA, accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', referer: origin + '/' },
    { 'user-agent': BROWSER_UA, accept: 'image/*,*/*;q=0.8' },
    { accept: 'image/*' },
  ];
  for (const headers of attempts) {
    try {
      const r = await fetchWithTimeout(url, { timeout: 8000, headers });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 8_000_000) continue;
      let type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!type.startsWith('image/')) type = sniffImageType(buf);
      if (type) return { buf, type };
    } catch {
      /* try the next way */
    }
  }
  return null;
}

/** Build a story from a URL that's no longer in the live feed (old shared links). */
async function storyFromUrl(url) {
  try {
    const { html, finalUrl } = await fetchHead(url, { timeout: 4000 });
    const m = extractMeta(html);
    const title = m['og:title'] || m['twitter:title'] || m['<title>'];
    if (!title) return null;
    let image = m['og:image'] || m['twitter:image'] || '';
    if (image) image = new URL(image, finalUrl).toString();
    return {
      id: hashId(url),
      title,
      url,
      sig: sign(url),
      summary: (m['og:description'] || m.description || '').slice(0, 420),
      image: isPublicHttpUrl(image) ? image : '',
      source: m['og:site_name'] || new URL(finalUrl).hostname.replace(/^www\./, ''),
      date: m['article:published_time'] || new Date().toISOString(),
      section: 'ai',
      tags: [],
      related: [],
      coverage: 1,
    };
  } catch {
    return null;
  }
}
