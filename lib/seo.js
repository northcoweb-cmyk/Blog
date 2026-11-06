// SEO engine: server-rendered pages that search engines can read without running
// JavaScript, company/topic hub pages, sitemaps and instant-index pings.

import crypto from 'node:crypto';
import { escapeHtml as esc, markdownToText } from '../public/assets/js/md.js';
import { headBlock, injectHead, orgGraph, breadcrumb, abs, trunc, ROBOTS_INDEX, ROBOTS_NOINDEX } from './seo-head.js';
import { SITE } from './site.js';
import { SECTIONS } from './sources.js';
import { listPosts, getPost, slugify, listEditions, getEdition, readData, writeData, canWrite } from './content.js';
import { getNews } from './news.js';
import { fetchWithTimeout } from './http.js';
import { TEMPLATES } from './page-templates.js';

const sectionById = (id) => SECTIONS.find((s) => s.id === id) || { id: 'desk', name: 'The Desk', long: 'From the Desk' };
const dayLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
const longDay = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const SLUG_OK = /^[a-z0-9][a-z0-9-]{0,60}$/;
const titleCase = (s) => s.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (term) => new RegExp(`(^|[^a-z0-9])${reEscape(term)}([^a-z0-9]|$)`, 'i');
// String.replace treats "$&" etc. specially; page text often contains "$", so always replace with a function.
const put = (html, find, text) => html.replace(find, () => text);

// ── Templates ────────────────────────────────────────────────────────────

function fill(name, { head, content, active, patches = [] }) {
  let html = TEMPLATES[name];
  if (!html) throw new Error(`Missing page template: ${name}`);
  if (content != null) html = put(html, '<!--CONTENT-->', content);
  if (active) html = put(html, 'data-page=""', `data-page="${active}"`);
  for (const [find, text] of patches) html = put(html, find, text);
  return injectHead(html, head);
}

// ── Server-rendered pieces (same CSS classes the browser uses) ───────────

const storyHref = (s) => `/story/${s.id}?u=${encodeURIComponent(s.url)}&amp;s=${s.sig}`;

