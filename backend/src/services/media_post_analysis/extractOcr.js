const axios = require('axios');
const logger = require('../../lib/logger');

const OCR_BASE_URL = (process.env.OCR_SERVICE_URL || 'http://98.86.63.69:8000').replace(/\/$/, '');
const OCR_MAX_ATTEMPTS = Math.max(1, Number(process.env.OCR_MAX_ATTEMPTS) || 3);

// Video analysis is much more expensive per attempt than image OCR (the service
// downloads + frame-samples + runs a VLM over up to a 60-minute clip, vs. a single
// image inference) and the media queue only runs 2 concurrent jobs -- a stuck video
// request retried 3x at a long timeout could tie up half the queue's capacity for
// a long time. Fewer attempts, shorter default timeout than the theoretical max.
const OCR_VIDEO_MAX_ATTEMPTS = Math.max(1, Number(process.env.OCR_VIDEO_MAX_ATTEMPTS) || 2);
const OCR_VIDEO_TIMEOUT_MS = Math.max(30000, Number(process.env.OCR_VIDEO_TIMEOUT_MS) || 600000);

/**
 * Derives an appropriate Referer header based on image CDN hostname to prevent 403 Forbidden.
 */
function refererFor(url) {
  try {
    const { hostname } = new URL(url);
    if (/instagram\.com|cdninstagram\.com/i.test(hostname)) return 'https://www.instagram.com/';
    if (/fbcdn\.net|facebook\.com/i.test(hostname)) return 'https://www.facebook.com/';
    if (/twimg\.com|twitter\.com|x\.com/i.test(hostname)) return 'https://twitter.com/';
    if (/telegram\.org|t\.me/i.test(hostname)) return 'https://web.telegram.org/';
    return undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Downloads image bytes and converts to base64.
 */
async function downloadImageAsBase64(imageUrl) {
  const referer = refererFor(imageUrl);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; BluraSaga/1.0; +https://blurasaga.com)',
    ...(referer ? { Referer: referer } : {}),
  };

  const resp = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers,
    maxContentLength: 25 * 1024 * 1024, // 25MB max
  });

  return Buffer.from(resp.data).toString('base64');
}

/**
 * Extracts text from an image with retry logic matching sentiment analysis standards.
 * @param {string} imageUrl - The URL of the image to extract text from
 * @param {object} [options]
 * @param {string} [options.postId] - For logging context
 * @returns {Promise<{ success: boolean, data?: object, error?: string, attempts: number }>}
 */
async function extractOcr(imageUrl, { postId = 'unknown' } = {}) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return { success: false, error: 'Invalid or missing image URL', attempts: 0 };
  }

  let base64Image = null;
  try {
    base64Image = await downloadImageAsBase64(imageUrl);
  } catch (downloadErr) {
    logger.warn(`[OCR] Image download failed for post ${postId}: ${downloadErr.message}`);
    return {
      success: false,
      error: `Download failed: ${downloadErr.message}`,
      attempts: 1,
      nonRetryable: downloadErr.response?.status === 404 || downloadErr.response?.status === 403,
    };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await axios.post(
        `${OCR_BASE_URL}/extract`,
        { image_base64: base64Image },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const result = res.data;
      if (result && result.success && result.data) {
        return {
          success: true,
          data: result.data,
          attempts: attempt,
        };
      }

      const errMsg = result?.error || 'OCR service returned success=false';
      throw new Error(errMsg);
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const detail = err.response?.data?.error || err.message;
      const isRetryable =
        !status ||
        status === 429 ||
        status >= 500 ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT';

      logger.warn(
        `[OCR] Attempt ${attempt}/${OCR_MAX_ATTEMPTS} failed for post ${postId}${status ? ` (HTTP ${status})` : ''}: ${detail}`
      );

      if (!isRetryable || attempt >= OCR_MAX_ATTEMPTS) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s...
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return {
    success: false,
    error: lastError?.response?.data?.error || lastError?.message || 'OCR extraction failed',
    attempts: OCR_MAX_ATTEMPTS,
  };
}

/**
 * Sends a video URL to the OCR/video service for scene description + on-screen
 * text extraction. Unlike images, the service fetches the video itself
 * server-side (SSRF-guarded) -- there is no base64/bytes-upload path for video
 * (deliberately not implemented upstream, to avoid huge JSON request bodies),
 * so this only ever sends the URL, never downloads it here.
 * @param {string} videoUrl - direct video file URL (not a thumbnail, not a
 *   platform permalink/watch page)
 * @param {object} [options]
 * @param {string} [options.postId] - for logging context
 * @returns {Promise<{ success: boolean, data?: object, error?: string, attempts: number }>}
 */
async function extractVideo(videoUrl, { postId = 'unknown' } = {}) {
  if (!videoUrl || typeof videoUrl !== 'string') {
    return { success: false, error: 'Invalid or missing video URL', attempts: 0 };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= OCR_VIDEO_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await axios.post(
        `${OCR_BASE_URL}/extract`,
        { video_url: videoUrl },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: OCR_VIDEO_TIMEOUT_MS,
        }
      );

      const result = res.data;
      if (result && result.success && result.data) {
        return { success: true, data: result.data, attempts: attempt };
      }

      const errMsg = result?.error || 'Video analysis service returned success=false';
      throw new Error(errMsg);
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const detail = err.response?.data?.error || err.message;
      const isRetryable =
        !status ||
        status === 429 ||
        status >= 500 ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT';

      logger.warn(
        `[Video] Attempt ${attempt}/${OCR_VIDEO_MAX_ATTEMPTS} failed for post ${postId}${status ? ` (HTTP ${status})` : ''}: ${detail}`
      );

      if (!isRetryable || attempt >= OCR_VIDEO_MAX_ATTEMPTS) {
        break;
      }

      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return {
    success: false,
    error: lastError?.response?.data?.error || lastError?.message || 'Video analysis failed',
    attempts: OCR_VIDEO_MAX_ATTEMPTS,
  };
}

module.exports = {
  extractOcr,
  extractVideo,
  downloadImageAsBase64,
  refererFor,
};
