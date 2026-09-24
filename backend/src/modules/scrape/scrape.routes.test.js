const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

// We need to bypass authorize for this test since we don't have a real DB user.
// But we want to test the proxy forwarder.

const authPath = require.resolve('../../middleware/auth.middleware');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    authorize: () => (req, res, next) => {
      req.user = { id: 'test-user-id' };
      req.tenant = { id: 'test-tenant-id' };
      next();
    }
  }
};

async function runTests() {
  // 1. Create a mock Unified API server on an ephemeral port
  const mockUnifiedApi = express();
  
  let lastRequest = null;
  mockUnifiedApi.all('*', (req, res) => {
    lastRequest = {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: req.body
    };
    
    // Simulate a 422 error for empty crawls POST
    if (req.method === 'POST' && req.path === '/scrape/api/v1/crawls' && !req.body?.url) {
      return res.status(422).json({ detail: 'Missing URL' });
    }
    
    res.status(200).json({ ok: true, forwarded: true });
  });

  const mockServer = http.createServer(mockUnifiedApi);
  await new Promise(resolve => mockServer.listen(0, resolve));
  const mockPort = mockServer.address().port;

  // 2. Override the environment variable so the proxy targets our mock API
  process.env.SCRAPE_API_URL = `http://127.0.0.1:${mockPort}/scrape`;

  delete require.cache[require.resolve('../../services/scrape/scrape.client')];
  delete require.cache[require.resolve('../../services/scrape')];
  delete require.cache[require.resolve('./scrape.routes')];

  const scrapeRoutes = require('./scrape.routes');

  // 3. Create a test host for our backend scrape routes (bypassing auth just for this test)
  const app = express();
  app.use(express.json());
  
  // Create a mock authorize middleware explicitly for this test app to inject tenant/user
  app.use('/api/scrape', (req, res, next) => {
    req.user = { id: 'test-user-id' };
    req.tenant = { id: 'test-tenant-id' };
    next();
  }, scrapeRoutes);

  const appServer = http.createServer(app);
  await new Promise(resolve => appServer.listen(0, resolve));
  const appPort = appServer.address().port;
  
  const client = axios.create({
    baseURL: `http://127.0.0.1:${appPort}`,
    validateStatus: () => true
  });

  try {
    console.log('Testing GET /api/scrape/api/v1/documents?limit=10...');
    let res = await client.get('/api/scrape/api/v1/documents?limit=10');
    assert.strictEqual(res.status, 200, 'Status should be preserved');
    assert.strictEqual(res.data.forwarded, true, 'Response body should be preserved');
    assert.strictEqual(lastRequest.method, 'GET', 'Method should be GET');
    assert.strictEqual(lastRequest.path, '/scrape/api/v1/documents', 'Path should be /scrape/api/v1/documents');
    assert.strictEqual(lastRequest.query.limit, '10', 'Query parameters should be preserved');
    assert.strictEqual(lastRequest.headers['x-user-id'], 'test-user-id', 'User ID should be forwarded');
    assert.strictEqual(lastRequest.headers['x-tenant-id'], 'test-tenant-id', 'Tenant ID should be forwarded');
    console.log('✅ GET successful.');

    console.log('Testing POST /api/scrape/api/v1/crawls (Missing body to test 422)...');
    res = await client.post('/api/scrape/api/v1/crawls', {});
    assert.strictEqual(res.status, 422, '422 status should be preserved');
    assert.strictEqual(res.data.detail, 'Missing URL', '422 error body should be preserved');
    console.log('✅ POST (422) successful.');

    console.log('Testing POST /api/scrape/api/v1/preflight...');
    res = await client.post('/api/scrape/api/v1/preflight', { target: "http://example.com" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastRequest.method, 'POST');
    assert.strictEqual(lastRequest.path, '/scrape/api/v1/preflight');
    console.log('✅ POST successful.');

    console.log('\nAll E2E Proxy tests passed!');
  } finally {
    mockServer.close();
    appServer.close();
  }
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
