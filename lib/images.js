// Real, on-topic images for stories whose feed didn't include one.
// Looks for the company, person or topic a headline is about and uses its
// Wikipedia/Wikimedia image (free, no key, hotlinking allowed).

import { fetchWithTimeout } from './http.js';

// Order matters: people first (real photos), then companies/products, then topics.
const ENTITIES = [
  // People
  [/\bsam altman\b/i, 'Sam Altman'],
  [/\bdario amodei\b/i, 'Dario Amodei'],
  [/\bjensen huang\b/i, 'Jensen Huang'],
  [/\belon musk\b|\bmusk\b/i, 'Elon Musk'],
  [/\bsundar pichai\b/i, 'Sundar Pichai'],
  [/\bsatya nadella\b/i, 'Satya Nadella'],
  [/\bmark zuckerberg\b|\bzuckerberg\b/i, 'Mark Zuckerberg'],
  [/\btim cook\b/i, 'Tim Cook'],
  [/\bdemis hassabis\b/i, 'Demis Hassabis'],
  [/\bmustafa suleyman\b/i, 'Mustafa Suleyman'],
  [/\blisa su\b/i, 'Lisa Su'],
  [/\bandy jassy\b/i, 'Andy Jassy'],
  [/\bmasayoshi son\b/i, 'Masayoshi Son'],
  [/\bdonald trump\b|\btrump\b/i, 'Donald Trump'],
  [/\bursula von der leyen\b/i, 'Ursula von der Leyen'],
  // Labs & AI companies
  [/\banthropic\b|\bclaude\b/i, 'Anthropic'],
  [/\bopen ?ai\b|\bchat ?gpt\b|\bgpt-?\d/i, 'OpenAI'],
  [/\bdeepmind\b/i, 'Google DeepMind'],
  [/\bgemini\b/i, 'Google Gemini'],
  [/\bx\.?ai\b|\bgrok\b/i, 'XAI (company)'],
  [/\bmistral\b/i, 'Mistral AI'],
  [/\bdeepseek\b/i, 'DeepSeek'],
  [/\bperplexity\b/i, 'Perplexity AI'],
  [/\bhugging ?face\b/i, 'Hugging Face'],
  [/\bcohere\b/i, 'Cohere'],
  [/\bscale ai\b/i, 'Scale AI'],
  [/\bdatabricks\b/i, 'Databricks'],
  [/\bcoreweave\b/i, 'CoreWeave'],
  [/\bmidjourney\b/i, 'Midjourney'],
  [/\bwaymo\b/i, 'Waymo'],
  // Big tech & chips
  [/\bnvidia\b/i, 'Nvidia'],
  [/\bmicrosoft\b|\bcopilot\b|\bazure\b/i, 'Microsoft'],
  [/\bgoogle\b|\balphabet\b/i, 'Google'],
  [/\bmeta\b|\bllama\b|\binstagram\b|\bfacebook\b/i, 'Meta Platforms'],
  [/\bapple\b|\biphone\b|\bsiri\b/i, 'Apple Inc.'],
  [/\bamazon\b|\baws\b|\balexa\b/i, 'Amazon (company)'],
  [/\btesla\b/i, 'Tesla, Inc.'],
  [/\bamd\b/i, 'AMD'],
  [/\bintel\b/i, 'Intel'],
  [/\btsmc\b|\btaiwan semiconductor\b/i, 'TSMC'],
  [/\bbroadcom\b/i, 'Broadcom'],
  [/\bqualcomm\b/i, 'Qualcomm'],
  [/\barm holdings\b/i, 'Arm Holdings'],
  [/\boracle\b/i, 'Oracle Corporation'],
  [/\bibm\b/i, 'IBM'],
  [/\bsalesforce\b/i, 'Salesforce'],
  [/\bpalantir\b/i, 'Palantir Technologies'],
  [/\bsamsung\b/i, 'Samsung'],
  [/\bsoftbank\b/i, 'SoftBank Group'],
  [/\balibaba\b|\bqwen\b/i, 'Alibaba Group'],
  [/\bbaidu\b/i, 'Baidu'],
  [/\btencent\b/i, 'Tencent'],
  [/\badobe\b/i, 'Adobe Inc.'],
  [/\bnetflix\b/i, 'Netflix'],
  [/\buber\b/i, 'Uber'],
  [/\bshopify\b/i, 'Shopify'],
  [/\bintuit\b|\bquickbooks\b/i, 'Intuit'],
  // Topics
  [/\bdata cent(er|re)s?\b/i, 'Data center'],
  [/\bchips?\b|\bsemiconductors?\b|\bgpus?\b/i, 'Semiconductor'],
  [/\bhumanoid\b|\brobots?\b|\brobotics\b/i, 'Humanoid robot'],
  [/\bself-driving\b|\bautonomous (car|vehicle)s?\b|\brobotaxi/i, 'Self-driving car'],
  [/\bnuclear\b/i, 'Nuclear power plant'],
  [/\bpower grid\b|\belectricity\b|\benergy\b/i, 'Electrical grid'],
  [/\beu\b|\beuropean (union|commission)\b|\bbrussels\b/i, 'European Commission'],
  [/\bcongress\b|\bsenate\b|\blawmakers\b|\bhouse (bill|committee)\b/i, 'United States Capitol'],
  [/\bwhite house\b|\bexecutive order\b/i, 'White House'],
  [/\bcourt\b|\blawsuit\b|\bsues?\b|\bjudge\b/i, 'Gavel'],
  [/\bchina\b|\bbeijing\b/i, 'Beijing'],
  [/\bwall street\b|\bstocks?\b|\bnasdaq\b|\bs&p\b/i, 'New York Stock Exchange'],
  [/\bsmall business(es)?\b|\brestaurants?\b|\bbakery\b|\bshop\b/i, 'Small business'],
  [/\bhospital\b|\bdoctors?\b|\bmedical\b|\bhealth ?care\b/i, 'Hospital'],
  [/\bschools?\b|\bstudents?\b|\bteachers?\b/i, 'Classroom'],
  [/\bjobs?\b|\bworkers?\b|\blayoffs?\b|\bworkforce\b/i, 'Office'],
];

