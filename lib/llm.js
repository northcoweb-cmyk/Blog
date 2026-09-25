// Optional AI writing layer. The site works fully without it; with a key it adds
// "Why it matters" notes, a written daily brief, and draft articles in the admin.
//
// Providers (pick one, set its key in Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY    — Google AI Studio, free tier (recommended for a $0 setup)
//   GROQ_API_KEY      — Groq, free tier
//   ANTHROPIC_API_KEY — Claude (paid, best writing quality)
// Force one with LLM_PROVIDER=gemini|groq|anthropic.

import Anthropic from '@anthropic-ai/sdk';
import { fetchWithTimeout } from './http.js';

export const HOUSE_STYLE = `You write for Tensor Street, a daily news briefing about AI and the AI economy.
Voice: a sharp, well-sourced human editor. Plain English. Concrete nouns and numbers. Short paragraphs.
Rules:
- Use ONLY facts present in the source material you are given. Never invent numbers, quotes, dates, names or product details. If something is unknown, leave it out.
- No hype. Never use these words or phrases: delve, landscape, game-changer, revolutionize, unleash, unlock, harness, seamless, cutting-edge, in today's fast-paced world, it's worth noting, in conclusion, navigate, realm, tapestry, testament, pivotal, robust, elevate, embark.
- No rhetorical questions, no exclamation marks, no emoji, at most one em dash per piece.
- Write like Axios meets the Financial Times: tight, confident, useful to a busy reader.
- Explain jargon in a few words the first time it appears.`;

export function llmProvider() {
  const forced = (process.env.LLM_PROVIDER || '').toLowerCase();
  const have = {
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };
  if (forced && have[forced]) return forced;
  return ['gemini', 'groq', 'anthropic'].find((p) => have[p]) || null;
}

export const llmEnabled = () => !!llmProvider();

/** Generate text. Returns a string, or throws. `json: true` asks for a JSON object back. */
export async function generate({ system = HOUSE_STYLE, prompt, maxTokens = 1200, json = false, timeout = 45000 }) {
  const provider = llmProvider();
  if (!provider) throw new Error('No AI provider configured');
  const fullPrompt = json ? `${prompt}\n\nRespond with a single valid JSON object only — no markdown fences, no commentary.` : prompt;
  let out;
  if (provider === 'gemini') out = await gemini(system, fullPrompt, maxTokens, json, timeout);
  else if (provider === 'groq') out = await groq(system, fullPrompt, maxTokens, json, timeout);
  else out = await claude(system, fullPrompt, maxTokens, timeout);
  out = scrub(out);
  return json ? parseJsonLoose(out) : out;
}

async function gemini(system, prompt, maxTokens, json, timeout) {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      timeout,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: Math.max(maxTokens * 3, 2048), // leave room for the model's own reasoning tokens
          temperature: 0.6,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${j?.error?.message || 'error'}`);
  const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error(`Gemini returned no text (${j?.candidates?.[0]?.finishReason || 'unknown'})`);
  return text;
}

async function groq(system, prompt, maxTokens, json, timeout) {
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    timeout,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.6,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Groq ${res.status}: ${j?.error?.message || 'error'}`);
  const text = j?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Groq returned no text');
  return text;
}

let anthropicClient;
async function claude(system, prompt, maxTokens, timeout) {
  anthropicClient ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropicClient.beta.messages.create(
    {
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
      max_tokens: Math.max(maxTokens * 4, 4000),
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout },
  );
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this request');
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!text) throw new Error('Claude returned no text');
  return text;
}

// Light clean-up so output reads human: strip fences, curly-dash overload, stray headings.
function scrub(s) {
  return String(s)
    .replace(/^```(?:json|markdown|md)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/—(?=[^—]*—)/g, ',') // keep at most the last em dash
    .trim();
}

export function parseJsonLoose(s) {
  try {
    return JSON.parse(s);
  } catch {
    const m = String(s).match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('AI response was not valid JSON');
  }
}
