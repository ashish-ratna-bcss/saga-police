// Handles every outgoing request to the YouTube Data API v3.
// Unlike Facebook/X, this goes through Google's own `googleapis` SDK rather
// than a raw HTTP call — give it an endpoint key from
// blugate.youtube.endpoints.js and the params it needs, and it resolves the
// matching SDK method and calls it.
//
// Example:
//   const callYouTubeApi = require('./blugate.youtube.api_client');
//   const channel = await callYouTubeApi('CHANNELS_LIST', { part: 'snippet', forHandle: '@nike' });

const { google } = require('googleapis');
const env = require('./blugate.youtube.env');
const { YOUTUBE_ENDPOINTS } = require('./blugate.youtube.endpoints');

const callYouTubeApi = async (endpointKey, params = {}) => {
    const endpoint = YOUTUBE_ENDPOINTS[endpointKey];
    if (!endpoint) {
        throw new Error(`Unknown YouTube endpoint "${endpointKey}". Valid keys: ${Object.keys(YOUTUBE_ENDPOINTS).join(', ')}`);
    }

    const apiKey = env.getYouTubeApiKey();
    if (!apiKey) {
        throw new Error('YouTube API key is not configured (set YOUTUBE_API_KEY)');
    }

    const [resource, operation] = endpoint.path.replace(/^youtube\./, '').split('.');
    const youtube = google.youtube({ version: 'v3', auth: apiKey });

    if (!youtube[resource] || typeof youtube[resource][operation] !== 'function') {
        throw new Error(`SDK has no method for "${endpoint.path}"`);
    }

    const response = await youtube[resource][operation](params);
    return response.data;
};

module.exports = callYouTubeApi;