const SECTION_TOPIC = {
  ai: 'Artificial intelligence',
  models: 'Neural network (machine learning)',
  markets: 'New York Stock Exchange',
  policy: 'United States Capitol',
  startups: 'Silicon Valley',
  mainstreet: 'Small business',
  research: 'Supercomputer',
  tech: 'Data center',
};

// Broad photo pools used once a story's own topic pool runs dry.
const GENERAL = ['Artificial intelligence', 'Data center', 'Semiconductor', 'Silicon Valley', 'Supercomputer', 'Robotics', 'Server (computing)', 'Stock exchange', 'Smartphone', 'Integrated circuit', 'Computer', 'Office'];

const TTL = 24 * 3600e3;
const pools = new Map(); // wikipedia title -> { at, p: Promise<string[]> }
const NOT_PHOTO = /logo|icon|wordmark|symbol|flag|map|signature|chart|graph|diagram|seal|coat[_ ]of[_ ]arms|commons-|wiki|question|edit|stub|ambox|padlock|screenshot/i;

/**
 * Real photos from a Wikipedia article (the pictures on the page itself), as 1280px-wide
 * landscape JPEGs. Free to hotlink, no key needed.
 */
export async function photoPool(title) {
  const hit = pools.get(title);
  if (hit && Date.now() - hit.at < (hit.empty ? 10 * 60e3 : TTL)) return hit.p;
  const p = (async () => {
    try {
      const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: title, generator: 'images', gimlimit: '60', prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '1280' });
      const res = await fetchWithTimeout(`https://en.wikipedia.org/w/api.php?${qs}`, { timeout: 4000, headers: { accept: 'application/json', 'api-user-agent': 'Kelvane/1.0 (news site; images for headlines)' } });
      if (!res.ok) return [];
      const j = await res.json();
      return pickPhotos(j?.query?.pages || []);
    } catch {
      return [];
    }
  })();
  const entry = { at: Date.now(), p, empty: false };
  pools.set(title, entry);
  p.then((list) => (entry.empty = !list.length));
  return p;
}

/** From an API answer, keep only real landscape photos (no logos, maps or diagrams). */
export function pickPhotos(pages) {
  const list = Array.isArray(pages) ? pages : Object.values(pages);
  return list
    .map((pg) => ({ name: String(pg.title || ''), ii: (pg.imageinfo || [])[0] }))
    .filter(({ name, ii }) => ii && ii.mime === 'image/jpeg' && !NOT_PHOTO.test(name) && ii.width >= 900 && ii.width / ii.height >= 1.2 && ii.width / ii.height <= 2.4)
    .sort((a, b) => b.ii.width * b.ii.height - a.ii.width * a.ii.height)
    .map(({ ii }) => ii.thumburl || ii.url)
    .filter(Boolean);
}

/** The Wikipedia page that best matches what the story is about. */
export function topicFor(story) {
  for (const [re, title] of ENTITIES) if (re.test(story.title)) return title;
  for (const [re, title] of ENTITIES) if (re.test(story.source || '')) return title;
  for (const [re, title] of ENTITIES) if (re.test((story.summary || '').slice(0, 300))) return title;
  return SECTION_TOPIC[story.section] || SECTION_TOPIC.ai;
}

/**
 * Every story gets its own picture, and no picture is used twice:
 *  - a publisher photo shared by several stories stays on the top-ranked one only
 *  - stories without a photo get the next unused photo about their topic, then their desk,
 *    then a general AI/tech pool
 *  - stories with a photo get a different backup photo in case the publisher blocks theirs
 */
export async function attachTopicImages(stories) {
  const topics = [...new Set([...stories.map(topicFor), ...Object.values(SECTION_TOPIC), ...GENERAL])];
  const found = new Map();
  for (let i = 0; i < topics.length; i += 8) {
    await Promise.all(topics.slice(i, i + 8).map(async (t) => found.set(t, [...(await photoPool(t))])));
  }
  const used = new Set();
  // Publisher photos: first (highest-ranked) story keeps it, repeats lose it.
  for (const s of stories) {
    if (!s.image) continue;
    const key = s.image.replace(/[?#].*$/, '');
    if (used.has(key)) {
      s.image = '';
      s.imageKind = undefined;
    } else used.add(key);
  }
  const next = (s) => {
    const order = [topicFor(s), SECTION_TOPIC[s.section] || SECTION_TOPIC.ai, ...GENERAL];
    for (const t of order) {
      const pool = found.get(t) || [];
      while (pool.length) {
        const url = pool.shift();
        const key = url.replace(/[?#].*$/, '');
        if (!used.has(key)) {
          used.add(key);
          return url;
        }
      }
    }
    return '';
  };
  for (const s of stories) {
    if (s.image) continue;
    const url = next(s);
    if (url) {
      s.image = url;
      s.imageKind = 'topic';
    }
  }
  for (const s of stories) {
    if (s.imageKind) continue;
    const url = next(s);
    if (url) {
      s.fallbackImage = url;
      s.fallbackKind = 'topic';
    }
  }
}

// Test hook
export const _resetImageCache = () => pools.clear();
