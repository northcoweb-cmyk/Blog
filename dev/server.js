// Local development server that behaves like Vercel: serves /public with clean
// URLs, applies the rewrites from vercel.json, and runs the /api functions.
//   npm run dev        → live feeds (needs internet)
//   npm run dev:mock   → offline sample data, for design work
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const vercel = JSON.parse(await fs.readFile(path.join(ROOT, 'vercel.json'), 'utf8'));

// Load .env / .env.local if present (simple KEY=VALUE lines).
for (const f of ['.env', '.env.local']) {
  try {
    for (const line of (await fs.readFile(path.join(ROOT, f), 'utf8')).split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

if (process.argv.includes('--mock')) {
  const { installMockFetch } = await import('./mock.js');
  installMockFetch();
  console.log('Mock mode: using offline sample feeds and market data.');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };

function compile(source) {
  const keys = [];
  const re = source.replace(/[.+?^${}()|[\]\\]/g, (c) => (c === '(' || c === ')' ? c : '\\' + c)).replace(/:([a-zA-Z]+)(\*)?/g, (_, k, star) => {
    keys.push(k);
    return star ? '(.*)' : '([^/]+)';
  });
  return { re: new RegExp(`^${re}$`), keys };
}
const rewrites = (vercel.rewrites || []).map((r) => ({ ...r, ...compile(r.source) }));

async function fileFor(pathname) {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [path.join(PUBLIC, clean), path.join(PUBLIC, clean + '.html'), path.join(PUBLIC, clean, 'index.html')];
  for (const c of candidates) {
    if (!c.startsWith(PUBLIC)) continue;
    try {
      if ((await fs.stat(c)).isFile()) return c;
    } catch {}
  }
  return null;
}

async function runFunction(name, req, res, query) {
  const mod = await import(pathToFileURL(path.join(ROOT, 'api', `${name}.js`)).href);
  req.query = query;
  await mod.default(req, res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams);
  const started = Date.now();
  res.on('finish', () => console.log(`${res.statusCode} ${req.method} ${req.url} ${Date.now() - started}ms`));

  try {
    // Clean URLs: /about.html → /about
    if (vercel.cleanUrls && pathname.endsWith('.html')) {
      res.writeHead(308, { location: pathname.replace(/(index)?\.html$/, '') + url.search });
      return res.end();
    }
    // 1. Direct API function
    const apiMatch = pathname.match(/^\/api\/(public|admin|cron)$/);
    if (apiMatch) return await runFunction(apiMatch[1], req, res, query);
    // 2. Static file
    const file = pathname.startsWith('/api/') ? null : await fileFor(pathname);
    if (file) {
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      return res.end(await fs.readFile(file));
    }
    // 3. Rewrites
    for (const r of rewrites) {
      const m = pathname.match(r.re);
      if (!m) continue;
      let dest = r.destination;
      r.keys.forEach((k, i) => (dest = dest.replace(new RegExp(`:${k}\\*?`, 'g'), m[i + 1])));
      const d = new URL(dest, 'http://x');
      const q = { ...query, ...Object.fromEntries(d.searchParams) };
      const fn = d.pathname.match(/^\/api\/(public|admin|cron)$/);
      if (fn) return await runFunction(fn[1], req, res, q);
      // Like Vercel: with cleanUrls, .html files can't be targeted by name.
      const f = vercel.cleanUrls && d.pathname.endsWith('.html') ? null : await fileFor(d.pathname);
      if (f) {
        res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'text/html' });
        return res.end(await fs.readFile(f));
      }
    }
    const nf = await fileFor('/404');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(nf ? await fs.readFile(nf) : 'Not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Server error: ' + e.message);
  }
});

server.listen(PORT, () => console.log(`\n  Tensor Street running at http://localhost:${PORT}\n  Admin: http://localhost:${PORT}/admin  (local password: ${process.env.ADMIN_PASSWORD ? '[ADMIN_PASSWORD]' : 'tensor'})\n`));