export function storyRowHtml(s) {
  const media = s.image ? `<div class="media"><img src="${esc(s.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : '';
  return `<a class="row-story big" href="${storyHref(s)}" data-sec="${esc(s.section)}"><div><span class="chip" data-sec="${esc(s.section)}">${esc(sectionById(s.section).name)}</span><h3>${esc(s.title)}</h3>${s.summary ? `<p class="sum">${esc(trunc(s.summary, 200))}</p>` : ''}<div class="meta"><span class="src">${esc(s.source)}</span><span class="sep"></span><time datetime="${esc(s.date)}">${dayLabel(s.date)}</time></div></div>${media}</a>`;
}

export function deskCardHtml(p) {
  const media = p.cover?.url ? `<div class="media r32"><img src="${esc(p.cover.url)}" alt="${esc(p.cover.alt || p.title)}" loading="lazy"></div>` : '';
  return `<a class="desk-card" href="/p/${esc(p.slug)}">${media}<span class="chip" data-sec="desk">From the Desk</span><h3>${esc(p.title)}</h3>${p.dek ? `<p class="dek">${esc(p.dek)}</p>` : ''}<div class="meta"><span class="src">${esc(p.author)}</span><span class="sep"></span><time datetime="${esc(p.publishedAt)}">${dayLabel(p.publishedAt)}</time><span class="sep"></span><span>${p.readingTime || 3} min read</span></div></a>`;
}

const topicLink = (name) => `<a href="/topic/${esc(slugify(name))}">${esc(name)}</a>`;

// ── Topics (companies, products, people, themes) ─────────────────────────

/** Every tag on published posts → { slug, name, count }. These get indexed hub pages. */
export function postTopics(posts) {
  const m = new Map();
  for (const p of posts) for (const t of p.tags || []) {
    const slug = slugify(t);
    if (!slug || slug === 'post') continue;
    const cur = m.get(slug) || { slug, name: t, count: 0 };
    cur.count++;
    m.set(slug, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function collectTopic(slug) {
  const [posts, news] = await Promise.all([listPosts(), getNews().catch(() => ({ stories: [] }))]);
  let name = null;
  for (const p of posts) for (const t of p.tags || []) if (slugify(t) === slug) name ||= t;
  if (!name) for (const s of news.stories) for (const t of s.tags || []) if (slugify(t) === slug) name ||= t;
  name ||= titleCase(slug);
  const re = wordRe(name);
  const own = posts.filter((p) => (p.tags || []).some((t) => slugify(t) === slug) || re.test(`${p.title} ${p.dek || ''}`));
  const wire = news.stories.filter((s) => (s.tags || []).some((t) => slugify(t) === slug) || re.test(`${s.title} ${s.summary || ''}`)).slice(0, 40);
  const rel = new Map();
  for (const t of [...own.flatMap((p) => p.tags || []), ...wire.flatMap((s) => s.tags || [])]) if (slugify(t) !== slug) rel.set(slugify(t), t);
  return { name, own, wire, related: [...rel.values()].slice(0, 14) };
}

export async function topicPage(slug, origin) {
  if (!SLUG_OK.test(slug || '')) return notFoundPage(origin);
  const { name, own, wire, related } = await collectTopic(slug);
  if (!own.length && !wire.length) return notFoundPage(origin);
  const path = `/topic/${slug}`;
  const indexable = own.length > 0; // pages with no original coverage stay out of Google (thin content)
  const intro = own.length
    ? `Everything Tensor Street has published about ${name}: ${own.length} original ${own.length === 1 ? 'article' : 'articles'}${wire.length ? ` plus ${wire.length} recent ${wire.length === 1 ? 'headline' : 'headlines'} from across the web` : ''}, updated continuously.`
    : `The latest headlines mentioning ${name}, collected from across the web and updated continuously.`;
  const desc = own[0]?.dek ? trunc(`${name}: ${own[0].dek} Plus the latest ${name} news, analysis and updates.`, 158) : trunc(`${intro} Follow ${name} news and analysis on Tensor Street.`, 158);
  const head = headBlock({
    origin, path,
    title: `${name} News, Analysis & Latest Updates`,
    description: desc,
    image: own.find((p) => p.cover?.url)?.cover.url || wire.find((s) => s.image)?.image,
    robots: indexable ? ROBOTS_INDEX : ROBOTS_NOINDEX,
    graph: [
      ...orgGraph(origin),
      {
        '@type': 'CollectionPage', '@id': `${origin}${path}#page`, url: origin + path, name: `${name}: news, analysis and latest updates`, description: desc,
        isPartOf: { '@id': `${origin}/#website` }, about: { '@type': 'Thing', name },
        mainEntity: { '@type': 'ItemList', numberOfItems: own.length, itemListElement: own.slice(0, 20).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${origin}/p/${p.slug}`, name: p.title })) },
      },
      breadcrumb(origin, [{ name: 'Home', path: '/' }, { name: 'Topics', path: '/topics' }, { name, path }]),
    ],
  });
  const content = `<header class="page-head"><div class="crumbs"><a href="/">Home</a> / <a href="/topics">Topics</a> / <span>${esc(name)}</span></div>
<span class="chip solid" data-sec="desk" style="margin-top:16px">Topic</span><h1>${esc(name)}: news, analysis &amp; latest updates</h1><p>${esc(intro)}</p></header>
${own.length ? `<section aria-label="Original articles"><div class="sec-head"><h2><span class="bar"></span>From the Desk · original ${esc(name)} coverage</h2></div><div class="cards-3">${own.slice(0, 12).map(deskCardHtml).join('')}</div></section>` : ''}
${wire.length ? `<section style="margin-top:44px" aria-label="Latest headlines"><div class="sec-head"><h2><span class="bar"></span>Latest ${esc(name)} headlines</h2></div><div class="grid"><div class="col-8"><div class="panel panel-pad">${wire.slice(0, 20).map(storyRowHtml).join('')}</div></div>
<aside class="col-4">${related.length ? `<div class="panel panel-pad"><div class="sec-head"><h2>Related topics</h2></div><div class="tags">${related.map(topicLink).join('')}</div></div>` : ''}</aside></div></section>` : related.length ? `<section style="margin-top:44px"><div class="sec-head"><h2>Related topics</h2></div><div class="tags">${related.map(topicLink).join('')}</div></section>` : ''}`;
  return { status: 200, html: fill('page', { head, content, active: 'topics' }), cacheSeconds: 300 };
}

export async function topicsIndexPage(origin) {
  const [posts, news] = await Promise.all([listPosts(), getNews().catch(() => ({ stories: [] }))]);
  const own = postTopics(posts);
  const ownSlugs = new Set(own.map((t) => t.slug));
  const trend = new Map();
  for (const s of news.stories) for (const t of s.tags || []) {
    const slug = slugify(t);
    if (ownSlugs.has(slug)) continue;
    const cur = trend.get(slug) || { slug, name: t, count: 0 };
    cur.count++;
    trend.set(slug, cur);
  }
  const hot = [...trend.values()].filter((t) => t.count >= 2).sort((a, b) => b.count - a.count).slice(0, 40);
  const pill = (t) => `<a href="/topic/${esc(t.slug)}">${esc(t.name)} <small>${t.count}</small></a>`;
  const head = headBlock({
    origin, path: '/topics',
    title: 'AI Companies & Topics: News and Analysis by Name',
    description: 'Browse news and analysis by company, product and topic: OpenAI, Anthropic, Nvidia, startups and more. Original coverage plus the latest headlines.',
    graph: [...orgGraph(origin), breadcrumb(origin, [{ name: 'Home', path: '/' }, { name: 'Topics', path: '/topics' }])],
  });
  const content = `<header class="page-head"><div class="crumbs"><a href="/">Home</a> / <span>Topics</span></div><h1>Companies &amp; topics</h1><p>Browse Tensor Street by the names in the news. Each page collects our original coverage and the latest headlines in one place.</p></header>
${own.length ? `<section><div class="sec-head"><h2><span class="bar"></span>Covered by the Desk</h2></div><div class="tags big">${own.map(pill).join('')}</div></section>` : ''}
${hot.length ? `<section style="margin-top:40px"><div class="sec-head"><h2><span class="bar" style="--sec:var(--live)"></span>Trending in the news</h2></div><div class="tags big">${hot.map(pill).join('')}</div></section>` : ''}`;
  return { status: 200, html: fill('page', { head, content, active: 'topics' }), cacheSeconds: 600 };
}

// ── Sections ─────────────────────────────────────────────────────────────

export const SECTION_SEO = {
  ai: ['AI News Today: Latest Artificial Intelligence Headlines', 'The latest artificial intelligence news: the biggest moves across the AI industry, updated all day from trusted newsrooms and the labs themselves.'],
  models: ['New AI Models & Launches: GPT, Claude, Gemini and More', 'New AI model releases and product launches from OpenAI, Anthropic, Google, Meta, xAI, Mistral and DeepSeek, as they happen.'],
  markets: ['AI Stocks & Markets: Nvidia, Big Tech and the AI Trade', 'AI stock news and market analysis: Nvidia, Microsoft, Alphabet, chipmakers, earnings, data center spending and the AI trade.'],
  policy: ['AI Regulation & Policy News: Laws, Courts and Politics', 'AI regulation and policy news: new laws, court rulings, government action and the politics shaping how AI is built and used.'],
  startups: ['AI Startup Funding News: Rounds, Deals and Acquisitions', 'AI startup news: funding rounds, valuations, acquisitions and the companies raising money to build with artificial intelligence.'],
  mainstreet: ['AI for Small Business: Tools, Case Studies and What Works', 'How small businesses are using AI: real examples, tools that save time, and honest takes on what is and is not working on Main Street.'],
  research: ['AI Research News: Papers, Breakthroughs and Benchmarks', 'AI research news in plain English: new papers, scientific breakthroughs, benchmarks and the science behind modern AI systems.'],
  tech: ['Tech News Through an AI Lens: Chips, Devices, Platforms', 'Technology news viewed through AI: chips, devices, platforms and the products people use every day, updated through the day.'],
};

export async function sectionPage(id, origin) {
  const sec = SECTIONS.find((s) => s.id === id);
  if (!sec) return notFoundPage(origin);
  const [title, desc] = SECTION_SEO[id] || [`${sec.long} News`, sec.blurb];
  const [news, posts] = await Promise.all([getNews().catch(() => ({ stories: [] })), listPosts()]);
  const list = news.stories.filter((s) => s.section === id).slice(0, 25);
  const mine = posts.filter((p) => p.section === id).slice(0, 10);
  const path = `/section/${id}`;
  const head = headBlock({
    origin, path, title, description: desc,
    image: mine.find((p) => p.cover?.url)?.cover.url,
    graph: [
      ...orgGraph(origin),
      { '@type': 'CollectionPage', '@id': `${origin}${path}#page`, url: origin + path, name: sec.long, description: desc, isPartOf: { '@id': `${origin}/#website` }, mainEntity: { '@type': 'ItemList', itemListElement: mine.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${origin}/p/${p.slug}`, name: p.title })) } },
      breadcrumb(origin, [{ name: 'Home', path: '/' }, { name: sec.long, path }]),
    ],
  });
  const patches = [
    [/<header class="page-head" id="page-head">[\s\S]*?<\/header>/, `<header class="page-head" id="page-head" data-sec="${esc(id)}"><div class="crumbs"><a href="/">Home</a> / <span>${esc(sec.long)}</span></div><span class="chip solid" style="margin-top:16px">${esc(sec.name)} desk</span><h1>${esc(sec.long)}</h1><p>${esc(sec.blurb)}</p></header>`],
    ['<div class="panel panel-pad" id="sec-list"></div>', `<div class="panel panel-pad" id="sec-list">${list.map(storyRowHtml).join('')}</div>`],
  ];
  return { status: 200, html: fill('section', { head, patches, active: id }), cacheSeconds: 300 };
}

