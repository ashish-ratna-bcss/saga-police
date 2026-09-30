// Outgoing requests to the Reddit provider (Blugate gateway).
//   const callRedditApi = require('./blugate.reddit.api_client');
//   const auth = callRedditApi.authFromPlatformRow(platformRow, 'Reddit');
//   await callRedditApi('RSS_MONITOR', { keywords: ['protest', 'strike'], limit: 50 }, auth);

const axios = require('axios');
const env = require('./blugate.reddit.env');
const { REDDIT_ENDPOINTS } = require('./blugate.reddit.endpoints');
const { authFromPlatformRow, describeProviderError } = require('../blugate.http');

const callRedditApi = async (endpointKey, payload = {}, auth = null) => {
  const endpoint = REDDIT_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown Reddit endpoint "${endpointKey}". Valid keys: ${Object.keys(REDDIT_ENDPOINTS).join(', ')}`
    );
  }

  const baseUrl = env.getRedditBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'Reddit base URL is not configured (set BLUGATE_BASE_URL or BLUGATE_REDDIT_HOST / REDDIT_BASE_URL)'
    );
  }

  let path = endpoint.path;
  const data = { ...(payload && typeof payload === 'object' ? payload : {}) };

  for (const key of Object.keys(data)) {
    const token = `{${key}}`;
    if (path.includes(token)) {
      path = path.split(token).join(encodeURIComponent(String(data[key])));
      delete data[key];
    }
  }

  const method = String(endpoint.method || 'GET').toUpperCase();
  const requestUrl = `${baseUrl}${path}`;
  const config = {
    method,
    url: requestUrl,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 60000,
  };

  const accessKey = String(auth?.accessKey || '').trim();
  const clientId = String(auth?.clientId || '').trim();
  if (accessKey && clientId) {
    config.headers.Authorization = `Bearer ${accessKey}`;
    config.headers['x-client-id'] = clientId;
  }

  if (method === 'GET' || method === 'DELETE') {
    config.params = data;
  } else {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const provider = err.response?.data;
    const providerMsg = describeProviderError(provider) || null;
    if (status || providerMsg) {
      const sent = status === 400 || status === 422 ? ` [sent: ${Object.keys(data).join(', ') || 'nothing'}]` : '';
      const noKeys =
        status === 401 && !(accessKey && clientId)
          ? ' (no BluGate keys were sent. Fetch platforms in Settings > Platforms)'
          : '';
      const enriched = new Error(
        (providerMsg
          ? `Reddit ${endpointKey} HTTP ${status || '?'}: ${providerMsg}`
          : `Reddit ${endpointKey} HTTP ${status || '?'}: ${err.message}`) +
          sent +
          noKeys
      );
      enriched.response = err.response;
      enriched.status = status;
      enriched.providerCode = provider?.error?.code || provider?.code || null;
      enriched.code = err.code;
      throw enriched;
    }
    throw err;
  }
};

callRedditApi.authFromPlatformRow = (row) => authFromPlatformRow(row, 'Reddit');

module.exports = callRedditApi;
