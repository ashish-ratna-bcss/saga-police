const axios = require('axios');

const BLUWEB_API_URL = String(process.env.BLUWEB_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = Math.max(5000, Number(process.env.BLUWEB_TIMEOUT_MS) || 60_000);
const LONG_TIMEOUT_MS = Math.max(DEFAULT_TIMEOUT_MS, Number(process.env.BLUWEB_LONG_TIMEOUT_MS) || 120_000);

const bluwebApi = axios.create({
  baseURL: BLUWEB_API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  validateStatus: () => true,
  responseType: 'arraybuffer',
});

const isLongPath = (path) => {
  const p = String(path || '');
  return (
    p.includes('/preflight') ||
    p.includes('/search/instant') ||
    p.endsWith('/preflight')
  );
};

/**
 * Forward an HTTP request to Bluweb.
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

  return bluwebApi.request(config);
};

module.exports = {
  BLUWEB_API_URL,
  DEFAULT_TIMEOUT_MS,
  LONG_TIMEOUT_MS,
  bluwebApi,
  forward,
};
