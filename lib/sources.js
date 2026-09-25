// Every source here is a free public RSS/Atom feed — no API keys required.
// `section` is the default desk a story lands on (the classifier can move it).
// `aiOnly: true` means the feed is general-interest, so only stories that
// mention AI (see lib/classify.js) are kept — that's how everything loops back to AI.
// `weight` nudges ranking: first-party labs and top outlets rank a bit higher.

const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

export const SOURCES = [
  // ── AI desks at major outlets ──────────────────────────────────────────
  { id: 'techcrunch-ai', name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', section: 'ai', weight: 1.15 },
  { id: 'verge-ai', name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', section: 'ai', weight: 1.1 },
  { id: 'venturebeat-ai', name: 'VentureBeat', url: 'https://venturebeat.com/category/ai/feed/', section: 'ai', weight: 1.0 },
  { id: 'ars-ai', name: 'Ars Technica', url: 'https://arstechnica.com/ai/feed/', section: 'ai', weight: 1.1 },
  { id: 'mittr-ai', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', section: 'research', weight: 1.15 },
  { id: 'wired-ai', name: 'WIRED', url: 'https://www.wired.com/feed/tag/ai/latest/rss', section: 'ai', weight: 1.05 },
  { id: 'decoder', name: 'The Decoder', url: 'https://the-decoder.com/feed/', section: 'ai', weight: 0.95 },

  // ── First-party AI labs & platforms (model launches land here first) ──
  { id: 'openai', name: 'OpenAI', url: 'https://openai.com/news/rss.xml', section: 'models', weight: 1.3, lab: true },
  { id: 'google-ai', name: 'Google', url: 'https://blog.google/technology/ai/rss/', section: 'models', weight: 1.2, lab: true },
  { id: 'deepmind', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', section: 'research', weight: 1.2, lab: true },
  { id: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', section: 'research', weight: 0.9, lab: true },
  { id: 'nvidia', name: 'NVIDIA', url: 'https://blogs.nvidia.com/feed/', section: 'ai', weight: 0.95, lab: true },
  { id: 'microsoft-ai', name: 'Microsoft', url: 'https://blogs.microsoft.com/ai/feed/', section: 'ai', weight: 1.0, lab: true },

  // ── Model launches & frontier labs (Google News covers labs without RSS, e.g. Anthropic) ──
  { id: 'gn-models', name: 'Google News', url: gnews('(Anthropic OR OpenAI OR "Google Gemini" OR "Meta AI" OR xAI OR Mistral OR DeepSeek) (launches OR releases OR unveils) model when:2d'), section: 'models', weight: 1.1, aggregator: true },
  { id: 'gn-claude', name: 'Google News', url: gnews('(Anthropic Claude) when:3d'), section: 'models', weight: 1.1, aggregator: true },

  // ── Markets & money ────────────────────────────────────────────────────
  { id: 'cnbc-tech', name: 'CNBC', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', section: 'markets', weight: 1.1, aiOnly: true },
  { id: 'cnbc-finance', name: 'CNBC', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', section: 'markets', weight: 1.05, aiOnly: true },
  { id: 'yahoo-finance', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', section: 'markets', weight: 1.0, aiOnly: true },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', section: 'markets', weight: 1.0, aiOnly: true },
  { id: 'gn-markets', name: 'Google News', url: gnews('(AI stocks OR Nvidia OR "AI spending" OR "data center" OR "AI chips") market when:1d'), section: 'markets', weight: 0.95, aggregator: true },

  // ── Policy & politics ──────────────────────────────────────────────────
  { id: 'thehill-tech', name: 'The Hill', url: 'https://thehill.com/policy/technology/feed/', section: 'policy', weight: 1.0, aiOnly: true },
  { id: 'gn-policy', name: 'Google News', url: gnews('("AI regulation" OR "AI policy" OR "AI bill" OR "AI executive order" OR "AI Act") when:2d'), section: 'policy', weight: 1.0, aggregator: true },

  // ── Startups & Main Street (the companies doing it well) ──────────────
  { id: 'techcrunch-startups', name: 'TechCrunch', url: 'https://techcrunch.com/category/startups/feed/', section: 'startups', weight: 1.05, aiOnly: true },
  { id: 'gn-funding', name: 'Google News', url: gnews('AI startup (raises OR funding OR "Series A" OR "Series B") when:2d'), section: 'startups', weight: 0.95, aggregator: true },
  { id: 'smallbiztrends', name: 'Small Business Trends', url: 'https://smallbiztrends.com/feed', section: 'mainstreet', weight: 1.0, aiOnly: true },
  { id: 'entrepreneur', name: 'Entrepreneur', url: 'https://www.entrepreneur.com/latest.rss', section: 'mainstreet', weight: 0.95, aiOnly: true },
  { id: 'gn-smb', name: 'Google News', url: gnews('"small business" (AI OR "artificial intelligence") when:3d'), section: 'mainstreet', weight: 1.0, aggregator: true },

  // ── Wider tech ─────────────────────────────────────────────────────────
  { id: 'verge-all', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', section: 'tech', weight: 1.0, aiOnly: true },
  { id: 'engadget', name: 'Engadget', url: 'https://www.engadget.com/rss.xml', section: 'tech', weight: 0.95, aiOnly: true },
  { id: 'ars-all', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', section: 'tech', weight: 1.0, aiOnly: true },
  { id: 'hn-ai', name: 'Hacker News', url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT+OR+Claude&points=150', section: 'tech', weight: 0.85, aggregator: true },
];

// The desks readers see. Order = order on the homepage.
export const SECTIONS = [
  { id: 'ai', name: 'AI', long: 'Artificial Intelligence', blurb: 'The biggest moves across the AI industry.' },
  { id: 'models', name: 'Models', long: 'Models & Launches', blurb: 'New models, releases and product launches from the labs.' },
  { id: 'markets', name: 'Markets', long: 'AI & Markets', blurb: 'Where AI meets money — stocks, chips, earnings and capex.' },
  { id: 'policy', name: 'Policy', long: 'Policy & Politics', blurb: 'Regulation, government and the politics of AI.' },
  { id: 'startups', name: 'Startups', long: 'Startups & Funding', blurb: 'Who is raising, building and winning.' },
  { id: 'mainstreet', name: 'Main Street', long: 'Main Street AI', blurb: 'How small businesses are actually putting AI to work.' },
  { id: 'research', name: 'Research', long: 'Research & Science', blurb: 'Papers, breakthroughs and the science behind the systems.' },
  { id: 'tech', name: 'Tech', long: 'Tech', blurb: 'The wider technology story, through an AI lens.' },
];

export const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));
