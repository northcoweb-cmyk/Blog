// Generates the static HTML shells in /public from one template, so every page
// shares the same <head>. Run after editing: `node dev/build-pages.js`
// (The generated files are committed, so Vercel needs no build step.)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = await fs.readFile(path.join(ROOT, 'dev/partials/head.html'), 'utf8');
const DESC = 'Tensor Street is a free daily briefing on artificial intelligence: model launches, AI stocks and markets, policy, startups, and how small businesses are putting AI to work. Updated all day.';

const og = (title, desc = DESC) => `<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tensor Street">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="/assets/brand/og-image.png">
<meta name="twitter:card" content="summary_large_image">`;

const shell = ({ title, desc, script, main, extraHead = '', active = '' }) => `<!doctype html>
<html lang="en">
<head>
${HEAD}<title>${title}</title>
${extraHead || og(title, desc)}
</head>
<body data-page="${active}">
<div id="site-top"></div>
${main}
<div id="site-foot"></div>
<script type="module" src="/assets/js/${script}.js"></script>
</body>
</html>
`;

const pages = {
  'index.html': {
    title: 'Tensor Street · The daily briefing on the AI economy',
    script: 'home',
    active: 'home',
    main: `<div class="dateline"><div class="wrap dateline-row"><span id="dateline-left"><b>&nbsp;</b></span><span class="dl-right"><span class="live" id="updated"><span class="dot"></span>Live</span><a class="hide-sm" href="/archive">Archive</a><a class="hide-sm" href="/learn">New to AI? Start here</a></span></div></div>
<main id="main"><div class="wrap">
  <h1 class="sr-only">Tensor Street: today's AI news</h1>
  <section class="grid" id="top-grid" aria-label="Top stories">
    <div class="col-6" id="lead"><div class="media sk" style="border-radius:14px"></div><div class="sk sk-title" style="width:85%;height:34px;margin-top:18px"></div><div class="sk sk-line"></div><div class="sk sk-line" style="width:60%"></div></div>
    <div class="col-3 stack" id="second"></div>
    <aside class="col-3" id="markets-panel" aria-label="AI markets"></aside>
  </section>
  <section id="brief" style="margin-top:40px" aria-label="The Brief"></section>
  <section class="grid" style="margin-top:40px">
    <div class="col-8">
      <div class="sec-head"><h2><span class="bar"></span>Latest</h2><div class="tabs" role="tablist" id="latest-tabs"></div></div>
      <div class="panel panel-pad" id="latest"></div>
    </div>
    <aside class="col-4 stack" id="rail" aria-label="More">
      <div class="panel panel-pad"><div class="sec-head"><h2><span class="bar" style="--sec:var(--live)"></span>Trending now</h2></div><ol class="hl-list" id="trending"></ol></div>
      <div id="subscribe">SIGNUP</div>
      <div class="panel panel-pad" id="desk-rail"></div>
      <a class="promo" href="/learn"><span class="chip" data-sec="research">Learn AI</span><h3>AI, explained in plain English</h3><p>The glossary for everything you'll read on this site, from LLMs to inference to agents.</p><div class="terms"><span>LLM</span><span>Agent</span><span>Inference</span><span>GPU</span><span>Tokens</span><span>RAG</span></div></a>
    </aside>
  </section>
  <div id="desk-feature"></div>
  <div id="sections"></div>
</div></main>`,
  },
  'section.html': {
    title: 'Section · Tensor Street',
    script: 'section',
    main: `<main id="main"><div class="wrap">
  <header class="page-head" id="page-head"><div class="crumbs"><a href="/">Home</a> / <span>Section</span></div><h1>&nbsp;</h1><p>&nbsp;</p></header>
  <section class="grid" id="sec-top"></section>
  <section class="grid" style="margin-top:36px"><div class="col-8"><div class="sec-head"><h2><span class="bar"></span>All stories</h2><span class="meta" id="sec-count"></span></div><div class="panel panel-pad" id="sec-list"></div></div>
  <aside class="col-4 stack"><div id="sec-desk"></div><div id="subscribe">SIGNUP</div><div class="panel panel-pad"><div class="sec-head"><h2>Other desks</h2></div><div class="tags" id="other-desks"></div></div></aside></section>
</div></main>`,
  },
  'story.html': {
    title: 'Story · Tensor Street',
    script: 'story',
    main: `<main id="main"><div class="wrap"><article class="article" id="story"><div class="sk sk-line" style="width:20%"></div><div class="sk sk-title" style="height:44px"></div><div class="sk sk-title" style="height:44px;width:70%"></div><div class="media sk" style="margin-top:24px"></div></article>
  <section id="more" style="margin-top:56px"></section></div></main>`,
  },
  'post.html': {
    title: 'Tensor Street',
    script: 'post',
    extraHead: '<!--POST_META-->',
    main: `<!--POST_JSON-->
<main id="main"><div class="wrap"><article class="article" id="post"><!--POST_BODY--></article><section id="more" style="margin-top:56px"></section></div></main>`,
  },
  'search.html': {
    title: 'Search · Tensor Street',
    script: 'search',
    active: 'search',
    main: `<main id="main"><div class="wrap">
  <header class="page-head"><div class="crumbs"><a href="/">Home</a> / <span>Search</span></div><h1>Search</h1>
  <form id="search-form" style="display:flex;gap:8px;max-width:640px;margin-top:16px"><input name="q" id="q" class="input" style="flex:1;height:48px;border-radius:12px;border:1px solid var(--line);background:var(--surface);padding:0 16px;font-size:16px" placeholder="Search stories, companies, models…" autocomplete="off"><button class="btn btn-primary" style="height:48px">Search</button></form></header>
  <div id="results"></div>
</div></main>`,
  },
  'archive.html': {
    title: 'Archive · Tensor Street',
    script: 'archive',
    active: 'archive',
    main: `<main id="main"><div class="wrap"><div id="archive"></div></div></main>`,
  },
  'learn.html': {
    title: 'Learn AI: The plain-English glossary · Tensor Street',
    desc: 'Plain-English definitions of the AI terms in the news: LLMs, agents, inference, GPUs, tokens, RAG, fine-tuning and more.',
    script: 'learn',
    active: 'learn',
    main: `<main id="main"><div class="wrap">
  <header class="page-head"><div class="crumbs"><a href="/">Home</a> / <span>Learn AI</span></div><span class="chip" data-sec="research" style="margin-top:14px">AI 101</span><h1>AI, in plain English</h1><p>Every term you'll run into on Tensor Street, explained in a sentence or two, with an example of how it shows up in the news.</p>
  <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center"><input id="gloss-filter" placeholder="Filter terms…" style="height:42px;border-radius:10px;border:1px solid var(--line);background:var(--surface);padding:0 14px;min-width:240px"><div class="tabs" id="gloss-tabs"></div></div></header>
  <div class="gloss" id="gloss"></div>
</div></main>`,
  },
  'about.html': {
    title: 'About · Tensor Street',
    script: 'about',
    active: 'about',
    main: `<main id="main"><div class="wrap"><article class="article">
  <div class="crumbs"><a href="/">Home</a> / <span>About</span></div>
  <div class="article-head"><h1>The AI economy, one briefing a day.</h1><p class="dek">Tensor Street is a free news desk for people who want to understand how AI is changing business, markets and everyday work, without the hype.</p></div>
  <div class="prose">
    <p>AI news moves fast and comes from everywhere: lab blogs, earnings calls, court filings, startup announcements, and the small business down the street that quietly automated its bookkeeping. Tensor Street pulls it into one place and keeps it updated from morning to night.</p>
    <h2>What you'll find here</h2>
    <ul>
      <li><strong>The Brief.</strong> The handful of stories that matter today, with a line on why each one matters.</li>
      <li><strong>The live wire.</strong> Headlines from dozens of trusted newsrooms and AI labs, ranked by how important and how fresh they are, updated around the clock.</li>
      <li><strong>AI markets.</strong> A live tape of the companies at the center of the AI build-out, plus the Tensor Street AI Index.</li>
      <li><strong>Main Street AI.</strong> A desk devoted to how small businesses are actually using AI, and what's working.</li>
      <li><strong>From the Desk.</strong> Original explainers and analysis from our editors.</li>
    </ul>
    <h2>How the wire works</h2>
    <p>Every few minutes we check public feeds from outlets like TechCrunch, The Verge, Ars Technica, MIT Technology Review, CNBC and Yahoo Finance, along with the official blogs of AI labs such as OpenAI, Google DeepMind, Microsoft and NVIDIA. Stories covered by several outlets rise to the top. Headlines always link back to the original publisher. We summarize, we don't republish.</p>
    <h2>Our standards</h2>
    <p>We separate reporting from opinion. Anything written with AI assistance is labeled and reviewed by an editor before it's published. Market data is for information only and may be delayed; nothing here is investment advice.</p>
    <h2>Get in touch</h2>
    <p>Tips, corrections and partnership ideas are welcome. Follow along on <a href="https://instagram.com/tensorstreet">Instagram</a> for the day's headlines.</p>
  </div>
  <div id="subscribe" style="margin-top:40px">SIGNUP</div>
</article></div></main>`,
  },
  'brand.html': {
    title: 'Brand kit · Tensor Street',
    script: 'about',
    active: 'brand',
    extraHead: '<meta name="robots" content="noindex">',
    main: `<main id="main"><div class="wrap">
  <header class="page-head"><div class="crumbs"><a href="/">Home</a> / <span>Brand kit</span></div><h1>Brand kit</h1><p>Everything you need to keep Tensor Street looking the same on the site, Instagram and anywhere else. Click any asset to download it.</p></header>
  <section class="grid">
    <div class="col-6 panel panel-pad"><div class="sec-head"><h2>Logo</h2></div><div style="background:var(--surface-2);border-radius:12px;padding:40px;display:grid;place-items:center"><img src="/assets/brand/logo-wordmark.svg" alt="Tensor Street logo" style="width:320px"></div><div style="background:#070a12;border-radius:12px;padding:40px;display:grid;place-items:center;margin-top:12px"><img src="/assets/brand/logo-wordmark-light.svg" alt="Tensor Street logo, light" style="width:320px"></div>
      <div class="tags" style="margin-top:14px"><a href="/assets/brand/logo-wordmark.svg" download>Wordmark (dark text) SVG</a><a href="/assets/brand/logo-wordmark-light.svg" download>Wordmark (light text) SVG</a><a href="/assets/brand/logo-mark.svg" download>Mark SVG</a><a href="/assets/brand/icon-512.png" download>App icon PNG</a></div>
      <p class="meta" style="margin-top:14px">The mark is a line chart made of connected nodes: markets and neural networks in one shape. The last node is always mint: the signal.</p></div>
    <div class="col-6 panel panel-pad"><div class="sec-head"><h2>Color</h2></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        ${[['Ink', '#0A0E1A', '#fff'], ['Tape', '#070A12', '#fff'], ['Paper', '#F3F4F6', '#0a0e1a'], ['Cobalt', '#2F54FF', '#fff'], ['Signal Mint', '#2EE6C5', '#0a0e1a'], ['Periwinkle', '#8EA2FF', '#0a0e1a'], ['Up', '#0C9A68', '#fff'], ['Down', '#DE3A41', '#fff'], ['Breaking', '#FF3B30', '#fff']].map(([n, h, t]) => `<div style="background:${h};color:${t};border-radius:12px;padding:16px;min-height:96px;display:flex;flex-direction:column;justify-content:flex-end;border:1px solid var(--line)"><b style="font-size:14px">${n}</b><span class="mono" style="font-size:12px;opacity:.8">${h}</span></div>`).join('')}
      </div>
      <div class="sec-head" style="margin-top:22px"><h2>Desk colors</h2></div><div class="tags">${['ai', 'models', 'markets', 'policy', 'startups', 'mainstreet', 'research', 'tech'].map((d) => `<span class="chip solid" data-sec="${d}">${d === 'mainstreet' ? 'Main Street' : d}</span>`).join('')}</div></div>
    <div class="col-6 panel panel-pad"><div class="sec-head"><h2>Type</h2></div>
      <div style="font-size:44px;font-weight:700;letter-spacing:-.04em;line-height:1">Geist Bold <span style="font-family:var(--serif);font-style:italic;font-weight:400;color:var(--brand)">with a serif accent</span></div>
      <p style="margin:12px 0;color:var(--muted)">Headlines: Geist 650–700, tight tracking (−3%). Body: Geist 400. Numbers and labels: Geist Mono. Accents: Newsreader Italic, one phrase per headline at most. All free on Google Fonts.</p>
      <div class="mono" style="font-size:22px">NVDA 182.40 <span class="up">+2.40%</span></div></div>
    <div class="col-6 panel panel-pad"><div class="sec-head"><h2>Voice</h2></div>
      <ul style="margin:0;padding-left:18px;color:var(--ink-2);display:grid;gap:8px"><li><b>Clear over clever.</b> Say what happened in the first sentence.</li><li><b>Numbers beat adjectives.</b> “Up 12%” instead of “soared”.</li><li><b>Always answer “so what?”</b> Every story gets a “Why it matters”.</li><li><b>No hype words:</b> revolutionary, game-changer, unleash, delve.</li><li><b>Friendly, not cute.</b> Write for a smart friend who doesn’t work in tech.</li></ul></div>
  </section>
  <section style="margin-top:28px"><div class="sec-head"><h2><span class="bar"></span>Instagram</h2></div>
    <div class="cards-4">
      <a class="story" href="/assets/brand/instagram-profile.png" download><div class="media r11"><img src="/assets/brand/instagram-profile.png" alt="Profile picture"></div><h3>Profile picture</h3><p class="sum">1080 × 1080. Upload as your Instagram avatar.</p></a>
      <a class="story" href="/assets/brand/ig-launch.png" download><div class="media" style="aspect-ratio:4/5"><img src="/assets/brand/ig-launch.png" alt="Launch post"></div><h3>Launch post</h3><p class="sum">Your first post. 1080 × 1350.</p></a>
      <a class="story" href="/assets/brand/ig-template-brief.png" download><div class="media" style="aspect-ratio:4/5"><img src="/assets/brand/ig-template-brief.png" alt="Daily brief template"></div><h3>Daily Brief carousel cover</h3><p class="sum">Swap in today’s five headlines.</p></a>
      <a class="story" href="/assets/brand/ig-template-market.png" download><div class="media" style="aspect-ratio:4/5"><img src="/assets/brand/ig-template-market.png" alt="Market template"></div><h3>By the Numbers</h3><p class="sum">For market-moving stories.</p></a>
    </div>
    <div class="panel panel-pad" style="margin-top:24px"><div class="sec-head"><h2>Instagram playbook</h2></div><div class="grid">
      <div class="col-4"><h3 style="margin:0 0 6px;font-size:16px">Bio</h3><p style="margin:0;color:var(--ink-2);font-size:14.5px;white-space:pre-line">Tensor Street 📈
The daily briefing on the AI economy
Models · Markets · Main Street AI
👇 Today’s Brief</p></div>
      <div class="col-4"><h3 style="margin:0 0 6px;font-size:16px">Weekly rhythm</h3><p style="margin:0;color:var(--ink-2);font-size:14.5px">Daily: one headline post from the Social Studio (Newsroom → Social studio). Mon: “5 things this week” carousel. Wed: Main Street AI spotlight. Fri: “By the Numbers” market recap. Stories: share each new desk article.</p></div>
      <div class="col-4"><h3 style="margin:0 0 6px;font-size:16px">Hashtags</h3><p class="mono" style="margin:0;color:var(--ink-2);font-size:13px">#TensorStreet #AI #ArtificialIntelligence #AINews #TechNews #AIStocks #SmallBusiness #FutureOfWork</p></div>
    </div></div>
  </section>
  <section class="panel panel-pad" style="margin-top:28px"><div class="sec-head"><h2>Other names we considered</h2></div><p style="margin:0;color:var(--ink-2)">If you ever rebrand, these fit the same idea: <b>Neural Ledger</b> (the daily record of the AI economy), <b>Frontier Wire</b>, <b>The Inference Desk</b>, <b>Model Market</b>. To rename, change <code>SITE</code> in <code>public/assets/js/site.js</code> and <code>lib/site.js</code>.</p></section>
</div></main>`,
  },
  '404.html': {
    title: 'Page not found · Tensor Street',
    script: 'about',
    main: `<main id="main"><div class="wrap"><div class="page-head" style="border:0;text-align:center;padding:80px 0"><span class="mono" style="color:var(--muted)">ERROR 404</span><h1>This page went off the wire.</h1><p style="margin:0 auto 24px">The link may be old or mistyped. Today's news is right this way.</p><a class="btn btn-primary" href="/">Back to the front page</a></div></div></main>`,
  },
  'admin.html': {
    title: 'Newsroom · Tensor Street',
    script: 'admin',
    extraHead: '<meta name="robots" content="noindex, nofollow"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="TS Newsroom"><link rel="stylesheet" href="/assets/css/admin.css">',
    main: `<div id="admin-root"></div>`,
  },
};

for (const [file, cfg] of Object.entries(pages)) {
  let html = shell(cfg);
  html = html.replaceAll('<div id="subscribe">SIGNUP</div>', '<div id="subscribe" data-signup-slot></div>').replace('<div id="subscribe" style="margin-top:40px">SIGNUP</div>', '<div id="subscribe" style="margin-top:40px" data-signup-slot></div>');
  if (file === 'admin.html') {
    html = html.replace('<div id="site-top"></div>\n', '').replace('<div id="site-foot"></div>\n', '');
    // The newsroom is its own home-screen app: separate name, opens on the Instagram page.
    html = html.replace('<link rel="manifest" href="/site.webmanifest">', '<link rel="manifest" href="/admin.webmanifest">').replace('<meta name="theme-color" content="#0a0e1a">', '<meta name="theme-color" content="#070a12">');
  }
  await fs.writeFile(path.join(ROOT, 'public', file), html);
}
console.log(`Wrote ${Object.keys(pages).length} pages.`);
