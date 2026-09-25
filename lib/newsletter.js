// Email newsletter via Buttondown (buttondown.com — free for your first 100 subscribers).
// Set BUTTONDOWN_API_KEY to turn on the signup forms and the daily email draft.

import { fetchWithTimeout } from './http.js';

const API = 'https://api.buttondown.com/v1';
export const newsletterEnabled = () => !!process.env.BUTTONDOWN_API_KEY;

function headers() {
  return { authorization: `Token ${process.env.BUTTONDOWN_API_KEY}`, 'content-type': 'application/json' };
}

export async function subscribe(email) {
  if (!newsletterEnabled()) throw Object.assign(new Error('Newsletter signups open soon.'), { status: 503 });
  let res = await fetchWithTimeout(`${API}/subscribers`, { method: 'POST', timeout: 8000, headers: headers(), body: JSON.stringify({ email_address: email, tags: ['website'] }) });
  if (res.status === 422 || res.status === 400) {
    const t = await res.text();
    if (/already|exists/i.test(t)) return { ok: true, already: true };
    // Older API versions used `email` instead of `email_address`.
    if (/email_address|field required/i.test(t)) {
      res = await fetchWithTimeout(`${API}/subscribers`, { method: 'POST', timeout: 8000, headers: headers(), body: JSON.stringify({ email }) });
    } else throw Object.assign(new Error('That email could not be added. Please check it and try again.'), { status: 400 });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if (/already|exists/i.test(t)) return { ok: true, already: true };
    throw Object.assign(new Error('Signup failed. Please try again in a minute.'), { status: 502 });
  }
  return { ok: true };
}

/** Create the daily email in Buttondown. Draft by default; NEWSLETTER_AUTOSEND=true sends it. */
export async function createEmail({ subject, body }) {
  if (!newsletterEnabled()) throw new Error('BUTTONDOWN_API_KEY not set');
  const status = process.env.NEWSLETTER_AUTOSEND === 'true' ? 'about_to_send' : 'draft';
  const res = await fetchWithTimeout(`${API}/emails`, { method: 'POST', timeout: 15000, headers: headers(), body: JSON.stringify({ subject, body, status }) });
  if (!res.ok) throw new Error(`Buttondown ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { status, ...(await res.json().catch(() => ({}))) };
}

export function briefToMarkdown(brief, origin, siteName) {
  const lines = [`# ${siteName} · ${brief.title}`, '', brief.intro, ''];
  brief.items.forEach((s, i) => {
    const link = `${origin}/story/${s.id}?u=${encodeURIComponent(s.url)}&s=${s.sig}`;
    lines.push(`## ${i + 1}. ${s.headline || s.title}`, '', s.aiSummary || s.summary || '', '', `**Why it matters:** ${s.why}`, '', `[Read more →](${link}) · via ${s.source}`, '');
  });
  lines.push('---', '', `You're getting this because you subscribed at [${siteName}](${origin}). Read the live desk any time of day at ${origin}.`);
  return lines.join('\n');
}
