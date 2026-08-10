const crypto = require('crypto');
const logger = require('../utils/logger');

const REDACT_KEYS = /^(password|token|secret|authorization|apikey|api_key|access_token|refresh_token)$/i;
const MAX_BODY_LOG_CHARS = 2000;

const redactBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  const clone = Array.isArray(body) ? [] : {};
  for (const [key, value] of Object.entries(body)) {
    clone[key] = REDACT_KEYS.test(key) ? '[REDACTED]' : value;
  }
  return clone;
};

const requestLogger = (req, res, next) => {
  req.id = crypto.randomUUID();
  const start = Date.now();

  let bodyPreview = '';
  try {
    bodyPreview = JSON.stringify(redactBody(req.body));
    if (bodyPreview && bodyPreview.length > MAX_BODY_LOG_CHARS) {
      bodyPreview = `${bodyPreview.slice(0, MAX_BODY_LOG_CHARS)}...[truncated]`;
    }
  } catch (_) {
    bodyPreview = '[unserializable]';
  }

  logger.debug(`[req ${req.id}] --> ${req.method} ${req.originalUrl} ip=${req.ip} body=${bodyPreview}`);

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`[req ${req.id}] <-- ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });

  next();
};

module.exports = requestLogger;
