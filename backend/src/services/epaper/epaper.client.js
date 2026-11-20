const axios = require('axios');
const FormData = require('form-data');

const EPAPER_URL = String(process.env.EPAPER_URL || '').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = Math.max(5000, Number(process.env.EPAPER_TIMEOUT_MS) || 60_000);
const LONG_TIMEOUT_MS = Math.max(DEFAULT_TIMEOUT_MS, Number(process.env.EPAPER_LONG_TIMEOUT_MS) || 600_000);

const client = axios.create({
  baseURL: EPAPER_URL || undefined,
  timeout: DEFAULT_TIMEOUT_MS,
  validateStatus: () => true,
  responseType: 'arraybuffer',
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
});

const isLongPath = (path) => {
  const p = String(path || '');
  return (
    p.includes('/jobs/upload') ||
    p.includes('/jobs/fetch') ||
    p.includes('/jobs/ingest') ||
    p.includes('/jobs/topic') ||
    p.includes('/daily/collect') ||
    p.includes('/corpus/backfill') ||
    p.includes('/corpus/rescore') ||
    p.includes('/corpus/reclassify')
  );
};

/**
 * Forward an HTTP request to the E-Paper service.
 * @param {{ method: string, path: string, query?: object, body?: any, headers?: object }} opts
 */
const forward = async ({ method, path, query, body, headers = {} }) => {
  if (!EPAPER_URL) {
    const err = new Error('EPAPER_URL is not configured');
    err.code = 'EPAPER_NOT_CONFIGURED';
    throw err;
  }

  const urlPath = path.startsWith('/') ? path : `/${path}`;
  const timeout = isLongPath(urlPath) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  const forwardHeaders = {
    Accept: headers.accept || headers.Accept || '*/*',
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
    if (!config.headers['Content-Type'] && !(body && typeof body.getHeaders === 'function')) {
      config.headers['Content-Type'] = 'application/json';
    }
  }

  return client.request(config);
};

/**
 * Multipart upload → E-Paper /api/jobs/upload
 * @param {{ buffer: Buffer, filename: string, contentType?: string, withText?: boolean }} file
 */
const uploadPage = async ({ buffer, filename, contentType, withText = true }) => {
  if (!EPAPER_URL) {
    const err = new Error('EPAPER_URL is not configured');
    err.code = 'EPAPER_NOT_CONFIGURED';
    throw err;
  }

  const form = new FormData();
  form.append('file', buffer, {
    filename: filename || 'page.jpg',
    contentType: contentType || 'application/octet-stream',
  });
  form.append('with_text', withText ? '1' : '0');

  return client.request({
    method: 'post',
    url: '/api/jobs/upload',
    data: form,
    headers: form.getHeaders(),
    timeout: LONG_TIMEOUT_MS,
  });
};

module.exports = {
  EPAPER_URL,
  DEFAULT_TIMEOUT_MS,
  LONG_TIMEOUT_MS,
  forward,
  uploadPage,
};
