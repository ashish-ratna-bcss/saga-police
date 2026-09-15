/**
 * Media download helpers — fetch remote CDN media server-side and expose
 * same-origin /files/... URLs so the browser can save them (CORS bypass).
 * Page URLs (YouTube / Facebook / Instagram) are fetched via yt-dlp when available.
 */
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
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
const YT_DLP_BIN = process.env.YT_DLP_PATH || 'yt-dlp';

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
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'googlevideo.com',
  'ytimg.com',
  'ggpht.com',
  'googleusercontent.com',
  'bhaskar-media-storage',
  'pinimg.com',
  'tiktokcdn.com',
];

const PAGE_HOST_RE =
  /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|facebook\.com|fb\.watch|instagram\.com|x\.com|twitter\.com)$/i;
const DIRECT_MEDIA_RE = /\.(mp4|webm|mkv|mov|m4v|avi|jpe?g|png|gif|webp)(\?|$)/i;

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

const isPageMediaUrl = (rawUrl) => {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (DIRECT_MEDIA_RE.test(parsed.pathname)) return false;
    return PAGE_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
};

const isLikelyDirectMediaUrl = (rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url) return false;
  if (DIRECT_MEDIA_RE.test(url)) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes('fbcdn.net') ||
      host.includes('cdninstagram.com') ||
      host.includes('twimg.com') ||
      host.includes('googlevideo.com') ||
      host.includes('amazonaws.com') ||
      host.includes('tiktokcdn.com')
    );
  } catch {
    return false;
  }
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
    if (host.includes('youtube') || host.includes('googlevideo') || host.includes('ytimg')) {
      return 'https://www.youtube.com/';
    }
  } catch {
    // ignore
  }
  return undefined;
};

const storeBufferAsFile = async (buffer, { kind = 'file', index = 1, ext = 'bin', contentType = 'application/octet-stream' } = {}) => {
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

const fetchAndStore = async (rawUrl, { kind = 'file', index = 1 } = {}) => {
  const url = String(rawUrl || '').trim();
  if (!url) throw Object.assign(new Error('URL is required'), { status: 400 });
  if (!isUrlAllowed(url)) throw Object.assign(new Error('URL host is not allowed'), { status: 400 });

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
  return storeBufferAsFile(buffer, { kind, index, ext, contentType });
};

const runYtDlp = (args, { timeoutMs = 180000 } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(YT_DLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Object.assign(new Error('yt-dlp timed out'), { status: 504 }));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(Object.assign(new Error('yt-dlp is not installed on the server'), { status: 501 }));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error((stderr || stdout || 'yt-dlp failed').trim().slice(0, 500)), { status: 422 }));
    });
  });

const downloadPageWithYtDlp = async (rawUrl, { kind = 'video', index = 1 } = {}) => {
  const url = String(rawUrl || '').trim();
  if (!url) throw Object.assign(new Error('URL is required'), { status: 400 });
  if (!isUrlAllowed(url)) throw Object.assign(new Error('URL host is not allowed'), { status: 400 });

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'blura-media-'));
  const outTemplate = path.join(tmpDir, 'media.%(ext)s');
  try {
    await runYtDlp([
      '--no-update',
      '--no-playlist',
      '--no-warnings',
      '-f',
      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
      '--merge-output-format',
      'mp4',
      '-o',
      outTemplate,
      url,
    ]);

    const files = (await fs.promises.readdir(tmpDir)).filter((name) => !name.startsWith('.'));
    if (!files.length) {
      throw Object.assign(new Error('yt-dlp produced no file'), { status: 422 });
    }
    const preferred =
      files.find((name) => name.endsWith('.mp4')) ||
      files.find((name) => name.endsWith('.webm')) ||
      files[0];
    const absTmp = path.join(tmpDir, preferred);
    const buffer = await fs.promises.readFile(absTmp);
    const ext = preferred.split('.').pop() || 'mp4';
    return storeBufferAsFile(buffer, {
      kind,
      index,
      ext,
      contentType: ext === 'mp4' ? 'video/mp4' : `video/${ext}`,
    });
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
};

const downloadMediaUrl = async (rawUrl, { kind = 'video', index = 1 } = {}) => {
  const url = String(rawUrl || '').trim();
  if (!url) throw Object.assign(new Error('URL is required'), { status: 400 });

  if (isPageMediaUrl(url) || !isLikelyDirectMediaUrl(url)) {
    try {
      return await downloadPageWithYtDlp(url, { kind, index });
    } catch (err) {
      // Fall through to direct fetch for CDN-like URLs that failed page detection.
      if (isPageMediaUrl(url)) throw err;
      logger.warn(`[media] yt-dlp failed, trying direct fetch: ${err.message}`);
    }
  }
  return fetchAndStore(url, { kind, index });
};

const pickBestVideoUrl = (body = {}) => {
  const candidates = [
    ...(Array.isArray(body.video_urls) ? body.video_urls : []),
    body.media_url,
    body.url,
    ...(Array.isArray(body.media_items)
      ? body.media_items.flatMap((item) => [item?.s3_url, item?.url, item?.preview])
      : []),
  ]
    .map((u) => String(u || '').trim())
    .filter(Boolean);

  const direct = candidates.find((u) => isLikelyDirectMediaUrl(u) && isUrlAllowed(u));
  if (direct) return direct;
  return candidates.find((u) => isUrlAllowed(u)) || candidates[0] || '';
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
    const mediaUrl = pickBestVideoUrl(req.body);
    if (!mediaUrl) {
      return res.status(400).json({ error: 'media_url required' });
    }

    const item = await downloadMediaUrl(mediaUrl, { kind: 'video', index: 1 });
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

router.post('/download', async (req, res) => {
  try {
    const mediaUrl = pickBestVideoUrl(req.body);
    if (!mediaUrl) {
      return res.status(400).json({ error: 'media_url required' });
    }
    const kind = isLikelyDirectMediaUrl(mediaUrl) && DIRECT_MEDIA_RE.test(mediaUrl) && !/\.(mp4|webm|mkv|mov|m4v)(\?|$)/i.test(mediaUrl)
      ? 'image'
      : 'video';
    const item = await downloadMediaUrl(mediaUrl, { kind, index: 1 });
    return res.json({
      download_url: item.download_url,
      filename: item.filename,
      items: [item],
    });
  } catch (error) {
    const status = error.status || 500;
    logger.error(`[media] download: ${error.message}`);
    return res.status(status).json({ error: error.message || 'Failed to download media' });
  }
});

module.exports = router;
