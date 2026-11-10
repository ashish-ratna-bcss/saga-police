const assert = require('assert');

// A gateway 401 means our BluGate key was rejected, not that the user's session expired.
// If it reaches the browser as 401, apiHandler logs the user out and reloads to /login.
// Stub axios so the shared client and the X client can be driven with fixed upstream failures.

process.env.BLUGATE_TWITTER_HOST = 'https://gateway.test/api/gateway/twitter';

let nextFailure;
const axiosPath = require.resolve('axios');
require.cache[axiosPath] = {
  id: axiosPath,
  filename: axiosPath,
  loaded: true,
  exports: async () => {
    throw nextFailure;
  },
};

const { blugateRequest, gatewayClientStatus } = require('./blugate.http');
const callXApi = require('./x/blugate.x.api_client');

const upstream = (status, body) => {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data: body };
  return err;
};

const auth = { accessKey: 'test-key', clientId: 'TEST-CLIENT' };
const sharedCall = () =>
  blugateRequest({
    baseUrl: 'https://gateway.test/api/gateway/facebook',
    path: '/page',
    auth,
    label: 'Facebook',
    endpointKey: 'PAGE',
  });
const xCall = () => callXApi('USER', { username: 'someone' }, auth);

const failsWith = async (call, failure) => {
  nextFailure = failure;
  try {
    await call();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to fail');
};

async function runTests() {
  console.log('gatewayClientStatus maps only 401...');
  assert.strictEqual(gatewayClientStatus(401), 502);
  assert.strictEqual(gatewayClientStatus(429), 429);
  assert.strictEqual(gatewayClientStatus(404), 404);
  assert.strictEqual(gatewayClientStatus(undefined), undefined);
  console.log('✅ ok.');

  for (const [name, call] of [
    ['shared client', sharedCall],
    ['X client', xCall],
  ]) {
    console.log(`${name}: a gateway 401 is NOT returned as 401 (would log the user out)...`);
    let err = await failsWith(call, upstream(401, { error: 'Invalid API key' }));
    assert.strictEqual(err.status, 502);
    assert.ok(/HTTP 401: Invalid API key/.test(err.message), `message keeps the gateway text: ${err.message}`);
    assert.strictEqual(err.response.status, 401, 'raw upstream status stays on err.response');
    console.log('✅ 401 → 502, message and raw status preserved.');

    console.log(`${name}: other statuses are unchanged...`);
    err = await failsWith(call, upstream(429, { message: 'Too many requests' }));
    assert.strictEqual(err.status, 429);
    err = await failsWith(call, upstream(404, { message: 'not found' }));
    assert.strictEqual(err.status, 404);
    const network = new Error('connect ECONNREFUSED');
    network.code = 'ECONNREFUSED';
    err = await failsWith(call, network);
    assert.strictEqual(err.status, 502);
    console.log('✅ 429 stays 429, 404 stays 404, no response → 502.');
  }

  console.log('\nAll Blugate status tests passed.');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
