// Crawls the site's sitemap and checks every page for SEO basics.
// Usage: node dev/seo-check.mjs [http://localhost:3000]
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const get = async (p) => { const r = await fetch(p.startsWith('http') ? p : base + p, { redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const attr = (html, re) => (html.match(re) || [])[1] || '';
let bad = 0;
const fail = (url, msg) => { bad++; console.log(`  ✗ ${url}: ${msg}`); };

const sm = await get('/sitemap.xml');
const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''));
const extra = ['/search', '/topics', '/nope-404'];
console.log(`Checking ${urls.length + extra.length} pages on ${base}`);
for (const u of [...new Set([...urls, ...extra])]) {
  const { status, text } = await get(u);
  if (u === '/nope-404') { if (status !== 404) fail(u, `expected 404, got ${status}`); continue; }
  if (status !== 200) { fail(u, `status ${status}`); continue; }
  const title = attr(text, /<title>([^<]*)<\/title>/);
  const desc = attr(text, /<meta name="description" content="([^"]*)"/);
  const canon = attr(text, /<link rel="canonical" href="([^"]*)"/);
  const og = attr(text, /<meta property="og:image" content="([^"]*)"/);
  const robots = attr(text, /<meta name="robots" content="([^"]*)"/);
  const h1 = (text.match(/<h1[\s>]/g) || []).length;
  const noindex = /noindex/.test(robots);
  if ((text.match(/<title>/g) || []).length !== 1) fail(u, 'needs exactly one <title>');
  if (title.length < 10 || title.length > 70) fail(u, `title length ${title.length}: ${title}`);
  if (desc.length < 50 || desc.length > 160) fail(u, `description length ${desc.length}`);
  if (!/^https?:\/\//.test(canon)) fail(u, 'canonical missing or not absolute');
  if (!/^https?:\/\//.test(og)) fail(u, 'og:image missing or not absolute');
  if (h1 !== 1 && !u.startsWith('/p/')) fail(u, `expected 1 <h1>, found ${h1}`);
  if (h1 < 1) fail(u, 'no <h1>');
  if (noindex && u !== '/search') fail(u, 'is noindex but listed in sitemap');
  for (const m of text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { fail(u, 'invalid JSON-LD'); }
  }
  if (u.startsWith('/p/') && !/"@type":"NewsArticle"/.test(text)) fail(u, 'missing NewsArticle JSON-LD');
  if (u.startsWith('/p/') && !/class="prose"/.test(text)) fail(u, 'article text not in HTML');
}
const rb = await get('/robots.txt');
if (!/Sitemap: https?:\/\//.test(rb.text)) fail('/robots.txt', 'no absolute Sitemap line');
const ns = await get('/news-sitemap.xml');
if (ns.status !== 200) fail('/news-sitemap.xml', `status ${ns.status}`);
console.log(bad ? `\n${bad} problem(s).` : '\nAll pages pass.');
process.exit(bad ? 1 : 0);
