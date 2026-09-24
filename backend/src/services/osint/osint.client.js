const axios = require('axios');

const OSINT_API_URL = String(process.env.OSINT_API_URL || 'http://100.49.109.96:8000/osint').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = Math.max(5000, Number(process.env.OSINT_TIMEOUT_MS) || 60_000);
const LONG_TIMEOUT_MS = Math.max(DEFAULT_TIMEOUT_MS, Number(process.env.OSINT_LONG_TIMEOUT_MS) || 300_000); // 5 mins for investigations

const osintApi = axios.create({
  baseURL: OSINT_API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  validateStatus: () => true,
  responseType: 'arraybuffer',
});

const isLongPath = (path) => {
  const p = String(path || '');
  return (
    p.includes('/investigations') ||
    p.includes('/lookup') ||
    p.includes('/search')
  );
};

/**
 * Forward an HTTP request to OSINT Unified API.
 * @param {{ method: string, path: string, query?: object, body?: any, headers?: object }} opts
 */
const forward = async ({ method, path, query, body, headers = {} }) => {
  const urlPath = path.startsWith('/') ? path : `/${path}`;
  const timeout = isLongPath(urlPath) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  const forwardHeaders = {
    Accept: headers.accept || headers.Accept || 'application/json',
  };
  if (headers['content-type'] || headers['Content-Type']) {
    forwardHeaders['Content-Type'] = headers['content-type'] || headers['Content-Type'];
  }
  if (headers['x-request-id'] || headers['X-Request-ID']) {
    forwardHeaders['X-Request-ID'] = headers['x-request-id'] || headers['X-Request-ID'];
  }
  
  // Forward tenant behavior for auditing if unified API tracks it
  if (headers['x-tenant-id'] || headers['X-Tenant-ID']) {
    forwardHeaders['X-Tenant-ID'] = headers['x-tenant-id'] || headers['X-Tenant-ID'];
  }
  if (headers['x-user-id'] || headers['X-User-ID']) {
    forwardHeaders['X-User-ID'] = headers['x-user-id'] || headers['X-User-ID'];
  }

  const config = {
    method: (method || 'GET').toLowerCase(),
    url: urlPath,
    params: query,
    timeout,
    headers: forwardHeaders,
  };

  if (body !== undefined && !['get', 'head'].includes(config.method)) {
    config.data = body;
    if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json';
    }
  }

  return osintApi.request(config);
};

module.exports = {
  OSINT_API_URL,
  DEFAULT_TIMEOUT_MS,
  LONG_TIMEOUT_MS,
  osintApi,
  forward,
};
