import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNews, extractMeta } from '../news.js';
import { getMarkets } from '../markets.js';
import { getBrief, rewriteStory, rewrittenFor } from '../brief.js';
import { llmEnabled } from '../llm.js';
import { listPosts, getPost, readMedia, listEditions, getEdition, slugify } from '../content.js';
import { SECTIONS, SECTION_IDS } from '../sources.js';
import { SITE } from '../site.js';
import { cache, json, getQuery, readJson, verify, fetchHead, fetchWithTimeout, isPublicHttpUrl, siteOrigin, hashId, sign, noStore, fetchImage } from '../http.js';
import { renderMarkdown, markdownToText, escapeHtml } from '../../public/assets/js/md.js';
import { newsletterEnabled, subscribe } from '../newsletter.js';
import { readCardPayload } from '../instagram.js';
import { postPreviewPage, postPage, topicPage, topicsIndexPage, sectionPage, archiveDatePage, storyPage, staticPage, notFoundPage, sitemapXml, newsSitemapXml, robotsTxt, indexNowKey } from '../seo.js';

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

  // GET /api/search?q=nvidia+earnings → scored results from the live wire, desk articles and topic pages.
  async search(req, res) {
    const q = String(getQuery(req).q || '').slice(0, 120);
    const terms = searchTerms(q);
    cache(res, 120, 600);
    if (!terms.length) return json(res, 200, { q, stories: [], posts: [], topics: [] });
    const [news, posts] = await Promise.all([getNews().catch(() => ({ stories: [] })), listPosts()]);
    // Short searches must match every word; long ones (like a pasted headline) a third of them.
    const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length / 3);
    const phrase = norm(q);
    const scoreOf = (fields) => {
      let total = 0;
      let hits = 0;
      for (const t of terms) {
        let best = 0;
        for (const [text, w] of fields) {
          const hay = ` ${String(text || '').toLowerCase()} `;
          if ((SYN[t] || []).some((x) => hay.includes(` ${x}`))) best = Math.max(best, w * 0.7);
          if (hay.includes(` ${t} `) || hay.includes(` ${t}'`) || hay.includes(` ${t},`) || hay.includes(` ${t}.`)) best = Math.max(best, w);
          else if (hay.includes(` ${t}`)) best = Math.max(best, w * 0.75);
          else if (t.length > 3 && hay.includes(t)) best = Math.max(best, w * 0.4);
        }
        if (best) hits++;
        total += best;
      }
      return hits >= need ? total * (hits / terms.length) ** 2 : 0;
    };
    const stories = news.stories
      .map((s) => {
        const ours = rewrittenFor(s.url);
        let base = scoreOf([[s.title, 6], [ours ? `${ours.headline} ${ours.dek}` : '', 6], [(s.tags || []).join(' '), 5], [s.summary, 2.5], [s.source, 2], [sectionName(s.section), 1.5], [(s.related || []).map((r) => r.title).join(' '), 1]]);
        if (phrase.length > 6 && (norm(s.title).includes(phrase) || (ours && norm(ours.headline).includes(phrase)))) base += 100;
        const ageH = (Date.now() - Date.parse(s.date)) / 3600e3;
        return { s, score: base ? base * (1 + 2 / (1 + ageH / 12)) : 0 };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.s);
    // Nothing matched well: show the closest stories rather than an empty page.
    if (!stories.length) {
      const loose = news.stories
        .map((s) => ({ s, n: terms.filter((t) => ` ${norm(`${s.title} ${s.summary} ${(s.tags || []).join(' ')}`)} `.includes(` ${t}`)).length }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 12)
        .map((x) => x.s);
      stories.push(...loose);
    }
    const deskHits = posts
      .map((p) => ({ p, score: scoreOf([[p.title, 6], [(p.tags || []).join(' '), 5], [p.dek, 3], [p.author, 1]]) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.p);
    const names = new Map();
    for (const t of [...posts.flatMap((p) => p.tags || []), ...news.stories.flatMap((s) => s.tags || [])]) names.set(t.toLowerCase(), t);
    const topics = [...names.values()].filter((t) => terms.some((x) => t.toLowerCase().includes(x))).slice(0, 6).map((name) => ({ name, slug: slugify(name) }));
    json(res, 200, { q, stories, posts: deskHits, topics });
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

  // GET /api/story?id=abc  or  /api/story?u=<url>&s=<sig>  (+ &full=1 for the full Kelvane Club article)
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
    // Full Kelvane Club article (AI, written in our own words from the facts).
    if (q.full) {
      if (!llmEnabled()) {
        cache(res, 3600);
        return json(res, 200, { article: null });
      }
      try {
        const article = await rewriteStory(story);
        if (!article.body || article.body.length < 200) throw new Error('Article came back empty');
        cache(res, 86400, 86400 * 3);
        return json(res, 200, { article: { ...article, html: renderMarkdown(article.body) } });
      } catch (e) {
        cache(res, 120);
        return json(res, 200, { article: null, error: e.message });
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

  // Server-drawn Instagram post image (JPEG). Instagram downloads posts from here.
  async card(req, res) {
    const q = getQuery(req);
    const card = readCardPayload(q.d, q.s);
    if (!card) return json(res, 403, { error: 'Bad signature' });
    const { renderCardJpeg } = await import('../social-card.js');
    const { jpeg } = await renderCardJpeg(card);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, immutable');
    res.end(jpeg);
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
    // fresh=1: only recent articles, so the front page never shows old news.
    if (q.fresh) posts = posts.filter((p) => Date.now() - Date.parse(p.publishedAt || p.updatedAt) < (parseInt(q.fresh, 10) > 1 ? parseInt(q.fresh, 10) : 14) * 86400e3);
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

  // Server-rendered HTML pages (real content + SEO tags for search engines): /, /about, /topic/:slug, /p/:slug …
  async html(req, res) {
    const q = getQuery(req);
    const origin = siteOrigin(req);
    const kind = String(q.kind || '');
    let out;
    try {
      if (kind === 'p') out = await postPage(q.slug, origin, renderMarkdown);
      else if (kind === 'topic') out = await topicPage(String(q.slug || '').toLowerCase(), origin);
      else if (kind === 'postpreview') out = postPreviewPage(origin);
      else if (kind === 'topics') out = await topicsIndexPage(origin);
      else if (kind === 'section') out = await sectionPage(String(q.id || ''), origin);
      else if (kind === 'archiveDate') out = await archiveDatePage(String(q.date || ''), origin);
      else if (kind === 'story') {
        const news = await getNews();
        let story = q.id ? news.stories.find((s) => s.id === q.id) : null;
        if (!story && q.u && verify(q.u, q.s) && isPublicHttpUrl(q.u)) story = news.stories.find((s) => s.url === q.u) || (await storyFromUrl(q.u));
        // Story pages are client-rendered from the feed; never tell Google a real-but-unfetched story is a 404.
        out = storyPage(story || (q.id ? { id: q.id, title: 'Kelvane Club story', url: '', section: 'ai', source: SITE.name, date: new Date().toISOString(), summary: '' } : null), origin);
        if (!story) out.status = 200;
      } else out = await staticPage(kind, origin);
    } catch (e) {
      console.error('html page failed', kind, e);
      out = notFoundPage(origin);
      out.status = 500;
    }
    res.statusCode = out.status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    cache(res, out.cacheSeconds || 60, 3600);
    res.end(out.html);
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
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    cache(res, 1800, 7200);
    res.end(await sitemapXml(siteOrigin(req)));
  },

  async newssitemap(req, res) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    cache(res, 600, 3600);
    res.end(await newsSitemapXml(siteOrigin(req)));
  },

  async robots(req, res) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    cache(res, 3600);
    res.end(robotsTxt(siteOrigin(req)));
  },

  // /indexnow-key.txt proves to Bing & co. that we own the site.
  async indexnowkey(req, res) {
    const key = await indexNowKey();
    if (!key) return json(res, 404, { error: 'No key yet' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    cache(res, 3600);
    res.end(key);
  },
};

const ALIASES = { nvda: 'nvidia', msft: 'microsoft', googl: 'google', goog: 'google', alphabet: 'google', amzn: 'amazon', aapl: 'apple', tsla: 'tesla', fb: 'meta', facebook: 'meta', chatgpt: 'openai', gpt: 'openai', claude: 'anthropic', gemini: 'google', ai: 'ai' };
const SYN = { stock: ['shares', 'stocks', 'market'], share: ['stock'], funding: ['raises', 'raised', 'round', 'valuation'], raise: ['funding', 'round'], regulation: ['law', 'rules', 'regulator', 'bill', 'policy'], law: ['regulation', 'bill'], chip: ['gpu', 'semiconductor', 'chips'], gpu: ['chip', 'chips'], model: ['llm', 'models'], launch: ['launches', 'releases', 'unveils', 'debuts'], ipo: ['listing', 'public'], earning: ['earnings', 'revenue', 'quarter'], job: ['jobs', 'layoffs', 'hiring', 'workers'], startup: ['startups', 'founders'] };
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'is', 'are', 'with', 'news', 'latest', 'about', 'what', 'how']);
function searchTerms(q) {
  const raw = String(q).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9$.%-]+/).map((t) => t.replace(/^[.-]+|[.-]+$/g, '')).filter((t) => t.length > 1 && !STOP.has(t));
  return [...new Set(raw.map((t) => ALIASES[t] || (t.endsWith('s') && t.length > 4 ? t.slice(0, -1) : t)))].slice(0, 8);
}
const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9$%.]+/g, ' ').trim();
const sectionName = (id) => SECTIONS.find((s) => s.id === id)?.long || '';

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
