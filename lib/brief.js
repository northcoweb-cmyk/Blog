import { getNews } from './news.js';
import { generate, llmEnabled } from './llm.js';
import { fetchWithTimeout, isPublicHttpUrl } from './http.js';
import { htmlToText } from './parse-feed.js';

const TZ = process.env.SITE_TIMEZONE || 'America/New_York';

export function editionInfo(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  const slot = hour < 12 ? 'morning' : hour < 17 ? 'midday' : 'evening';
  return { date: `${parts.year}-${parts.month}-${parts.day}`, slot, title: { morning: 'Morning Edition', midday: 'Midday Edition', evening: 'Evening Edition' }[slot] };
}

/** Pick the day's top stories with at most two per desk so the brief stays varied. */
function pickTop(stories, n = 6) {
  const out = [];
  const perSection = {};
  for (const s of stories) {
    if (out.length >= n) break;
    if ((perSection[s.section] || 0) >= 2) continue;
    perSection[s.section] = (perSection[s.section] || 0) + 1;
    out.push(s);
  }
  return out;
}

const WHY = {
  models: 'New model releases reset what products can do and what competitors must match.',
  markets: 'AI spending is now one of the biggest forces moving the stock market.',
  policy: 'The rules being written now will decide who can build, sell and use AI.',
  startups: 'Where the money goes shows which AI businesses investors think will last.',
  mainstreet: 'This is AI showing up in ordinary businesses, not just at the big labs.',
  research: 'Today’s research is next year’s product feature.',
  tech: 'AI is reshaping the devices and platforms people already use every day.',
  ai: 'It’s one of the moves shaping how fast AI spreads through the economy.',
};

export function fallbackBrief(stories, info = editionInfo()) {
  const top = pickTop(stories, 6);
  const lead = top[0];
  return {
    ...info,
    ai: false,
    intro: lead
      ? `The top line: ${lead.title.replace(/\.$/, '')}. Here are the stories worth your time right now, pulled from ${new Set(stories.map((s) => s.source)).size} newsrooms and labs.`
      : 'The desk is gathering today’s stories.',
    items: top.map((s) => ({ id: s.id, title: s.title, url: s.url, sig: s.sig, source: s.source, section: s.section, image: s.image, date: s.date, summary: s.summary, why: WHY[s.section] || WHY.ai })),
  };
}

let memo = { key: '', data: null };

export async function getBrief({ allowAi = true } = {}) {
  const info = editionInfo();
  const key = `${info.date}-${info.slot}`;
  if (memo.key === key && memo.data) return memo.data;
  const news = await getNews();
  const base = fallbackBrief(news.stories, info);
  if (!allowAi || !llmEnabled() || !base.items.length) return base;

  try {
    const input = base.items.map((s, i) => `[${i + 1}] id=${s.id}\nHeadline: ${s.title}\nSource: ${s.source}\nDesk: ${s.section}\nSummary: ${s.summary || '(none)'}`).join('\n\n');
    const out = await generate({
      json: true,
      maxTokens: 1400,
      prompt: `Write today's ${info.title} briefing from these ${base.items.length} stories.

${input}

Return JSON:
{
  "intro": "Two sentences that set up the day for a busy reader. Specific, no fluff.",
  "items": [ { "id": "<id from above>", "headline": "A tighter headline, max 12 words, sentence case", "summary": "Two sentences on what happened.", "why": "One sentence on why it matters." } ]
}
Keep every story, in the same order. Use only the facts given.`,
    });
    const byId = new Map(base.items.map((s) => [s.id, s]));
    const items = (out.items || [])
      .filter((o) => byId.has(o.id))
      .map((o) => ({ ...byId.get(o.id), headline: String(o.headline || '').slice(0, 160), aiSummary: String(o.summary || '').slice(0, 500), why: String(o.why || byId.get(o.id).why).slice(0, 300) }));
    if (items.length < 3) return base;
    const data = { ...info, ai: true, intro: String(out.intro || base.intro).slice(0, 500), items };
    memo = { key, data };
    return data;
  } catch (e) {
    console.warn('[brief] AI brief failed, using fallback:', e.message);
    return base;
  }
}

// ── On-site articles ─────────────────────────────────────────────────────
// Readers stay on Tensor Street: each wire story gets a full article written in
// our own words from the facts in the original reporting, with a clear credit
// and link to the outlet that broke it. Facts aren't copyrightable; wording is,
// so the prompt forbids reusing the source's phrasing.

const BOILERPLATE = /subscribe|sign up|newsletter|cookie|advertis|all rights reserved|©|follow us|related:|read more|click here|getty images|photo:|image:|credit:/i;