// ── Static pages (home, about, learn, archive, search, brand) ────────────

const STATIC = {
  index: { path: '/', title: 'Tensor Street | AI News, AI Stocks & Startup Funding', exactTitle: true, description: 'Free daily AI news: model launches, AI stocks and markets, regulation, startup funding and how small businesses use AI. Updated all day.' },
  about: { path: '/about', title: 'About Tensor Street: The Daily AI Economy Briefing', description: 'Tensor Street is a free news desk covering AI and the AI economy: model launches, markets, policy, startups and small business. How we work and what we stand for.' },
  learn: { path: '/learn', title: 'AI Glossary: Plain-English Definitions of AI Terms', description: 'Plain-English definitions of the AI terms in the news: LLMs, agents, inference, GPUs, tokens, RAG, fine-tuning, AGI and more, with examples from real headlines.' },
  archive: { path: '/archive', title: 'Daily AI News Archive: Every Edition of The Brief', description: 'Every edition of Tensor Street’s daily AI briefing, saved by date: the top AI stories of each day with a line on why each one matters.' },
  search: { path: '/search', title: 'Search AI News', description: 'Search Tensor Street for AI news, companies, models and original analysis.', robots: ROBOTS_NOINDEX },
  brand: { path: '/brand', title: 'Brand kit', description: 'Tensor Street brand assets.', robots: 'noindex,nofollow' },
};

