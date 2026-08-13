const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv)(\?|$)/i;
const ARCHIVED_URL_RE = /(amazonaws\.com|\bs3[.-]|bhaskar-media-storage|\/files\/)/i;
export const INSTAGRAM_CDN_FRESH_BUFFER_MS = 10 * 60 * 1000;

export const parseInstagramCdnExpiryMs = (url) => {
  if (typeof url !== 'string' || !url) return null;
  try {
    const oe = new URL(url).searchParams.get('oe');
    if (!oe) return null;
    const seconds = parseInt(oe, 16);
    if (!Number.isFinite(seconds) || seconds < 1e9 || seconds > 2e10) return null;
    return seconds * 1000;
  } catch (_) {
    return null;
  }
};

export const isPlayableMediaUrlFresh = (url, bufferMs = INSTAGRAM_CDN_FRESH_BUFFER_MS) => {
  if (typeof url !== 'string' || !url) return false;
  if (ARCHIVED_URL_RE.test(url) && VIDEO_EXT_RE.test(url)) return true;
  const expiry = parseInstagramCdnExpiryMs(url);
  if (!expiry) return false;
  return expiry - Date.now() > bufferMs;
};

export const anyPlayableMediaUrlFresh = (urls = []) => (
  (Array.isArray(urls) ? urls : [urls]).some((url) => isPlayableMediaUrlFresh(url))
);
