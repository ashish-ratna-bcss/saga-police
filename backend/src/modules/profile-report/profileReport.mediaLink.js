/**
 * Tools → Profile Report: showing a post's video.
 *
 * A platform's video links are signed and short-lived: an Instagram link carries its own expiry (`oe=`), a day or two after it was
 * issued (two real links for one post expired 48 hours apart, both at 15:19:05 UTC), and after that the platform answers 403. So a
 * link that played when the post was collected does not play a few days later, in a browser or anywhere else. Checked live: with an
 * expired link the platform answered 403, the provider's MEDIA_BY_SHORTCODE gave a fresh link in under 3 seconds, and the full video came through. The app therefore serves the video itself: it opens the stored link, and when the platform
 * refuses it (403, 404, 410) it asks the data provider for a fresh link to the same post, keeps that link for next time, and passes
 * the video on. Only Instagram has a call for one post (MEDIA_BY_SHORTCODE); for other platforms a refused link stays refused.
 *
 * The link always comes from the saved post, never from the request, so the endpoint cannot be pointed at an arbitrary address;
 * it must also be https, on a host name (not an IP address).
 */
const axios = require('axios');
const logger = require('../../lib/logger');
const store = require('./profileReport.store');
const { authForPlatform } = require('../../services/blugate/authForPlatform');
const { refererFor } = require('../../services/media_post_analysis/extractOcr');
const media = require('../../services/media_post_analysis/analyzeMediaPost');

const MAX_BYTES = () => Math.max(5, Number(process.env.PROFILE_REPORT_VIDEO_SERVE_MAX_MB) || 150) * 1024 * 1024;
const REFUSED = [401, 403, 404, 410];
/** A post's link is refreshed at most this often, and the provider is not asked more than once every few seconds (its quota is shared and limited). */
const PER_POST_COOLDOWN_MS = 10 * 60 * 1000;
const GAP_MS = 3000;
const recent = new Map();
let lastAsk = 0;

const videoUrlOf = (post) => media.extractFirstVideoUrl({ media_urls: Array.isArray(post && post.media_urls) ? post.media_urls : [] });

/** https, on a host name: never an address typed as numbers, localhost or an internal name. */
const isSafeUrl = (value) => {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname;
    return !(/^(localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(h) || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':') || !h.includes('.'));
  } catch (e) {
    return false;
  }
};

const VIDEO_FILE = /\.(mp4|m4v|mov|webm)(\?|$)/i;
/**
 * The video file link in a provider's answer for one post. The shape was not captured from the live service (its quota was spent
 * when this was written), so it is searched for rather than read from a fixed place: the usual `video_versions[0].url` of an
 * Instagram item first, then a few common names, then any link to a video file, wherever it is.
 */
const findVideoUrl = (value, depth = 0) => {
  if (value == null || depth > 8) return null;
  if (Array.isArray(value)) {
    for (const x of value) { const r = findVideoUrl(x, depth + 1); if (r) return r; }
    return null;
  }
  if (typeof value !== 'object') return null;
  const v0 = Array.isArray(value.video_versions) ? value.video_versions[0] : null;
  if (v0 && typeof v0.url === 'string') return v0.url;
  for (const k of ['video_url', 'videoUrl', 'download_url', 'downloadUrl', 'url', 'src']) {
    if (typeof value[k] === 'string' && VIDEO_FILE.test(value[k])) return value[k];
  }
  for (const x of Object.values(value)) { const r = findVideoUrl(x, depth + 1); if (r) return r; }
  return null;
};

/** A fresh link to the post's video from the data provider, or null (not supported for the platform, refused, rate-limited, or not found). */
const freshVideoUrl = async (prisma, dbName, post) => {
  if (String(post.platform).toLowerCase() !== 'instagram' || !post.external_id) return null;
  const now = Date.now();
  if (now - (recent.get(post.id) || 0) < PER_POST_COOLDOWN_MS || now - lastAsk < GAP_MS) return null;
  recent.set(post.id, now);
  if (recent.size > 2000) recent.clear();
  lastAsk = now;
  try {
    const row = await prisma.platforms.findFirst({ where: { slug: 'instagram' } });
    const auth = authForPlatform(row, { tenantKey: dbName });
    const call = require('../../services/blugate/instagram/blugate.instagram.api_client');   // eslint-disable-line global-require
    const answer = await call('MEDIA_BY_SHORTCODE', { shortcode: post.external_id }, auth);
    const url = findVideoUrl(answer);
    return url && isSafeUrl(url) ? url : null;
  } catch (err) {
    logger.warn(`[ProfileReport] fresh video link for post ${post.id} not available: ${String(err.response?.status || err.message).slice(0, 80)}`);
    return null;
  }
};

const deps = {
  get: (url, opts) => axios.get(url, opts),
  fresh: freshVideoUrl,
};

const open = (url) => deps.get(url, {
  responseType: 'stream', timeout: 30000, maxRedirects: 3, validateStatus: () => true,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BluraSaga/1.0; +https://blurasaga.com)', ...(refererFor(url) ? { Referer: refererFor(url) } : {}) },
});

const fail = (status, message) => ({ ok: false, status, message });

/**
 * Open the post's video for serving.
 * @returns {Promise<{ ok: true, stream: object, headers: object } | { ok: false, status: number, message: string }>}
 */
const openVideo = async (prisma, dbName, post) => {
  let link = videoUrlOf(post);
  if (!link) return fail(404, 'This post has no video file.');
  if (!isSafeUrl(link)) return fail(422, 'This video cannot be shown here. Open the original to watch it.');
  let up;
  try {
    up = await open(link);
    if (REFUSED.includes(up.status)) {
      up.data.destroy();
      const fresh = await deps.fresh(prisma, dbName, post);
      if (fresh && fresh !== link) {
        up = await open(fresh);
        if (up.status < 400) {
          const urls = (post.media_urls || []).map((u) => (u === link ? fresh : u));
          await store.setPostMediaUrls(prisma, post.id, urls).catch(() => {});   // the next play uses it
          link = fresh;
        }
      }
    }
  } catch (err) {
    return fail(502, 'The video could not be fetched right now. Try again in a moment.');
  }
  if (up.status >= 400) {
    up.data.destroy();
    if (up.status >= 500) return fail(502, 'The platform could not serve this video right now. Try again in a moment.');
    return fail(410, 'The platform no longer serves this video, and a fresh link could not be fetched right now. Open the original to watch it.');
  }
  const length = Number(up.headers['content-length']);
  if (length > MAX_BYTES()) { up.data.destroy(); return fail(413, 'This video is too large to show here. Open the original to watch it.'); }
  const type = String(up.headers['content-type'] || '');
  return {
    ok: true,
    stream: up.data,
    headers: {
      'Content-Type': /^video\//i.test(type) ? type : 'video/mp4',
      ...(Number.isFinite(length) && length > 0 ? { 'Content-Length': String(length) } : {}),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  };
};

module.exports = { videoUrlOf, isSafeUrl, findVideoUrl, freshVideoUrl, openVideo, __test: { deps, reset: () => { recent.clear(); lastAsk = 0; } } };
