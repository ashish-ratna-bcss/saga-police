// Blugate Instagram gateway client (ig-downloader-api).
//
// curl -X POST 'https://blugate.blurasaga.com/api/gateway/instagram/api/instagram/userInfo' \
//   -H 'Authorization: Bearer <ACCESS_KEY>' \
//   -H 'x-client-id: <CLIENT_CODE>' \
//   -H 'Content-Type: application/json' \
//   -d '{"username":"instagram"}'

const env = require('./blugate.instagram.env');
const { INSTAGRAM_ENDPOINTS } = require('./blugate.instagram.endpoints');
const { authFromPlatformRow, blugateRequest } = require('../blugate.http');

const authFromInstagramPlatform = (row) => authFromPlatformRow(row, 'Instagram');

const callInstagramApi = async (endpointKey, body = {}, auth = null) => {
  const endpoint = INSTAGRAM_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown Instagram endpoint "${endpointKey}". Valid keys: ${Object.keys(INSTAGRAM_ENDPOINTS).join(', ')}`
    );
  }

  return blugateRequest({
    baseUrl: env.getInstagramBaseUrl(),
    path: endpoint.path,
    method: endpoint.method,
    params: body,
    auth,
    timeout: Number(process.env.INSTAGRAM_API_TIMEOUT_MS) || 60000,
    label: 'Instagram',
    endpointKey,
  });
};

callInstagramApi.authFromPlatformRow = authFromInstagramPlatform;

module.exports = callInstagramApi;
module.exports.authFromPlatformRow = authFromInstagramPlatform;
module.exports.callInstagramApi = callInstagramApi;