export async function staticPage(name, origin) {
  const cfg = STATIC[name];
  if (!cfg) return notFoundPage(origin);
  const graph = [...orgGraph(origin)];
  if (name !== 'index') graph.push(breadcrumb(origin, [{ name: 'Home', path: '/' }, { name: cfg.title.split(':')[0], path: cfg.path }]));
  const head = headBlock({ origin, ...cfg, graph });
  const patches = [];
  if (name === 'index') {
    // Headlines in the HTML itself, so crawlers that don't run JavaScript still see the news.
    const news = await getNews().catch(() => ({ stories: [] }));
    patches.push(['<div class="panel panel-pad" id="latest"></div>', `<div class="panel panel-pad" id="latest">${news.stories.slice(0, 12).map(storyRowHtml).join('')}</div>`]);
  }
  if (name === 'archive') {
    const eds = await listEditions();
    const list = eds.length ? `<div class="panel panel-pad"><ul class="hl-list">${eds.map((e) => `<li><a href="/archive/${esc(e.date)}" style="grid-template-columns:150px 1fr"><span class="n" style="font-size:13px">${dayLabel(`${e.date}T12:00:00Z`)}</span><div><h4>${esc(e.headline || e.title)}</h4><div class="meta">${esc(e.title)} · ${e.count} stories</div></div></a></li>`).join('')}</ul></div>` : '';
    patches.push(['<div id="archive"></div>', `<div id="archive"><header class="page-head"><div class="crumbs"><a href="/">Home</a> / <span>Archive</span></div><h1>The daily archive</h1><p>Every edition of The Brief, saved each morning.</p></header><div id="eds">${list}</div></div>`]);
  }
  return { status: 200, html: fill(name, { head, patches, active: name === 'index' ? 'home' : name }), cacheSeconds: name === 'index' ? 300 : 3600 };
}

