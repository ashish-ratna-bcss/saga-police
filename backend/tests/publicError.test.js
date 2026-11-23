const test = require('node:test');
const assert = require('node:assert');
const { isTechnical, sanitizeBody } = require('../src/lib/publicError');

test('flags provider and system internals', () => {
  for (const text of [
    'Blugate X SEARCH HTTP 401: Invalid API key. Go to https://blugate.blurasaga.com/docs/keys-and-key-rotation for more info.',
    'connect ECONNREFUSED 100.49.109.96:8003',
    'Request failed with status code 502',
    'timeout of 60000ms exceeded',
    'Invalid `prisma.social_media_posts.findMany()` invocation',
    'relation "epaper_posts" does not exist',
    "Cannot read properties of undefined (reading 'id')",
    'ENOENT: no such file /data-migration/apps/blurasaga/backend/x.js',
    'vllm not reachable at http://101.53.138.142:8001/v1',
  ]) {
    assert.strictEqual(isTechnical(text), true, text);
  }
});

test('leaves plain messages alone', () => {
  for (const text of ['Query parameter is required', 'Pick a newspaper', 'Search is temporarily rate limited. Please retry later.', 'No posts found']) {
    assert.strictEqual(isTechnical(text), false, text);
  }
});

test('error responses: technical text is replaced, plain text and codes are kept', () => {
  const a = sanitizeBody({ error: 'Blugate X SEARCH HTTP 401: Invalid API key', code: 'X_AUTH' }, 502);
  assert.strictEqual(a.changed, true);
  assert.strictEqual(a.body.code, 'X_AUTH');
  assert.ok(!/blugate|api key/i.test(a.body.error));
  const b = sanitizeBody({ message: 'Query parameter is required' }, 400);
  assert.strictEqual(b.changed, false);
  const c = sanitizeBody({ error: { message: 'connect ECONNREFUSED 127.0.0.1:8000', code: 'UNREACHABLE' } }, 503);
  assert.strictEqual(c.body.error.code, 'UNREACHABLE');
  assert.ok(!/ECONN/.test(c.body.error.message));
});

test('success responses: only error lists are touched', () => {
  const r = sanitizeBody({ results: [{ text: 'see https://example.com' }], errors: [{ platform: 'x', message: 'HTTP 401 invalid api key' }] }, 200);
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.body.results[0].text, 'see https://example.com');
  assert.ok(!/401|api key/i.test(r.body.errors[0].message));
  const plain = sanitizeBody({ results: [{ text: 'https://example.com' }] }, 200);
  assert.strictEqual(plain.changed, false);
});
