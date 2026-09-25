// Exercises the GitHub publishing and AI code paths against a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
let files = { 'content/posts/index.json': '[]' };
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const method = opts.method || 'GET';
  calls.push(`${method} ${url.replace(/https:\/\/[^/]+/, '')}`);
  const J = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('api.github.com')) {
    const path = url.split('/repos/me/blog')[1];
    if (path.startsWith('/contents/')) {
      const p = decodeURIComponent(path.slice(10).split('?')[0]);
      return p in files ? new Response(files[p]) : new Response('nf', { status: 404 });
    }
    if (path.startsWith('/git/ref/')) return J({ object: { sha: 'head1' } });
    if (path.startsWith('/git/commits/')) return J({ tree: { sha: 'tree1' } });
    if (path === '/git/blobs') return J({ sha: 'blob' + calls.length });
    if (path === '/git/trees') {
      const body = JSON.parse(opts.body);
      for (const t of body.tree) if (t.sha === null) delete files[t.path];
      test.lastTree = body.tree;
      return J({ sha: 'tree2' });
    }
    if (path === '/git/commits') return J({ sha: 'c2' });
    if (path.startsWith('/git/refs/')) return J({});
  }
  if (url.includes('generativelanguage.googleapis.com')) {
    return J({ candidates: [{ content: { parts: [{ text: '```json\n{"title":"T","dek":"D","tags":["a"],"body":"Hello — world — again"}\n```' }] } }] });
  }
  return new Response('no', { status: 500 });
};

process.env.GITHUB_TOKEN = 't';
process.env.GITHUB_REPO = 'me/blog';
process.env.GITHUB_BRANCH = 'main';
process.env.GEMINI_API_KEY = 'k';

const { savePost, storageMode } = await import('../../lib/content.js');
const { generate } = await import('../../lib/llm.js');

test('GitHub mode commits post + index (+ image) in one commit', async () => {
  assert.equal(storageMode(), 'github');
  const post = await savePost({ title: 'Hello World!', body: 'x', status: 'published' }, { image: { data: 'data:image/png;base64,iVBORw0KGgo=', type: 'image/png' } });
  assert.equal(post.slug, 'hello-world');
  assert.match(post.cover.url, /^\/media\/\d{4}\/\d{2}\/.+\.png$/);
  const paths = test.lastTree.map((t) => t.path).sort();
  assert.equal(paths.length, 3);
  assert.ok(paths.includes('content/posts/hello-world.json'));
  assert.ok(paths.includes('content/posts/index.json'));
  assert.ok(calls.some((c) => c.startsWith('PATCH /repos/me/blog/git/refs/heads/main')));
});

test('Gemini JSON output is parsed and de-dashed', async () => {
  const out = await generate({ prompt: 'x', json: true });
  assert.equal(out.title, 'T');
  assert.equal((out.body.match(/—/g) || []).length, 1);
});
