/**
 * Keeps provider and system internals out of what people see.
 *
 * Error responses often carry raw text from the layers underneath: gateway URLs, key names, HTTP
 * codes, database errors, file paths, stack traces. None of that helps the person using the app
 * and some of it shows how the system is wired. This module recognises that kind of text and
 * swaps it for a plain sentence. The original goes to the log, so nothing is lost for whoever has
 * to fix it.
 *
 * Messages that are already plain ("Query parameter is required") pass through untouched.
 */
const logger = require('./logger');

const TECHNICAL = [
  /https?:\/\/\S+/i,
  /\b(api[ _-]?key|bearer|access[ _-]?token|secret|client[ _-]?code|key rotation)\b/i,
  /blu\s?gate/i,
  /\bHTTP\s*\d{3}\b/i,
  /status code \d{3}/i,
  /request failed with status/i,
  /\b(ECONN\w+|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up|getaddrinfo|axios|timeout of \d+\s?ms)\b/i,
  /prisma|\bP\d{4}\b|invalid `|relation "[^"]*" does not exist|column "[^"]*" does not exist|syntax error at or near|duplicate key value|violates (foreign|unique|not-null)/i,
  /\n\s+at\s|\b(TypeError|ReferenceError|SyntaxError|RangeError)\b|cannot read propert|is not a function|undefined is not|unexpected token/i,
  /(^|[\s"'(])\/(Users|home|data-migration|var|opt|usr|srv|app)\//,
  /node_modules/,
  /\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/,
  /\b(vllm|qwen|indicocr|ollama|rapidapi|x-rapidapi)\b/i,
];

const isTechnical = (value) => typeof value === 'string' && value.length > 0 && TECHNICAL.some((re) => re.test(value));

const BY_STATUS = {
  400: 'The request could not be completed. Please check what you entered and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do this.',
  404: 'We could not find what you asked for.',
  409: 'This conflicts with information that already exists.',
  413: 'That is too large to upload.',
  422: 'Some of what you entered is not valid. Please check it and try again.',
  429: 'Too many requests. Please try again in a moment.',
};
const SERVER_MESSAGE = 'Something went wrong on our side. Please try again later.';
const UNAVAILABLE = 'Not available right now. Please try again later.';

const friendly = (status) => BY_STATUS[status] || (status >= 500 ? SERVER_MESSAGE : UNAVAILABLE);

const TEXT_KEYS = new Set(['error', 'message', 'detail', 'details', 'reason', 'description', 'msg']);
const LIST_KEYS = new Set(['errors', 'platformErrors', 'platform_errors', 'warnings', 'scanErrors', 'scan_errors']);
const MAX_DEPTH = 5;
const MAX_ITEMS = 300;

/** Returns { value, changed } with technical strings replaced. `force` means: strings here are messages. */
const clean = (value, status, force, depth, originals) => {
  if (typeof value === 'string') {
    if (force && isTechnical(value)) {
      originals.push(value);
      return { value: friendly(status), changed: true };
    }
    return { value, changed: false };
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return { value, changed: false };

  if (Array.isArray(value)) {
    let changed = false;
    const out = value.slice(0, MAX_ITEMS).map((item) => {
      const r = clean(item, status, force, depth + 1, originals);
      if (r.changed) changed = true;
      return r.value;
    });
    return changed ? { value: value.length > MAX_ITEMS ? out.concat(value.slice(MAX_ITEMS)) : out, changed } : { value, changed: false };
  }

  let changed = false;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const isText = TEXT_KEYS.has(k);
    const isList = LIST_KEYS.has(k);
    if (typeof v === 'string') {
      const r = clean(v, status, isText || force, depth + 1, originals);
      out[k] = r.value;
      if (r.changed) changed = true;
    } else if (v && typeof v === 'object') {
      const r = clean(v, status, isList || (isText && true) || (force && !isList && false), depth + 1, originals);
      out[k] = r.value;
      if (r.changed) changed = true;
    } else {
      out[k] = v;
    }
  }
  return changed ? { value: out, changed } : { value, changed: false };
};

/** Sanitise a JSON response body. Error responses are checked in full; others only their error lists. */
const sanitizeBody = (body, status) => {
  const originals = [];
  if (!body || typeof body !== 'object') return { body, changed: false, originals };

  if (status >= 400) {
    const r = clean(body, status, false, 0, originals);
    return { body: r.value, changed: r.changed, originals };
  }

  // Successful responses can still carry per-platform failures (search banners, scan results).
  if (Array.isArray(body)) return { body, changed: false, originals };
  let changed = false;
  let out = body;
  const targets = [body, body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : null].filter(Boolean);
  for (const target of targets) {
    for (const key of Object.keys(target)) {
      if (!LIST_KEYS.has(key)) continue;
      const r = clean(target[key], status || 200, true, 1, originals);
      if (r.changed) {
        if (!changed) out = { ...body, ...(body.data && target === body.data ? { data: { ...body.data } } : {}) };
        if (target === body) out[key] = r.value;
        else out.data[key] = r.value;
        changed = true;
      }
    }
  }
  return { body: out, changed, originals };
};

// Operator-facing diagnostics need the real detail; everything else gets the plain version.
const SKIP_PREFIXES = ['/api/health', '/api/integrations', '/api/blugate', '/api/audit'];

const publicErrorMiddleware = (req, res, next) => {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next();

  const json = res.json.bind(res);
  res.json = (body) => {
    try {
      const result = sanitizeBody(body, res.statusCode);
      if (result.changed) {
        logger.warn(`[PublicError] ${req.method} ${path} -> ${res.statusCode}: ${result.originals.join(' | ').slice(0, 400)}`);
        return json(result.body);
      }
    } catch (err) {
      logger.warn(`[PublicError] could not sanitise ${path}: ${err.message}`);
    }
    return json(body);
  };
  return next();
};

module.exports = { isTechnical, friendly, sanitizeBody, publicErrorMiddleware, UNAVAILABLE };
