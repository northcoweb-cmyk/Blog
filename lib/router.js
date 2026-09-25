import { json } from './http.js';

/** Wrap a route table into one Vercel function (keeps us far under the Hobby plan's function limit). */
export function makeHandler(routes, prefix) {
  return async function handler(req, res) {
    let action = req.query?.action || req.query?.job;
    if (!action) {
      const u = new URL(req.url, 'http://x');
      action = u.searchParams.get('action') || u.searchParams.get('job') || u.pathname.replace(new RegExp(`^/api/${prefix ? prefix + '/' : ''}`), '').split('/')[0];
    }
    const fn = Object.hasOwn(routes, action) ? routes[action] : null;
    if (!fn) return json(res, 404, { error: `Unknown endpoint: ${action || '(none)'}` });
    try {
      await fn(req, res);
    } catch (e) {
      console.error(`[api/${prefix || ''}${action}]`, e);
      if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on our end. Please try again.' });
      else res.end();
    }
  };
}
