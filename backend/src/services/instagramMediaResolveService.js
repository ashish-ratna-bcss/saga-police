/**
 * Refresh playable Instagram media when CDN URLs expire.
 *
 * Alerts persist Instagram video URLs from RapidAPI at ingest time. Those
 * CDN links typically die within hours, S3 auto-archive is off, and HTML
 * og:video scrape rarely returns a playable MP4. This service:
 *   1. Reuses any archived/S3 copy already on Content / InstagramStory
 *   2. Re-fetches video_versions via RapidAPI by shortcode / story pk
 *   3. Optionally writes fresh URLs back onto Content.media
 */
const { fetchInstagramPostDetail } = require('./rapidApiInstagramService');
const cacheService = require('./cacheService');
const Content = require('../models/Content');
const InstagramStory = require('../models/InstagramStory');
const logger = require('../utils/logger');
const {
  looksLikeImageUrl,
  looksLikeInstagramVideoUrl,
  keepPlayableVideoUrls,
  collectVariantUrls,
  extractInstagramPostId,
  escapeRegex,
  collectFromMediaArray,
  mergePlaybackSources,
  toPlaybackMediaItems,
  uniqueStrings,
  anyPlayableMediaUrlFresh
} = require('./instagramMediaResolveLogic');

const PLAYBACK_CACHE_TTL_SEC = 15 * 60;
const PLAYBACK_FAIL_TTL_SEC = 60;
const playbackCacheKey = (postId) => `ig:playback:${postId}`;

const loadStoryPlayback = async (postId) => {
  if (!postId || !/^\d+$/.test(String(postId))) return null;
  const story = await InstagramStory.findOne({
    $or: [{ story_pk: String(postId) }, { story_pk: postId }]
  }).select('media_type s3_url original_url video_versions thumbnail_url s3_thumbnail_url').lean();
  if (!story) return null;

  const isVideo = String(story.media_type || '').toLowerCase() === 'video'
    || looksLikeInstagramVideoUrl(story.s3_url)
    || looksLikeInstagramVideoUrl(story.original_url)
    || collectVariantUrls(story.video_versions).length > 0;

  const archivedVideos = keepPlayableVideoUrls([
    story.s3_url && (looksLikeInstagramVideoUrl(story.s3_url) || /\.mp4(\?|$)/i.test(story.s3_url))
      ? story.s3_url
      : ''
  ]);
  const liveVideos = keepPlayableVideoUrls([
    story.original_url,
    collectVariantUrls(story.video_versions)
  ]);
  const images = uniqueStrings(
    story.s3_thumbnail_url,
    story.thumbnail_url,
    !isVideo && story.s3_url ? story.s3_url : ''
  );

  return { archivedVideos, liveVideos, images, isVideo };
};

const loadContentPlayback = async (postId) => {
  if (!postId) return null;
  const safeId = escapeRegex(postId);
  const content = await Content.findOne({
    platform: 'instagram',
    $or: [
      { content_id: postId },
      { content_url: new RegExp(`/${safeId}(?:/|\\?|$)`, 'i') }
    ]
  }).select('id media content_url').lean();
  if (!content) return null;
  return { content, ...collectFromMediaArray(content.media) };
};

const persistRefreshedMedia = async (content, freshItems = []) => {
  if (!content?.id || !Array.isArray(freshItems) || freshItems.length === 0) return;
  const existing = Array.isArray(content.media) ? content.media : [];
  const nextMedia = (existing.length ? existing : freshItems.map(() => ({}))).map((item, index) => {
    const fresh = freshItems[index] || (freshItems.length === 1 ? freshItems[0] : null);
    if (!fresh) return item;
    const updated = { ...item };
    const freshVideo = fresh.video_url || (fresh.type === 'video' ? fresh.url : '');
    if (freshVideo && !looksLikeImageUrl(freshVideo)) {
      updated.original_url = updated.original_url || updated.url || null;
      updated.original_video_url = updated.original_video_url || updated.video_url || updated.url || null;
      updated.url = freshVideo;
      updated.video_url = freshVideo;
      updated.type = 'video';
    } else if (fresh.url && !updated.url) {
      updated.url = fresh.url;
      updated.type = fresh.type || updated.type || 'photo';
    }
    if (fresh.preview && !updated.s3_preview) {
      updated.preview = fresh.preview;
      updated.original_preview = updated.original_preview || updated.preview || null;
    }
    if (Array.isArray(fresh.video_versions) && fresh.video_versions.length) {
      updated.video_versions = fresh.video_versions;
    }
    return updated;
  });

  try {
    await Content.updateOne({ id: content.id }, { $set: { media: nextMedia } });
  } catch (error) {
    logger.warn(`[InstagramResolve] persist failed for ${content.id}: ${error.message}`);
  }
};

