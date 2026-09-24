const http = require('http');
const express = require('express');
const axios = require('axios');
const assert = require('assert');

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
    if (req.method === 'POST' && req.path === '/osint/api/v1/investigations' && !req.body?.target) {
      return res.status(422).json({ detail: 'Missing Target' });
    }
    res.status(200).json({ ok: true, forwarded: true });
  });

  const mockServer = http.createServer(mockUnifiedApi);
  await new Promise(resolve => mockServer.listen(0, resolve));
  const mockPort = mockServer.address().port;

  process.env.OSINT_API_URL = 'http://127.0.0.1:' + mockPort + '/osint';

  delete require.cache[require.resolve('../../services/osint/osint.client')];
  delete require.cache[require.resolve('../../services/osint')];
  delete require.cache[require.resolve('./osint.routes')];

  const osintRoutes = require('./osint.routes');

  const app = express();
  app.use(express.json());
  app.use('/api/osint', osintRoutes);

  const appServer = http.createServer(app);
  await new Promise(resolve => appServer.listen(0, resolve));
  const appPort = appServer.address().port;
  
  const client = axios.create({ baseURL: 'http://127.0.0.1:' + appPort, validateStatus: () => true });

  try {
    console.log('Testing GET /api/osint/api/v1/investigations/123/status...');
    let res = await client.get('/api/osint/api/v1/investigations/123/status');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.forwarded, true);
    assert.strictEqual(lastRequest.method, 'GET');
    assert.strictEqual(lastRequest.path, '/osint/api/v1/investigations/123/status');
    assert.strictEqual(lastRequest.headers['x-user-id'], 'test-user-id');
    assert.strictEqual(lastRequest.headers['x-tenant-id'], 'test-tenant-id');
    console.log('✅ GET successful.');

    console.log('Testing POST /api/osint/api/v1/investigations...');
    res = await client.post('/api/osint/api/v1/investigations', {});
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.data.detail, 'Missing Target');
    console.log('✅ POST (422) successful.');

    console.log('Testing POST /api/osint/api/v1/phone/lookup...');
    res = await client.post('/api/osint/api/v1/phone/lookup', { phone: '+1234567890' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastRequest.method, 'POST');
    assert.strictEqual(lastRequest.path, '/osint/api/v1/phone/lookup');
    console.log('✅ POST successful.');
    
    console.log('\nAll OSINT E2E Proxy tests passed!');
  } finally {
    mockServer.close();
    appServer.close();
  }
}
runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
