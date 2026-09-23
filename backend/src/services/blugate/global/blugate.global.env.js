// Global Blugate gateway base URL — client account status, platform health, and billing.
// Per blugateapis/global-blugate-documentation.json:
//   gatewayBaseUrl: https://blugate.blurasaga.com/api/gateway/global
// Prefer:
//   BLUGATE_GLOBAL_HOST=https://blugate.blurasaga.com/api/gateway/global
//   or BLUGATE_BASE_URL=https://blugate.blurasaga.com  → appends /api/gateway/global

const { resolveGatewayBaseUrl } = require('../blugate.http');

const getGlobalBaseUrl = () => resolveGatewayBaseUrl('global', ['BLUGATE_GLOBAL_HOST']);

module.exports = {
  getGlobalBaseUrl,
};