export async function archiveDatePage(date, origin) {
  const ed = await getEdition(date);
  if (!ed) return notFoundPage(origin);
  const path = `/archive/${date}`;
  const nice = longDay(`${date}T12:00:00Z`);
  const head = headBlock({
    origin, path,
    title: `AI News Brief for ${nice}`,
    description: trunc(`${ed.intro || ''} The top AI stories of ${nice}.`, 158),
    type: 'article', published: `${date}T12:00:00Z`, section: 'AI',
    graph: [...orgGraph(origin), breadcrumb(origin, [{ name: 'Home', path: '/' }, { name: 'Archive', path: '/archive' }, { name: nice, path }])],
  });
  const items = (ed.items || []).map((s, i) => `<li><strong>${esc(s.headline || s.title)}</strong><br>${esc(s.aiSummary || s.summary || '')}<br><em>Why it matters:</em> ${esc(s.why || '')}</li>`).join('');
  const patches = [['<div id="archive"></div>', `<div id="archive"><header class="page-head"><div class="crumbs"><a href="/">Home</a> / <a href="/archive">Archive</a> / <span>${esc(date)}</span></div><h1>${esc(nice)}</h1><p>${esc(ed.intro || '')}</p></header><ol class="prose">${items}</ol></div>`]];
  return { status: 200, html: fill('archive', { head, patches, active: 'archive' }), cacheSeconds: 86400 };
}

// ── Wire story pages (shareable, but kept out of Google: they summarize other outlets' reporting) ──

export function storyPage(story, origin) {
  if (!story) {
    const head = headBlock({ origin, path: '/story', title: 'Story not found', description: 'This story has rolled off the live wire.', robots: 'noindex,nofollow' });
    return { status: 404, html: fill('story', { head }), cacheSeconds: 60 };
  }
  const path = `/story/${story.id}`;
  const head = headBlock({
    origin, path, title: story.title, exactTitle: false,
    description: story.summary || `${story.title}. Reported by ${story.source}.`,
    image: story.image, type: 'article', robots: ROBOTS_NOINDEX, published: story.date, section: sectionById(story.section).long, tags: story.tags || [],
  });
  const patches = [[/<article class="article" id="story">[\s\S]*?<\/article>/, `<article class="article" id="story"><div class="crumbs"><a href="/">Home</a> / <a href="/section/${esc(story.section)}">${esc(sectionById(story.section).long)}</a></div><header class="article-head" style="margin-top:18px"><h1>${esc(story.title)}</h1>${story.summary ? `<p class="dek">${esc(story.summary)}</p>` : ''}</header><p class="meta"><span class="src">${esc(story.source)}</span><span class="sep"></span><time datetime="${esc(story.date)}">${dayLabel(story.date)}</time></p></article>`]];
  return { status: 200, html: fill('story', { head, patches, active: story.section }), cacheSeconds: 600 };
}

// ── Desk articles ────────────────────────────────────────────────────────

