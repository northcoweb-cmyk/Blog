// Cross-device audit of the public site. Run against a local server:
//   node dev/server.js --mock &   then   node dev/audit.mjs [baseUrl]
// Opens every public page on phones, a tablet and desktops, clicks the interactive
// controls, and reports dead links, sideways scrolling, console errors and leftover UI.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const IMG_DIR = process.env.MOCK_IMAGE_DIR || '';
const DEVICES = [
  ['iPhone 15', devices['iPhone 15'] || devices['iPhone 14']],
  ['Pixel 7', devices['Pixel 7']],
  ['iPad Pro 11', devices['iPad Pro 11']],
  ['Small phone 320px', { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ['Laptop 1024', { viewport: { width: 1024, height: 700 } }],
  ['Desktop 1440', { viewport: { width: 1440, height: 900 } }],
];

const problems = [];
const bad = (dev, page, msg) => problems.push(`[${dev}] ${page}: ${msg}`);
const internalLinks = new Map(); // href -> first place seen

const browser = await chromium.launch();

async function routeMocks(ctx) {
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 204, body: '' }));
  await ctx.route('https://mock-images.test/**', (r) => {
    const n = r.request().url().match(/(\d+)\.jpg/)?.[1] || '1';
    const f = `${IMG_DIR}/mock-${n}.jpg`;
    return IMG_DIR && fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: 'image/jpeg' }) : r.fulfill({ status: 204, body: '' });
  });
}

