// Reddit Blugate gateway base URL (credentials come from the platforms table, not .env).
// Set BLUGATE_BASE_URL=https://blugate.blurasaga.com once and this becomes
//   https://blugate.blurasaga.com/api/gateway/reddit
// Overrides: BLUGATE_REDDIT_HOST, REDDIT_BASE_URL, or legacy REDDIT_UNIFIED_API_URL.

const { resolveGatewayBaseUrl } = require('../blugate.http');

const getRedditBaseUrl = () =>
  String(
    resolveGatewayBaseUrl('reddit', [
      'BLUGATE_REDDIT_HOST',
      'REDDIT_BASE_URL',
      'REDDIT_UNIFIED_API_URL',
    ]) || ''
  )
    .trim()
    .replace(/\/$/, '');

module.exports = {
  getRedditBaseUrl,
};
