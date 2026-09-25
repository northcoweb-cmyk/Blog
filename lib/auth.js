import crypto from 'node:crypto';

const COOKIE = 'ts_admin';
const TTL_S = 60 * 60 * 24 * 14; // two weeks

export function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  // Local development convenience only — never active on Vercel.
  return process.env.VERCEL ? null : 'tensor';
}

const secret = () => crypto.createHash('sha256').update(`ts-session:${process.env.SESSION_SECRET || ''}:${adminPassword() || ''}`).digest();

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
}

export function checkPassword(input) {
  const pw = adminPassword();
  if (!pw || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(pw).digest();
  return crypto.timingSafeEqual(a, b);
}

export function setSession(req, res) {
  const token = signPayload({ sub: 'admin', exp: Math.floor(Date.now() / 1000) + TTL_S });
  const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') || !!process.env.VERCEL;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_S}${secure ? '; Secure' : ''}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function isAdmin(req) {
  return !!readToken(cookies(req)[COOKIE]);
}

/** Guard for admin endpoints. Returns true if the request may proceed. */
export function requireAdmin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (isAdmin(req)) return true;
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not signed in' }));
  return false;
}
