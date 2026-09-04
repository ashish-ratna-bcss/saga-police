// Handles every outgoing request to the X (Twitter) provider.
// Give it an endpoint key from blugate.x.endpoints.js and the query params
// it needs, and it takes care of the base URL, auth headers, and the
// actual HTTP call.
//
// Example:
//   const callXApi = require('./blugate.x.api_client');
//   const user = await callXApi('USER', { username: 'elonmusk' });

const axios = require('axios');
const env = require('./blugate.x.env');
const { X_ENDPOINTS } = require('./blugate.x.endpoints');

const callXApi = async (endpointKey, params = {}) => {
    const endpoint = X_ENDPOINTS[endpointKey];
    if (!endpoint) {
        throw new Error(`Unknown X endpoint "${endpointKey}". Valid keys: ${Object.keys(X_ENDPOINTS).join(', ')}`);
    }

    const baseUrl = env.getXBaseUrl();
    if (!baseUrl) {
        throw new Error('X base URL is not configured (set X_BASE_URL)');
    }

    const apiKey = env.getXApiKey();
    if (!apiKey) {
        throw new Error('X API key is not configured (set X_API_KEY)');
    }

    const requestUrl = `${baseUrl}/${endpoint.path}`;
    const requestHeaders = {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': new URL(baseUrl).host,
        'Content-Type': 'application/json'
    };

    const response = await axios({
        method: endpoint.method,
        url: requestUrl,
        params,
        headers: requestHeaders
    });

    return response.data;
};

module.exports = callXApi;
