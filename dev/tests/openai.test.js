// OpenAI provider against a fake API: JSON mode, reasoning params, model fallback.
import test from 'node:test';
import assert from 'node:assert/strict';

const seen = [];
globalThis.fetch = async (url, opts = {}) => {
  const body = JSON.parse(opts.body);
  seen.push({ url: String(url), body, auth: opts.headers.authorization });
  if (body.model === 'gpt-5-mini') return new Response(JSON.stringify({ error: { message: 'The model `gpt-5-mini` does not exist', code: 'model_not_found' } }), { status: 404 });
  return new Response(JSON.stringify({ choices: [{ message: { content: '{"brief":"Hi","why":"Because"}' }, finish_reason: 'stop' }] }), { status: 200 });
};

process.env.OPENAI_API_KEY = 'sk-test';
const { generate, llmProvider } = await import('../../lib/llm.js');

test('OpenAI key is picked up and falls back to the next model', async () => {
  assert.equal(llmProvider(), 'openai');
  const out = await generate({ prompt: 'x', json: true });
  assert.deepEqual(out, { brief: 'Hi', why: 'Because' });
  assert.equal(seen[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(seen[0].auth, 'Bearer sk-test');
  assert.equal(seen[0].body.reasoning_effort, 'low');
  assert.equal(seen[0].body.temperature, undefined);
  assert.equal(seen[1].body.model, 'gpt-4.1-mini');
  assert.equal(seen[1].body.temperature, 0.6);
  assert.deepEqual(seen[1].body.response_format, { type: 'json_object' });
  // Remembers the working model for the next call.
  await generate({ prompt: 'y' });
  assert.equal(seen[2].body.model, 'gpt-4.1-mini');
});
