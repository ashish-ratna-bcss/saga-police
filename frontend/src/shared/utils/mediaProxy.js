/**
 * Shared media URL proxy helpers.
 *
 * IMPORTANT: Three historically distinct behaviours exist in the app.
 * Do not collapse them — call sites depend on each variant.
 *
 * 1. proxyMediaUrl          — CDN-host allowlist (alerts, content cards, grievances)
 * 2. proxyInstagramMediaUrl — Instagram CDN substring match (IG monitors / stories)
 * 3. proxyMediaUrlAlways    — Always stream via backend (POI reports / html2canvas CORS)
 */
import { BACKEND_URL } from '../../lib/backendUrl';

/** Hosts that require the backend stream proxy (alerts / grievances / content cards). */
export const NEEDS_PROXY_RE =
  /(amazonaws\.com|\.fbcdn\.net|\.fbsbx\.com|lookaside\.facebook\.com|cdninstagram\.com|video\.twimg\.com|pbs\.twimg\.com|googlevideo\.com|ytimg\.com|ggpht\.com|googleusercontent\.com|scontent|bhaskar-media-storage)/i;

const STREAM_PATH = '/api/media/stream?url=';

const toStreamUrl = (url) =>
  `${BACKEND_URL}${STREAM_PATH}${encodeURIComponent(url)}`;

/**
 * Proxy known social/CDN URLs through the backend stream endpoint.
 * Preserves AlertCards / ContentCard / Grievances behaviour.
 */
export const proxyMediaUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl || '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') || trimmed.startsWith(BACKEND_URL)) return trimmed;
  if (NEEDS_PROXY_RE.test(trimmed)) {
    return toStreamUrl(trimmed);
  }
  return trimmed;
};

/**
 * Proxy Instagram-family CDN URLs only.
 * Preserves InstagramMonitor / StoryViewer / Sources behaviour.
 */
export const proxyInstagramMediaUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  if (rawUrl.startsWith('/') || rawUrl.startsWith(BACKEND_URL)) return rawUrl;
  if (
    rawUrl.includes('cdninstagram.com') ||
    rawUrl.includes('fbcdn.net') ||
    rawUrl.includes('instagram.') ||
    rawUrl.includes('scontent')
  ) {
    return toStreamUrl(rawUrl);
  }
  return rawUrl;
};

/**
 * Always route through the backend stream proxy (except data:/blob: and
 * same-host non-upload URLs). Preserves POIDetail report behaviour.
 */
export const proxyMediaUrlAlways = (url) => {
  if (!url || typeof url !== 'string' || url === '') return url;

  if (url.startsWith('data:') || url.includes('blob:')) return url;

  if (
    typeof window !== 'undefined' &&
    url.includes(window.location.hostname) &&
    !url.includes('/uploads/')
  ) {
    return url;
  }

  return toStreamUrl(url);
};

/**
 * Build a de-duplicated list of proxied (+ original fallback) media URLs.
 * Used by Instagram monitor / Sources candidate chains.
 */
export const buildInstagramMediaCandidates = (urls = []) => {
  const candidates = [];
  urls
    .filter((url) => typeof url === 'string' && url.trim())
    .forEach((url) => {
      const trimmed = url.trim();
      const proxied = proxyInstagramMediaUrl(trimmed);
      if (proxied && !candidates.includes(proxied)) candidates.push(proxied);
      if (trimmed && proxied !== trimmed && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    });
  return candidates;
};

/** @deprecated Prefer named exports — alias for clarity at call sites. */
export const proxyUrl = proxyInstagramMediaUrl;
