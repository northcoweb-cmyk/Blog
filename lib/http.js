import crypto from 'node:crypto';

const UA =
  'Mozilla/5.0 (compatible; TensorStreetBot/1.0; +https://github.com/northcoweb-cmyk/blog) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/** fetch() with a hard timeout and sensible headers. Never throws on HTTP status. */
export async function fetchWithTimeout(url, { timeout = 8000, headers = {}, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...opts,
      headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9', ...headers },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Read at most `limit` bytes of a response body (for sniffing <head> meta tags). */
export async function fetchHead(url, { limit = 160_000, timeout = 3500 } = {}) {
  const res = await fetchWithTimeout(url, { timeout, headers: { accept: 'text/html' } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    const text = Buffer.concat(chunks).toString('utf8');
    if (text.includes('</head>')) break;
  }
  reader.cancel().catch(() => {});
  return { html: Buffer.concat(chunks).toString('utf8'), finalUrl: res.url || url };
}

// ── Response helpers ─────────────────────────────────────────────────────

/** CDN caching: `sMaxAge` seconds fresh at the edge, then served stale while refreshing. */
export function cache(res, sMaxAge, swr = sMaxAge * 6) {
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`);
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return json(res, 405, { error: 'Method not allowed' });
}

export function getQuery(req) {
  if (req.query) return req.query;
  const u = new URL(req.url, 'http://localhost');
  return Object.fromEntries(u.searchParams);
}

/** Vercel parses JSON bodies for us; this also covers raw streams (local dev). */
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// ── Signing (so our proxy endpoints only serve URLs that came from our own feed) ──

const SIGN_SECRET = () =>
  process.env.SIGNING_SECRET || process.env.ADMIN_PASSWORD || 'tensor-street-default-signing-key';

export function sign(value) {
  return crypto.createHmac('sha256', SIGN_SECRET()).update(String(value)).digest('base64url').slice(0, 22);
}

export function verify(value, sig) {
  if (!sig || typeof sig !== 'string') return false;
  const expected = sign(value);
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export function hashId(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
}

/** Block requests to private/internal hosts (SSRF guard for proxy endpoints). */
export function isPublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '0.0.0.0') return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (h.includes(':')) return false; // raw IPv6
  return true;
}
