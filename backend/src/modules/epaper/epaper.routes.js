const express = require('express');
const multer = require('multer');
const logger = require('../../lib/logger');
const { authorize } = require('../../middleware/auth.middleware');
const { forward, uploadPage, EPAPER_URL } = require('../../services/epaper');
const postsService = require('./epaper.posts.service');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

router.use(authorize());

// ── Posts saved in this tenant's database (any signed-in user) ─────────────
const postsError = (res, error, fallback) => {
  logger.error(`[E-Paper] ${fallback}:`, error.message);
  if (error.code === 'EPAPER_NOT_CONFIGURED') {
    return res.status(503).json({ error: { code: error.code, message: 'E-Paper is not configured' } });
  }
  if (error.code === 'NO_TENANT_DB') return res.status(400).json({ message: error.message });
  return res.status(error.status || 500).json({ message: error.message || fallback });
};

router.get('/posts', async (req, res) => {
  try {
    const out = await postsService.listPosts({
      db: req.tenantPrisma,
      q: req.query.q,
      paper: req.query.paper,
      category: req.query.category,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
      page: req.query.page,
      perPage: req.query.per_page,
    });
    return res.json(out);
  } catch (error) {
    return postsError(res, error, 'could not list posts');
  }
});

router.get('/posts/:id', async (req, res) => {
  try {
    const post = await postsService.getPost({ db: req.tenantPrisma, id: req.params.id });
    if (!post) return res.status(404).json({ message: 'Post not found' });
    return res.json(post);
  } catch (error) {
    return postsError(res, error, 'could not load post');
  }
});

/** Fetch posts from the E-Paper service for the chosen filters, save them all, return them. */
router.post('/posts/fetch', async (req, res) => {
  try {
    const b = req.body || {};
    const out = await postsService.fetchAndSave({
      db: req.tenantPrisma,
      userId: req.user?.id,
      paper: b.paper,
      dateFrom: b.date_from,
      dateTo: b.date_to,
      category: b.category,
      q: b.q,
      limit: b.limit,
    });
    return res.json(out);
  } catch (error) {
    return postsError(res, error, 'could not fetch posts');
  }
});

// Reading the corpus is open to any signed-in user; anything that changes it
// (upload, collect, sources, categories, deleting jobs) is admin-only.
router.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const role = req.user?.role;
  if (role === 'admin' || role === 'superadmin') return next();
  return res.status(403).json({
    error: { code: 'FORBIDDEN', message: 'Only admins can change E-Paper data' },
  });
});

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

  const text = buf.toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const sendUpstream = (res, response) => {
  const requestId =
    response.headers['x-request-id'] || response.headers['X-Request-ID'] || null;
  if (requestId) res.setHeader('X-Request-ID', requestId);

  const contentType = response.headers['content-type'];
  if (contentType) res.setHeader('Content-Type', contentType);

  if (response.status === 204) return res.status(204).end();

  // Binary media (images, PDF crops) — stream buffer as-is
  if (
    contentType &&
    (contentType.startsWith('image/') ||
      contentType.startsWith('application/pdf') ||
      contentType.startsWith('application/octet-stream'))
  ) {
    return res.status(response.status || 200).send(Buffer.from(response.data || []));
  }

  const payload = decodeBody(response);
  return res.status(response.status || 502).send(payload);
};

const notConfigured = (res) =>
  res.status(503).json({
    error: {
      code: 'EPAPER_NOT_CONFIGURED',
      message: 'EPAPER_URL is not configured',
    },
  });

/** Dedicated multipart path — multer + form-data to upstream. */
router.post('/api/jobs/upload', upload.single('file'), async (req, res) => {
  if (!EPAPER_URL) return notConfigured(res);
  if (!req.file) {
    return res.status(400).json({
      error: { code: 'NO_FILE', message: 'file is required' },
    });
  }

  try {
    const withText = String(req.body?.with_text ?? '1') !== '0';
    const response = await uploadPage({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      withText,
    });
    return sendUpstream(res, response);
  } catch (error) {
    logger.error('[E-Paper] upload failed:', error.message);
    return res.status(503).json({
      error: {
        code: 'EPAPER_UNREACHABLE',
        message: 'E-Paper service is not reachable',
        details: { reason: error.code || error.message },
      },
    });
  }
});

/** Catch-all proxy: /api/epaper/* → EPAPER_URL/* */
const proxy = async (req, res) => {
  if (!EPAPER_URL) return notConfigured(res);

  const targetPath = (req.url || '/').split('?')[0] || '/';

  try {
    const response = await forward({
      method: req.method,
      path: targetPath,
      query: req.query,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      headers: req.headers,
    });
    return sendUpstream(res, response);
  } catch (error) {
    if (error.code === 'EPAPER_NOT_CONFIGURED') return notConfigured(res);
    logger.error('[E-Paper] proxy failed:', error.message);
    return res.status(503).json({
      error: {
        code: 'EPAPER_UNREACHABLE',
        message: 'E-Paper service is not reachable',
        details: { reason: error.code || error.message },
      },
    });
  }
};

router.use(proxy);

module.exports = router;