/** Pull the readable paragraphs out of an article page (facts for the rewrite). */
export async function sourceText(url) {
  if (!url || /news\.google\.com/.test(url) || !isPublicHttpUrl(url)) return '';
  try {
    const res = await fetchWithTimeout(url, { timeout: 6000, headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' } });
    if (!res.ok) return '';
    let html = (await res.text()).slice(0, 800_000);
    const art = html.match(/<article[\s\S]*?<\/article>/i);
    if (art && art[0].length > 1500) html = art[0];
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => htmlToText(m[1]))
      .filter((t) => t.length > 60 && !BOILERPLATE.test(t));
    return [...new Set(paras)].join('\n').slice(0, 7000);
  } catch {
    return '';
  }
}

const articleCache = new Map();

/** Full Tensor Street version of a wire story. Returns { headline, dek, body, keyPoints, why } */
export async function rewriteStory(story) {
  const hit = articleCache.get(story.url);
  if (hit && Date.now() - hit.at < 12 * 3600e3) return hit.article;

  // Gather facts: the lead story's text, or the first related outlet that isn't paywalled.
  let facts = await sourceText(story.url);
  if (facts.length < 600) {
    for (const r of story.related || []) {
      const t = await sourceText(r.url);
      if (t.length > facts.length) facts = t;
      if (facts.length >= 600) break;
    }
  }
  const related = (story.related || []).map((r) => `- ${r.source}: ${r.title}`).join('\n');
  const out = await generate({
    json: true,
    maxTokens: 1800,
    timeout: 55000,
    prompt: `Write a Tensor Street news article about this story, for readers who follow AI, business and markets.

Original reporting by ${story.source}.
Headline: ${story.title}
Summary: ${story.summary || '(none)'}
${related ? `Other outlets covering it:\n${related}\n` : ''}
Source text (use for FACTS ONLY):
"""
${facts || '(not available: rely on the headline, summary and other coverage)'}
"""

Rules:
- Write 100% in your own words. Never copy a sentence, and never reuse more than five words in a row from the source text. Restructure and summarize; do not paraphrase line by line.
- Use only facts found above. No invented numbers, names, dates or quotes. If a detail isn't given, leave it out.
- At most one short direct quote (under 15 words), attributed to the person who said it.
- Refer to the original outlet by name at least once in the body, e.g. "according to ${story.source}".
- ${facts.length > 600 ? '300-500 words.' : 'Only a little is known, so keep it tight: 150-250 words, and say plainly what is still unclear.'}
- Body in Markdown: short paragraphs, then a "## Why it matters" section, then a "## What to watch" section. No H1, no sign-off.

Return JSON:
{
  "headline": "A fresh headline in sentence case, max 14 words, different wording from the original",
  "dek": "One-sentence subheadline",
  "body": "the markdown article",
  "keyPoints": ["3 short bullets, each under 16 words"]
}`,
  });
  const article = {
    headline: String(out.headline || story.title).slice(0, 180),
    dek: String(out.dek || '').slice(0, 300),
    body: String(out.body || '').slice(0, 12000),
    keyPoints: Array.isArray(out.keyPoints) ? out.keyPoints.slice(0, 4).map((k) => String(k).slice(0, 200)) : [],
    basedOnFullText: facts.length > 600,
  };
  if (article.body.length > 200) {
    if (articleCache.size > 500) articleCache.clear();
    articleCache.set(story.url, { at: Date.now(), article });
  }
  return article;
}

/** Full article draft (markdown) for the admin editor. */
export async function draftArticle(story, notes = '') {
  const related = (story.related || []).map((r) => `- ${r.source}: ${r.title} (${r.url})`).join('\n');
  return generate({
    json: true,
    maxTokens: 2200,
    timeout: 55000,
    prompt: `Draft an original Tensor Street explainer article about this story. Do not copy sentences from sources.

Lead story (${story.source}): ${story.title}
URL: ${story.url}
Summary: ${story.summary || '(none)'}
${related ? `Other coverage:\n${related}` : ''}
${notes ? `Editor's notes: ${notes}` : ''}

Structure the body in Markdown:
- An opening paragraph that says what happened in plain English.
- "## Why it matters" section.
- "## The details" section with a short bullet list of the facts given.
- "## What to watch" section, 2-3 sentences.
- End with a line: "Source: [${story.source}](${story.url})"
400-650 words. Only facts from the material above. Where details are missing, say what isn't known yet rather than guessing.

Return JSON: { "title": "headline, max 14 words", "dek": "one-sentence subheadline", "tags": ["2-4 short tags"], "body": "the markdown body" }`,
  });
}
