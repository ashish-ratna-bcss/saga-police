// Blugate global (client-account) gateway client.
//
// curl -X GET 'https://blugate.blurasaga.com/api/gateway/global/health' \
//   -H 'Authorization: Bearer <ACCESS_KEY>' \
//   -H 'x-client-id: <CLIENT_CODE>'
//
// Base URL: .env (BLUGATE_GLOBAL_HOST / BLUGATE_BASE_URL)
// ACCESS_KEY / CLIENT_CODE: platforms.api_key + platforms.blugate_client_key (tenant DB).
// Unlike the per-platform clients, this isn't tied to one platform row — BluGate uses a
// single client account across every platform gateway, so any configured row's
// credentials work here. resolveGlobalAuth() picks the first one that has both set.

const env = require('./blugate.global.env');
const { GLOBAL_ENDPOINTS } = require('./blugate.global.endpoints');
const { authFromPlatformRow, blugateRequest } = require('../blugate.http');

/** Finds any platform row with Blugate credentials configured, for the shared client account. */
const resolveGlobalAuth = async (db) => {
  if (!db) return null;
  const row = await db.platforms.findFirst({
    where: { api_key: { not: null }, blugate_client_key: { not: null } },
  });
  if (!row) return null;
  try {
    return authFromPlatformRow(row, 'Blugate');
  } catch {
    return null;
  }
};

const callGlobalApi = async (endpointKey, params = {}, auth = null) => {
  const endpoint = GLOBAL_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown Blugate global endpoint "${endpointKey}". Valid keys: ${Object.keys(GLOBAL_ENDPOINTS).join(', ')}`
    );
  }

  const baseUrl = env.getGlobalBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'Blugate global base URL is not configured (set BLUGATE_GLOBAL_HOST or BLUGATE_BASE_URL)'
    );
  }

  return blugateRequest({
    baseUrl,
    path: endpoint.path,
    method: endpoint.method,
    params,
    auth,
    label: 'Global',
    endpointKey,
    timeout: Number(process.env.BLUGATE_GLOBAL_TIMEOUT_MS) || 6000,
  });
};

module.exports = { callGlobalApi, resolveGlobalAuth };
