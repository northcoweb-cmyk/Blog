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
  models: 'Large language model',
  markets: 'New York Stock Exchange',
  policy: 'United States Capitol',
  startups: 'Silicon Valley',
  mainstreet: 'Small business',
  research: 'Supercomputer',
  tech: 'Data center',
};

const cache = new Map(); // title -> Promise<{url, logo} | null>
const TTL = 24 * 3600e3;

async function wikiImage(title) {
  const hit = cache.get(title);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = (async () => {
    try {
      const res = await fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`, {
        timeout: 3500,
        headers: { accept: 'application/json', 'api-user-agent': 'TensorStreet/1.0 (news site; images for headlines)' },
      });
      if (!res.ok) return null;
      const j = await res.json();
      const orig = j.originalimage;
      const thumb = j.thumbnail?.source;
      if (!orig?.source && !thumb) return null;
      const src = orig?.source || thumb;
      const isSvg = /\.svg$/i.test(src);
      const logo = isSvg || /\.png$/i.test(src) || /logo|wordmark|icon/i.test(src);
      let url;
      if (!isSvg && orig?.width && orig.width <= 1600) url = orig.source;
      else if (thumb) url = thumb.replace(/\/\d+px-/, `/${isSvg ? 800 : Math.min(1280, orig?.width || 1280)}px-`);
      else url = src;
      return { url, logo };
    } catch {
      return null;
    }
  })();
  cache.set(title, { at: Date.now(), p });
  return p;
}

/** The Wikipedia page that best matches what the story is about. */
export function topicFor(story) {
  for (const [re, title] of ENTITIES) if (re.test(story.title)) return title;
  for (const [re, title] of ENTITIES) if (re.test((story.summary || '').slice(0, 300))) return title;
  return SECTION_TOPIC[story.section] || SECTION_TOPIC.ai;
}

/**
 * Gives every story a real image:
 *  - stories without a photo get the topic image as their main image
 *  - stories with a photo get it as `fallbackImage` (used if the publisher blocks the photo)
 */
export async function attachTopicImages(stories) {
  const titles = [...new Set([...stories.map(topicFor), ...Object.values(SECTION_TOPIC)])];
  const found = new Map(await Promise.all(titles.map(async (t) => [t, await wikiImage(t)])));
  for (const s of stories) {
    let img = found.get(topicFor(s));
    if (!img) img = found.get(SECTION_TOPIC[s.section]) || null;
    if (!img) continue;
    if (!s.image) {
      s.image = img.url;
      s.imageKind = img.logo ? 'logo' : 'topic';
    } else {
      s.fallbackImage = img.url;
      s.fallbackKind = img.logo ? 'logo' : 'topic';
    }
  }
}