for (const [name, opts] of DEVICES) {
  const ctx = await browser.newContext({ ...opts, permissions: ['clipboard-read', 'clipboard-write'] });
  await routeMocks(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('JS error: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));
  page.on('requestfailed', (r) => !/fonts|mock-images/.test(r.url()) && errors.push('request failed: ' + r.url()));
  page.on('response', (r) => r.status() >= 400 && !/favicon|mock-images/.test(r.url()) && !/\/story\/zzz/.test(r.url()) && errors.push(`HTTP ${r.status()}: ${r.url().replace(BASE, '')}`));
  const isPhone = (opts.viewport?.width || 0) < 820;

  // Find a real story link to test the story page.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const storyHref = await page.$eval('a[href^="/story/"]', (a) => a.getAttribute('href')).catch(() => null);
  const pages = ['/', '/section/models', '/section/mainstreet', storyHref, '/p/welcome-to-tensor-street', '/learn', '/about', '/archive', '/search?q=ai', '/brand', '/this-page-does-not-exist'].filter(Boolean);

  for (const path of pages) {
    errors.length = 0;
    const label = path.length > 40 ? path.slice(0, 40) + '…' : path;
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(250);

    // 1. Sideways scrolling / clipped content
    const overflow = await page.evaluate(() => {
      const w = window.innerWidth;
      const wide = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 2 && getComputedStyle(el).position !== 'fixed' && !el.closest('.tape-rail, .nav, .tabs, svg, .drawer, .search-overlay'); }).slice(0, 3).map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
      return { scroll: document.documentElement.scrollWidth - w, wide };
    });
    if (overflow.scroll > 1) bad(name, label, `scrolls sideways by ${overflow.scroll}px (${overflow.wide.join(', ')})`);

    // 2. Leftover subscribe/newsletter UI (email service is not connected)
    const leftovers = await page.evaluate(() => {
      const hits = [];
      for (const el of document.querySelectorAll('button, a, h1, h2, h3, h4, label')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && /subscribe|in your inbox|email edition/i.test(el.textContent)) hits.push(el.textContent.trim().slice(0, 40));
      }
      return hits;
    });
    if (leftovers.length) bad(name, label, `shows subscribe UI: ${leftovers.join(' | ')}`);

    // 3. Links: collect internal hrefs; flag dead '#' and unsafe targets
    const links = await page.$$eval('a[href]', (as) => as.filter((a) => a.getBoundingClientRect().width > 0).map((a) => ({ href: a.getAttribute('href'), blank: a.target === '_blank', rel: a.rel, text: a.textContent.trim().slice(0, 30) })));
    for (const l of links) {
      if (l.href === '#' || l.href === '' || l.href.startsWith('javascript:')) bad(name, label, `dead link "${l.text}" (${l.href})`);
      else if (l.href.startsWith('#')) { if (!(await page.$(l.href))) bad(name, label, `anchor ${l.href} has no target ("${l.text}")`); }
      else if (/^https?:/.test(l.href) && l.blank && !/noopener/.test(l.rel)) bad(name, label, `external link missing rel=noopener: ${l.href.slice(0, 50)}`);
      else if (l.href.startsWith('/')) internalLinks.has(l.href) || internalLinks.set(l.href, `${name} ${label}`);
    }

    // 4. Tap targets on touch devices
    if (opts.hasTouch) {
      const small = await page.evaluate(() => [...document.querySelectorAll('a, button, input, select')].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.height < 30 || r.width < 30) && !el.closest('.tape, .hl-list li, p, .prose, .meta, .tags') && el.type !== 'hidden' && !el.classList.contains('hp') && !el.classList.contains('skip') && !(r.width < 3); }).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 18)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
      if (small.length) bad(name, label, `small tap targets: ${small.join(', ')}`);
    }

    if (path !== '/this-page-does-not-exist') for (const e of errors) bad(name, label, e);
  }

  // ── Interactive controls on the home page ──
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const check = async (what, fn) => { try { const ok = await fn(); if (ok === false) bad(name, 'home', `${what} did not work`); } catch (e) { bad(name, 'home', `${what} failed: ${String(e.message).split('\n')[0]}`); } };

  await check('dark mode toggle', async () => {
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('.theme-btn');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('.theme-btn');
    return before !== after;
  });
  await check('search opens, takes input, closes with Esc', async () => {
    await page.click('[data-search]');
    await page.waitForSelector('#search-overlay.open', { timeout: 2000 });
    const focused = await page.evaluate(() => document.activeElement?.tagName === 'INPUT');
    await page.keyboard.type('nvidia');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#search-overlay.open'));
    return focused;
  });
  await check('search submits to results page', async () => {
    await page.click('[data-search]');
    await page.fill('#search-overlay input', 'openai');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/search\?q=openai/, { timeout: 4000 });
    await page.waitForSelector('#results .row-story, #results .empty', { timeout: 6000 });
    return true;
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  if (isPhone || opts.viewport.width < 1080) {
    await check('menu drawer opens and links work', async () => {
      await page.click('[data-menu]');
      await page.waitForSelector('#drawer.open', { timeout: 2000 });
      const n = await page.$$eval('#drawer .drawer-panel a', (a) => a.filter((x) => x.getBoundingClientRect().width).length);
      await page.click('#drawer [data-close]');
      await page.waitForFunction(() => !document.querySelector('#drawer.open'));
      return n >= 9;
    });
  } else {
    await check('desktop nav is visible', async () => (await page.$$eval('.nav a', (a) => a.filter((x) => x.getBoundingClientRect().width).length)) >= 9);
  }
  await check('Latest tabs filter the feed', async () => {
    const before = await page.$$eval('#latest .row-story', (e) => e.length);
    await page.click('#latest-tabs button:nth-child(3)');
    await page.waitForTimeout(200);
    const sel = await page.$eval('#latest-tabs button:nth-child(3)', (b) => b.getAttribute('aria-selected'));
    return sel === 'true' && before > 0;
  });
  await check('story opens from the front page', async () => {
    await page.click('#lead a, .story a, a.story');
    await page.waitForURL(/\/story\//, { timeout: 5000 });
    await page.waitForSelector('.article h1', { timeout: 5000 });
    return true;
  });
  await check('copy-link share button', async () => {
    await page.click('[data-copy]');
    await page.waitForSelector('.toast.show', { timeout: 2000 });
    return (await page.evaluate(() => navigator.clipboard.readText())).includes('/story/');
  });
  await check('"Continue reading" opens the source', async () => (await page.$eval('.readout a', (a) => a.target === '_blank' && /^https?:/.test(a.href))));
  await page.goto(BASE + '/learn', { waitUntil: 'networkidle' });
  await check('glossary filter + categories', async () => {
    await page.fill('#gloss-filter', 'gpu');
    await page.waitForTimeout(150);
    const one = await page.$$eval('#gloss .term', (e) => e.length);
    await page.fill('#gloss-filter', '');
    await page.click('#gloss-tabs button:nth-child(3)');
    await page.waitForTimeout(150);
    const cat = await page.$$eval('#gloss .term', (e) => e.length);
    return one >= 1 && one < 6 && cat > 1;
  });
  await ctx.close();
}

// ── Every internal link must load ──
const ctx = await browser.newContext();
let checked = 0;
for (const [href, from] of internalLinks) {
  if (/^\/(api|media)\//.test(href)) continue;
  const res = await ctx.request.get(BASE + href, { failOnStatusCode: false, timeout: 20000 });
  checked++;
  if (res.status() >= 400) problems.push(`[all] broken link ${href} → HTTP ${res.status()} (first seen: ${from})`);
}
await browser.close();

console.log(`\nChecked ${DEVICES.length} devices × pages, ${checked} unique internal links.`);
if (problems.length) {
  const uniq = [...new Set(problems)];
  console.log(`\n${uniq.length} PROBLEM(S):`);
  uniq.forEach((p) => console.log(' - ' + p));
  process.exit(1);
}
console.log('NO PROBLEMS FOUND');
