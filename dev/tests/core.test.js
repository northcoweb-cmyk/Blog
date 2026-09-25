import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../../lib/parse-feed.js';
import { classify, isAiStory } from '../../lib/classify.js';
import { renderMarkdown } from '../../public/assets/js/md.js';
import { sign, verify, isPublicHttpUrl } from '../../lib/http.js';

test('parses RSS 2.0 with media:content and CDATA', () => {
  const items = parseFeed(`<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>X</title>
  <item><title><![CDATA[Nvidia &amp; AMD rally on AI demand]]></title><link>https://ex.com/a</link><pubDate>Wed, 24 Sep 2026 10:00:00 GMT</pubDate><dc:creator>Jane</dc:creator>
  <description><![CDATA[<p>Chip stocks rose.</p>]]></description><media:content url="https://ex.com/i.jpg" medium="image" width="1200"/></item></channel></rss>`);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Nvidia & AMD rally on AI demand');
  assert.equal(items[0].image, 'https://ex.com/i.jpg');
  assert.equal(items[0].summary, 'Chip stocks rose.');
  assert.equal(items[0].author, 'Jane');
  assert.equal(items[0].date, '2026-09-24T10:00:00.000Z');
});

test('parses Atom with alternate link and image in content', () => {
  const items = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>OpenAI ships a model</title><link rel="alternate" href="https://ex.com/b"/><updated>2026-09-24T10:00:00Z</updated><content type="html">&lt;img src="https://ex.com/p.png"&gt;&lt;p&gt;Body&lt;/p&gt;</content><author><name>Sam</name></author></entry></feed>`);
  assert.equal(items[0].link, 'https://ex.com/b');
  assert.equal(items[0].image, 'https://ex.com/p.png');
  assert.equal(items[0].author, 'Sam');
});

test('Google News source + duplicate description are handled', () => {
  const items = parseFeed(`<rss><channel><item><title>Big AI bill passes - Reuters</title><link>https://news.google.com/rss/articles/x</link><description>&lt;a href="#"&gt;Big AI bill passes&lt;/a&gt; Reuters</description><source url="https://reuters.com">Reuters</source></item></channel></rss>`);
  assert.equal(items[0].sourceName, 'Reuters');
  assert.equal(items[0].summary, '');
});

test('AI filter and desk classifier', () => {
  assert.ok(isAiStory('Nvidia beats earnings'));
  assert.ok(!isAiStory('Retail chain posts stronger quarterly results'));
  assert.equal(classify('OpenAI launches GPT-6 model', '', 'ai'), 'models');
  assert.equal(classify('Senate passes AI regulation bill', '', 'markets'), 'policy');
  assert.equal(classify('AI startup raises $40M Series B', '', 'ai'), 'startups');
  assert.equal(classify('How a small business uses AI for bookkeeping', '', 'tech'), 'mainstreet');
});

test('markdown escapes HTML and blocks javascript: links', () => {
  const html = renderMarkdown('Hi <script>alert(1)</script> [x](javascript:alert(1)) **b**\n\n## Head');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('href="#"'));
  assert.ok(html.includes('<strong>b</strong>'));
  assert.ok(html.includes('<h2 id="head">Head</h2>'));
});

test('URL signing and SSRF guard', () => {
  const u = 'https://ex.com/a';
  assert.ok(verify(u, sign(u)));
  assert.ok(!verify(u, 'nope'));
  assert.ok(!verify('https://evil.com', sign(u)));
  for (const bad of ['http://localhost/x', 'http://127.0.0.1/', 'http://10.0.0.1', 'http://192.168.1.1', 'file:///etc/passwd', 'http://169.254.169.254/latest']) assert.ok(!isPublicHttpUrl(bad), bad);
  assert.ok(isPublicHttpUrl('https://techcrunch.com/x'));
});
