import { getNews } from './news.js';
import { generate, llmEnabled } from './llm.js';

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

/** AI "Why it matters" note for a single story. */
export async function storyTake(story) {
  const related = (story.related || []).map((r) => `- ${r.source}: ${r.title}`).join('\n');
  return generate({
    json: true,
    maxTokens: 700,
    prompt: `Story from ${story.source}:
Headline: ${story.title}
Summary: ${story.summary || '(none)'}
${related ? `Other outlets covering it:\n${related}` : ''}

Return JSON:
{
  "brief": "Two or three sentences explaining what happened, for someone who hasn't followed AI closely.",
  "why": "One or two sentences on why it matters for people, businesses or markets.",
  "keyPoints": ["Three short bullet points, each under 18 words, using only the facts above"],
  "watch": "One sentence on what to watch next. Frame as a question the story raises, stated plainly, not a prediction."
}`,
  });
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
