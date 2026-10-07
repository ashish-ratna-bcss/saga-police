const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

// Bypass authorize (no real DB user) and the platforms-table lookup for BluGate
// credentials, so this exercises only the routes → client → gateway forwarding.

const stubModule = (relPath, exports) => {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

stubModule('../../middleware/auth.middleware', {
  authorize: () => (req, res, next) => next(),
});

let globalAuth = { accessKey: 'test-key', clientId: 'TEST-CLIENT' };
stubModule('../../services/blugate/global/blugate.global.api_client', {
  resolveGlobalAuth: async () => globalAuth,
});

async function runTests() {
  // 1. Mock BluGate news-api gateway on an ephemeral port
  const mockGateway = express();
  let lastRequest = null;
  mockGateway.all('*', (req, res) => {
    lastRequest = { method: req.method, path: req.path, query: req.query, headers: req.headers };
    if (req.path === '/api/gateway/news-api/news/articles/missing') {
      return res.status(404).json({ detail: 'Article not found (not in cache)' });
    }
    if (req.query.keyword === 'reject-key') {
      return res.status(401).json({ error: 'Missing or invalid Authorization header', status: 401 });
    }
    if (req.path === '/api/gateway/news-api/news/sources') {
      return res.status(200).json([{ id: 'eenadu', name: 'Eenadu' }]);
    }
    return res.status(200).json({ ok: true, path: req.path });
  });
  const mockServer = http.createServer(mockGateway);
  await new Promise((resolve) => mockServer.listen(0, resolve));
  process.env.BLUGATE_NEWS_HOST = `http://127.0.0.1:${mockServer.address().port}/api/gateway/news-api`;

  // 2. Backend app with only the news routes mounted
  const newsRoutes = require('./news.routes');
  const app = express();
  app.use('/api/news', newsRoutes);
  const appServer = http.createServer(app);
  await new Promise((resolve) => appServer.listen(0, resolve));
  const client = axios.create({ baseURL: `http://127.0.0.1:${appServer.address().port}`, validateStatus: () => true });

  try {
    console.log('Testing GET /api/news/health...');
    let res = await client.get('/api/news/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastRequest.path, '/api/gateway/news-api/health');
    assert.strictEqual(lastRequest.headers.authorization, 'Bearer test-key', 'Bearer key should be sent');
    assert.strictEqual(lastRequest.headers['x-client-id'], 'TEST-CLIENT', 'Client id should be sent');
    console.log('✅ health forwarded with BluGate credentials.');

    console.log('Testing GET /api/news/sources drops undeclared params...');
    res = await client.get('/api/news/sources?country=India&bogus=1');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data, [{ id: 'eenadu', name: 'Eenadu' }], 'Array body should be returned as-is');
    assert.strictEqual(lastRequest.path, '/api/gateway/news-api/news/sources');
    assert.deepStrictEqual(lastRequest.query, { country: 'India' });
    console.log('✅ sources forwarded; unknown params dropped.');

    console.log('Testing GET /api/news/articles joins repeated params and skips blanks...');
    res = await client.get('/api/news/articles?country=India&country=United%20States&keyword=&limit=5&offset=20&search_id=9');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastRequest.path, '/api/gateway/news-api/news/articles');
    assert.deepStrictEqual(lastRequest.query, { country: 'India,United States', limit: '5', offset: '20' },
      'search_id is ours and must not go upstream');
    assert.strictEqual(res.data.saved, null, 'no tenant DB → live results only');
    console.log('✅ articles query normalised.');

    console.log('Testing GET /api/news/articles/:id substitutes the path param...');
    res = await client.get('/api/news/articles/abc123');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastRequest.path, '/api/gateway/news-api/news/articles/abc123');
    console.log('✅ article id in path.');

    console.log('Testing upstream 404 passes through...');
    res = await client.get('/api/news/articles/missing');
    assert.strictEqual(res.status, 404);
    assert.match(res.data.message, /not found/i);
    console.log('✅ 404 preserved with readable message.');

    console.log('Testing gateway 401 is NOT returned as 401 (would log the user out)...');
    res = await client.get('/api/news/articles?keyword=reject-key');
    assert.strictEqual(res.status, 502);
    assert.match(res.data.message, /invalid Authorization/i);
    console.log('✅ gateway 401 mapped to 502.');

    console.log('Testing missing BluGate credentials → 503 NEWS_NOT_CONFIGURED...');
    globalAuth = null;
    res = await client.get('/api/news/health');
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.data.code, 'NEWS_NOT_CONFIGURED');
    console.log('✅ not-configured reported.');

    console.log('\nAll news route tests passed.');
  } finally {
    mockServer.close();
    appServer.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
