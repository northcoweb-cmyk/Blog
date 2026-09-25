// Keyword rules that (1) decide if a story is about AI and (2) route it to a desk.
// Deliberately plain regexes — fast, predictable, and easy to tune by hand.

const AI_RE =
  /\b(a\.?i\.?|artificial intelligence|machine learning|deep learning|neural net\w*|llms?|large language models?|generative|gen ?ai|chatbots?|chat ?gpt|gpt-?\d\w*|openai|anthropic|claude|gemini|deepmind|copilot|llama|mistral|deepseek|grok|xai|perplexity|hugging ?face|nvidia|gpus?|ai chips?|data cent(er|re)s?|hyperscalers?|agentic|ai agents?|autonomous|robot\w*|humanoid|automation|inference|transformer|diffusion model|midjourney|stable diffusion|sora|veo|superintelligence|agi)\b/i;

// "AI" as a bare word is ambiguous in some contexts (e.g. "Ai Weiwei") — good enough for news.
export function isAiStory(title, summary = '') {
  return AI_RE.test(title) || AI_RE.test(summary.slice(0, 400));
}

const RULES = [
  {
    section: 'models',
    re: /\b(launch(es|ed)?|releas(es|ed|ing)|unveil(s|ed)?|introduc(es|ed|ing)|debuts?|rolls? out|announces?|ships?|open[- ]sources?|now available)\b[^.]{0,80}\b(model|gpt|claude|gemini|llama|grok|mistral|deepseek|qwen|sonnet|opus|haiku|fable|o\d|reasoning|multimodal|agent|assistant|chatbot|api)\b|\b(gpt-?\d[\w.-]*|claude [\w. ]*\d|gemini \d[\w.]*|llama \d|grok \d|opus \d|sonnet \d|haiku \d|fable \d)\b/i,
  },
  {
    section: 'policy',
    re: /\b(regulat\w+|congress|senate|house (bill|committee)|lawmakers?|white house|executive order|eu ai act|ai act|legislation|bill|lawsuit|sues?|court|judge|ftc|sec|doj|antitrust|copyright|(?<![-\w])ban(s|ned)?|government|federal|state law|policy|election|trump|biden|harris|governor|brussels|parliament|tariffs?|export controls?)\b/i,
  },
  {
    section: 'markets',
    re: /\b(stocks?|shares|nasdaq|s&p|dow|earnings|revenue|guidance|market cap|investors?|ipo|trillion|billion|capex|spending|bond|fed|interest rates?|wall street|rally|sell-?off|bubble|quarter(ly)?|profit|forecast)\b/i,
  },
  {
    section: 'startups',
    re: /\b(raises?|raised|funding|series [a-f]|seed round|pre-seed|valuation of|backed by|venture|vc|unicorn|acquir(es|ed|ing)|acquisition|startup|founders?|y ?combinator)\b/i,
  },
  {
    section: 'mainstreet',
    re: /\b(small business(es)?|smbs?|local business(es)?|restaurants?|retailers?|shop owners?|entrepreneurs?|freelancers?|solopreneurs?|main street|franchise|family[- ]owned|mom[- ]and[- ]pop|real estate agents?|realtors?|contractors?)\b/i,
  },
  {
    section: 'research',
    re: /\b(research(ers)?|paper|study|scientists?|benchmark|arxiv|breakthrough|university|lab result|peer[- ]reviewed|protein|alphafold|physics|math(ematics)?|interpretability|alignment|safety research)\b/i,
  },
];

/** Pick the best desk for a story. Falls back to the feed's own desk. */
export function classify(title, summary, fallback) {
  const hay = `${title}. ${summary.slice(0, 300)}`;
  // Title matches beat summary matches.
  for (const r of RULES) if (r.re.test(title)) return r.section;
  if (fallback && fallback !== 'ai' && fallback !== 'tech') return fallback;
  for (const r of RULES) if (r.re.test(hay)) return r.section;
  return fallback || 'ai';
}

// Signals that a story is "breaking" / major.
const MAJOR_RE =
  /\b(breaking|just in|launch(es|ed)|releases?|unveils?|announces?|acquires?|acquisition|bans?|sues?|record|plunges?|soars?|surges?|tumbles?|biggest|first-ever|historic)\b/i;

export function isMajor(title) {
  return MAJOR_RE.test(title);
}

const TAGS = [
  ['OpenAI', /\bopen ?ai|chat ?gpt|gpt-?\d/i],
  ['Anthropic', /\banthropic|claude\b/i],
  ['Google', /\bgoogle|gemini|deepmind|alphabet\b/i],
  ['Meta', /\bmeta\b|llama|zuckerberg/i],
  ['Microsoft', /\bmicrosoft|copilot|azure\b/i],
  ['Nvidia', /\bnvidia|jensen huang\b/i],
  ['Apple', /\bapple\b|siri\b/i],
  ['Amazon', /\bamazon|aws\b|alexa\b/i],
  ['xAI', /\bx\.?ai\b|grok\b|musk\b/i],
  ['Mistral', /\bmistral\b/i],
  ['DeepSeek', /\bdeepseek\b/i],
  ['Chips', /\bchips?|semiconductor|tsmc|gpus?|amd\b|intel\b/i],
  ['Robotics', /\brobot|humanoid|self-driving|autonomous vehicle|waymo|tesla\b/i],
  ['Agents', /\bagents?\b|agentic/i],
  ['Jobs', /\bjobs?|layoffs?|workers?|hiring|workforce|employment\b/i],
  ['Energy', /\benergy|power grid|nuclear|electricity\b/i],
  ['Healthcare', /\bhealth|medical|drug|hospital|doctor\b/i],
  ['Education', /\bschools?|students?|education|teachers?\b/i],
];

export function tagsFor(title, summary = '') {
  const hay = `${title} ${summary.slice(0, 300)}`;
  return TAGS.filter(([, re]) => re.test(hay)).map(([t]) => t).slice(0, 4);
}
