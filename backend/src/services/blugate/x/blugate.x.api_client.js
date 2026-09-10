// Blugate X (Twitter) gateway client.
//
// curl -X GET 'https://blugate.blurasaga.com/api/gateway/twitter/<path>' \
//   -H 'Authorization: Bearer <ACCESS_KEY>' \
//   -H 'x-client-id: <CLIENT_CODE>'
//
// Base URL: .env (BLUGATE_TWITTER_HOST / BLUGATE_BASE_URL)
// ACCESS_KEY / CLIENT_CODE: platforms.api_key + platforms.blugate_client_key (tenant DB)

const axios = require('axios');
const env = require('./blugate.x.env');
const { X_ENDPOINTS } = require('./blugate.x.endpoints');
const { decryptPlatformSecret } = require('../../../lib/platformSecrets');

/** Build auth from a platforms row (encrypted or plaintext). */
const authFromPlatformRow = (row) => {
  if (!row) {
    const err = new Error('X platform not found — add it under Settings → Platforms');
    err.status = 400;
    throw err;
  }
  const accessKey = decryptPlatformSecret(row.api_key);
  const clientId = decryptPlatformSecret(row.blugate_client_key);

  if (!accessKey) {
    const err = new Error(
      'X platform API key missing. Set API key under Settings → Platforms.'
    );
    err.status = 400;
    throw err;
  }
  if (!clientId) {
    const err = new Error(
      'X platform Blugate client key missing. Set Blugate client key under Settings → Platforms.'
    );
    err.status = 400;
    throw err;
  }

  return { accessKey, clientId };
};

const formatAxiosError = (err, endpointKey) => {
  const status = err.response?.status;
  const data = err.response?.data;
  let detail = '';
  if (typeof data === 'string') detail = data.slice(0, 300);
  else if (data && typeof data === 'object') {
    detail = data.message || data.error || data.detail || JSON.stringify(data).slice(0, 300);
  } else {
    detail = err.message;
  }
  // zlib "incorrect header check" = bad Content-Encoding decompress
  if (/incorrect header check/i.test(String(err.message || ''))) {
    detail =
      'Gateway returned a compressed body axios could not decode. Retried with Accept-Encoding: identity.';
  }
  const enriched = new Error(
    status
      ? `Blugate X ${endpointKey} HTTP ${status}: ${detail}`
      : `Blugate X ${endpointKey}: ${detail}`
  );
  enriched.status = status || 502;
  enriched.response = err.response;
  enriched.code = err.code;
  return enriched;
};

const callXApi = async (endpointKey, params = {}, auth = null) => {
  const endpoint = X_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown X endpoint "${endpointKey}". Valid keys: ${Object.keys(X_ENDPOINTS).join(', ')}`
    );
  }

  const baseUrl = env.getXBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'X Blugate base URL is not configured (set BLUGATE_TWITTER_HOST or BLUGATE_BASE_URL)'
    );
  }

  const accessKey = String(auth?.accessKey || '').trim();
  const clientId = String(auth?.clientId || '').trim();
  if (!accessKey || !clientId) {
    throw new Error(
      'Blugate credentials required: pass accessKey (api_key) and clientId (blugate_client_key) from the platforms table'
    );
  }

  const path = String(endpoint.path || '').replace(/^\//, '');
  const requestUrl = `${baseUrl}/${path}`;
  const method = String(endpoint.method || 'GET').toUpperCase();

  // Match Blugate curl: Bearer + x-client-id only.
  // Accept-Encoding: identity avoids axios zlib "incorrect header check" on bad gzip.
  const headers = {
    Authorization: `Bearer ${accessKey}`,
    'x-client-id': clientId,
    Accept: 'application/json',
    'Accept-Encoding': 'identity',
  };

  try {
    const response = await axios({
      method,
      url: requestUrl,
      params: method === 'GET' || method === 'DELETE' ? params : undefined,
      data: method !== 'GET' && method !== 'DELETE' ? params : undefined,
      headers,
      timeout: Number(process.env.X_API_TIMEOUT_MS) || 45000,
      // Prevent zlib "incorrect header check" when gateway lies about Content-Encoding
      decompress: false,
      responseType: 'text',
      transformResponse: [
        (raw) => {
          if (raw == null || raw === '') return raw;
          if (typeof raw === 'object') return raw;
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
      ],
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return response.data;
  } catch (err) {
    throw formatAxiosError(err, endpointKey);
  }
};

callXApi.authFromPlatformRow = authFromPlatformRow;

module.exports = callXApi;
module.exports.authFromPlatformRow = authFromPlatformRow;
module.exports.callXApi = callXApi;
