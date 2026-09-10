/**
 * Shared Blugate gateway HTTP helpers.
 *
 * Auth from platforms table:
 *   Authorization: Bearer <api_key>
 *   x-client-id: <blugate_client_key>
 * Base URL from .env (BLUGATE_*_HOST / BLUGATE_BASE_URL).
 */

const axios = require('axios');
const { decryptPlatformSecret } = require('../../lib/platformSecrets');

const normalizeBaseUrl = (raw) => {
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

/**
 * Resolve gateway base URL for a platform segment (facebook|instagram|youtube|twitter).
 * Prefers BLUGATE_<PLATFORM>_HOST, then BLUGATE_BASE_URL + /api/gateway/<segment>.
 */
const resolveGatewayBaseUrl = (segment, envKeys = []) => {
  for (const key of envKeys) {
    const fromEnv = normalizeBaseUrl(process.env[key]);
    if (fromEnv) return fromEnv;
  }
  const root = normalizeBaseUrl(process.env.BLUGATE_BASE_URL || process.env.BLUGATE_HOST || '');
  if (!root) return '';
  if (new RegExp(`/api/gateway/${segment}/?$`, 'i').test(root)) return root.replace(/\/$/, '');
  if (/\/api\/gateway$/i.test(root)) return `${root}/${segment}`;
  return `${root}/api/gateway/${segment}`;
};

const authFromPlatformRow = (row, platformLabel = 'platform') => {
  if (!row) {
    const err = new Error(
      `${platformLabel} platform not found — add it under Settings → Platforms`
    );
    err.status = 400;
    throw err;
  }
  const accessKey = decryptPlatformSecret(row.api_key);
  const clientId = decryptPlatformSecret(row.blugate_client_key);
  if (!accessKey) {
    const err = new Error(
      `${platformLabel} API key missing. Set API key under Settings → Platforms.`
    );
    err.status = 400;
    throw err;
  }
  if (!clientId) {
    const err = new Error(
      `${platformLabel} Blugate client key missing. Set Blugate client key under Settings → Platforms.`
    );
    err.status = 400;
    throw err;
  }
  return { accessKey, clientId };
};

const formatAxiosError = (err, label, endpointKey) => {
  const status = err.response?.status;
  const data = err.response?.data;
  let detail = '';
  if (typeof data === 'string') detail = data.slice(0, 300);
  else if (data && typeof data === 'object') {
    detail = data.message || data.error || data.detail || JSON.stringify(data).slice(0, 300);
  } else {
    detail = err.message;
  }
  if (/incorrect header check/i.test(String(err.message || ''))) {
    detail = 'Gateway returned a compressed body that could not be decoded.';
  }
  const enriched = new Error(
    status
      ? `Blugate ${label} ${endpointKey} HTTP ${status}: ${detail}`
      : `Blugate ${label} ${endpointKey}: ${detail}`
  );
  enriched.status = status || 502;
  enriched.response = err.response;
  enriched.code = err.code;
  return enriched;
};

/**
 * Call Blugate gateway with Bearer + x-client-id.
 * @param {{ baseUrl: string, path: string, method?: string, params?: object, auth: {accessKey, clientId}, timeout?: number, label?: string, endpointKey?: string }} opts
 */
const blugateRequest = async ({
  baseUrl,
  path,
  method = 'GET',
  params = {},
  auth,
  timeout = 45000,
  label = 'API',
  endpointKey = '',
}) => {
  const accessKey = String(auth?.accessKey || '').trim();
  const clientId = String(auth?.clientId || '').trim();
  if (!accessKey || !clientId) {
    throw new Error(
      'Blugate credentials required: accessKey (api_key) and clientId (blugate_client_key) from platforms table'
    );
  }
  if (!baseUrl) {
    throw new Error(`Blugate ${label} base URL is not configured`);
  }

  const cleanPath = String(path || '');
  const suffix = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  const requestUrl = `${String(baseUrl).replace(/\/$/, '')}${suffix}`;
  const verb = String(method || 'GET').toUpperCase();
  const isBodyMethod = verb !== 'GET' && verb !== 'DELETE' && verb !== 'HEAD';
  const headers = {
    Authorization: `Bearer ${accessKey}`,
    'x-client-id': clientId,
    Accept: 'application/json',
    'Accept-Encoding': 'identity',
  };
  if (isBodyMethod) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await axios({
      method: verb,
      url: requestUrl,
      params: !isBodyMethod ? params : undefined,
      data: isBodyMethod ? params : undefined,
      headers,
      timeout,
      decompress: false,
      responseType: 'text',
      transformResponse: [
        (raw) => {
          if (raw == null || raw === '') return raw;
          if (typeof raw === 'object') return raw;
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
      ],
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return response.data;
  } catch (err) {
    throw formatAxiosError(err, label, endpointKey || verb);
  }
};

module.exports = {
  normalizeBaseUrl,
  resolveGatewayBaseUrl,
  authFromPlatformRow,
  blugateRequest,
};
