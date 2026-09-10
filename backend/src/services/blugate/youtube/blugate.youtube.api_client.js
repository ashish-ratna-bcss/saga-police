// Blugate YouTube gateway client.
//
// curl -X GET 'https://blugate.blurasaga.com/api/gateway/youtube/videos?part=snippet&id=VIDEO_ID' \
//   -H 'Authorization: Bearer <ACCESS_KEY>' \
//   -H 'x-client-id: <CLIENT_CODE>'

const env = require('./blugate.youtube.env');
const { YOUTUBE_ENDPOINTS } = require('./blugate.youtube.endpoints');
const { authFromPlatformRow, blugateRequest } = require('../blugate.http');

const authFromYouTubePlatform = (row) => authFromPlatformRow(row, 'YouTube');

const callYouTubeApi = async (endpointKey, params = {}, auth = null) => {
  const endpoint = YOUTUBE_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown YouTube endpoint "${endpointKey}". Valid keys: ${Object.keys(YOUTUBE_ENDPOINTS).join(', ')}`
    );
  }

  return blugateRequest({
    baseUrl: env.getYouTubeBaseUrl(),
    path: endpoint.path,
    method: endpoint.method,
    params,
    auth,
    timeout: Number(process.env.YOUTUBE_API_TIMEOUT_MS) || 45000,
    label: 'YouTube',
    endpointKey,
  });
};

callYouTubeApi.authFromPlatformRow = authFromYouTubePlatform;

module.exports = callYouTubeApi;
module.exports.authFromPlatformRow = authFromYouTubePlatform;
module.exports.callYouTubeApi = callYouTubeApi;
