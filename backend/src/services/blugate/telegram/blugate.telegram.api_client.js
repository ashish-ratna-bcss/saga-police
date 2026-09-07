// Outgoing requests to the Telegram provider (Blugate-style).
// Example:
//   const callTelegramApi = require('./blugate.telegram.api_client');
//   await callTelegramApi('CHANNEL_INFO', { username: 'somchannel' });

const axios = require('axios');
const env = require('./blugate.telegram.env');
const { TELEGRAM_ENDPOINTS } = require('./blugate.telegram.endpoints');

const callTelegramApi = async (endpointKey, payload = {}) => {
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
    const providerMsg =
      provider && typeof provider === 'object'
        ? provider.message || provider.detail || provider.error || null
        : typeof provider === 'string'
          ? provider
          : null;
    if (status || providerMsg) {
      const enriched = new Error(
        providerMsg
          ? `Telegram ${endpointKey} HTTP ${status || '?'}: ${providerMsg}`
          : `Telegram ${endpointKey} HTTP ${status || '?'}: ${err.message}`
      );
      enriched.response = err.response;
      enriched.code = err.code;
      throw enriched;
    }
    throw err;
  }
};

module.exports = callTelegramApi;
