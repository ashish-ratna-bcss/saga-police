// Facebook Blugate gateway base URL (credentials from platforms table).
//   BLUGATE_FACEBOOK_HOST=https://blugate.blurasaga.com/api/gateway/facebook
//   or BLUGATE_BASE_URL=https://blugate.blurasaga.com

const { resolveGatewayBaseUrl } = require('../blugate.http');

const getFacebookBaseUrl = () =>
  resolveGatewayBaseUrl('facebook', [
    'BLUGATE_FACEBOOK_HOST',
    'FACEBOOK_BASE_URL',
  ]);

module.exports = {
  getFacebookBaseUrl,
};
