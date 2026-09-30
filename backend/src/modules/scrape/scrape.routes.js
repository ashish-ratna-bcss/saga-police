const express = require('express');
const logger = require('../../lib/logger');
const { authorize } = require('../../middleware/auth.middleware');
const { forward, SCRAPE_API_URL } = require('../../services/scrape');

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

  // Prefer JSON when content-type is missing
  const text = buf.toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const proxy = async (req, res) => {
  if (!SCRAPE_API_URL) {
    return res.status(503).json({
      error: {
        code: 'SCRAPE_NOT_CONFIGURED',
        message: 'SCRAPE_API_URL is not configured',
      },
    });
  }

  // Mounted at /api/scrape → forward remaining path (e.g. /health, /api/v1/crawls)
  const targetPath = (req.url || '/').split('?')[0] || '/';

  try {
    const response = await forward({
      method: req.method,
      path: targetPath,
      query: req.query,
      body: req.body,
      headers: {
        ...req.headers,
        // Optional: Pass through user information to unified API if needed
        'X-User-ID': req.user?.id,
        'X-Tenant-ID': req.tenant?.id,
      },
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
    logger.error('[Scrape] proxy failed:', error.message);
    return res.status(503).json({
      error: {
        code: 'SCRAPE_UNREACHABLE',
        message: 'Scrape service is not reachable',
        details: { reason: error.code || error.message },
      },
    });
  }
};

router.use(proxy);

module.exports = router;
