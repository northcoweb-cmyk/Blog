// Instagram autopilot against a fake Instagram API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';

const calls = [];
let media = [];
let pendingCaption = '';
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const method = opts.method || 'GET';
  const params = method === 'GET' ? u.searchParams : new URLSearchParams(String(opts.body));
  calls.push({ method, path: u.pathname, params: Object.fromEntries(params) });
  const J = (b) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
  if (u.hostname === 'graph.instagram.com') {
    if (u.pathname === '/me') return J({ user_id: '1789', username: 'tensorstreet', account_type: 'MEDIA_CREATOR' });
    if (u.pathname === '/1789/media' && method === 'GET') return J({ data: media });
    if (u.pathname === '/1789/media' && method === 'POST') {
      pendingCaption = params.get('caption');
      return J({ id: 'c1' });
    }
    if (u.pathname === '/c1') return J({ status_code: 'FINISHED' });
    if (u.pathname === '/1789/media_publish') {
      media.unshift({ id: 'm1', caption: pendingCaption, timestamp: new Date().toISOString() });
      return J({ id: 'm1' });
    }
    if (u.pathname === '/m1') return J({ permalink: 'https://instagram.com/p/abc' });
  }
  // News feeds: one AI story
  if (String(url).includes('techcrunch.com/category/artificial-intelligence')) {
    return new Response(`<rss><channel><item><title>OpenAI launches a new model for developers</title><link>https://techcrunch.com/a</link><pubDate>${new Date(Date.now() - 3600e3).toUTCString()}</pubDate><description>Details here.</description><enclosure url="https://techcrunch.com/i.jpg" type="image/jpeg"/></item></channel></rss>`);
  }
  return new Response('no', { status: 404 });
};

const dir = fs.mkdtempSync(os.tmpdir() + '/ts-');
process.chdir(dir);
process.env.INSTAGRAM_ACCESS_TOKEN = 'IGtest';
process.env.INSTAGRAM_AUTOPILOT = 'on';
process.env.SITE_TIMEZONE = 'UTC';
const igx = await import('../../lib/instagram.js');

test('card links are signed and readable', () => {
  const url = igx.cardUrl('https://ts.com', { title: 'Hi', section: 'ai', source: 'X', image: 'https://x.com/a.jpg' });
  const q = new URL(url).searchParams;
  assert.equal(igx.readCardPayload(q.get('d'), q.get('s')).title, 'Hi');
  assert.equal(igx.readCardPayload(q.get('d'), 'bad'), null);
});

test('autopilot posts the top story once, then skips it', async () => {
  const r1 = await igx.runAutopilot({ origin: 'https://ts.com', force: true });
  assert.equal(r1.posted, true, JSON.stringify(r1));
  assert.equal(r1.story, 'OpenAI launches a new model for developers');
  const create = calls.find((c) => c.method === 'POST' && c.path === '/1789/media');
  assert.match(create.params.image_url, /^https:\/\/ts\.com\/api\/card\?d=/);
  assert.match(create.params.caption, /^OpenAI launches a new model for developers\n/);
  assert.match(create.params.caption, /Source: TechCrunch/);
  assert.equal(create.params.access_token, 'IGtest');
  // Same story is now on Instagram → nothing new to post.
  const r2 = await igx.runAutopilot({ origin: 'https://ts.com', force: true });
  assert.equal(r2.posted, false);
});

test('spacing: will not post again right after a post', async () => {
  const r = await igx.runAutopilot({ origin: 'https://ts.com' });
  assert.equal(r.posted, false);
  assert.match(r.reason, /Waiting|Outside posting hours|Already posted/);
});
