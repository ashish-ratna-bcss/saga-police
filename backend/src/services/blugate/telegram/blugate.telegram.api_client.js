// Outgoing requests to the Telegram provider (Blugate gateway).
// Like the other platforms, pass credentials from the platforms table:
//   const callTelegramApi = require('./blugate.telegram.api_client');
//   const auth = callTelegramApi.authFromPlatformRow(platformRow);
//   await callTelegramApi('CHANNEL_INFO', { username: 'somchannel' }, auth);
// Without auth the request is sent unauthenticated (only for an open self-hosted provider).

const axios = require('axios');
const env = require('./blugate.telegram.env');
const { TELEGRAM_ENDPOINTS } = require('./blugate.telegram.endpoints');
const { authFromPlatformRow, describeProviderError } = require('../blugate.http');

const callTelegramApi = async (endpointKey, payload = {}, auth = null) => {
  const endpoint = TELEGRAM_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown Telegram endpoint "${endpointKey}". Valid keys: ${Object.keys(TELEGRAM_ENDPOINTS).join(', ')}`
    );
  }

  const baseUrl = env.getTelegramBaseUrl();
  if (!baseUrl) {
    throw new Error('Telegram base URL is not configured (set TELEGRAM_BASE_URL)');
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
      // For bad requests, say which fields were sent so a 422 can be traced (names only, never values).
      const sent = status === 400 || status === 422 ? ` [sent: ${Object.keys(data).join(', ') || 'nothing'}]` : '';
      const noKeys = status === 401 && !(accessKey && clientId) ? ' (no BluGate keys were sent. Fetch platforms in Settings > Platforms)' : '';
      const enriched = new Error(
        (providerMsg
          ? `Telegram ${endpointKey} HTTP ${status || '?'}: ${providerMsg}`
          : `Telegram ${endpointKey} HTTP ${status || '?'}: ${err.message}`) + sent + noKeys
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

callTelegramApi.authFromPlatformRow = authFromPlatformRow;

module.exports = callTelegramApi;
