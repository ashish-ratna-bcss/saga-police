// Handles every outgoing request to the IG Downloader provider.
// Give it an endpoint key from blugate.instagram.endpoints.js and the JSON
// body it needs, and it takes care of the base URL, auth headers, and the
// actual HTTP call.
//
// Example:
//   const callInstagramApi = require('./blugate.instagram.api_client');
//   const profile = await callInstagramApi('USER_INFO', { username: 'instagram' });

const axios = require('axios');
const env = require('./blugate.instagram.env');
const { INSTAGRAM_ENDPOINTS } = require('./blugate.instagram.endpoints');

const callInstagramApi = async (endpointKey, body = {}) => {
  const endpoint = INSTAGRAM_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown Instagram endpoint "${endpointKey}". Valid keys: ${Object.keys(INSTAGRAM_ENDPOINTS).join(', ')}`
    );
  }

  const baseUrl = env.getInstagramBaseUrl();
  if (!baseUrl) {
    throw new Error('Instagram base URL is not configured (set INSTAGRAM_BASE_URL)');
  }

  const apiKey = env.getInstagramApiKey();
  if (!apiKey) {
    throw new Error('Instagram API key is not configured (set INSTAGRAM_API_KEY)');
  }

  const requestUrl = `${baseUrl}${endpoint.path}`;
  const requestHeaders = {
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': new URL(baseUrl).host,
    'Content-Type': 'application/json',
  };

  try {
    const response = await axios({
      method: endpoint.method,
      url: requestUrl,
      data: body,
      headers: requestHeaders,
      timeout: Number(process.env.INSTAGRAM_API_TIMEOUT_MS) || 60000,
    });
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const provider = err.response?.data;
    const providerMsg =
      provider && typeof provider === 'object'
        ? provider.message || provider.response_type || null
        : typeof provider === 'string'
          ? provider
          : null;
    if (status || providerMsg) {
      const enriched = new Error(
        providerMsg
          ? `Instagram ${endpointKey} HTTP ${status || '?'}: ${providerMsg}`
          : `Instagram ${endpointKey} HTTP ${status || '?'}: ${err.message}`
      );
      enriched.response = err.response;
      enriched.code = err.code;
      throw enriched;
    }
    throw err;
  }
};

module.exports = callInstagramApi;
