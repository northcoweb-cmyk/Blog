import { readFileSync } from 'node:fs';
// Offline sample data for local design work (`npm run dev:mock`) and tests.
// NOT used in production — headlines here are made-up placeholders.
import { SOURCES } from '../lib/sources.js';

const H = 3600e3;
const img = (n) => `https://mock-images.test/${n}.jpg`;

// [sourceId, title, summary, hoursAgo, image?]
const ITEMS = [
  ['openai', 'OpenAI releases a faster reasoning model for developers', 'The new model is available in the API today with lower prices for high-volume customers and a larger context window.', 1.2, img(1)],
  ['techcrunch-ai', 'OpenAI launches faster reasoning model, cuts API prices', 'The company says the model matches its previous flagship on coding benchmarks at a fraction of the cost.', 1.5, img(1)],
  ['verge-ai', 'OpenAI’s new reasoning model is cheaper and faster', 'Developers get access first; ChatGPT users will see it over the next few weeks.', 1.8],
  ['gn-claude', 'Anthropic expands Claude for small business teams - Reuters', '', 2.5],
  ['ars-ai', 'Anthropic adds new agent tools to Claude for small business teams', 'The update lets Claude handle multi-step tasks like reconciling invoices and drafting customer replies.', 3, img(2)],
  ['cnbc-tech', 'Nvidia shares climb as data center demand stays hot', 'Analysts raised price targets after supply-chain checks pointed to strong orders for next-generation AI chips.', 2, img(3)],
  ['yahoo-finance', 'AI stocks lead Nasdaq higher as chipmakers rally', 'Semiconductor stocks posted their best day in weeks as investors bet AI spending will keep growing into next year.', 3.5, img(4)],
  ['marketwatch', 'Big Tech’s AI spending could top $400 billion next year, analysts say', 'Capital spending on data centers keeps rising, and investors are watching whether revenue keeps pace.', 5],
  ['gn-markets', 'Oracle stock jumps on surge in AI cloud contracts - Bloomberg', '', 4],
  ['gn-policy', 'Senate committee advances bipartisan AI safety bill - Politico', '', 6],
  ['thehill-tech', 'Lawmakers push new rules for AI in hiring decisions', 'The proposal would require companies to disclose when AI tools screen job applicants and allow candidates to request human review.', 7, img(5)],
  ['techcrunch-startups', 'AI bookkeeping startup raises $40M Series B to serve local businesses', 'The company automates invoicing and cash-flow forecasts for businesses with fewer than 50 employees.', 8, img(6)],
  ['gn-funding', 'Voice AI startup for restaurants raises Series A - TechCrunch', '', 9],
  ['smallbiztrends', 'Survey: Most small businesses now use at least one AI tool', 'Owners say customer service and marketing are where AI saves the most time, but many still worry about accuracy.', 10, img(7)],
  ['gn-smb', 'How a family bakery used AI to cut food waste by a third - Inc.', '', 12],
  ['entrepreneur', 'Five ways small business owners are using AI agents to win back hours', 'From scheduling to follow-up emails, owners describe the tasks they have handed off, and the ones they will not.', 14, img(8)],
  ['mittr-ai', 'Researchers show smaller AI models can match giants on math with better training data', 'A new study suggests careful data curation matters more than raw model size for some reasoning tasks.', 11, img(9)],
  ['deepmind', 'A new approach to weather forecasting with AI', 'Our latest model produces more accurate 10-day forecasts and runs in minutes on a single chip.', 20, img(10)],
  ['huggingface', 'Open-source model tops coding leaderboard', 'The community-trained model outperforms several closed models on common coding tests.', 16],
  ['google-ai', 'New Gemini features arrive in Google Workspace', 'Gemini can now draft spreadsheets from a prompt and summarize long email threads in Gmail.', 6.5, img(11)],
  ['microsoft-ai', 'Copilot gets new agent features for Microsoft 365 customers', 'Businesses can now build agents that take actions across Outlook, Teams and Excel.', 13],
  ['nvidia', 'Inside the AI factories powering the next wave of models', 'How data centers are being redesigned around AI workloads.', 22, img(12)],
  ['wired-ai', 'The AI jobs debate is changing, and workers are noticing', 'Economists say the effects so far are uneven: some roles are shrinking while demand for AI-savvy workers grows.', 9.5, img(13)],
  ['engadget', 'Apple’s new AI features are coming to more devices', 'The company confirmed the rollout at an event this week.', 18],
  ['hn-ai', 'Show HN: An open-source AI agent that runs entirely on your laptop', '', 7.5],
  ['decoder', 'Meta shows off new open model with multilingual voice', 'The company says the model will be released with open weights for researchers and developers.', 15, img(14)],
  ['venturebeat-ai', 'Enterprises shift AI budgets from pilots to production', 'A new survey finds more companies moving AI projects into day-to-day operations.', 17],
  ['cnbc-finance', 'Fed officials weigh how AI productivity could shape the economy', 'Several officials said AI could lift productivity, though the timing remains uncertain.', 19, img(15)],
  ['verge-all', 'Google’s new phones lean hard into on-device AI', 'Real-time translation and photo editing now run without an internet connection.', 21],
  ['ars-all', 'The race to build nuclear power for AI data centers', 'Tech companies are signing deals for new reactors to meet surging electricity demand.', 23, img(16)],
  ['techcrunch-ai', 'xAI unveils Grok update with new reasoning mode', 'The update is rolling out to paid subscribers first.', 26],
  ['gn-models', 'DeepSeek releases new open-weight model - Reuters', '', 28],
  ['gn-policy', 'EU regulators publish new guidance for general-purpose AI models - Financial Times', '', 30],
  ['cnbc-tech', 'Retail chain posts stronger quarterly results', 'Same-store sales rose on back-to-school demand.', 3],
];