const resolveInstagramPlayback = async (rawUrl) => {
  const postId = extractInstagramPostId(rawUrl);
  if (!postId) {
    return { success: false, video_url: null, video_urls: [], image_url: null, image_urls: [], media: [] };
  }

  try {
    const cached = await cacheService.get(playbackCacheKey(postId));
    if (cached?.success && anyPlayableMediaUrlFresh(cached.video_urls || [cached.video_url, cached.image_url])) {
      return cached;
    }
  } catch (_) { /* cache miss */ }

  const [storyPlayback, contentPlayback] = await Promise.all([
    loadStoryPlayback(postId).catch(() => null),
    loadContentPlayback(postId).catch(() => null)
  ]);

  let liveVideos = [];
  let liveImages = [];
  let liveItems = [];
  const storedAlreadyFresh = anyPlayableMediaUrlFresh([
    ...(storyPlayback?.archivedVideos || []),
    ...(storyPlayback?.liveVideos || []),
    ...(contentPlayback?.archivedVideos || []),
    ...(contentPlayback?.liveVideos || [])
  ]);

  if (!storedAlreadyFresh) {
    try {
      const detail = await fetchInstagramPostDetail(postId);
      if (Array.isArray(detail?.media) && detail.media.length) {
        const collected = collectFromMediaArray(detail.media);
        liveVideos = collected.liveVideos;
        liveImages = collected.images;
        liveItems = collected.items;
      }
    } catch (error) {
      logger.warn(`[InstagramResolve] RapidAPI refresh failed for ${postId}: ${error.message}`);
    }
  }

  const archivedVideos = uniqueStrings(storyPlayback?.archivedVideos, contentPlayback?.archivedVideos);
  const storedVideos = uniqueStrings(storyPlayback?.liveVideos, contentPlayback?.liveVideos);
  const images = uniqueStrings(storyPlayback?.images, liveImages, contentPlayback?.images);
  const videoUrls = mergePlaybackSources({ archived: archivedVideos, live: liveVideos, stored: storedVideos });

  const media = (liveItems.length > 1 ? liveItems : null)
    || (contentPlayback?.items?.length > 1 && !liveVideos.length ? contentPlayback.items : null)
    || toPlaybackMediaItems({
      archivedVideos,
      liveVideos,
      storedVideos,
      images
    });

  if (contentPlayback?.content && liveItems.length) {
    persistRefreshedMedia(contentPlayback.content, liveItems).catch(() => {});
  }

  const result = {
    success: Boolean(videoUrls[0] || images[0]),
    video_url: videoUrls[0] || null,
    video_urls: videoUrls,
    image_url: images[0] || null,
    image_urls: images,
    media
  };

  try {
    await cacheService.set(
      playbackCacheKey(postId),
      result,
      result.success && (result.video_url || result.image_url) ? PLAYBACK_CACHE_TTL_SEC : PLAYBACK_FAIL_TTL_SEC
    );
  } catch (_) { /* non-blocking */ }

  return result;
};

module.exports = {
  looksLikeInstagramVideoUrl,
  extractInstagramPostId,
  collectFromMediaArray,
  mergePlaybackSources,
  toPlaybackMediaItems,
  resolveInstagramPlayback
};
