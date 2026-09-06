const express = require('express');
const logger = require('../utils/logger');
const { authorize } = require('../middleware/auth.middleware');
const { forward, BLUWEB_API_URL } = require('../services/bluwebClient');

const router = express.Router();

router.use(authorize());

const decodeBody = (response) => {
  const contentType = String(response.headers['content-type'] || '');
  const buf = Buffer.from(response.data || []);

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    const text = buf.toString('utf8');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (contentType.startsWith('text/') || contentType.includes('prometheus')) {
    return buf.toString('utf8');
  }

  // Prefer JSON when Bluweb omitted content-type
  const text = buf.toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const proxy = async (req, res) => {
  if (!BLUWEB_API_URL) {
    return res.status(503).json({
      error: {
        code: 'BLUWEB_NOT_CONFIGURED',
        message: 'BLUWEB_API_URL is not configured',
      },
    });
  }

  // Mounted at /api/web-intelligence → forward remaining path (e.g. /health, /api/v1/crawls)
  const targetPath = (req.url || '/').split('?')[0] || '/';

  try {
    const response = await forward({
      method: req.method,
      path: targetPath,
      query: req.query,
      body: req.body,
      headers: req.headers,
    });

    const requestId =
      response.headers['x-request-id'] ||
      response.headers['X-Request-ID'] ||
      null;
    if (requestId) {
      res.setHeader('X-Request-ID', requestId);
    }

    const contentType = response.headers['content-type'];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    if (response.status === 204) {
      return res.status(204).end();
    }

    const payload = decodeBody(response);
    return res.status(response.status || 502).send(payload);
  } catch (error) {
    logger.error('[Bluweb] proxy failed:', error.message);
    return res.status(503).json({
      error: {
        code: 'BLUWEB_UNREACHABLE',
        message: 'Web Intelligence (Bluweb) service is not reachable',
        details: { reason: error.code || error.message },
      },
    });
  }
};

router.use(proxy);

module.exports = router;