export async function postPage(slug, origin, renderMarkdown) {
  const post = await getPost(String(slug || ''));
  if (!post) return notFoundPage(origin, 'post');
  const sec = sectionById(post.section);
  const path = `/p/${post.slug}`;
  const html = renderMarkdown(post.body);
  const text = markdownToText(post.body);
  const desc = post.dek || trunc(text, 158);
  const img = post.cover?.url ? abs(origin, post.cover.url) : `${origin}/assets/brand/og-image.png`;
  const tags = post.tags || [];
  const words = text.split(/\s+/).filter(Boolean).length;
  const isDesk = /desk|tensor street/i.test(post.author || '');
  const head = headBlock({
    origin, path, title: post.title, description: desc, image: post.cover?.url, imageAlt: post.cover?.alt || post.title,
    type: 'article', published: post.publishedAt, modified: post.updatedAt, section: sec.long, tags,
    graph: [
      ...orgGraph(origin),
      {
        '@type': 'NewsArticle', '@id': `${origin}${path}#article`,
        headline: trunc(post.title, 110), description: desc, image: [img],
        datePublished: post.publishedAt, dateModified: post.updatedAt || post.publishedAt,
        author: isDesk ? { '@type': 'Organization', name: post.author || SITE.name, url: `${origin}/about` } : { '@type': 'Person', name: post.author },
        publisher: { '@id': `${origin}/#organization` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': origin + path },
        isPartOf: { '@id': `${origin}/#website` },
        articleSection: sec.long, keywords: tags.join(', '), wordCount: words, inLanguage: 'en-US', isAccessibleForFree: true,
        about: tags.slice(0, 3).map((t) => ({ '@type': 'Thing', name: t, url: `${origin}/topic/${slugify(t)}` })),
        mentions: tags.slice(3, 8).map((t) => ({ '@type': 'Thing', name: t })),
      },
      breadcrumb(origin, [{ name: 'Home', path: '/' }, { name: sec.long, path: `/section/${post.section}` }, { name: post.title, path }]),
    ],
  });
  const body = `<div class="crumbs"><a href="/">Home</a> / <a href="/section/${esc(post.section)}">${esc(sec.long)}</a></div>
<header class="article-head" style="margin-top:18px"><span class="chip solid" data-sec="desk">From the Desk · ${esc(sec.name)}</span><h1>${esc(post.title)}</h1>${post.dek ? `<p class="dek">${esc(post.dek)}</p>` : ''}</header>
<div class="byline"><div><div class="who">${esc(post.author)}</div><div class="when"><time datetime="${esc(post.publishedAt)}">${dayLabel(post.publishedAt)}</time> · ${post.readingTime || 3} min read</div></div></div>
${post.cover?.url ? `<figure class="article-figure"><div class="media"><img src="${esc(post.cover.url)}" alt="${esc(post.cover.alt || post.title)}"></div></figure>` : ''}
<div class="prose">${html}</div>
${tags.length ? `<div class="tags" style="margin:28px 0">${tags.map(topicLink).join('')}</div>` : ''}`;
  const payload = JSON.stringify({ ...post, html }).replace(/</g, '\\u003c');
  let out = TEMPLATES.post;
  out = put(out, '<!--POST_JSON-->', `<script>window.__POST__=${payload}</script>`);
  out = put(out, '<!--POST_BODY-->', body);
  return { status: 200, html: injectHead(out, head), cacheSeconds: 60 };
}

export function notFoundPage(origin, template = 'page') {
  const head = headBlock({ origin, path: '/', title: 'Page not found', description: 'That page could not be found.', robots: 'noindex,nofollow' });
  const content = `<div class="page-head" style="border:0;text-align:center;padding:80px 0"><span class="mono" style="color:var(--muted)">ERROR 404</span><h1>This page went off the wire.</h1><p style="margin:0 auto 24px">The link may be old or mistyped. Today’s news is right this way.</p><a class="btn btn-primary" href="/">Back to the front page</a></div>`;
  if (template === 'post') {
    let out = TEMPLATES.post;
    out = put(out, '<!--POST_JSON-->', '<script>window.__POST__=null</script>');
    out = put(out, '<!--POST_BODY-->', content);
    return { status: 404, html: injectHead(out, head), cacheSeconds: 30 };
  }
  return { status: 404, html: fill('page', { head, content }), cacheSeconds: 30 };
}

// ── Sitemaps & robots ────────────────────────────────────────────────────

const xml = (s) => esc(s);

export async function sitemapXml(origin) {
  const [posts, editions] = await Promise.all([listPosts(), listEditions()]);
  const topics = postTopics(posts);
  const url = (loc, { mod, freq, pri, img } = {}) => `<url><loc>${xml(loc)}</loc>${mod ? `<lastmod>${new Date(mod).toISOString()}</lastmod>` : ''}${freq ? `<changefreq>${freq}</changefreq>` : ''}${pri ? `<priority>${pri}</priority>` : ''}${img ? `<image:image><image:loc>${xml(abs(origin, img))}</image:loc></image:image>` : ''}</url>`;
  const rows = [
    url(`${origin}/`, { freq: 'hourly', pri: '1.0', mod: posts[0]?.updatedAt || Date.now() }),
    url(`${origin}/topics`, { freq: 'daily', pri: '0.8' }),
    ...SECTIONS.map((s) => url(`${origin}/section/${s.id}`, { freq: 'hourly', pri: '0.8' })),
    ...posts.map((p) => url(`${origin}/p/${p.slug}`, { mod: p.updatedAt || p.publishedAt, freq: 'weekly', pri: '0.9', img: p.cover?.url })),
    ...topics.map((t) => url(`${origin}/topic/${t.slug}`, { freq: 'daily', pri: '0.8' })),
    url(`${origin}/learn`, { freq: 'monthly', pri: '0.6' }),
    url(`${origin}/archive`, { freq: 'daily', pri: '0.5' }),
    url(`${origin}/about`, { freq: 'monthly', pri: '0.4' }),
    ...editions.slice(0, 90).map((e) => url(`${origin}/archive/${e.date}`, { freq: 'yearly', pri: '0.4' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${rows.join('\n')}\n</urlset>`;
}

/** Google News sitemap: only articles from the last two days, as Google requires. */
export async function newsSitemapXml(origin) {
  const cutoff = Date.now() - 48 * 3600e3;
  const posts = (await listPosts()).filter((p) => Date.parse(p.publishedAt) >= cutoff).slice(0, 1000);
  const rows = posts.map((p) => `<url><loc>${xml(`${origin}/p/${p.slug}`)}</loc><news:news><news:publication><news:name>${xml(SITE.name)}</news:name><news:language>en</news:language></news:publication><news:publication_date>${new Date(p.publishedAt).toISOString()}</news:publication_date><news:title>${xml(p.title)}</news:title></news:news></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${rows.join('\n')}\n</urlset>`;
}

export const robotsTxt = (origin) => `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/news-sitemap.xml\n`;

// ── IndexNow: tell Bing, Yahoo, DuckDuckGo & co. about new pages within minutes ──
// (Google doesn't use IndexNow; it finds pages through the sitemap in Search Console.)

const KEY_FILE = 'content/seo/indexnow.json';

export async function indexNowKey({ create = false } = {}) {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY;
  const saved = await readData(KEY_FILE, null);
  if (saved?.key) return saved.key;
  if (!create || !canWrite()) return null;
  const key = crypto.randomBytes(16).toString('hex');
  await writeData(KEY_FILE, { key }, 'Create IndexNow key');
  return key;
}

export async function pingIndexNow(origin, urls) {
  try {
    if (/^https?:\/\/(localhost|127\.)/.test(origin)) return 'skipped (local)';
    const list = [...new Set(urls.filter(Boolean))].slice(0, 100);
    if (!list.length) return 'skipped';
    const key = await indexNowKey({ create: true });
    if (!key) return 'skipped (no key)';
    const res = await fetchWithTimeout('https://api.indexnow.org/indexnow', {
      method: 'POST', timeout: 5000,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/indexnow-key.txt`, urlList: list }),
    });
    return res.ok ? 'sent' : `failed (${res.status})`;
  } catch (e) {
    return `failed (${e.message})`;
  }
}

/** URLs worth pinging when a desk article goes live: the article, its topic pages and the home page. */
export const urlsForPost = (origin, post) => [`${origin}/p/${post.slug}`, `${origin}/`, `${origin}/topics`, ...(post.tags || []).map((t) => `${origin}/topic/${slugify(t)}`), `${origin}/section/${post.section}`];

/** The article shell used by the editor's Preview button (never indexed). */
export function postPreviewPage(origin) {
  const head = headBlock({ origin, path: '/post', title: 'Preview', description: 'Article preview.', robots: 'noindex,nofollow' });
  let out = TEMPLATES.post;
  out = put(out, '<!--POST_JSON-->', '');
  out = put(out, '<!--POST_BODY-->', '');
  return { status: 200, html: injectHead(out, head), cacheSeconds: 0 };
}
