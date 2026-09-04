// Handles every outgoing request to the Facebook Scraper provider.
// Give it an endpoint key from blugate.facebook.endpoints.js and the query
// params it needs, and it takes care of the base URL, auth headers, and
// the actual HTTP call.
//
// Example:
//   const callFacebookApi = require('./blugate.facebook.api_client');
//   const page = await callFacebookApi('PAGE_DETAILS', { url: 'https://www.facebook.com/nike' });

const axios = require('axios');
const env = require('./blugate.facebook.env');
const { FACEBOOK_ENDPOINTS } = require('./blugate.facebook.endpoints');

const callFacebookApi = async (endpointKey, params = {}) => {
    const endpoint = FACEBOOK_ENDPOINTS[endpointKey];
    if (!endpoint) {
        throw new Error(`Unknown Facebook endpoint "${endpointKey}". Valid keys: ${Object.keys(FACEBOOK_ENDPOINTS).join(', ')}`);
    }

    const baseUrl = env.getFacebookBaseUrl();
    if (!baseUrl) {
        throw new Error('Facebook base URL is not configured (set FACEBOOK_BASE_URL)');
    }

    const apiKey = env.getFacebookApiKey();
    if (!apiKey) {
        throw new Error('Facebook API key is not configured (set FACEBOOK_API_KEY)');
    }

    const requestUrl = `${baseUrl}${endpoint.path}`;
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

module.exports = callFacebookApi;
