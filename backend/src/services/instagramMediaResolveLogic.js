/**
 * Pure Instagram playback URL helpers (no DB / RapidAPI).
 */
const { parseInstagramUrl } = require('./urlParserService');

const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|m3u8)(\?|$)/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp)(\?|$)/i;
const VIDEO_CDN_RE = /(video\.cdninstagram\.com|\/o1\/v\/t\d+|video[^.]*\.fbcdn\.net)/i;
const ARCHIVED_URL_RE = /(amazonaws\.com|\bs3[.-]|bhaskar-media-storage|\/files\/)/i;

const uniqueStrings = (...values) => {
  const seen = new Set();
  const items = [];
  const push = (value) => {
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || seen.has(text)) return;
    seen.add(text);
    items.push(text);
  };
  values.forEach(push);
  return items;
};

const looksLikeImageUrl = (url) => typeof url === 'string' && IMAGE_EXT_RE.test(url);

const looksLikeInstagramVideoUrl = (url) => {
  if (typeof url !== 'string' || !url) return false;
  if (VIDEO_EXT_RE.test(url)) return true;
  if (looksLikeImageUrl(url)) return false;
  return VIDEO_CDN_RE.test(url);
};

const keepPlayableVideoUrls = (urls) => uniqueStrings(urls).filter((url) => (
  looksLikeInstagramVideoUrl(url)
  || (url && !looksLikeImageUrl(url) && ARCHIVED_URL_RE.test(url) && VIDEO_EXT_RE.test(url))
));

const collectVariantUrls = (versions) => uniqueStrings(
  (Array.isArray(versions) ? versions : []).map((variant) => (
    typeof variant === 'string' ? variant : (variant?.url || variant?.src || '')
  ))
);

const extractInstagramPostId = (url) => {
  const parsed = parseInstagramUrl(url);
  if (parsed?.postId) return parsed.postId;
  if (typeof url !== 'string' || !url) return '';
  const mediaMatch = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (mediaMatch?.[1]) return mediaMatch[1];
  const storyMatch = url.match(/\/stories\/[^/]+\/(\d+)/i);
  return storyMatch?.[1] || '';
};

const INSTAGRAM_CDN_FRESH_BUFFER_MS = 10 * 60 * 1000;

const parseInstagramCdnExpiryMs = (url) => {
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

const isPlayableMediaUrlFresh = (url, bufferMs = INSTAGRAM_CDN_FRESH_BUFFER_MS) => {
  if (typeof url !== 'string' || !url) return false;
  if (ARCHIVED_URL_RE.test(url) && VIDEO_EXT_RE.test(url)) return true;
  const expiry = parseInstagramCdnExpiryMs(url);
  if (!expiry) return false;
  return expiry - Date.now() > bufferMs;
};

const anyPlayableMediaUrlFresh = (urls = []) => uniqueStrings(urls).some((url) => isPlayableMediaUrlFresh(url));

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const collectFromMediaItem = (item = {}) => {
  const type = String(item.type || item.media_type || '').toLowerCase();
  const isVideoType = ['video', 'animated_gif', 'gifv', '2'].includes(type) || Boolean(item.is_video);
  const archivedVideos = keepPlayableVideoUrls([
    looksLikeInstagramVideoUrl(item.s3_url) || (item.s3_url && VIDEO_EXT_RE.test(item.s3_url)) ? item.s3_url : '',
    item.s3_url && isVideoType && !looksLikeImageUrl(item.s3_url) ? item.s3_url : ''
  ]);
  const liveVideos = keepPlayableVideoUrls([
    item.video_url,
    item.videoUrl,
    item.original_video_url,
    looksLikeInstagramVideoUrl(item.url) ? item.url : '',
    looksLikeInstagramVideoUrl(item.original_url) ? item.original_url : '',
    collectVariantUrls(item.video_versions),
    collectVariantUrls(item.videoVersions)
  ]);
  const images = uniqueStrings(
    item.s3_preview,
    item.s3_thumbnail_url,
    item.preview,
    item.preview_url,
    item.thumbnail_url,
    item.display_url,
    item.image_url,
    looksLikeImageUrl(item.s3_url) ? item.s3_url : '',
    looksLikeImageUrl(item.url) ? item.url : '',
    looksLikeImageUrl(item.original_url) ? item.original_url : '',
    looksLikeImageUrl(item.original_preview) ? item.original_preview : ''
  );

  return {
    archivedVideos,
    liveVideos,
    images,
    isVideo: isVideoType || archivedVideos.length > 0 || liveVideos.length > 0
  };
};

const mergePlaybackSources = ({ archived = [], live = [], stored = [] } = {}) => (
  uniqueStrings(archived, live, stored)
);

const toPlaybackMediaItems = ({ archivedVideos = [], liveVideos = [], storedVideos = [], images = [] } = {}) => {
  const videoUrls = mergePlaybackSources({ archived: archivedVideos, live: liveVideos, stored: storedVideos });
  if (videoUrls.length) {
    return [{
      type: 'video',
      url: videoUrls[0],
      video_url: videoUrls[0],
      preview: images[0] || '',
      fallbackUrls: videoUrls.slice(1),
      previewFallbackUrls: images.slice(1),
      ...(ARCHIVED_URL_RE.test(videoUrls[0]) ? { s3_url: videoUrls[0] } : {})
    }];
  }
  if (images.length) {
    return [{
      type: 'photo',
      url: images[0],
      preview: images[0],
      fallbackUrls: images.slice(1),
      previewFallbackUrls: images.slice(1)
    }];
  }
  return [];
};

const collectFromMediaArray = (mediaArray = []) => {
  const archivedVideos = [];
  const liveVideos = [];
  const images = [];
  const items = [];

  (Array.isArray(mediaArray) ? mediaArray : []).forEach((item) => {
    const collected = collectFromMediaItem(item);
    archivedVideos.push(...collected.archivedVideos);
    liveVideos.push(...collected.liveVideos);
    images.push(...collected.images);
    if (collected.isVideo || collected.images.length) {
      const videoUrls = mergePlaybackSources({
        archived: collected.archivedVideos,
        live: collected.liveVideos
      });
      items.push({
        type: videoUrls.length ? 'video' : 'photo',
        url: videoUrls[0] || collected.images[0] || '',
        video_url: videoUrls[0] || '',
        preview: collected.images[0] || '',
        fallbackUrls: videoUrls.slice(1),
        previewFallbackUrls: collected.images.slice(1),
        video_versions: item.video_versions || item.videoVersions || undefined,
        ...(item.s3_url ? { s3_url: item.s3_url } : {}),
        ...(item.s3_preview ? { s3_preview: item.s3_preview } : {})
      });
    }
  });

  return {
    archivedVideos: uniqueStrings(archivedVideos),
    liveVideos: uniqueStrings(liveVideos),
    images: uniqueStrings(images),
    items: items.filter((item) => item.url)
  };
};

module.exports = {
  VIDEO_EXT_RE,
  IMAGE_EXT_RE,
  VIDEO_CDN_RE,
  ARCHIVED_URL_RE,
  uniqueStrings,
  looksLikeImageUrl,
  looksLikeInstagramVideoUrl,
  keepPlayableVideoUrls,
  collectVariantUrls,
  extractInstagramPostId,
  parseInstagramCdnExpiryMs,
  isPlayableMediaUrlFresh,
  anyPlayableMediaUrlFresh,
  INSTAGRAM_CDN_FRESH_BUFFER_MS,
  escapeRegex,
  collectFromMediaItem,
  collectFromMediaArray,
  mergePlaybackSources,
  toPlaybackMediaItems
};
