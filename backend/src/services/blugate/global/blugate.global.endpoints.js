// Catalog of the Blugate "global" (client-account-level) endpoints, mirrored from
// blugateapis/global-blugate-documentation.json. Unlike the per-platform endpoint
// catalogs, these aren't scraped provider data — they're BluGate's own client API:
// account status, every platform's health, and live billing/quota consumption.
// blugate.global.api_client.js looks these up by key to build and send the request.

const GLOBAL_ENDPOINTS = {
  HEALTH: {
    method: 'GET',
    path: '/health',
    usedFor: 'Client account status, system operational health, and per-platform health states',
    params: [],
  },
  BILLING: {
    method: 'GET',
    path: '/billing',
    usedFor: 'Real-time billing consumption, per-platform consumed requests, quota limits, and rate limits',
    params: [],
  },
};

module.exports = { GLOBAL_ENDPOINTS };
