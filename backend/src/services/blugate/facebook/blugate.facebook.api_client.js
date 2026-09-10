// Blugate Facebook gateway client.
//
// curl -X GET 'https://blugate.blurasaga.com/api/gateway/facebook/<path>' \
//   -H 'Authorization: Bearer <ACCESS_KEY>' \
//   -H 'x-client-id: <CLIENT_CODE>'

const env = require('./blugate.facebook.env');
const { FACEBOOK_ENDPOINTS } = require('./blugate.facebook.endpoints');
const { authFromPlatformRow, blugateRequest } = require('../blugate.http');

const authFromFacebookPlatform = (row) => authFromPlatformRow(row, 'Facebook');

const callFacebookApi = async (endpointKey, params = {}, auth = null) => {
  const endpoint = FACEBOOK_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown Facebook endpoint "${endpointKey}". Valid keys: ${Object.keys(FACEBOOK_ENDPOINTS).join(', ')}`
    );
  }

  return blugateRequest({
    baseUrl: env.getFacebookBaseUrl(),
    path: endpoint.path,
    method: endpoint.method,
    params,
    auth,
    timeout: Number(process.env.FACEBOOK_API_TIMEOUT_MS) || 45000,
    label: 'Facebook',
    endpointKey,
  });
};

callFacebookApi.authFromPlatformRow = authFromFacebookPlatform;

module.exports = callFacebookApi;
module.exports.authFromPlatformRow = authFromFacebookPlatform;
module.exports.callFacebookApi = callFacebookApi;
