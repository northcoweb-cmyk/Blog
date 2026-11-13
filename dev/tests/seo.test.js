import test from 'node:test';
import assert from 'node:assert/strict';
import { headBlock, injectHead, fitTitle, trunc, orgGraph } from '../../lib/seo-head.js';
import { topicPage, sitemapXml, robotsTxt, postTopics, storyPage } from '../../lib/seo.js';

const O = 'https://example.com';

test('titles stay short and brand only when it fits', () => {
  assert.equal(fitTitle('NorthCo raises $10M'), 'NorthCo raises $10M | Kelvane');
  assert.ok(!fitTitle('A very long headline about NorthCo that goes on and on forever and ever').endsWith('Kelvane'));
  assert.ok(trunc('word '.repeat(80), 158).length <= 158);
});

test('head block has absolute canonical + og:image, and valid JSON-LD', () => {
  const h = headBlock({ origin: O, path: '/p/x', title: 'NorthCo', description: 'About NorthCo.', image: '/media/a.jpg', graph: orgGraph(O) });
  assert.match(h, /rel="canonical" href="https:\/\/example.com\/p\/x"/);
  assert.match(h, /og:image" content="https:\/\/example.com\/media\/a.jpg"/);
  const ld = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.ok(JSON.parse(ld)['@graph'].length >= 2);
});

test('injectHead replaces old tags instead of duplicating', () => {
  const html = '<html><head><title>Old</title><meta name="description" content="old"><meta property="og:title" content="old"></head></html>';
  const out = injectHead(html, headBlock({ origin: O, path: '/', title: 'New', description: 'Fresh description here.' }));
  assert.equal((out.match(/<title>/g) || []).length, 1);
  assert.equal((out.match(/name="description"/g) || []).length, 1);
  assert.ok(!out.includes('content="old"'));
});

test('story (wire) pages are noindex; unknown story is a 404', () => {
  const s = storyPage({ id: 'a', title: 'T', url: 'https://x.com', section: 'ai', source: 'X', date: new Date().toISOString(), summary: 'S', tags: [] }, O);
  assert.match(s.html, /noindex/);
  assert.equal(storyPage(null, O).status, 404);
});

test('bad topic slugs 404; sitemap + robots are absolute', async () => {
  assert.equal((await topicPage('../etc/passwd', O)).status, 404);
  assert.match(robotsTxt(O), /Sitemap: https:\/\/example.com\/sitemap.xml/);
  const sm = await sitemapXml(O);
  assert.match(sm, /<loc>https:\/\/example.com\/<\/loc>/);
  assert.ok(Array.isArray(postTopics([{ tags: ['NorthCo', 'AI'] }, { tags: ['northco'] }])));
  assert.equal(postTopics([{ tags: ['NorthCo'] }, { tags: ['northco'] }])[0].count, 2);
});
