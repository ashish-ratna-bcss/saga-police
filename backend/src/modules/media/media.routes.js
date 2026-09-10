/**
 * Media download helpers — fetch remote CDN media server-side and expose
 * same-origin /files/... URLs so the browser can save them (CORS bypass).
 */
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { authorize } = require('../../middleware/auth.middleware');
const logger = require('../../lib/logger');

const router = express.Router();
router.use(authorize());

const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MEDIA_DOWNLOAD_RATE_LIMIT_MAX || 80),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many media download requests, try again later' },
});
router.use(downloadLimiter);

const STORAGE_DIR = process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', '..', '..', 'storage');
const PUBLIC_BASE = (process.env.PUBLIC_BACKEND_URL || '').replace(/\/+$/, '');
const DOWNLOAD_FOLDER = process.env.MEDIA_DOWNLOAD_FOLDER || 'downloads';

const DEFAULT_HOST_SUFFIXES = [
  'amazonaws.com',
  'fbcdn.net',
  'fbsbx.com',
  'facebook.com',
  'cdninstagram.com',
  'instagram.com',
  'twimg.com',
  'video.twimg.com',
  'x.com',
  'twitter.com',
  't.co',
  'googlevideo.com',
  'ytimg.com',
  'ggpht.com',
  'googleusercontent.com',
  'bhaskar-media-storage',
  'pinimg.com',
  'tiktokcdn.com',
];

const buildPublicUrl = (key) => {
  const pathPart = `/files/${key.split('/').map(encodeURIComponent).join('/')}`;
  return PUBLIC_BASE ? `${PUBLIC_BASE}${pathPart}` : pathPart;
};

const getHostAllowlist = () => {
  const fromEnv = (process.env.UPLOAD_PROXY_HOST_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const list = fromEnv.length ? fromEnv : DEFAULT_HOST_SUFFIXES.slice();
  try {
    const publicHost = new URL(PUBLIC_BASE).hostname.toLowerCase();
    if (publicHost && !list.includes(publicHost)) list.push(publicHost);
  } catch {
    // ignore
  }
  return list;
};

const isUrlAllowed = (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return getHostAllowlist().some((suffix) => {
    const needle = suffix.replace(/^\./, '');
    return host === needle || host.endsWith(`.${needle}`) || host.endsWith(needle);
  });
};

const guessExt = (url, contentType, fallback) => {
  const fromUrl = String(url || '').split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (fromUrl) return fromUrl.toLowerCase();
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('mp4')) return 'mp4';
  if (ct.includes('webm')) return 'webm';
  if (ct.includes('quicktime')) return 'mov';
  return fallback;
};

const refererFor = (url) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('fbcdn') || host.includes('facebook')) return 'https://www.facebook.com/';
    if (host.includes('cdninstagram') || host.includes('instagram')) return 'https://www.instagram.com/';
    if (host.includes('twimg') || host.includes('twitter') || host.includes('x.com')) return 'https://x.com/';
  } catch {
    // ignore
  }
  return undefined;
};

const fetchAndStore = async (rawUrl, { kind = 'file', index = 1 } = {}) => {
  const url = String(rawUrl || '').trim();
  if (!url) throw Object.assign(new Error('URL is required'), { status: 400 });
  if (!isUrlAllowed(url)) throw Object.assign(new Error('URL host is not allowed'), { status: 400 });

  // Prefer original quality for Twitter stills
  let fetchUrl = url;
  if (fetchUrl.includes('pbs.twimg.com') && !/[?&]name=/.test(fetchUrl)) {
    fetchUrl += `${fetchUrl.includes('?') ? '&' : '?'}name=orig`;
  }

  const response = await axios({
    method: 'GET',
    url: fetchUrl,
    responseType: 'arraybuffer',
    timeout: Number(process.env.MEDIA_DOWNLOAD_TIMEOUT_MS || 60000),
    maxRedirects: 5,
    maxContentLength: Number(process.env.MEDIA_DOWNLOAD_MAX_BYTES || 120 * 1024 * 1024),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; BluraSaga/1.0; +https://blurasaga.com)',
      ...(refererFor(fetchUrl) ? { Referer: refererFor(fetchUrl) } : {}),
      Accept: '*/*',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const contentType = response.headers['content-type'] || 'application/octet-stream';
  if (String(contentType).toLowerCase().includes('text/html')) {
    throw Object.assign(new Error('Remote URL returned HTML, not media'), { status: 422 });
  }

  const buffer = Buffer.from(response.data);
  if (!buffer.length) {
    throw Object.assign(new Error('Empty media response'), { status: 422 });
  }

  const fallback = kind === 'video' ? 'mp4' : 'jpg';
  const ext = guessExt(fetchUrl, contentType, fallback);
  const filename = `${kind}_${index}_${Date.now()}.${ext}`;
  const key = `${DOWNLOAD_FOLDER}/${crypto.randomUUID()}-${filename}`;
  const absPath = path.join(STORAGE_DIR, key);
  const resolvedStorage = path.resolve(STORAGE_DIR);
  const resolvedFile = path.resolve(absPath);
  if (!resolvedFile.startsWith(resolvedStorage + path.sep)) {
    throw Object.assign(new Error('Invalid storage path'), { status: 400 });
  }

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  await fs.promises.writeFile(absPath, buffer);

  return {
    download_url: buildPublicUrl(key),
    filename,
    content_type: contentType,
    bytes: buffer.length,
  };
};

router.post('/download-images', async (req, res) => {
  try {
    const urls = Array.isArray(req.body?.image_urls)
      ? req.body.image_urls.map(String).filter(Boolean)
      : [];
    if (!urls.length) {
      return res.status(400).json({ error: 'image_urls required' });
    }

    const items = [];
    const errors = [];
    for (let i = 0; i < urls.length; i += 1) {
      try {
        items.push(await fetchAndStore(urls[i], { kind: 'image', index: i + 1 }));
      } catch (err) {
        logger.warn(`[media] image download failed: ${err.message}`);
        errors.push({ url: urls[i], error: err.message });
      }
    }

    if (!items.length) {
      return res.status(422).json({
        error: errors[0]?.error || 'Failed to download images',
        errors,
      });
    }

    return res.json({ items, errors });
  } catch (error) {
    logger.error('[media] download-images:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to download images' });
  }
});

router.post('/download-video', async (req, res) => {
  try {
    const mediaUrl = String(req.body?.media_url || req.body?.url || '').trim();
    if (!mediaUrl) {
      return res.status(400).json({ error: 'media_url required' });
    }

    const item = await fetchAndStore(mediaUrl, { kind: 'video', index: 1 });
    return res.json({
      download_url: item.download_url,
      filename: item.filename,
      items: [item],
    });
  } catch (error) {
    const status = error.status || 500;
    logger.error(`[media] download-video: ${error.message}`);
    return res.status(status).json({ error: error.message || 'Failed to download video' });
  }
});

module.exports = router;