function rss(items, { atom = false } = {}) {
  if (atom) {
    return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Mock</title>${items
      .map(
        ([, t, s, h, im], i) =>
          `<entry><title type="html">${esc(t)}</title><link rel="alternate" type="text/html" href="https://example.com/atom/${i}-${encodeURIComponent(t.slice(0, 20))}"/><id>tag:${i}</id><published>${new Date(Date.now() - h * H).toISOString()}</published><updated>${new Date(Date.now() - h * H).toISOString()}</updated><author><name>Staff Writer</name></author><content type="html">${esc(`${im ? `<figure><img src="${im}"/></figure>` : ''}<p>${s}</p>`)}</content></entry>`,
      )
      .join('')}</feed>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Mock</title>${items
    .map(([id, t, s, h, im], i) => {
      const gn = id.startsWith('gn-');
      const [title, pub] = gn ? t.split(' - ') : [t];
      return `<item><title><![CDATA[${t}]]></title><link>https://${gn ? 'news.google.com/rss/articles/' : 'example.com/'}${id}/${i}?utm_source=rss</link><pubDate>${new Date(Date.now() - h * H).toUTCString()}</pubDate><dc:creator><![CDATA[Staff Writer]]></dc:creator>${s ? `<description><![CDATA[<p>${s}</p><p>The post ${title} appeared first on Mock.</p>]]></description>` : `<description><![CDATA[<a href="#">${title}</a>&nbsp;&nbsp;<font color="#6f6f6f">${pub}</font>]]></description>`}${im ? `<media:content url="${im}" medium="image" width="1200" height="675"/>` : ''}${gn ? `<source url="https://example.com">${pub}</source>` : ''}</item>`;
    })
    .join('')}</channel></rss>`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function spark(base, drift) {
  const out = [];
  let v = base;
  for (let i = 0; i < 26; i++) {
    v += (Math.sin(i * 1.7 + base) * 0.004 + drift / 26) * base;
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

const QUOTES = { '^GSPC': [6512, 0.004], '^IXIC': [21840, 0.009], '^SOX': [5980, 0.018], NVDA: [182.4, 0.024], MSFT: [512.3, 0.006], GOOGL: [248.9, 0.011], META: [742.1, -0.004], AMZN: [229.6, 0.003], AAPL: [251.2, -0.007], AVGO: [338.5, 0.017], AMD: [161.8, 0.021], TSM: [271.4, 0.013], ORCL: [301.2, 0.031], PLTR: [178.9, -0.012], TSLA: [421.7, -0.015] };

export function mockResponse(url) {
  const u = String(url);
  // Sample photos for local testing: MOCK_IMAGE_DIR=/path/with/mock-1.jpg …
  const im = u.match(/^https:\/\/mock-images\.test\/(\d+)\.jpg$/);
  if (im && process.env.MOCK_IMAGE_DIR) {
    try {
      return new Response(readFileSync(`${process.env.MOCK_IMAGE_DIR}/mock-${im[1]}.jpg`), { headers: { 'content-type': 'application/octet-stream' } });
    } catch {}
  }
  if (u.includes('finance.yahoo.com/v8/finance/spark')) {
    const syms = decodeURIComponent(u.match(/symbols=([^&]+)/)[1]).split(',');
    const body = {};
    for (const s of syms) {
      const [price, d] = QUOTES[s] || [100, 0];
      const prev = price / (1 + d);
      body[s] = { symbol: s, close: spark(prev, d), chartPreviousClose: prev, meta: { regularMarketPrice: price, chartPreviousClose: prev } };
    }
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }
  // Fake AI (dev only) so the AI features can be previewed offline.
  if (u.startsWith('https://api.openai.com/')) {
    const article = { headline: 'OpenAI’s new reasoning model trades a little power for a lot of speed', dek: 'Developers get a cheaper option for high-volume work, according to OpenAI.', body: 'OpenAI has released a faster reasoning model aimed at developers, according to OpenAI. The company says it costs less for customers who send large volumes of requests, and it can take in more text at once.\n\nThe model is available through the API first. Pricing for everyday ChatGPT users was not part of the announcement.\n\n## Why it matters\n\nCheaper, faster models change what is practical to build. Features that were too expensive to run on every customer request start to make sense.\n\n## What to watch\n\nWhether rivals cut prices in response, and how the model performs outside the company’s own tests.', keyPoints: ['New model is faster and cheaper for high-volume API users', 'Available to developers first', 'Handles more text in a single request'] };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(article) }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
  }
  const src = SOURCES.find((s) => s.url === u);
  if (src) {
    const items = ITEMS.filter((i) => i[0] === src.id);
    return new Response(rss(items, { atom: src.id.startsWith('verge') }), { headers: { 'content-type': 'application/rss+xml' } });
  }
  return new Response('offline (mock mode)', { status: 503 });
}

export function installMockFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) return real(url, opts);
    return mockResponse(u);
  };
}
