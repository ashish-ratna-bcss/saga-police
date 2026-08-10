const express = require('express');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/authMiddleware');
const { requireAnyPageAccess } = require('../middleware/rbacMiddleware');
const logger = require('../utils/logger');

logger.info('📦 UPLOAD ROUTES LOADED - VERSION: ONPREM-V1');

const router = express.Router();
router.use(protect, requireAnyPageAccess(['/dial-100-incident-reporting', '/grievances', '/person-of-interest']));

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.UPLOAD_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many upload requests, please try again later' }
});
router.use(uploadLimiter);

const STORAGE_DIR = process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', '..', 'storage');
const PUBLIC_BASE = (process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, '');
const UPLOAD_FOLDER = process.env.UPLOAD_FOLDER || 'uploads';

const DEFAULT_PROXY_HOST_SUFFIXES = [
  'amazonaws.com',
  'fbcdn.net',
  'fbsbx.com',
  'facebook.com',
  'cdninstagram.com',
  'instagram.com',
  'twimg.com',
  'googlevideo.com',
  'ytimg.com',
  'ggpht.com',
  'googleusercontent.com',
  'bhaskar-media-storage'
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const buildPublicUrl = (key) =>
  `${PUBLIC_BASE}/files/${key.split('/').map(encodeURIComponent).join('/')}`;

const sanitizeStorageKey = (customKey) => {
  if (customKey == null || customKey === '' || customKey === 'undefined' || customKey === 'null') {
    return null;
  }
  if (typeof customKey !== 'string') {
    throw new Error('Invalid customKey');
  }

  const normalized = path.normalize(customKey).replace(/^(\.\.(\/|\\|$))+/, '');
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    normalized.split(/[/\\]/).includes('..') ||
    normalized.includes('\0')
  ) {
    throw new Error('Invalid customKey');
  }

  return normalized;
};

const getProxyHostAllowlist = () => {
  const fromEnv = (process.env.UPLOAD_PROXY_HOST_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const list = fromEnv.length ? fromEnv : DEFAULT_PROXY_HOST_SUFFIXES.slice();

  try {
    const publicHost = new URL(PUBLIC_BASE).hostname.toLowerCase();
    if (publicHost && !list.includes(publicHost)) list.push(publicHost);
  } catch {
    // ignore invalid PUBLIC_BACKEND_URL
  }

  return list;
};

const isProxyUrlAllowed = (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  return getProxyHostAllowlist().some((suffix) => {
    const needle = suffix.replace(/^\./, '');
    return host === needle || host.endsWith(`.${needle}`) || host.endsWith(needle);
  });
};

const writeBufferToDisk = async (file, customKey = null) => {
  const safeKey = sanitizeStorageKey(customKey);
  const key = safeKey || `${UPLOAD_FOLDER}/${crypto.randomUUID()}-${file.originalname.replace(/\s+/g, '-')}`;

  if (!file.buffer || file.size === 0) {
    throw new Error("Cannot write empty file to storage");
  }

  const absPath = path.join(STORAGE_DIR, key);
  const resolvedStorage = path.resolve(STORAGE_DIR);
  const resolvedFile = path.resolve(absPath);
  if (!resolvedFile.startsWith(resolvedStorage + path.sep) && resolvedFile !== resolvedStorage) {
    throw new Error('Invalid storage path');
  }

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  await fs.promises.writeFile(absPath, file.buffer);

  const url = buildPublicUrl(key);
  const resourceType = file.mimetype?.startsWith('image/') ? 'image' :
    file.mimetype?.startsWith('video/') ? 'video' : 'file';

  return {
    url,
    key,
    resource_type: resourceType,
    original_filename: file.originalname
  };
};

router.post('/s3', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const queryKey = req.query.customKey;
    const headerKey = req.headers['x-s3-key'];
    const bodyKey = req.body.customKey;

    let customKey = queryKey || headerKey || bodyKey;
    if (customKey === 'undefined' || customKey === 'null') customKey = null;

    const uploads = await Promise.all(req.files.map(file => writeBufferToDisk(file, customKey)));
    res.status(200).json({ uploads });
  } catch (error) {
    logger.error('[Upload] ❌ FAILURE:', error);
    const status = error.message === 'Invalid customKey' || error.message === 'Invalid storage path' ? 400 : 500;
    res.status(status).json({ message: 'Upload failed', error: error.message });
  }
});

// Pre-calculate a key/URL for a planned upload (kept for client compatibility)
router.get('/predict', (req, res) => {
  try {
    const { filename } = req.query;
    if (!filename) return res.status(400).json({ message: 'Filename is required' });

    const uuid = crypto.randomUUID();
    const cleanFileName = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_.]/g, '');
    const key = `${UPLOAD_FOLDER}/${uuid}-${cleanFileName}`;
    const url = buildPublicUrl(key);

    res.json({ url, key });
  } catch (error) {
    logger.error('[Upload Predict] Error:', error);
    res.status(500).json({ message: 'Prediction failed', error: error.message });
  }
});

// Proxy endpoint for downloading files to bypass CORS (host allowlisted — SSRF harden)
router.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('URL is required');
    }

    if (!isProxyUrlAllowed(url)) {
      return res.status(400).send('URL host is not allowed');
    }

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: Number(process.env.UPLOAD_PROXY_TIMEOUT_MS || 30000),
      maxRedirects: 3
    });

    const contentType = response.headers['content-type'];
    let filename = url.split('/').pop().split('?')[0];
    if (!filename) filename = 'downloaded-file';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    response.data.pipe(res);
  } catch (error) {
    logger.error('Proxy download error:', error);
    res.status(500).send('Failed to download file');
  }
});

module.exports = router;
