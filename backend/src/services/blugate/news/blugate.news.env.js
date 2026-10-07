// Blugate News Articles gateway base URL.
// Per blugateapis/news-api-blugate-documentation.json:
//   gatewayBaseUrl: https://blugate.blurasaga.com/api/gateway/news-api
// Prefer:
//   BLUGATE_NEWS_HOST=https://blugate.blurasaga.com/api/gateway/news-api
//   or BLUGATE_BASE_URL=https://blugate.blurasaga.com  → appends /api/gateway/news-api
// Falls back to the production gateway so the Tools → News module works without extra .env setup.

const { resolveGatewayBaseUrl } = require('../blugate.http');

const DEFAULT_NEWS_BASE_URL = 'https://blugate.blurasaga.com/api/gateway/news-api';

const getNewsBaseUrl = () =>
  resolveGatewayBaseUrl('news-api', ['BLUGATE_NEWS_HOST']) || DEFAULT_NEWS_BASE_URL;

module.exports = {
  DEFAULT_NEWS_BASE_URL,
  getNewsBaseUrl,
};
