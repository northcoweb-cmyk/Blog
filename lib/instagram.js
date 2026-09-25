// Instagram autopilot: posts the day's top stories to Instagram using the
// official Instagram API (free). Needs a Business or Creator account and an
// access token (see README → "Instagram autopilot").

import crypto from 'node:crypto';
import { fetchWithTimeout, sign, verify } from './http.js';
import { readData, writeData, canWrite } from './content.js';
import { getNews } from './news.js';
import { caption as buildCaption } from '../public/assets/js/social-render.js';

const API = () => `https://graph.instagram.com${process.env.INSTAGRAM_API_VERSION ? '/' + process.env.INSTAGRAM_API_VERSION : ''}`;
const FILE = 'content/social/instagram.json';
const TZ = () => process.env.SITE_TIMEZONE || 'America/New_York';

// ── Settings & token storage ─────────────────────────────────────────────
// The token is stored encrypted in the repo, so it can be refreshed
// automatically before it expires (Instagram tokens last 60 days).

const key = () => crypto.createHash('sha256').update(`ts-ig:${process.env.CRON_SECRET || ''}:${process.env.ADMIN_PASSWORD || ''}`).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}
function decrypt(blob) {
  try {
    const [iv, tag, enc] = blob.split('.').map((p) => Buffer.from(p, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const DEFAULTS = { enabled: false, perDay: 6, startHour: 8, endHour: 21, style: 'photo' };

export async function getSettings() {
  const stored = await readData(FILE, {});
  const envOn = /^(1|true|on|yes)$/i.test(process.env.INSTAGRAM_AUTOPILOT || '');
  return {
    ...DEFAULTS,
    ...(envOn ? { enabled: true } : {}),
    ...(process.env.INSTAGRAM_POSTS_PER_DAY ? { perDay: Number(process.env.INSTAGRAM_POSTS_PER_DAY) } : {}),
    ...stored,
  };
}

async function saveSettings(next, message) {
  const stored = await readData(FILE, {});
  await writeData(FILE, { ...stored, ...next }, message);
}

export async function getToken() {
  const s = await readData(FILE, {});
  if (s.token) {
    const t = decrypt(s.token);
    if (t) return { token: t, source: 'saved', savedAt: s.tokenSavedAt };
  }
  if (process.env.INSTAGRAM_ACCESS_TOKEN) return { token: process.env.INSTAGRAM_ACCESS_TOKEN.trim(), source: 'env' };
  return { token: null, source: null };
}

export async function saveToken(token) {
  token = String(token || '').trim();
  const me = await getMe(token); // throws if the token is bad
  if (!canWrite()) throw Object.assign(new Error('Connect GitHub first (GITHUB_TOKEN) so the token can be saved. Or add it in Vercel as INSTAGRAM_ACCESS_TOKEN.'), { status: 503 });
  await saveSettings({ token: encrypt(token), tokenSavedAt: new Date().toISOString(), username: me.username }, 'Connect Instagram');
  return me;
}

export async function disconnect() {
  const stored = await readData(FILE, {});
  delete stored.token;
  delete stored.tokenSavedAt;
  await writeData(FILE, stored, 'Disconnect Instagram');
}

// ── API calls ────────────────────────────────────────────────────────────

async function ig(path, { token, method = 'GET', params = {} } = {}) {
  const u = new URL(API() + path);
  const body = new URLSearchParams({ ...params, access_token: token });
  if (method === 'GET') for (const [k, v] of body) u.searchParams.set(k, v);
  const res = await fetchWithTimeout(u.toString(), { method, timeout: 20000, ...(method === 'GET' ? {} : { body, headers: { 'content-type': 'application/x-www-form-urlencoded' } }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const msg = j.error?.error_user_msg || j.error?.message || `HTTP ${res.status}`;
    throw Object.assign(new Error(`Instagram: ${msg}`), { status: res.status === 400 ? 400 : 502, code: j.error?.code });
  }
  return j;
}

export async function getMe(token) {
  if (!token) throw new Error('No Instagram token');
  const j = await ig('/me', { token, params: { fields: 'user_id,username,account_type' } });
  return { id: j.user_id || j.id, username: j.username, accountType: j.account_type };
}

export async function recentMedia(token, uid, limit = 30) {
  const j = await ig(`/${uid}/media`, { token, params: { fields: 'id,caption,timestamp,permalink,media_url,thumbnail_url', limit: String(limit) } });
  return j.data || [];
}

/** Create a post from a public JPEG URL. Returns { id, permalink }. */
export async function publishImage(token, uid, imageUrl, caption) {
  const container = await ig(`/${uid}/media`, { token, method: 'POST', params: { image_url: imageUrl, caption: caption.slice(0, 2200) } });
  // Instagram downloads and processes the image; wait until it's ready.
  for (let i = 0; i < 12; i++) {
    const st = await ig(`/${container.id}`, { token, params: { fields: 'status_code,status' } });
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error(`Instagram couldn't process the image (${st.status || st.status_code}).`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  const done = await ig(`/${uid}/media_publish`, { token, method: 'POST', params: { creation_id: container.id } });
  let permalink = '';
  try {
    permalink = (await ig(`/${done.id}`, { token, params: { fields: 'permalink' } })).permalink || '';
  } catch {}
  return { id: done.id, permalink };
}

/** Long-lived tokens expire after 60 days; refresh weekly while we can. */
export async function maybeRefresh() {
  const s = await readData(FILE, {});
  if (!s.token || !canWrite()) return 'skipped';
  const age = Date.now() - Date.parse(s.tokenRefreshedAt || s.tokenSavedAt || 0);
  if (age < 6 * 86400e3) return 'fresh';
  const token = decrypt(s.token);
  if (!token) return 'unreadable';
  const u = new URL('https://graph.instagram.com/refresh_access_token');
  u.searchParams.set('grant_type', 'ig_refresh_token');
  u.searchParams.set('access_token', token);
  const res = await fetchWithTimeout(u.toString(), { timeout: 15000 });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) return `failed: ${j.error?.message || res.status}`;
  await saveSettings({ token: encrypt(j.access_token), tokenRefreshedAt: new Date().toISOString() }, 'Refresh Instagram token');
  return 'refreshed';
}

// ── Picking and rendering posts ──────────────────────────────────────────

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Signed link to the server-rendered JPEG for a story (Instagram downloads it from here). */
export function cardUrl(origin, story, { style = 'photo', fmt = 'post' } = {}) {
  const payload = Buffer.from(
    JSON.stringify({
      t: story.title,
      sec: story.section,
      src: story.source,
      k: story.kind || 'wire',
      img: story.image && story.imageKind !== 'logo' ? story.image : '',
      fb: story.fallbackImage || (story.imageKind === 'topic' ? story.image : ''),
      st: story.breaking ? 'breaking' : style,
      f: fmt,
    }),
  ).toString('base64url');
  return `${origin}/api/card?d=${payload}&s=${sign(payload)}`;
}

export function readCardPayload(d, s) {
  if (!d || !verify(d, s)) return null;
  try {
    const j = JSON.parse(Buffer.from(d, 'base64url').toString('utf8'));
    return { title: j.t, section: j.sec, source: j.src, kind: j.k, image: j.img, fallbackImage: j.fb, style: j.st, fmt: j.f };
  } catch {
    return null;
  }
}

/** Best stories not posted yet: big, fresh, well-sourced, with a real photo if possible. */
export function pickStories(stories, recent, n = 1) {
  const posted = recent.map((m) => norm((m.caption || '').split('\n')[0]));
  const fresh = Date.now() - 20 * 3600e3;
  return stories
    .filter((s) => !s.archived && Date.parse(s.date) > fresh && s.title.length <= 140)
    .filter((s) => !posted.some((p) => p && (p === norm(s.title) || p.includes(norm(s.title).slice(0, 60)))))
    .map((s) => ({ s, score: s.rank * (s.image && !s.imageKind ? 1.4 : 1) * (1 + Math.log2(s.coverage || 1)) * (s.breaking ? 1.5 : 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ s }) => s);
}

function localHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ(), hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
}

export function captionFor(story, origin) {
  const link = origin.replace(/^https?:\/\//, '');
  return buildCaption({ ...story, kind: 'wire' }, story.title).replace('at the link in bio.', `at the link in bio (${link}).`);
}

/**
 * One autopilot tick (runs hourly). Posts at most one story, spaced so the
 * day's posts spread evenly across the posting window.
 */
export async function runAutopilot({ origin, force = false }) {
  const settings = await getSettings();
  if (!settings.enabled && !force) return { posted: false, reason: 'Autopilot is off' };
  const { token } = await getToken();
  if (!token) return { posted: false, reason: 'Instagram is not connected' };

  const refresh = await maybeRefresh().catch((e) => `failed: ${e.message}`);
  const hour = localHour();
  if (!force && (hour < settings.startHour || hour >= settings.endHour)) return { posted: false, reason: `Outside posting hours (${settings.startHour}:00–${settings.endHour}:00)`, refresh };

  const me = await getMe(token);
  const recent = await recentMedia(token, me.id);
  const now = Date.now();
  const last24 = recent.filter((m) => now - Date.parse(m.timestamp) < 24 * 3600e3);
  const perDay = Math.max(1, Math.min(25, settings.perDay));
  if (!force && last24.length >= perDay) return { posted: false, reason: `Already posted ${last24.length} in the last 24 hours`, refresh };
  const gapMin = ((settings.endHour - settings.startHour) * 60) / perDay;
  const lastAt = recent[0] ? Date.parse(recent[0].timestamp) : 0;
  if (!force && now - lastAt < gapMin * 0.85 * 60e3) return { posted: false, reason: `Waiting: next post due ${Math.round(gapMin - (now - lastAt) / 60e3)} min after the last one`, refresh };

  const news = await getNews();
  const [story] = pickStories(news.stories, recent, 1);
  if (!story) return { posted: false, reason: 'No new stories worth posting right now', refresh };

  const imageUrl = cardUrl(origin, story, { style: settings.style });
  const out = await publishImage(token, me.id, imageUrl, captionFor(story, origin));
  return { posted: true, story: story.title, source: story.source, permalink: out.permalink, refresh };
}

export async function autopilotStatus({ origin }) {
  const settings = await getSettings();
  const { token, source, savedAt } = await getToken();
  const base = { settings: { enabled: settings.enabled, perDay: settings.perDay, startHour: settings.startHour, endHour: settings.endHour }, canSave: canWrite(), tokenSource: source, timezone: TZ(), cronSecret: !!process.env.CRON_SECRET };
  if (!token) return { ...base, connected: false };
  try {
    const me = await getMe(token);
    const recent = await recentMedia(token, me.id, 12);
    const news = await getNews();
    const queue = pickStories(news.stories, recent, 5).map((s) => ({ title: s.title, source: s.source, section: s.section, card: cardUrl(origin, s, { style: settings.style }) }));
    const expires = source === 'saved' ? new Date(Date.parse(settings.tokenRefreshedAt || savedAt || Date.now()) + 60 * 86400e3).toISOString() : null;
    return { ...base, connected: true, username: me.username, accountType: me.accountType, recent: recent.slice(0, 8), queue, tokenExpires: expires };
  } catch (e) {
    return { ...base, connected: false, error: e.message };
  }
}

export { saveSettings };
