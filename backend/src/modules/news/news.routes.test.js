const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

// Bypass authorize (no real DB user), the platforms-table lookup for BluGate
// credentials, and the tenant DB store, so this exercises routes → controller →
// gateway forwarding. The store itself is covered by news.store.service.test.js.

const stubModule = (relPath, exports) => {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

let tenantDb = { fake: 'tenant-db' };
stubModule('../../middleware/auth.middleware', {
  authorize: () => (req, res, next) => {
    req.user = { id: 7, name: 'Asha' };
    req.tenantPrisma = tenantDb;
    req.tenantDbName = 'blurasaga_test';
    next();
  },
});

let globalAuth = { accessKey: 'test-key', clientId: 'TEST-CLIENT' };
stubModule('../../services/blugate/global/blugate.global.api_client', {
  resolveGlobalAuth: async () => globalAuth,
});

const storeCalls = [];
stubModule('./news.store.service', {
  listArticles: async (db, query) => {
    storeCalls.push(['listArticles', db, query]);
    return { count: 1, limit: 20, offset: 0, articles: [{ id: 'db1' }], query_terms: [], query_phrases: [] };
  },
  saveCollected: async (db, collected) => {
    storeCalls.push(['saveCollected', db, collected]);
    return { search_id: '42', fetched: collected.articles.length, new: 3, collected_at: new Date('2026-10-07T12:00:00Z') };
  },
  getSavedArticle: async (db, id) => (id === 'saved1' ? { id: 'saved1', content: 'From the DB' } : null),
  listSearches: async () => ({ count: 0, items: [] }),
  deleteSearch: async () => undefined,
});

async function runTests() {
  // 1. Mock BluGate news-api gateway on an ephemeral port
  const mockGateway = express();
  const gatewayCalls = [];
  mockGateway.all('*', (req, res) => {
    gatewayCalls.push({ path: req.path, query: req.query, headers: req.headers });
    if (req.query.keyword === 'reject-key') {
      return res.status(401).json({ error: 'Missing or invalid Authorization header', status: 401 });
    }
    if (req.path === '/api/gateway/news-api/news/articles') {
      // 120 live matches → the collector should ask for offsets 0, 50, 100
      const offset = Number(req.query.offset || 0);
      const n = Math.max(0, Math.min(Number(req.query.limit), 120 - offset));
      return res.json({
        count: 120, limit: Number(req.query.limit), offset, pending_sources: 2,
        articles: Array.from({ length: n }, (_, i) => ({ id: `live${offset + i}` })),
      });
    }
    if (req.path === '/api/gateway/news-api/news/articles/missing') {
      return res.status(404).json({ detail: 'Article not found (not in cache)' });
    }
    if (req.path.startsWith('/api/gateway/news-api/news/articles/')) {
      return res.json({ id: req.path.split('/').pop(), content: 'Live copy' });
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
  app.use(express.json());
  app.use('/api/news', newsRoutes);
  const appServer = http.createServer(app);
  await new Promise((resolve) => appServer.listen(0, resolve));
  const client = axios.create({ baseURL: `http://127.0.0.1:${appServer.address().port}`, validateStatus: () => true });
  const lastGateway = () => gatewayCalls[gatewayCalls.length - 1];

  try {
    console.log('Testing live health/sources are forwarded with BluGate credentials...');
    let res = await client.get('/api/news/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastGateway().path, '/api/gateway/news-api/health');
    assert.strictEqual(lastGateway().headers.authorization, 'Bearer test-key');
    assert.strictEqual(lastGateway().headers['x-client-id'], 'TEST-CLIENT');
    res = await client.get('/api/news/sources?country=India&bogus=1');
    assert.deepStrictEqual(res.data, [{ id: 'eenadu', name: 'Eenadu' }]);
    assert.deepStrictEqual(lastGateway().query, { country: 'India' }, 'unknown params dropped');
    console.log('✅ health/sources forwarded.');

    console.log('Testing GET /api/news/articles reads the tenant DB only...');
    const before = gatewayCalls.length;
    res = await client.get('/api/news/articles', { params: { keyword: 'textbook errors, NYCS', min_match: 2, state: 'Odisha' } });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data.articles, [{ id: 'db1' }]);
    const [name, db, query] = storeCalls[storeCalls.length - 1];
    assert.strictEqual(name, 'listArticles');
    assert.strictEqual(db, tenantDb);
    assert.deepStrictEqual(query, { keyword: 'textbook errors, NYCS', min_match: '2', state: 'Odisha' });
    assert.strictEqual(gatewayCalls.length, before, 'no live call for displaying articles');
    console.log('✅ articles come from the DB with the filters.');

    console.log('Testing POST /api/news/collect fetches pages live and saves them...');
    gatewayCalls.length = 0;
    res = await client.post('/api/news/collect', { keyword: 'textbook errors, NYCS', min_match: 2, state: 'Odisha', limit: 999 });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(gatewayCalls.map((c) => c.query.offset), ['0', '50', '100']);
    assert.deepStrictEqual(gatewayCalls[0].query, { keyword: 'textbook errors, NYCS', state: 'Odisha', limit: '50', offset: '0' },
      'live fetch forwards the filters but not min_match (every match is saved)');
    const saveCall = storeCalls[storeCalls.length - 1];
    assert.strictEqual(saveCall[0], 'saveCollected');
    assert.strictEqual(saveCall[2].articles.length, 120);
    assert.strictEqual(saveCall[2].liveCount, 120);
    assert.strictEqual(saveCall[2].query.min_match, 2, 'search history keeps min_match');
    assert.deepStrictEqual(res.data, { ok: true, search_id: '42', fetched: 120, new: 3, collected_at: '2026-10-07T12:00:00.000Z', live_count: 120, pending_sources: 2 });
    console.log('✅ 3 pages fetched, 120 saved, stats returned.');

    console.log('Testing collect needs a tenant workspace...');
    tenantDb = null;
    res = await client.post('/api/news/collect', { keyword: 'x' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.code, 'NO_TENANT_DB');
    tenantDb = { fake: 'tenant-db' };
    console.log('✅ no workspace → 400 NO_TENANT_DB.');

    console.log('Testing a gateway 401 is NOT returned as 401 (would log the user out)...');
    res = await client.post('/api/news/collect', { keyword: 'reject-key' });
    assert.strictEqual(res.status, 502);
    assert.match(res.data.message, /invalid Authorization/i);
    console.log('✅ gateway 401 → 502.');

    console.log('Testing over-long keyword lists are refused before any work...');
    const big = 'x'.repeat(6001);
    gatewayCalls.length = 0;
    assert.strictEqual((await client.get('/api/news/articles', { params: { keyword: big } })).data.code, 'KEYWORD_TOO_LONG');
    assert.strictEqual((await client.post('/api/news/collect', { keyword: big })).data.code, 'KEYWORD_TOO_LONG');
    assert.strictEqual(gatewayCalls.length, 0);
    console.log('✅ too-long keyword → 400 KEYWORD_TOO_LONG.');

    console.log('Testing article detail: DB copy first, live otherwise...');
    res = await client.get('/api/news/articles/saved1');
    assert.strictEqual(res.data.content, 'From the DB');
    res = await client.get('/api/news/articles/abc123');
    assert.strictEqual(res.data.content, 'Live copy');
    assert.strictEqual(lastGateway().path, '/api/gateway/news-api/news/articles/abc123');
    res = await client.get('/api/news/articles/missing');
    assert.strictEqual(res.status, 404);
    console.log('✅ detail from DB, live fallback, 404 preserved.');

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
