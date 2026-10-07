// Blugate News Articles gateway client.
//
// curl -X GET 'https://blugate.blurasaga.com/api/gateway/news-api/news/articles?state=Telangana&limit=10' \
//   -H 'Authorization: Bearer <ACCESS_KEY>' \
//   -H 'x-client-id: <CLIENT_CODE>'
//
// Base URL: .env (BLUGATE_NEWS_HOST / BLUGATE_BASE_URL), defaulting to the production gateway.
// ACCESS_KEY / CLIENT_CODE: the shared BluGate client account — resolve with
// resolveGlobalAuth() from the global client, since news isn't tied to one platform row.

const env = require('./blugate.news.env');
const { NEWS_ENDPOINTS } = require('./blugate.news.endpoints');
const { blugateRequest } = require('../blugate.http');

const DEFAULT_TIMEOUT_MS = 30000;

const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

/** Repeated query keys (?country=a&country=b) arrive as arrays; the API wants one comma list. */
const toParamValue = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(',');
  if (value == null) return '';
  return String(value).trim();
};

/**
 * Call a news-api endpoint by catalog key. Only params declared in the catalog are sent;
 * path params ({article_id}) are substituted into the route.
 */
const callNewsApi = async (endpointKey, params = {}, auth = null) => {
  const endpoint = NEWS_ENDPOINTS[endpointKey];
  if (!endpoint) {
    throw new Error(
      `Unknown Blugate news endpoint "${endpointKey}". Valid keys: ${Object.keys(NEWS_ENDPOINTS).join(', ')}`
    );
  }

  let path = endpoint.path;
  const query = {};
  for (const param of endpoint.params) {
    const value = toParamValue(params[param.name]);
    if (!value) {
      if (param.required) throw badRequest(`Missing required parameter "${param.name}"`);
      continue;
    }
    if (param.in === 'path') {
      path = path.replace(`{${param.name}}`, encodeURIComponent(value));
    } else {
      query[param.name] = value;
    }
  }

  return blugateRequest({
    baseUrl: env.getNewsBaseUrl(),
    path,
    method: endpoint.method,
    params: query,
    auth,
    label: 'News',
    endpointKey,
    timeout: endpoint.timeout || DEFAULT_TIMEOUT_MS,
  });
};

module.exports = { callNewsApi };
