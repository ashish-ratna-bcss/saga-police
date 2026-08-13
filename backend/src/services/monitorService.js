const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');
const { TwitterApi } = require('twitter-api-v2');
const Source = require('../models/Source');
const Content = require('../models/Content');
const Analysis = require('../models/Analysis');
const Alert = require('../models/Alert');
const Settings = require('../models/Settings');
const Keyword = require('../models/Keyword');
const Comment = require('../models/Comment');
const { analyzeContent } = require('./analysisService');
const { sendAlertEmail } = require('./emailService');
const { getActiveEvents, autoArchiveEndedEvents, scanEventOnce, shouldPollEvent } = require('./eventMonitorService');
const { checkAndCreateVelocityAlerts, createNewPostAlert, updateEngagementHistory, checkVelocity } = require('./velocityAlertService');
const { queueUrlEnrichment } = require('./urlEnrichmentService');
const rapidApiInstagramService = require('./rapidApiInstagramService');
const { archiveContentMedia, archiveTwitterMedia, archiveFacebookMedia } = require('./contentS3Service');
const { enqueueMediaLocationExtraction } = require('./mediaLocationService');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');
const { getAnalyzableContentText, hasAnalyzableContent } = require('../utils/contentText');
const {
  extractInstagramEngagement,
  extractYouTubeEngagement,
  engagementFromXMetricsBag,
  mergeEngagement,
  buildEngagement
} = require('../utils/engagementMetrics');
const isStrictAnalysisMode = () => String(process.env.ANALYSIS_STRICT_LLM_MODE || 'true').toLowerCase() === 'true';

const {
  shouldSkipContentAnalysis,
  SCAN_OUTCOME,
  scanResult,
  isYoutubeQuotaError,
  classifyScanError,
  formatCooldown,
  markPlatformQuotaLimited,
  clearPlatformQuotaLimit,
  getPlatformQuotaPause,
  getPlatformQuotaStatus,
  ANALYSIS_STATUS,
  isUsableAnalysis,
  buildExistingAlertUpdate,
  selectPendingForRetry
} = require('./monitorScanLogic');
const { deactivateIfDuplicateIdentity } = require('./sourceDedupeService');

let lastMediaBackfillAt = 0;
const MEDIA_BACKFILL_INTERVAL_MS = 15 * 60 * 1000;

const normalizeInstagramHandle = (value) => {
  if (!value) return value;
  let id = String(value).trim();
  if (/^https?:\/\//i.test(id) || /instagram\.com\//i.test(id)) {
    try {
      const url = new URL(id.startsWith('http') ? id : `https://${id}`);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length > 0) id = parts[0];
    } catch (_) {
      // ignore
    }
  }
  id = id.replace(/^@/, '');
  return id.toLowerCase();
};

const archiveXTweetMedia = async (tweetId, media = [], quotedContent = null) => {
  const normalizedMedia = Array.isArray(media) ? media : [];
  const quoted = quotedContent && typeof quotedContent === 'object' ? { ...quotedContent } : quotedContent;

  if (normalizedMedia.length === 0 && (!quoted?.media || quoted.media.length === 0)) {
    return {
      media: normalizedMedia,
      quoted_content: quoted,
      is_media_archived: false,
      upload_failures: 0
    };
  }

  let archivedMedia = normalizedMedia;
  let archivedQuoted = quoted;
  let uploadFailures = 0;

  try {
    if (normalizedMedia.length > 0) {
      archivedMedia = await archiveTwitterMedia(normalizedMedia, `${tweetId}`);
      uploadFailures += archivedMedia.filter((item) => item?.url && !item?.s3_url).length;
    }

    if (quoted?.media && Array.isArray(quoted.media) && quoted.media.length > 0) {
      const archivedQuotedMedia = await archiveTwitterMedia(
        quoted.media,
        `${tweetId}_quoted_${quoted.author_handle || 'unknown'}`
      );
      uploadFailures += archivedQuotedMedia.filter((item) => item?.url && !item?.s3_url).length;
      archivedQuoted = {
        ...quoted,
        media: archivedQuotedMedia
      };
    }
  } catch (error) {
    logger.error(`[Monitor] X media archive failed for ${tweetId}: ${error.message}`);
    return {
      media: normalizedMedia,
      quoted_content: quoted,
      is_media_archived: false,
      upload_failures: normalizedMedia.length
    };
  }

  return {
    media: archivedMedia,
    quoted_content: archivedQuoted,
    is_media_archived: archivedMedia.length > 0 && archivedMedia.every((item) => !!item?.s3_url),
    upload_failures: uploadFailures
  };
};

const hasS3Gaps = (media = []) => {
  if (!Array.isArray(media) || media.length === 0) return false;
  return media.some((item) => {
    const hasSource = Boolean(item?.video_url || item?.url);
    return hasSource && !item?.s3_url;
  });
};

const hasAnyMedia = (media = []) => Array.isArray(media) && media.length > 0;

const hasAnyTwitterMedia = (media = [], quotedContent = null) => {
  const mainHasMedia = hasAnyMedia(media);
  const quotedHasMedia = hasAnyMedia(quotedContent?.media);
  return mainHasMedia || quotedHasMedia;
};

const queueXTweetMediaArchive = ({
  query,
  tweetId,
  media = [],
  quotedContent = null,
  sourceTag = 'x-monitor'
}) => {
  if (!query || !tweetId || !hasAnyTwitterMedia(media, quotedContent)) return;

  archiveXTweetMedia(tweetId, media, quotedContent)
    .then(async (archived) => {
      if (archived.upload_failures > 0) {
        logger.warn(`[Monitor] X archive partial failure (${sourceTag}) for ${tweetId}: ${archived.upload_failures} media item(s)`);
      }

      const patch = {
        media: archived.media,
        is_media_archived: archived.is_media_archived
      };

      if (archived.quoted_content) {
        patch.quoted_content = archived.quoted_content;
      }

      await Content.updateOne(query, { $set: patch });
    })
    .catch((error) => {
      logger.error(`[Monitor] X media archive background error (${sourceTag}) for ${tweetId}: ${error.message}`);
    });
};

const queueInstagramMediaArchive = ({
  query,
  contentId,
  media = [],
  sourceTag = 'instagram-monitor'
}) => {
  if (!query || !contentId || !hasAnyMedia(media) || !hasS3Gaps(media)) return;

  // Find the correct post/story URL for yt-dlp
  let postUrl = undefined;
  if (media && media.length > 0) {
    // Try to find a valid Instagram post/story URL
    // For posts: https://www.instagram.com/p/{shortcode}/
    // For stories: https://www.instagram.com/stories/{handle}/{contentId}/
    const first = media[0];
    if (first.type === 'video' || first.type === 'reel') {
      // Try to find post_url or fallback to content_url
      postUrl = first.post_url || first.content_url || undefined;
    }
  }
  archiveContentMedia(media, `${contentId}`, {
    useUniqueFileName: true,
    replaceOriginalUrls: false,
    postUrl
  })
    .then(async (archivedMedia) => {
      const uploadFailures = archivedMedia.filter((item) => (item?.url || item?.video_url) && !item?.s3_url).length;
      if (uploadFailures > 0) {
        logger.warn(`[Monitor] Instagram archive partial failure (${sourceTag}) for ${contentId}: ${uploadFailures} media item(s)`);
      }

      await Content.updateOne(query, {
        $set: {
          media: archivedMedia,
          is_media_archived: archivedMedia.length > 0 && !hasS3Gaps(archivedMedia)
        }
      });
    })
    .catch((error) => {
      logger.error(`[Monitor] Instagram media archive background error (${sourceTag}) for ${contentId}: ${error.message}`);
    });
};

const queueFacebookMediaArchive = ({
  query,
  contentId,
  media = [],
  postUrl,
  sourceTag = 'facebook-monitor'
}) => {
  if (!query || !contentId || !hasAnyMedia(media) || !hasS3Gaps(media)) return;

  archiveFacebookMedia(media, `${contentId}`, {
    postUrl,
    replaceOriginalUrls: false
  })
    .then(async (archivedMedia) => {
      const uploadFailures = archivedMedia.filter((item) => (item?.url || item?.video_url) && !item?.s3_url).length;
      if (uploadFailures > 0) {
        logger.warn(`[Monitor] Facebook archive partial failure (${sourceTag}) for ${contentId}: ${uploadFailures} media item(s)`);
      }

      await Content.updateOne(query, {
        $set: {
          media: archivedMedia,
          is_media_archived: archivedMedia.length > 0 && !hasS3Gaps(archivedMedia)
        }
      });
    })
    .catch((error) => {
      logger.error(`[Monitor] Facebook media archive background error (${sourceTag}) for ${contentId}: ${error.message}`);
    });
};

const backfillRecentXMedia = async ({ limit = 200, hours = 24, maxUpdates = 50 } = {}) => {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const alerts = await Alert.find({ platform: 'x', created_at: { $gte: since } })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    if (!alerts.length) return 0;

    const cache = new Map();
    let updated = 0;

    for (const alert of alerts) {
      if (updated >= maxUpdates) break;

      const content = await Content.findOne({ id: alert.content_id });
      if (!content) continue;
      if (content.media && content.media.length > 0) continue;

      const source = content.source_id ? await Source.findOne({ id: content.source_id }).lean() : null;
      const handle = content.author_handle || source?.identifier;
      if (!handle) continue;

      if (!cache.has(handle)) {
        const res = await rapidApiXService.fetchUserTweets(handle, 40);
        const tweets = Array.isArray(res) ? res : (res?.tweets || []);
        cache.set(handle, tweets);
      }

      const tweets = cache.get(handle) || [];
      const match = tweets.find(t => t.id === content.content_id);
      if (!match || !Array.isArray(match.media) || match.media.length === 0) continue;

      content.media = match.media;
      if (match.quoted_content) content.quoted_content = match.quoted_content;
      content.is_media_archived = false;
      if (match.url_cards && match.url_cards.length > 0) content.url_cards = match.url_cards;
      if (match.is_repost !== undefined) content.is_repost = match.is_repost;

      const isUnknown = (val) => !val || String(val).trim().toLowerCase() === 'unknown' || String(val).trim().toLowerCase() === 'unknown user';

      if (match.original_author && (!isUnknown(match.original_author) || isUnknown(content.original_author))) {
        content.original_author = match.original_author;
      }
      if (match.original_author_name && (!isUnknown(match.original_author_name) || isUnknown(content.original_author_name))) {
        content.original_author_name = match.original_author_name;
      }
      if (match.original_author_avatar) content.original_author_avatar = match.original_author_avatar;
      content.scraped_content = `Media Count: ${match.media.length}`;

      await content.save();
      queueXTweetMediaArchive({
        query: { id: content.id },
        tweetId: match.id || content.content_id,
        media: match.media,
        quotedContent: match.quoted_content,
        sourceTag: 'x-backfill'
      });
      updated++;
    }

    if (updated > 0) {
      //(() => {})(`[Monitor] Media backfill updated ${updated} X items.`);
    }
    return updated;
  } catch (error) {
    //(() => {})(`[Monitor] Media backfill failed: ${error.message}`);
    return 0;
  }
};

const backfillRecentInstagramMedia = async ({ limit = 300, hours = 72, maxUpdates = 80 } = {}) => {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const docs = await Content.find({
      platform: 'instagram',
      published_at: { $gte: since },
      media: { $exists: true, $ne: [] }
    })
      .sort({ published_at: -1 })
      .limit(limit)
      .lean();

    if (!docs.length) return 0;

    let queued = 0;
    for (const doc of docs) {
      if (queued >= maxUpdates) break;
      const media = Array.isArray(doc.media) ? doc.media : [];
      if (!hasS3Gaps(media)) continue;
      queueInstagramMediaArchive({
        query: { id: doc.id },
        contentId: doc.content_id || doc.id,
        media,
        sourceTag: 'instagram-backfill'
      });
      queued++;
    }
    return queued;
  } catch (_) {
    return 0;
  }
};

// Helper to extract and fetch URL content
const extractAndFetchUrlContent = async (text) => {
  try {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex);

    if (!urls || urls.length === 0) return '';

    let scrapedText = '';
    for (const url of urls.slice(0, 2)) {
      try {
        if (url.includes('youtube.com') || url.includes('twitter.com') || url.includes('x.com')) continue;

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) continue;

        const html = await response.text();

        // Simple regex extraction
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
          html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
        const description = descMatch ? descMatch[1].trim() : '';

        if (title || description) {
          scrapedText += ` [Link Content: ${title} - ${description}]`;
        }
      } catch (err) {
        // Ignore fetch errors
        //(() => {})(`Failed to fetch URL ${url}: ${err.message}`);
      }
    }
    return scrapedText;
  } catch (error) {
    //(() => {})('Error in URL extraction:', error);
    return '';
  }
};

const monitorYoutubeSource = async (source, apiKey) => {
  let apiCalls = 0;

  try {
    const youtube = google.youtube({
      version: 'v3',
      auth: apiKey
    });

    // ─── Resolve identifier to channel ID if needed ───────────────────
    let channelId = source.identifier;
    const isChannelId = /^UC[A-Za-z0-9_-]{20,}$/.test(channelId);

    if (!isChannelId) {
      // Identifier is @ handle, URL, or username — resolve to channel ID
      logger.info(`[YouTube Monitor] Resolving identifier "${channelId}" for ${source.display_name}...`);
      const platformIdentityService = require('./platformIdentityService');
      const resolved = await platformIdentityService.resolvePlatformIdentity('youtube', channelId);

      if (!resolved?.platformUserId) {
        logger.info(`[YouTube Monitor] ⚠️ Could not resolve "${channelId}" for ${source.display_name} (method: ${resolved?.method || 'unknown'})`);
        // Don't update last_checked — let it retry next cycle
        return scanResult([], SCAN_OUTCOME.IDENTITY_UNRESOLVED, `identifier unresolved (method: ${resolved?.method || 'unknown'})`);
      }

      channelId = resolved.platformUserId;
      logger.info(`[YouTube Monitor] ✅ Resolved "${source.identifier}" → ${channelId} (${resolved.resolvedDisplayName || 'no name'}) via ${resolved.method}`);

      // Persist the resolved channel ID so we don't re-resolve every cycle
      const updates = { identifier: channelId };
      if (resolved.resolvedDisplayName && source.display_name?.includes('Pending Resolution')) {
        updates.display_name = resolved.resolvedDisplayName;
      }
      if (resolved.profileImageUrl && !source.profile_image_url) {
        updates.profile_image_url = resolved.profileImageUrl;
      }

      try {
        await Source.findOneAndUpdate({ id: source.id }, updates);
      } catch (updateError) {
        if (updateError?.code === 11000) {
          // Another Source doc already owns this channel ID (duplicate added under a
          // different handle/URL). Persisting would collide every cycle forever —
          // deactivate this duplicate instead of retrying indefinitely.
          const existingOwner = await Source.findOne({ platform: 'youtube', identifier: channelId, id: { $ne: source.id } });
          logger.info(`[YouTube Monitor] ⚠️ "${source.display_name}" (${source.id}) resolves to channel ${channelId}, already monitored as "${existingOwner?.display_name || 'unknown'}" (${existingOwner?.id || '?'}). Deactivating duplicate.`);
          await Source.findOneAndUpdate({ id: source.id }, { is_active: false });
          return scanResult([], SCAN_OUTCOME.OK, 'deactivated duplicate channel');
        }
        throw updateError;
      }
    }

    // ─── Resolve the channel's uploads playlist (cached on the Source) ──────
    // playlistItems.list costs 1 quota unit where search.list costs 100, and the
    // uploads playlist is already newest-first, so ordering is preserved.
    let uploadsPlaylistId = source.youtube_metadata?.upload_playlist_id || null;
    let uploadsFromCache = Boolean(uploadsPlaylistId);

    const resolveUploadsPlaylistId = async () => {
      const channelResponse = await youtube.channels.list({
        part: 'contentDetails',
        id: channelId
      });
      apiCalls += 1;
      return channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
    };

    if (!uploadsPlaylistId) {
      uploadsPlaylistId = await resolveUploadsPlaylistId();
      if (!uploadsPlaylistId) {
        logger.info(`[YouTube Monitor] ⚠️ No uploads playlist for ${source.display_name} (${channelId})`);
        return scanResult([], SCAN_OUTCOME.IDENTITY_UNRESOLVED, 'channel exposes no uploads playlist');
      }
      await Source.findOneAndUpdate({ id: source.id }, { 'youtube_metadata.upload_playlist_id': uploadsPlaylistId });
    }

    const listUploads = async () => {
      const playlistResponse = await youtube.playlistItems.list({
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: 10
      });
      apiCalls += 1;
      return playlistResponse.data.items || [];
    };

    let playlistItems;
    try {
      playlistItems = await listUploads();
    } catch (playlistError) {
      // A cached playlist id can go stale if the channel behind this source
      // changed. Re-derive once before calling it a real failure.
      if (!uploadsFromCache || isYoutubeQuotaError(playlistError)) throw playlistError;
      logger.info(`[YouTube Monitor] ♻️ Cached uploads playlist rejected for ${source.display_name} — re-resolving`);
      uploadsPlaylistId = await resolveUploadsPlaylistId();
      if (!uploadsPlaylistId) {
        return scanResult([], SCAN_OUTCOME.IDENTITY_UNRESOLVED, 'channel exposes no uploads playlist');
      }
      await Source.findOneAndUpdate({ id: source.id }, { 'youtube_metadata.upload_playlist_id': uploadsPlaylistId });
      uploadsFromCache = false;
      playlistItems = await listUploads();
    }

    const videoIds = playlistItems
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean);

    if (videoIds.length === 0) {
      await Source.findOneAndUpdate({ id: source.id }, { last_checked: new Date() });
      logger.info(`[YouTube Monitor] ℹ️ No videos found for ${source.display_name} (${channelId}) | api_calls=${apiCalls}`);
      return scanResult([], SCAN_OUTCOME.OK, null, {
        posts_attempted: 0, posts_succeeded: 0, posts_failed: 0, new: 0, updated: 0
      });
    }

    // One batched videos.list (1 unit for up to 50 ids) replaces the previous
    // per-video call, and carries the statistics needed to refresh engagement.
    const detailsResponse = await youtube.videos.list({
      part: 'snippet,statistics',
      id: videoIds.join(',')
    });
    apiCalls += 1;

    const videoById = new Map((detailsResponse.data.items || []).map((v) => [v.id, v]));

    const newContent = [];
    let postsAttempted = 0;
    let postsSucceeded = 0;
    let postsFailed = 0;
    let postsSkipped = 0;
    let createdCount = 0;
    let updatedCount = 0;
    const skippedReasons = new Set();

    for (const videoId of videoIds) {
      postsAttempted += 1;
      try {
        const videoData = videoById.get(videoId);
        if (!videoData) {
          // Listed in the uploads playlist but absent from videos.list — deleted,
          // privated or region-blocked between the two calls. Not a failure, but
          // it is a real drop and must not masquerade as a successful persist.
          postsSkipped += 1;
          skippedReasons.add('video_details_missing');
          continue;
        }

        const snippet = videoData.snippet;
        const stats = videoData.statistics || {};
        const engagement = extractYouTubeEngagement(stats);

        const existing = await Content.findOne({ platform: 'youtube', content_id: videoId });

        if (existing) {
          // Refresh engagement so velocity can still see a video that goes viral
          // after we first stored it. Media/archive state is left untouched.
          const merged = mergeEngagement(existing.engagement, engagement);
          const updatedDoc = await Content.findOneAndUpdate(
            { id: existing.id },
            {
              $set: { engagement: merged },
              $push: {
                engagement_history: {
                  $each: [{
                    timestamp: new Date(),
                    ...(merged.views !== undefined ? { views: merged.views } : {}),
                    ...(merged.likes !== undefined ? { likes: merged.likes } : {}),
                    ...(merged.comments !== undefined ? { comments: merged.comments } : {})
                  }],
                  $slice: -50
                }
              }
            },
            { new: true }
          );

          if (updatedDoc) {
            updatedDoc.is_update = true;
            newContent.push(updatedDoc);
            updatedCount += 1;
          }
          postsSucceeded += 1;
          continue;
        }

        const baseText = `${snippet.title} ${snippet.description}`;
        const scrapedContent = await extractAndFetchUrlContent(baseText);

        const content = new Content({
          source_id: source.id,
          platform: 'youtube',
          content_id: videoId,
          content_url: `https://www.youtube.com/watch?v=${videoId}`,
          text: baseText + scrapedContent,
          scraped_content: scrapedContent,
          media: [{
            url: `https://www.youtube.com/watch?v=${videoId}`,
            type: 'video'
          }],
          author: snippet.channelTitle,
          author_handle: source.identifier,
          published_at: new Date(snippet.publishedAt),
          engagement
        });

        await content.save();
        newContent.push(content);
        createdCount += 1;
        postsSucceeded += 1;
        logger.info(`[YouTube Monitor] 🆕 New video: ${videoId} from ${source.display_name}`);
      } catch (videoError) {
        postsFailed += 1;
        logger.error(`[YouTube Monitor] ⚠️ Post failure: source="${source.display_name}" platform=youtube video=${videoId} stage=persist type=${classifyScanError(videoError)} error=${videoError.message}`);
      }
    }

    // Update last checked
    await Source.findOneAndUpdate({ id: source.id }, { last_checked: new Date() });

    logger.info(`[YouTube Monitor] ✅ ${source.display_name}: endpoint=playlistItems api_calls=${apiCalls} videos_returned=${videoIds.length} new=${createdCount} updated=${updatedCount} skipped=${postsSkipped} failed=${postsFailed}`);
    if (postsSkipped > 0) {
      logger.warn(`[YouTube Monitor] ⚠️ ${source.display_name}: ${postsSkipped}/${postsAttempted} video(s) not persisted [${Array.from(skippedReasons).join(', ')}]`);
    }

    return scanResult(newContent, SCAN_OUTCOME.OK, null, {
      posts_attempted: postsAttempted,
      posts_succeeded: postsSucceeded,
      posts_failed: postsFailed,
      posts_skipped: postsSkipped,
      new: createdCount,
      updated: updatedCount
    });
  } catch (error) {
    const outcome = classifyScanError(error);
    logger.error(`[YouTube Monitor] ❌ Error monitoring ${source.display_name} (${outcome}): ${error.message}`);
    // Don't update last_checked on error — let it retry
    return scanResult([], outcome, error.message);
  }
};

const xApiService = require('./xApiService');
const rapidApiXService = require('./rapidApiXService');
const rapidApiFacebookService = require('./rapidApiFacebookService');
const { scrapeProfile, getHealthyAccount } = require('./scraperService');
const { syncRetweetRelationshipsForSource } = require('./retweetNetworkService');

const monitorXSource = async (source) => {
  try {
    let tweets = [];
    const useRapidApi = !!process.env.RAPIDAPI_KEY;
    const useOfficialApi = !!process.env.X_BEARER_TOKEN;

    let userData = null;

    if (useRapidApi) {
      const result = await rapidApiXService.fetchUserTweets(source.identifier);

      // Handle null (API error), array, and object returns safely
      if (!result) {
        logger.error(`[Monitor:X] ⚠️ fetchUserTweets returned null for ${source.display_name} (@${source.identifier}) — API error or user not found`);
        // Track consecutive failures — auto-deactivate after 10 consecutive null returns
        const failCount = (source.api_fail_count || 0) + 1;
        const updateFields = { api_fail_count: failCount, last_api_error: new Date() };
        if (failCount >= 10) {
          updateFields.is_active = false;
          updateFields.deactivation_reason = 'api_not_found_10x';
          logger.error(`[Monitor:X] 🚫 Auto-deactivated @${source.identifier} after ${failCount} consecutive API failures`);
        }
        await Source.findOneAndUpdate({ id: source.id }, { $set: updateFields });
        // Do NOT update last_checked — let it retry next cycle
        return scanResult([], SCAN_OUTCOME.IDENTITY_UNRESOLVED, 'fetchUserTweets returned null (API error or user not found)');
      } else if (Array.isArray(result)) {
        tweets = result;
      } else {
        tweets = result.tweets || [];
        userData = result.userData;

        if (userData) {
          const updates = {};
          // Update verification status if different
          if (userData.isVerified !== undefined && source.is_verified !== userData.isVerified) {
            updates.is_verified = userData.isVerified;
          }
          // Update profile image if availalble and different
          if (userData.profileImageUrl && source.profile_image_url !== userData.profileImageUrl) {
            updates.profile_image_url = userData.profileImageUrl;
          }

          if (Object.keys(updates).length > 0) {
            await Source.updateOne({ id: source.id }, updates);
            //(() => {})(`[Monitor] Updated metadata for ${source.identifier}:`, Object.keys(updates).join(', '));
          }
        }
      }
    } else if (useOfficialApi) {
      //(() => {})(`[Monitor] Using Official X API for ${source.display_name}`);
      tweets = await xApiService.fetchUserTweets(source.identifier);
    }

    // Fallback or legacy path if API fails or not configured
    if (!tweets || tweets.length === 0) {
      // Corrected Logic: Check if NO API is configured
      if (!useRapidApi && !useOfficialApi) {
        //(() => {})(`[Monitor] API not configured, falling back to scraper for ${source.display_name}`);
        const account = await getHealthyAccount();
        if (account) {
          tweets = await scrapeProfile(source.identifier, account);
        } else {
          //(() => {})('No healthy Twitter accounts available for scraping.');
        }
      } else {
        // (() => {})(`[Monitor] API active but returned no data (Rate Limit or empty). Skipping scraper fallback per policy.`);
      }
    }

    // Update last checked only when API returned NO tweets (confirms poll happened but account is quiet)
    if (!tweets || tweets.length === 0) {
      logger.info(`[Monitor:X] 📭 No tweets returned for ${source.display_name} (@${source.identifier}) — API answered with an empty timeline. NOT updating last_checked.`);
      // Do NOT update last_checked when API returned empty — it may be rate limited or in cooldown.
      // last_checked should only be updated after tweets are actually processed below.
      // A genuine null/error already returned above, so reaching here is a
      // successful poll of a quiet account — not a fetch failure.
      return scanResult([], SCAN_OUTCOME.OK, 'API returned zero tweets', {
        posts_attempted: 0, posts_succeeded: 0, posts_failed: 0, new: 0, updated: 0
      });
    }

    logger.info(`[Monitor:X] 📥 Got ${tweets.length} raw tweets for ${source.display_name} (@${source.identifier})`);

    // Reset API failure counter on successful tweet fetch
    if (source.api_fail_count > 0) {
      await Source.findOneAndUpdate({ id: source.id }, { $set: { api_fail_count: 0 }, $unset: { last_api_error: 1 } });
    }

    // Log the tweet IDs and dates for audit trail
    if (tweets.length > 0) {
      const sorted = [...tweets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      logger.info(`[Monitor:X] 📋 Tweet dates for ${source.display_name}: newest=${sorted[0]?.created_at?.toISOString?.() || 'N/A'}, oldest=${sorted[sorted.length-1]?.created_at?.toISOString?.() || 'N/A'}, IDs: ${sorted.slice(0, 5).map(t => t.id).join(', ')}${sorted.length > 5 ? `... +${sorted.length - 5} more` : ''}`);
    }

    // Check if this source has any existing content (first scan detection)
    const hasExistingContent = await Content.findOne(
      { platform: 'x', author_handle: source.identifier },
      { _id: 1 }
    );
    const isFirstScan = !hasExistingContent;

    const beforeFilter = tweets.length;

    if (isFirstScan) {
      // First scan: keep ALL tweets — don't apply 24h filter so infrequent tweeters get initial content
      logger.info(`[Monitor:X] 🆕 First scan for ${source.display_name} (@${source.identifier}) — keeping all ${tweets.length} tweets (no 24h filter)`);
    } else {
      // Subsequent scans: filter to last 24 hours only
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      tweets = tweets.filter(t => {
        const tweetDate = new Date(t.created_at);
        // Safety: if created_at is null/invalid, KEEP the tweet (don't silently drop it)
        if (!t.created_at || isNaN(tweetDate.getTime())) return true;
        return tweetDate > twentyFourHoursAgo;
      });

      if (beforeFilter > 0 && tweets.length === 0) {
        logger.info(`[Monitor:X] ⏰ All ${beforeFilter} tweets for ${source.display_name} were older than 24h — filtered out`);
      }
    }

    if (!tweets || tweets.length === 0) {
      // All tweets were older than 24h — this IS a valid check, update last_checked
      await Source.findOneAndUpdate({ id: source.id }, { last_checked: new Date() });
      return scanResult([], SCAN_OUTCOME.OK, 'all tweets older than the 24h window', {
        posts_attempted: 0, posts_succeeded: 0, posts_failed: 0, new: 0, updated: 0
      });
    }

    logger.info(`[Monitor:X] 🔍 Processing ${tweets.length} tweets (of ${beforeFilter} raw) for ${source.display_name} (@${source.identifier})`);

    const newContent = [];
    let postsAttempted = 0;
    let postsSucceeded = 0;
    let postsFailed = 0;

    for (const tweet of tweets) {
      postsAttempted += 1;
      try {
        // Check if exists
        const existing = await Content.findOne({ platform: 'x', content_id: tweet.id });
        if (existing) {
          const incomingMedia = Array.isArray(tweet.media) ? tweet.media : [];
          const incomingCards = Array.isArray(tweet.url_cards) ? tweet.url_cards : [];
          const existingMedia = Array.isArray(existing.media) ? existing.media : [];
          const existingQuoted = existing.quoted_content || null;
          const incomingQuoted = tweet.quoted_content || null;

          // Keep already-archived media to avoid replacing it with raw URLs on each poll.
          const preserveArchivedMainMedia =
            existing.is_media_archived === true &&
            existingMedia.length > 0 &&
            !hasS3Gaps(existingMedia);
          const mediaForSave = incomingMedia.length > 0
            ? (preserveArchivedMainMedia ? existingMedia : incomingMedia)
            : existingMedia;

          const preserveArchivedQuotedMedia =
            Array.isArray(existingQuoted?.media) &&
            existingQuoted.media.length > 0 &&
            !hasS3Gaps(existingQuoted.media);
          const quotedForSave = incomingQuoted
            ? (preserveArchivedQuotedMedia ? { ...incomingQuoted, media: existingQuoted.media } : incomingQuoted)
            : existingQuoted;

          const archiveMainCandidates = incomingMedia.length > 0 ? incomingMedia : existingMedia;
          const archiveQuotedCandidates = incomingQuoted || existingQuoted;
          const needsArchive =
            hasAnyTwitterMedia(archiveMainCandidates, archiveQuotedCandidates) &&
            (hasS3Gaps(mediaForSave) || hasS3Gaps(quotedForSave?.media));

          const shouldUpdate =
            (incomingMedia.length > 0 && (!existing.media || existing.media.length === 0)) ||
            (!existing.quoted_content && quotedForSave) ||
            (incomingCards.length > 0 && (!existing.url_cards || existing.url_cards.length === 0)) ||
            (!existing.original_author && tweet.original_author) ||
            (!existing.original_author_name && tweet.original_author_name) ||
            (!existing.original_author_avatar && tweet.original_author_avatar) ||
            (tweet.is_repost !== undefined && existing.is_repost !== tweet.is_repost);

          if (shouldUpdate || true) { // Always update metrics if found
            const newEngagement = mergeEngagement(
              existing.engagement,
              engagementFromXMetricsBag(tweet.metrics || {})
            );

            const historyPoint = {
              timestamp: new Date(),
              ...(newEngagement.views !== undefined ? { views: newEngagement.views } : {}),
              ...(newEngagement.likes !== undefined ? { likes: newEngagement.likes } : {}),
              ...(newEngagement.comments !== undefined ? { comments: newEngagement.comments } : {}),
              ...(newEngagement.retweets !== undefined ? { retweets: newEngagement.retweets } : {})
            };

            const updatedDoc = await Content.findOneAndUpdate(
              { id: existing.id },
              {
                $set: {
                  text: tweet.text || existing.text,
                  quoted_content: quotedForSave || existing.quoted_content,
                  media: incomingMedia.length > 0 ? incomingMedia : existing.media,
                  // Safeguard against 'Unknown' overwriting valid quoted_content
                  quoted_content: (tweet.quoted_content && (tweet.quoted_content.author_name !== 'Unknown' || !existing.quoted_content))
                    ? tweet.quoted_content : existing.quoted_content,

                  url_cards: incomingCards.length > 0 ? incomingCards : existing.url_cards,
                  is_repost: tweet.is_repost ?? existing.is_repost,

                  // Safeguard against 'Unknown' overwriting valid original_author info
                  original_author: (tweet.original_author && (tweet.original_author !== 'unknown' || !existing.original_author))
                    ? tweet.original_author : existing.original_author,
                  original_author_name: (tweet.original_author_name && (tweet.original_author_name !== 'Unknown' || !existing.original_author_name))
                    ? tweet.original_author_name : existing.original_author_name,

                  original_author_avatar: tweet.original_author_avatar || existing.original_author_avatar,
                  media: mediaForSave,
                  is_media_archived: mediaForSave.length > 0 ? !hasS3Gaps(mediaForSave) : existing.is_media_archived,
                  scraped_content: mediaForSave.length > 0 ? `Media Count: ${mediaForSave.length}` : existing.scraped_content,
                  engagement: newEngagement,
                  location: tweet.location || existing.location,
                  raw_data: tweet.raw_data || existing.raw_data
                },
                $push: {
                  engagement_history: {
                    $each: [historyPoint],
                    $slice: -50
                  }
                }
              },
              { new: true }
            );
            //(() => {})(`[Monitor] Updated metrics/meta for ${tweet.id} from ${source.display_name}`);

            // Add to newContent so it gets checked for velocity alerts
            // We attach a flag 'is_update' so analysis service can skip re-analysis if needed
            updatedDoc.is_update = true;
            newContent.push(updatedDoc);

            if (needsArchive) {
              queueXTweetMediaArchive({
                query: { id: existing.id },
                tweetId: tweet.id,
                media: archiveMainCandidates,
                quotedContent: archiveQuotedCandidates,
                sourceTag: 'x-update'
              });
            }
          }
          postsSucceeded += 1;
          continue;
        }

        const incomingMedia = Array.isArray(tweet.media) ? tweet.media : [];
        const incomingQuoted = tweet.quoted_content || null;
        const shouldArchive = hasAnyTwitterMedia(incomingMedia, incomingQuoted);

        const content = new Content({
          source_id: source.id,
          platform: 'x',
          content_id: tweet.id,
          content_url: tweet.url,
          text: tweet.text,
          scraped_content: incomingMedia.length > 0 ? `Media Count: ${incomingMedia.length}` : '',
          media: incomingMedia,
          is_media_archived: false,
          is_repost: tweet.is_repost || false,
          original_author: tweet.original_author,
          original_author_name: tweet.original_author_name,
          original_author_avatar: tweet.original_author_avatar,
          quoted_content: incomingQuoted,
          url_cards: tweet.url_cards || [],
          author: source.display_name,
          author_handle: source.identifier,
          published_at: new Date(tweet.created_at),
          location: tweet.location || null,
          engagement: engagementFromXMetricsBag(tweet.metrics || {})
        });

        await content.save();
        newContent.push(content);
        enqueueMediaLocationExtraction(content.id);

        if (shouldArchive) {
          queueXTweetMediaArchive({
            query: { id: content.id },
            tweetId: tweet.id,
            media: incomingMedia,
            quotedContent: incomingQuoted,
            sourceTag: 'x-create'
          });
        }
        //(() => {})(`New X post: ${tweet.id} from ${source.display_name}`);
        postsSucceeded += 1;
      } catch (tweetError) {
        postsFailed += 1;
        logger.error(`[Monitor:X] ⚠️ Post failure: source="${source.display_name}" platform=x tweet=${tweet?.id || "unknown"} stage=persist type=${classifyScanError(tweetError)} error=${tweetError.message}`);
      }
    }

    // ── AUDIT SUMMARY ──
    const newCreated = newContent.filter(c => !c.is_update).length;
    const updated = newContent.filter(c => c.is_update).length;
    logger.info(`[Monitor:X] ✅ ${source.display_name} (@${source.identifier}): API=${beforeFilter}→24hFilter=${tweets.length} | new=${newCreated}, updated=${updated}, failed=${postsFailed}, total_processed=${newContent.length}`);

    // Queue background URL card enrichment for new content
    if (newContent.length > 0) {
      const contentIds = newContent.map(c => c.id);
      queueUrlEnrichment(contentIds);
    }

    // Update last_checked AFTER content is actually processed/saved
    await Source.findOneAndUpdate({ id: source.id }, { last_checked: new Date() });

    // Retweet sync disabled — engager analysis is now on-demand only (triggered from alert card)
    // try {
    //   const retweetCandidates = newContent.filter(
    //     (doc) => Number(doc?.engagement?.retweets || 0) > 0
    //   );
    //   if (retweetCandidates.length > 0) {
    //     await syncRetweetRelationshipsForSource(source, retweetCandidates, {
    //       maxTweets: retweetCandidates.length,
    //       staleHours: 1
    //     });
    //   }
    // } catch (retweetSyncError) {
    //   (() => {})(`[Retweet Network] monitor sync warning for ${source.identifier}: ${retweetSyncError.message}`);
    // }

    return scanResult(newContent, SCAN_OUTCOME.OK, null, {
      posts_attempted: postsAttempted,
      posts_succeeded: postsSucceeded,
      posts_failed: postsFailed,
      new: newCreated,
      updated
    });
  } catch (error) {
    const outcome = classifyScanError(error);
    logger.error(`Error monitoring X source ${source.display_name} (${outcome}): ${error.message}`);
    return scanResult([], outcome, error.message);
  }
};

const monitorInstagramSource = async (source, accessToken) => {
  try {
    const igKeys = rapidApiInstagramService.getInstagramRapidApiKeys();
    if (!igKeys || igKeys.length === 0) {
      logger.info('[Instagram Monitor] ⚠️ No RapidAPI Instagram keys configured. Skipping scan.');
      // Do NOT update last_checked — keys not configured is not a successful check
      return scanResult([], SCAN_OUTCOME.AUTH_CONFIG, 'no RapidAPI Instagram key configured');
    }

    // ─── Handle Normalization ──────────────────────────────────────────────
    const normalizeHandle = (value) => {
      let str = String(value || '').trim();
      if (str.includes('instagram.com/')) {
        try {
          if (!str.startsWith('http')) str = 'https://' + str;
          const urlObj = new URL(str);
          const segments = urlObj.pathname.split('/').filter(Boolean);
          if (segments.length > 0) return segments[0].toLowerCase();
        } catch (e) { /* fallback */ }
      }
      return str.replace(/^@/, '').toLowerCase();
    };

    const handle = normalizeHandle(source.identifier || source.display_name);
    if (!handle) {
      logger.info(`[Instagram Monitor] ⚠️ No valid handle for source ${source.display_name}`);
      return scanResult([], SCAN_OUTCOME.IDENTITY_UNRESOLVED, 'source has no usable Instagram handle');
    }

    logger.info(`[Instagram Monitor] 🔍 Starting scan for @${handle} (${source.display_name})`);

    // ─── Utility Helpers ───────────────────────────────────────────────────
    const toJsDate = (value) => {
      if (!value) return new Date();
      if (value instanceof Date) return value;
      if (typeof value === 'number') {
        const ms = value < 1e12 ? value * 1000 : value;
        const d = new Date(ms);
        return isNaN(d) ? new Date() : d;
      }
      const d = new Date(value);
      return isNaN(d) ? new Date() : d;
    };

    const pickFirst = (...values) => values.find(v => v !== undefined && v !== null && v !== '');
    const asArray = (value) => (Array.isArray(value) ? value : []);
    const INSTAGRAM_VIDEO_EXT_RE = /\.(mp4|webm|m3u8|mov)(\?|$)/i;
    const INSTAGRAM_VIDEO_CDN_RE = /(video\.cdninstagram\.com|\/o1\/v\/t\d+|video[^.]*\.fbcdn\.net)/i;
    const isInstagramVideoUrl = (rawUrl) => {
      if (typeof rawUrl !== 'string' || !rawUrl) return false;
      if (INSTAGRAM_VIDEO_EXT_RE.test(rawUrl)) return true;
      if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(rawUrl)) return false;
      return INSTAGRAM_VIDEO_CDN_RE.test(rawUrl);
    };

    const unwrapStoryNode = (item) => {
      if (!item || typeof item !== 'object') return item;
      let current = item;
      let depth = 0;

      while (depth < 6) {
        const next = current?.node || current?.media || current?.story || current?.item || current?.data || null;
        if (!next || next === current || typeof next !== 'object') break;
        current = next;
        depth += 1;
      }

      return current;
    };

    const pickBestVideoVariantUrl = (variants = []) => {
      const normalized = variants
        .map((variant) => {
          if (typeof variant === 'string') return { url: variant, contentType: '' };
          if (!variant || typeof variant !== 'object') return null;
          return {
            ...variant,
            url: variant.url || variant.src,
            contentType: variant.content_type || variant.mime_type || variant.type || ''
          };
        })
        .filter((variant) => typeof variant?.url === 'string' && variant.url.trim());

      if (!normalized.length) return null;

      const mp4Only = normalized.filter((variant) => {
        const contentType = String(variant.contentType || '').toLowerCase();
        return !contentType || contentType.includes('mp4');
      });

      const selectable = mp4Only.length > 0 ? mp4Only : normalized;
      selectable.sort((a, b) => Number(b.bitrate || b.bandwidth || 0) - Number(a.bitrate || a.bandwidth || 0));
      return selectable[0]?.url || null;
    };

    // ─── Profile Extraction (deep fallbacks for different API shapes) ─────
    const extractProfile = (raw) => {
      if (!raw) return null;
      const data = raw?.data?.data || raw?.data || raw?.result || raw;
      const user =
        data?.user ||
        data?.data?.user ||
        data?.user_info?.user ||
        data?.userInfo ||
        data?.profile ||
        data?.result?.user ||
        data?.result?.data?.user ||
        data?.graphql?.user ||
        null;

      if (!user) return null;

      const username = pickFirst(user.username, user.user?.username, user.handle);
      const fullName = pickFirst(user.full_name, user.name, user.fullName, user.user?.full_name);
      const profilePic = pickFirst(
        user.profile_pic_url_hd,
        user.profile_pic_url,
        user.profile_pic,
        user.avatar,
        user.user?.profile_pic_url
      );
      const followers = pickFirst(
        user.edge_followed_by?.count,
        user.follower_count,
        user.followers,
        user.followers_count
      );
      const posts = pickFirst(
        user.edge_owner_to_timeline_media?.count,
        user.media_count,
        user.posts_count,
        user.post_count
      );
      const verified = pickFirst(user.is_verified, user.isVerified);
      const bio = pickFirst(user.biography, user.bio, user.description, '');

      return { username, fullName, profilePic, followers, posts, verified, bio };
    };

    // ─── Post Extraction (handles 10+ different API response shapes) ──────
    const extractPosts = (raw) => {
      if (!raw) return [];
      // Check raw.response first — RapidAPI Instagram wraps posts in { response: [...], success: true }
      if (Array.isArray(raw?.response)) return raw.response.map(item => item?.node || item).filter(Boolean);
      const data = raw?.data?.data || raw?.data || raw?.result || raw;
      if (Array.isArray(data)) return data.map(item => item?.node || item).filter(Boolean);
      const candidates = [
        data?.edges,
        data?.user?.edge_owner_to_timeline_media?.edges,
        data?.data?.user?.edge_owner_to_timeline_media?.edges,
        data?.edge_owner_to_timeline_media?.edges,
        data?.graphql?.user?.edge_owner_to_timeline_media?.edges,
        data?.items,
        data?.data?.items,
        data?.posts,
        data?.data?.posts,
        data?.results,
        data?.data?.results,
        data?.feed?.items,
        data?.media?.items
      ];
      const list = candidates.find(Array.isArray) || [];
      return list.map(item => item?.node || item).filter(Boolean);
    };

    // ─── Story Extraction (handles various API response shapes) ───────────
    const extractStories = (raw) => {
      if (!raw) return [];
      const data = raw?.data?.data || raw?.data || raw?.result || raw;

      const extracted = [];
      const appendCandidates = (input) => {
        asArray(input).forEach((entry) => {
          const unwrapped = unwrapStoryNode(entry);
          if (Array.isArray(unwrapped?.items)) {
            unwrapped.items.forEach((nestedEntry) => extracted.push(unwrapStoryNode(nestedEntry)));
            return;
          }
          extracted.push(unwrapped);
        });
      };

      if (Array.isArray(data)) {
        appendCandidates(data);
      } else {
        const candidates = [
          data?.reel?.items,
          data?.reel_media?.items,
          data?.reels_media?.[0]?.items,
          data?.story?.items,
          data?.story_items,
          data?.stories,
          data?.items,
          data?.data?.stories,
          data?.data?.items,
          data?.data?.reel?.items,
          data?.user?.reel?.items,
          data?.highlights,
          data?.data?.highlights
        ];

        candidates.forEach(appendCandidates);
        asArray(data?.reels_media).forEach((reel) => appendCandidates(reel?.items));
      }

      return extracted.filter(Boolean);
    };

    // ─── Media Normalization ───────────────────────────────────────────────
    const normalizeMediaItem = (item) => {
      if (!item) return null;

      if (typeof item === 'string') {
        const rawUrl = item.trim();
        if (!rawUrl) return null;
        const isVideoUrl = isInstagramVideoUrl(rawUrl);
        return {
          type: isVideoUrl ? 'video' : 'photo',
          url: rawUrl,
          ...(isVideoUrl ? { video_url: rawUrl } : {}),
          preview: rawUrl
        };
      }

      const normalizedItem = unwrapStoryNode(item);
      const videoVersions = [
        ...asArray(normalizedItem?.video_versions),
        ...asArray(normalizedItem?.videoVersions),
        ...asArray(normalizedItem?.video_resources),
        ...asArray(normalizedItem?.variants)
      ];

      const bestVariantUrl = pickBestVideoVariantUrl(videoVersions);
      const directVideoUrl = pickFirst(
        normalizedItem?.video_url,
        normalizedItem?.videoUrl,
        normalizedItem?.video?.url,
        normalizedItem?.play_url,
        bestVariantUrl
      );

      const imageCandidates = [
        normalizedItem?.preview,
        normalizedItem?.preview_image_url,
        normalizedItem?.thumbnail_url,
        normalizedItem?.thumbnail_src,
        normalizedItem?.display_url,
        normalizedItem?.image_url,
        normalizedItem?.cover_frame_url,
        ...asArray(normalizedItem?.image_versions2?.candidates).map((candidate) => candidate?.url),
        ...asArray(normalizedItem?.image_versions).map((candidate) => candidate?.url),
        ...asArray(normalizedItem?.display_resources).map((resource) => resource?.src)
      ];

      const imageUrl = pickFirst(
        ...imageCandidates,
        normalizedItem?.url
      );

      const mediaType = String(normalizedItem?.type || normalizedItem?.media_type || '').toLowerCase();
      const isVideo = !!(
        normalizedItem?.is_video ||
        mediaType === 'video' ||
        mediaType === 'animated_gif' ||
        mediaType === '2' ||
        directVideoUrl ||
        videoVersions.length > 0 ||
        isInstagramVideoUrl(normalizedItem?.url)
      );

      const url = isVideo ? pickFirst(directVideoUrl, imageUrl) : imageUrl;
      if (!url) return null;

      const preview = pickFirst(imageUrl, url, directVideoUrl);
      return {
        type: isVideo ? 'video' : 'photo',
        url,
        preview,
        ...(isVideo ? { video_url: pickFirst(directVideoUrl, url) } : {}),
        ...(isVideo && videoVersions.length ? { video_versions: videoVersions } : {}),
        original_url: url,
        ...(isVideo ? { original_video_url: pickFirst(directVideoUrl, url) } : {})
      };
    };

    const normalizeMedia = (node) => {
      const normalizedNode = unwrapStoryNode(node);
      const children = (
        normalizedNode?.edge_sidecar_to_children?.edges ||
        normalizedNode?.carousel_media ||
        normalizedNode?.carousel ||
        []
      );

      if (Array.isArray(children) && children.length > 0) {
        return children
          .map(child => normalizeMediaItem(unwrapStoryNode(child)))
          .filter(Boolean);
      }

      const single = normalizeMediaItem(normalizedNode);
      return single ? [single] : [];
    };

    const hasUsableMedia = (mediaItems = []) => (
      Array.isArray(mediaItems) &&
      mediaItems.some((mediaItem) => typeof mediaItem?.url === 'string' && mediaItem.url.trim())
    );

    // ─── STEP 1: Fetch Profile (with fallback to cached data) ─────────────
    let profile = null;
    let profileFetchFailed = false;

    try {
      const profileRaw = await rapidApiInstagramService.fetchUserProfile(handle);
      profile = extractProfile(profileRaw);
      if (profile) {
        logger.info(`[Instagram Monitor] ✅ Profile fetched: ${profile.fullName || profile.username || handle}`);
      }
    } catch (profileErr) {
      profileFetchFailed = true;
      logger.error(`[Instagram Monitor] ⚠️ Profile fetch failed for @${handle}: ${profileErr.message}. Using cached data.`);
    }

    // Update source metadata from fresh profile (or keep existing)
    if (profile) {
      const set = {};
      const push = {};

      if (profile.fullName && profile.fullName !== source.display_name) set.display_name = profile.fullName;
      if (profile.profilePic && profile.profilePic !== source.profile_image_url) set.profile_image_url = profile.profilePic;
      if (profile.verified !== undefined && profile.verified !== null) set.is_verified = profile.verified;

      if (profile.followers || profile.posts) {
        const existingStats = source.statistics || {};
        set.statistics = {
          ...existingStats,
          subscriber_count: Number(profile.followers) || existingStats.subscriber_count || 0,
          video_count: Number(profile.posts) || existingStats.video_count || 0,
          view_count: existingStats.view_count || 0
        };

        push.history = {
          date: new Date(),
          subscriber_count: Number(profile.followers) || 0,
          video_count: Number(profile.posts) || 0,
          view_count: existingStats.view_count || 0
        };
      }

      const update = {};
      if (Object.keys(set).length > 0) update.$set = set;
      if (Object.keys(push).length > 0) update.$push = push;
      if (Object.keys(update).length > 0) {
        await Source.findOneAndUpdate({ id: source.id }, update);
        //(() => {})(`[Instagram Monitor] 📝 Updated source metadata for @${handle}`);
      }
    }

    // ─── STEP 2: Fetch Posts (with fallback — continue even if profile failed) ──
    let posts = [];
    let postsFetchFailed = false;

    try {
      const postsRaw = await rapidApiInstagramService.fetchUserPosts(handle);
      if (postsRaw === null) {
        // API returned null = all endpoints failed (not "user has 0 posts")
        postsFetchFailed = true;
        logger.error(`[Instagram Monitor] ⚠️ fetchUserPosts returned null for @${handle} — API failure`);
      } else if (postsRaw?.success === false || postsRaw?.response_type === 'page not found') {
        // API explicitly said this account doesn't exist / is private
        postsFetchFailed = true;
        logger.info(`[Instagram Monitor] ⚠️ Account not found/private for @${handle}: ${postsRaw?.message || postsRaw?.response_type}`);
      } else {
        posts = extractPosts(postsRaw);
        logger.info(`[Instagram Monitor] 📦 Extracted ${posts.length} posts for @${handle}`);
      }
    } catch (postsErr) {
      // A rate limit is a platform-wide condition, not a per-source API error.
      // Let it reach the outer catch so classifyScanError yields RATE_LIMIT and
      // the platform breaker arms instead of hammering every remaining source.
      if (postsErr?.isRateLimit) throw postsErr;
      postsFetchFailed = true;
      logger.error(`[Instagram Monitor] ❌ Posts fetch failed for @${handle}: ${postsErr.message}`);
    }

    // If both profile and posts failed, something is seriously wrong with this source
    if (profileFetchFailed && postsFetchFailed) {
      logger.error(`[Instagram Monitor] 🚨 Complete API failure for @${handle}. All API keys may be exhausted. Will retry next cycle.`);
      // Do NOT update last_checked on API failure — so it retries next cycle
      return scanResult([], SCAN_OUTCOME.API_ERROR, 'profile and posts fetch both failed');
    }

    if (!posts || posts.length === 0) {
      if (postsFetchFailed) {
        // Posts API failed but profile worked — don't mark as checked
        logger.error(`[Instagram Monitor] ⚠️ Posts API failed for @${handle} but profile succeeded — will retry`);
        return scanResult([], SCAN_OUTCOME.API_ERROR, 'posts fetch failed (profile succeeded)');
      }
      logger.info(`[Instagram Monitor] ℹ️ No posts found for @${handle} (may be private or empty)`);
      await Source.findOneAndUpdate({ id: source.id }, { last_checked: new Date() });
      return scanResult([], SCAN_OUTCOME.OK, 'API returned zero posts', {
        posts_attempted: 0, posts_succeeded: 0, posts_failed: 0, new: 0, updated: 0
      });
    }

    // ─── STEP 3: Process Each Post (with per-post error isolation) ────────
    const newContent = [];
    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const post of posts) {
      try {
        const shortcode = pickFirst(post.shortcode, post.code);
        const contentId = String(pickFirst(post.id, post.pk, post.media_id, shortcode));
        if (!contentId) {
          // No id, pk, media_id or shortcode — nothing stable to key Content on.
          // Counted as a skip, never as a silent success.
          skippedCount += 1;
          continue;
        }

        let content = await Content.findOne({ platform: 'instagram', content_id: contentId });

        const caption =
          pickFirst(
            post.edge_media_to_caption?.edges?.[0]?.node?.text,
            post.caption?.text,
            post.text,
            post.caption_text,
            ''
          ) || '';

        // Safe date parsing with fallback
        let createdAt;
        try {
          createdAt = toJsDate(pickFirst(post.taken_at_timestamp, post.taken_at, post.created_time, post.timestamp, post.created_at));
        } catch (dateErr) {
          createdAt = new Date();
          //(() => {})(`[Instagram Monitor] ⚠️ Date parse failed for post ${contentId}, using now()`);
        }

        const media = normalizeMedia(post);
        const contentUrl = pickFirst(
          post.permalink,
          shortcode ? `https://www.instagram.com/p/${shortcode}/` : null,
          post.url
        );

        // Geotag — try the feed payload first; if absent, fall back to the
        // per-post detail endpoint (costs +1 RapidAPI call, but only when
        // missing). Skip enrichment for already-stored content that already
        // has a location so we don't burn quota re-fetching.
        let location = rapidApiInstagramService.extractInstagramLocation(post);
        if (!location && shortcode) {
          const existingLoc = content?.location?.name ? content.location : null;
          if (existingLoc) {
            location = existingLoc;
          } else {
            try {
              const detail = await rapidApiInstagramService.fetchInstagramPostDetail(shortcode);
              if (detail?.location?.name) location = detail.location;
            } catch (locErr) {
              // Non-fatal — location is best-effort
            }
          }
        }

        // Engagement extraction — only fields actually present on the API node
        const extractedEngagement = extractInstagramEngagement(post);

        if (content) {
          const existingMedia = Array.isArray(content.media) ? content.media : [];
          const preserveArchivedMedia = content.is_media_archived === true &&
            existingMedia.length > 0 &&
            !hasS3Gaps(existingMedia);
          const mediaForSave = media.length > 0
            ? (preserveArchivedMedia ? existingMedia : media)
            : existingMedia;
          const needsArchive = hasS3Gaps(mediaForSave);

          // ── UPDATE existing content (metrics refresh, like X monitoring) ──
          const newEngagement = mergeEngagement(content.engagement, extractedEngagement);

          const updatedDoc = await Content.findOneAndUpdate(
            { id: content.id },
            {
              $set: {
                text: caption || content.text,
                media: mediaForSave,
                is_media_archived: mediaForSave.length > 0 ? !hasS3Gaps(mediaForSave) : content.is_media_archived,
                engagement: newEngagement,
                location: location || content.location || null,
                author: profile?.fullName || content.author || source.display_name,
                author_handle: handle || content.author_handle || source.identifier
              },
              $push: {
                engagement_history: {
                  $each: [{
                    timestamp: new Date(),
                    ...(newEngagement.likes !== undefined ? { likes: newEngagement.likes } : {}),
                    ...(newEngagement.comments !== undefined ? { comments: newEngagement.comments } : {}),
                    ...(newEngagement.views !== undefined ? { views: newEngagement.views } : {})
                  }],
                  $slice: -50 // Keep last 50 history entries
                }
              }
            },
            { new: true }
          );

          if (updatedDoc) {
            // Safeguard Author Updates (Separate Update)
            const isUnknown = (val) => !val || String(val).trim().toLowerCase() === 'unknown' || String(val).trim().toLowerCase() === 'unknown user';
            const newAuthor = profile?.fullName || source.display_name;
            const newHandle = handle || source.identifier;

            if (!isUnknown(newAuthor) || isUnknown(updatedDoc.author)) {
              await Content.updateOne({ id: content.id }, { $set: { author: newAuthor || content.author } });
            }
            if (!isUnknown(newHandle) || isUnknown(updatedDoc.author_handle)) {
              await Content.updateOne({ id: content.id }, { $set: { author_handle: newHandle || content.author_handle } });
            }

            updatedDoc.is_update = true;
            newContent.push(updatedDoc);
            updatedCount++;

            if (needsArchive) {
              queueInstagramMediaArchive({
                query: { id: content.id },
                contentId,
                media: mediaForSave,
                sourceTag: 'instagram-update'
              });
            }
          }
        } else {
          // ── CREATE new content ────────────────────────────────────────────
          content = new Content({
            source_id: source.id,
            platform: 'instagram',
            content_id: contentId,
            content_url: contentUrl || `https://www.instagram.com/p/${shortcode || contentId}/`,
            text: caption || 'Instagram post',
            scraped_content: media.length > 0 ? `Media Count: ${media.length}` : '',
            media,
            author: profile?.fullName || source.display_name,
            author_handle: handle || source.identifier,
            published_at: createdAt,
            location: location || null,
            engagement: extractedEngagement
          });
          await content.save();
          newContent.push(content);
          processedCount++;
          logger.info(`[Instagram Monitor] 🆕 New post: ${contentId} from @${handle}`);
          enqueueMediaLocationExtraction(content.id);

          queueInstagramMediaArchive({
            query: { id: content.id },
            contentId,
            media,
            sourceTag: 'instagram-create'
          });
        }
      } catch (postErr) {
        errorCount++;
        logger.error(`[Instagram Monitor] ⚠️ Post failure: source="${source.display_name}" platform=instagram post=${post?.id || post?.pk || post?.code || 'unknown'} stage=persist type=${classifyScanError(postErr)} error=${postErr.message}`);
        // Continue processing remaining posts
      }
    }

    // ─── STEP 4: Fetch Stories (ephemeral, 24h content) ────────────────
    let storiesCount = 0;
    try {
      const storiesRaw = await rapidApiInstagramService.fetchUserStories(handle);
      const stories = extractStories(storiesRaw);
      //(() => {})(`[Instagram Monitor] 📖 Extracted ${stories.length} stories for @${handle}`);

      for (const story of stories) {
        try {
          const storyId = String(pickFirst(story.id, story.pk, story.story_id, story.media_id));
          if (!storyId) continue;

          const caption = pickFirst(story.caption?.text, story.text, '') || '';
          let createdAt;
          try {
            createdAt = toJsDate(pickFirst(story.taken_at, story.taken_at_timestamp, story.timestamp, story.created_at));
          } catch (dateErr) {
            createdAt = new Date();
          }

          const media = normalizeMedia(story);
          const storyUrl = pickFirst(
            story.story_url,
            story.url,
            `https://www.instagram.com/stories/${handle}/${storyId}/`
          );

          const expiresAt = story.expiring_at
            ? toJsDate(story.expiring_at)
            : new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // 24h from creation

          // Check if story already exists and repair only when media was missing earlier.
          const existingStory = await Content.findOne({
            platform: 'instagram',
            content_id: storyId,
            content_type: 'story'
          });

          if (existingStory) {
            const existingHasMedia = hasUsableMedia(existingStory.media);
            const incomingHasMedia = hasUsableMedia(media);
            const existingMedia = Array.isArray(existingStory.media) ? existingStory.media : [];
            const preserveArchivedMedia = existingStory.is_media_archived === true &&
              existingMedia.length > 0 &&
              !hasS3Gaps(existingMedia);
            const mediaForSave = incomingHasMedia
              ? (preserveArchivedMedia ? existingMedia : media)
              : existingMedia;
            const needsArchive = hasS3Gaps(mediaForSave);

            if ((!existingHasMedia && incomingHasMedia) || (incomingHasMedia && !preserveArchivedMedia)) {
              existingStory.media = mediaForSave;
              existingStory.content_url = storyUrl || existingStory.content_url;
              existingStory.scraped_content = `Story expires: ${expiresAt.toISOString()}`;
              existingStory.is_media_archived = mediaForSave.length > 0 ? !hasS3Gaps(mediaForSave) : existingStory.is_media_archived;
              if ((!existingStory.text || existingStory.text === 'Instagram Story') && caption) {
                existingStory.text = caption;
              }
              await existingStory.save();
              updatedCount++;
              //(() => {})(`[Instagram Monitor] 🔧 Repaired story media: ${storyId} from @${handle}`);
            }

            if (needsArchive) {
              queueInstagramMediaArchive({
                query: { id: existingStory.id },
                contentId: storyId,
                media: mediaForSave,
                sourceTag: 'instagram-story-update'
              });
            }

            continue;
          }

          const storyContent = new Content({
            source_id: source.id,
            platform: 'instagram',
            content_type: 'story',
            content_id: storyId,
            content_url: storyUrl,
            text: caption || 'Instagram Story',
            scraped_content: `Story expires: ${expiresAt.toISOString()}`,
            media,
            author: profile?.fullName || source.display_name,
            author_handle: handle || source.identifier,
            published_at: createdAt,
            engagement: extractInstagramEngagement(story)
          });
          await storyContent.save();
          newContent.push(storyContent);
          storiesCount++;
          //(() => {})(`[Instagram Monitor] 📖 New story: ${storyId} from @${handle}`);

          queueInstagramMediaArchive({
            query: { id: storyContent.id },
            contentId: storyId,
            media,
            sourceTag: 'instagram-story-create'
          });
        } catch (storyErr) {
          //(() => {})(`[Instagram Monitor] ⚠️ Error processing story: ${storyErr.message}`);
        }
      }
    } catch (storiesErr) {
      //(() => {})(`[Instagram Monitor] ⚠️ Stories fetch failed for @${handle}: ${storiesErr.message}`);
      // Stories are optional, continue without them
    }

    // ─── STEP 5: Update source last_checked ──────────────────────────────
    await Source.findOneAndUpdate({ id: source.id }, { last_checked: new Date() });

    logger.info(`[Instagram Monitor] ✅ Scan complete for @${handle}: ${processedCount} new posts, ${storiesCount} stories, ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`);
    if (skippedCount > 0) {
      logger.warn(`[Instagram Monitor] ⚠️ @${handle}: ${skippedCount}/${posts.length} post(s) not persisted [no_resolvable_content_id]`);
    }
    return scanResult(newContent, SCAN_OUTCOME.OK, null, {
      posts_attempted: posts.length,
      posts_succeeded: posts.length - errorCount - skippedCount,
      posts_failed: errorCount,
      posts_skipped: skippedCount,
      new: processedCount,
      updated: updatedCount
    });

  } catch (error) {
    const outcome = classifyScanError(error);
    logger.error(`[Instagram Monitor] ❌ Fatal error monitoring ${source.display_name} (${outcome}): ${error.message}`);
    // Do NOT update last_checked on fatal error — let it retry
    return scanResult([], outcome, error.message);
  }
};

const monitorFacebookSource = async (source, accessToken, options = {}) => {
  try {
    const FACEBOOK_VIDEO_URL_RE = /\.(mp4|webm|mkv|mov|avi|m3u8)(\?|$)/i;

    const isFacebookVideoUrl = (url) => typeof url === 'string' && (
      FACEBOOK_VIDEO_URL_RE.test(url) || /(^|[/?=_-])video([/?=_-]|$)/i.test(url)
    );

    const readFacebookMediaUrl = (value, depth = 0) => {
      if (depth > 3 || value === null || value === undefined) return '';
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || '';
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          const found = readFacebookMediaUrl(entry, depth + 1);
          if (found) return found;
        }
        return '';
      }
      if (typeof value === 'object') {
        const directKeys = [
          's3_url',
          'video_url',
          'videoUrl',
          'url',
          'uri',
          'src',
          'source',
          'href',
          'hd_url',
          'sd_url',
          'playable_url',
          'playable_url_quality_hd',
          'playable_url_quality_sd',
          'playable_url_hd',
          'playable_url_sd',
          'browser_native_hd_url',
          'browser_native_sd_url',
          'browser_native_src',
          'download_url',
          'secure_url',
          'image_url',
          'thumbnail_url',
          'preview_url',
          'preview_image_url',
          'display_url',
          'thumbnail_src',
          'cover_frame_url',
          'poster',
          'poster_url',
          'original_url'
        ];

        for (const key of directKeys) {
          const found = readFacebookMediaUrl(value[key], depth + 1);
          if (found) return found;
        }

        if (value.thumbnails && typeof value.thumbnails === 'object') {
          const thumbPriority = ['maxres', 'high', 'medium', 'default', 'small'];
          for (const key of thumbPriority) {
            const found = readFacebookMediaUrl(value.thumbnails[key], depth + 1);
            if (found) return found;
          }
          const anyThumb = readFacebookMediaUrl(Object.values(value.thumbnails), depth + 1);
          if (anyThumb) return anyThumb;
        }

        const nestedKeys = ['image', 'video', 'thumbnail', 'preview', 'media', 'picture', 'attachment', 'node', 'cover', 'poster'];
        for (const key of nestedKeys) {
          const found = readFacebookMediaUrl(value[key], depth + 1);
          if (found) return found;
        }

        const listKeys = ['images', 'media', 'items', 'data', 'attachments', 'subattachments', 'children', 'nodes', 'edges', 'sources', 'video_versions', 'videoVersions'];
        for (const key of listKeys) {
          const found = readFacebookMediaUrl(value[key], depth + 1);
          if (found) return found;
        }
      }

      return '';
    };

    const collectFacebookMediaUrls = (...values) => {
      const seen = new Set();
      const urls = [];

      const visit = (value, depth = 0) => {
        if (depth > 4 || value === null || value === undefined) return;
        if (Array.isArray(value)) {
          value.forEach((entry) => visit(entry, depth + 1));
          return;
        }

        const resolved = readFacebookMediaUrl(value);
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          urls.push(resolved);
        }
      };

      values.forEach((value) => visit(value));
      return urls;
    };

    const normalizeFacebookMediaItems = (mediaInput) => {
      const sourceMedia = Array.isArray(mediaInput) ? mediaInput : (mediaInput ? [mediaInput] : []);
      const normalized = [];
      const seen = new Set();

      const expandedMedia = sourceMedia.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return entry ? [entry] : [];

        const nested = [
          ...(Array.isArray(entry.media) ? entry.media : []),
          ...(Array.isArray(entry.images) ? entry.images : []),
          ...(Array.isArray(entry.items) ? entry.items : []),
          ...(Array.isArray(entry.data) ? entry.data : []),
          ...(Array.isArray(entry.attachments) ? entry.attachments : []),
          ...(Array.isArray(entry.attachments?.data) ? entry.attachments.data : []),
          ...(Array.isArray(entry.attachments?.media) ? entry.attachments.media : []),
          ...(Array.isArray(entry.subattachments) ? entry.subattachments : []),
          ...(Array.isArray(entry.subattachments?.data) ? entry.subattachments.data : []),
          ...(Array.isArray(entry.all_subattachments) ? entry.all_subattachments : []),
          ...(Array.isArray(entry.all_subattachments?.nodes) ? entry.all_subattachments.nodes : []),
          ...(Array.isArray(entry.children) ? entry.children : []),
          ...(Array.isArray(entry.nodes) ? entry.nodes : [])
        ];

        const hasDirectMediaValue = Boolean(readFacebookMediaUrl([
          entry?.s3_url,
          entry?.video_url,
          entry?.videoUrl,
          entry?.url,
          entry?.uri,
          entry?.src,
          entry?.hd_url,
          entry?.sd_url,
          entry?.playable_url,
          entry?.playable_url_quality_hd,
          entry?.playable_url_quality_sd,
          entry?.browser_native_hd_url,
          entry?.browser_native_sd_url,
          entry?.image_url,
          entry?.thumbnail_url,
          entry?.preview_url,
          entry?.preview_image_url,
          entry?.original_url,
          entry?.original_video_url
        ]));

        if (nested.length > 0) {
          return hasDirectMediaValue ? [entry, ...nested] : nested;
        }

        return [entry];
      });

      for (const mediaEntry of expandedMedia) {
        const typeHint = String(
          mediaEntry?.type
          || mediaEntry?.media_type
          || mediaEntry?.mime_type
          || mediaEntry?.kind
          || mediaEntry?.__typename
          || ''
        ).toLowerCase();

        const videoCandidates = collectFacebookMediaUrls(
          mediaEntry?.s3_url,
          mediaEntry?.video_url,
          mediaEntry?.videoUrl,
          mediaEntry?.original_video_url,
          mediaEntry?.hd_url,
          mediaEntry?.sd_url,
          mediaEntry?.playable_url,
          mediaEntry?.playable_url_quality_hd,
          mediaEntry?.playable_url_quality_sd,
          mediaEntry?.playable_url_hd,
          mediaEntry?.playable_url_sd,
          mediaEntry?.browser_native_hd_url,
          mediaEntry?.browser_native_sd_url,
          mediaEntry?.browser_native_src,
          mediaEntry?.source,
          mediaEntry?.sources,
          mediaEntry?.video_versions,
          mediaEntry?.videoVersions,
          mediaEntry?.video?.playable_url,
          mediaEntry?.video?.playable_url_quality_hd,
          mediaEntry?.video?.playable_url_quality_sd,
          mediaEntry?.video?.playable_url_hd,
          mediaEntry?.video?.playable_url_sd,
          mediaEntry?.video?.browser_native_hd_url,
          mediaEntry?.video?.browser_native_sd_url,
          mediaEntry?.video?.browser_native_src,
          mediaEntry?.video?.hd_url,
          mediaEntry?.video?.sd_url,
          mediaEntry?.video?.video_url,
          mediaEntry?.video?.url,
          mediaEntry?.video?.src,
          mediaEntry?.media_url_https,
          mediaEntry?.media_url
        );

        const imageCandidates = collectFacebookMediaUrls(
          mediaEntry?.s3_preview,
          mediaEntry?.preview,
          mediaEntry?.preview_url,
          mediaEntry?.original_preview,
          mediaEntry?.thumbnail_url,
          mediaEntry?.thumbnail_src,
          mediaEntry?.preview_image_url,
          mediaEntry?.image_url,
          mediaEntry?.display_url,
          mediaEntry?.cover_frame_url,
          mediaEntry?.poster,
          mediaEntry?.poster_url,
          mediaEntry?.image,
          mediaEntry?.picture,
          mediaEntry?.thumbnail,
          mediaEntry?.thumbnails,
          mediaEntry?.photo_image,
          mediaEntry?.media_image,
          mediaEntry?.image_lowres,
          mediaEntry?.image_highres,
          mediaEntry?.imageHigh,
          mediaEntry?.image_versions2?.candidates,
          mediaEntry?.image_versions,
          mediaEntry?.display_resources
        );

        const generalCandidates = collectFacebookMediaUrls(
          mediaEntry?.url,
          mediaEntry?.uri,
          mediaEntry?.src,
          mediaEntry?.href,
          mediaEntry?.original_url,
          mediaEntry?.secure_url,
          mediaEntry?.download_url,
          mediaEntry?.attachment,
          mediaEntry?.attachments,
          mediaEntry?.subattachments,
          mediaEntry?.all_subattachments,
          mediaEntry
        );

        const generalVideoCandidates = generalCandidates.filter((candidate) => isFacebookVideoUrl(candidate));
        const generalImageCandidates = generalCandidates.filter((candidate) => !isFacebookVideoUrl(candidate));
        const hasVideoSignal =
          typeHint.includes('video')
          || Boolean(
            mediaEntry?.is_video
            || mediaEntry?.video
            || mediaEntry?.video_url
            || mediaEntry?.videoUrl
            || mediaEntry?.hd_url
            || mediaEntry?.sd_url
            || mediaEntry?.playable_url
            || mediaEntry?.playable_url_quality_hd
            || mediaEntry?.playable_url_quality_sd
            || mediaEntry?.browser_native_hd_url
            || mediaEntry?.browser_native_sd_url
            || (Array.isArray(mediaEntry?.video_versions) && mediaEntry.video_versions.length > 0)
            || (Array.isArray(mediaEntry?.videoVersions) && mediaEntry.videoVersions.length > 0)
          );
        const isVideo = hasVideoSignal || [...videoCandidates, ...generalVideoCandidates].some((candidate) => isFacebookVideoUrl(candidate));

        const orderedCandidates = isVideo
          ? [...videoCandidates, ...generalVideoCandidates, ...imageCandidates, ...generalImageCandidates]
          : [...imageCandidates, ...generalImageCandidates, ...videoCandidates, ...generalVideoCandidates];
        const url = orderedCandidates.find(Boolean) || '';

        if (!url) continue;

        const previewCandidates = isVideo
          ? [...imageCandidates, ...generalImageCandidates, ...videoCandidates, ...generalVideoCandidates]
          : [...imageCandidates, ...generalImageCandidates, url];
        const preview = previewCandidates.find(Boolean) || url;

        const dedupeKey = `${isVideo ? 'video' : 'photo'}::${url}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const normalizedItem = {
          url,
          type: isVideo ? 'video' : 'photo',
          preview
        };

        if (isVideo) {
          normalizedItem.video_url = videoCandidates.find((candidate) => isFacebookVideoUrl(candidate)) || url;
          normalizedItem.preview_url = preview || '';
        }

        normalized.push(normalizedItem);
      }

      return normalized;
    };

    const mediaSignature = (media = []) => JSON.stringify(
      (Array.isArray(media) ? media : []).map((item) => ({
        type: item?.type || '',
        url: item?.url || '',
        video_url: item?.video_url || '',
        preview: item?.preview || '',
        preview_url: item?.preview_url || ''
      }))
    );

    const mediaNeedsRefresh = (existingMedia = [], incomingMedia = []) => {
      if (!Array.isArray(incomingMedia) || incomingMedia.length === 0) return false;
      if (!Array.isArray(existingMedia) || existingMedia.length === 0) return true;

      const hasBrokenVideo = existingMedia.some((item) => {
        const type = String(item?.type || item?.media_type || '').toLowerCase();
        const candidate = String(item?.video_url || item?.url || '');
        return type.includes('video') && !isFacebookVideoUrl(candidate);
      });

      return hasBrokenVideo || mediaSignature(existingMedia) !== mediaSignature(incomingMedia);
    };

    const pageUrl = source.identifier;
    let details = await rapidApiFacebookService.fetchPageDetails(pageUrl, { throwOnCooldown: !!options.throwOnCooldown });
    if (details) {
      const updates = {};
      if (details.name && details.name !== source.display_name) updates.display_name = details.name;
      if (details.image && details.image !== source.profile_image_url) updates.profile_image_url = details.image;

      // Update stats
      if (details.followers || details.likes) {
        updates.statistics = {
          ...source.statistics,
          subscriber_count: details.followers || source.statistics.subscriber_count,
          view_count: details.likes || source.statistics.view_count
        };

        // Track history
        if (!source.history) source.history = [];
        source.history.push({
          date: new Date(),
          subscriber_count: details.followers || 0,
          view_count: details.likes || 0
        });
      }

      if (Object.keys(updates).length > 0) {
        await Source.findOneAndUpdate({ id: source.id }, updates);
        //(() => {})(`[Monitor] Updated profile info for ${source.display_name}`);
      }
    }

    // 2. Fetch Posts - prefer numeric id from details when available, else use the stored page URL
    const pageKey = details?.id || pageUrl;
    let posts = await rapidApiFacebookService.fetchPagePosts(pageKey, 10, source.display_name, { throwOnCooldown: !!options.throwOnCooldown });
    if (!posts || posts.length === 0) {
      // fallback: try the URL form (covers cases where pageKey is numeric but API expects URL)
      posts = await rapidApiFacebookService.fetchPagePosts(pageUrl, 10, source.display_name, { throwOnCooldown: !!options.throwOnCooldown });
    }

    if (posts === null) {
      // fetchPagePosts returned null = API error (not "no posts") — do NOT update last_checked
      logger.error(`[Facebook Monitor] ⚠️ Posts API failed for ${source.display_name} — will retry next cycle`);
      return scanResult([], SCAN_OUTCOME.API_ERROR, 'fetchPagePosts returned null');
    }

    if (!posts || posts.length === 0) {
      // Check if this is likely an API/resolution failure versus truly no posts
      if (!details) {
        logger.info(`[Facebook Monitor] ⚠️ Could not resolve page details for "${pageUrl}" — will retry next cycle`);
        // Do NOT update last_checked on resolution failure
        return scanResult([], SCAN_OUTCOME.IDENTITY_UNRESOLVED, 'could not resolve page details');
      }
      logger.info(`[Facebook Monitor] ℹ️ No posts found for ${source.display_name} (pageKey=${pageKey})`);
      await Source.findOneAndUpdate({ id: source.id }, { last_checked: new Date() });
      return scanResult([], SCAN_OUTCOME.OK, 'API returned zero posts', {
        posts_attempted: 0, posts_succeeded: 0, posts_failed: 0, new: 0, updated: 0
      });
    }

    logger.info(`[Facebook Monitor] 📥 Got ${posts.length} posts for ${source.display_name}`);
    const newContent = [];
    let postsAttempted = 0;
    let postsSucceeded = 0;
    let postsFailed = 0;
    let createdCount = 0;
    let updatedCount = 0;

    const toJsDate = (value) => {
      if (!value) return new Date();
      if (value instanceof Date) return value;
      if (typeof value === 'number') {
        const ms = value < 1e12 ? value * 1000 : value;
        const d = new Date(ms);
        return isNaN(d) ? new Date() : d;
      }
      const d = new Date(value);
      return isNaN(d) ? new Date() : d;
    };

    for (const post of posts) {
      postsAttempted += 1;
      try {
        let content = await Content.findOne({ platform: 'facebook', content_id: post.id });
        const incomingMedia = normalizeFacebookMediaItems(post.media);

        if (content) {
          // Update existing content engagement — sparse, semantically correct fields
          const extracted = buildEngagement({
            likes: post.engagement?.likes,
            comments: post.engagement?.comments,
            shares: post.engagement?.shares,
            views: post.engagement?.views
          });
          if (!Array.isArray(content.engagement_history)) content.engagement_history = [];
          content.engagement = mergeEngagement(content.engagement, extracted);
          content.engagement_history.push({
            timestamp: new Date(),
            ...(content.engagement.likes !== undefined ? { likes: content.engagement.likes } : {}),
            ...(content.engagement.comments !== undefined ? { comments: content.engagement.comments } : {}),
            ...(content.engagement.views !== undefined ? { views: content.engagement.views } : {})
          });

          if (mediaNeedsRefresh(content.media, incomingMedia)) {
            content.media = incomingMedia;
            content.scraped_content = `Media Count: ${incomingMedia.length}`;
            content.is_media_archived = false;
          }

          if (post.location?.name && !content.location?.name) {
            content.location = post.location;
          }

          await content.save();

          // Feed the refreshed post back through the shared finalization path
          // (same as X/Instagram) so velocity can still see it going viral and
          // upgrade the EXISTING alert. No new Alert is created downstream.
          content.is_update = true;
          newContent.push(content);
          updatedCount += 1;

          queueFacebookMediaArchive({
            query: { id: content.id },
            contentId: post.id,
            media: content.media,
            postUrl: post.url,
            sourceTag: 'facebook-update'
          });
        } else {
          // Create new content
          const mediaItems = incomingMedia;

          content = new Content({
            source_id: source.id,
            platform: 'facebook',
            content_id: post.id,
            content_url: post.url,
            text: post.text || 'Facebook post',
            scraped_content: mediaItems.length > 0 ? `Media Count: ${mediaItems.length}` : '',
            media: mediaItems,
            author: post.author_name,
            author_handle: source.identifier,
            published_at: toJsDate(post.created_at),
            location: post.location || null,
            raw_data: post,
            engagement: buildEngagement({
              likes: post.engagement?.likes,
              comments: post.engagement?.comments,
              shares: post.engagement?.shares,
              views: post.engagement?.views
            })
          });
          await content.save();
          newContent.push(content);
          createdCount += 1;
          enqueueMediaLocationExtraction(content.id);
          queueFacebookMediaArchive({
            query: { id: content.id },
            contentId: post.id,
            media: mediaItems,
            postUrl: post.url,
            sourceTag: 'facebook-create'
          });
        }

        // 3. Fetch Comments for this post
        if (post.engagement.comments > 0) {
          const comments = await rapidApiFacebookService.fetchPostComments(post.id, 20, { throwOnCooldown: !!options.throwOnCooldown });
          for (const c of comments) {
            const existingComment = await Comment.findOne({ comment_id: c.id });
            if (!existingComment) {
              const newComment = new Comment({
                content_id: content.id,
                video_id: post.id, // Using post_id as video_id
                comment_id: c.id,
                author_channel_id: c.author_id || 'unknown',
                author_display_name: c.author_name,
                author_profile_image: c.author_image,
                text: c.text || '',
                like_count: c.likes,
                published_at: new Date(c.created_at)
              });
              await newComment.save();
              // TODO: Analyze comment risk?
            }
          }
        }

        postsSucceeded += 1;
      } catch (postError) {
        // A cooldown must still surface to callers that asked for it (manual
        // scan returns 429) — everything else stays isolated to this post.
        if (options.throwOnCooldown && (postError?.code === 'FB_RAPIDAPI_COOLDOWN' || postError?.response?.status === 429)) {
          throw postError;
        }
        postsFailed += 1;
        logger.error(`[Facebook Monitor] ⚠️ Post failure: source="${source.display_name}" platform=facebook post=${post?.id || 'unknown'} stage=persist type=${classifyScanError(postError)} error=${postError.message}`);
      }
    }

    // Update source last_checked
    await Source.findOneAndUpdate({ id: source.id }, { last_checked: new Date() });

    logger.info(`[Facebook Monitor] ✅ ${source.display_name}: posts=${posts.length} new=${createdCount} updated=${updatedCount} failed=${postsFailed}`);

    return scanResult(newContent, SCAN_OUTCOME.OK, null, {
      posts_attempted: postsAttempted,
      posts_succeeded: postsSucceeded,
      posts_failed: postsFailed,
      new: createdCount,
      updated: updatedCount
    });

  } catch (error) {
    if (options.throwOnCooldown && (error?.code === 'FB_RAPIDAPI_COOLDOWN' || error?.response?.status === 429)) {
      throw error;
    }
    const outcome = classifyScanError(error);
    logger.error(`[Facebook Monitor] ❌ Error monitoring ${source.display_name} (${outcome}): ${error.message}`);
    // Do NOT update last_checked on error — let it retry
    return scanResult([], outcome, error.message);
  }
};

/**
 * Shared post-ingest path used by monitored Sources:
 * AI analysis → independent virality check → one Alert per content (create or upward virality upgrade).
 * Velocity NEVER modifies risk_level or threat_details.risk_score.
 */
const mapVelocityPriorityToVirality = (priority) => {
  if (!priority) return null;
  const p = String(priority).toUpperCase();
  if (p === 'HIGH') return 'high';
  if (p === 'MEDIUM') return 'medium';
  if (p === 'LOW') return 'low';
  return null;
};

const normalizeAlertRiskLevel = (level) => {
  const v = String(level || 'low').toLowerCase();
  if (v === 'critical' || v === 'high') return 'high';
  if (v === 'medium') return 'medium';
  return 'low';
};

const buildVelocityData = (velocity) => {
  if (!velocity) return undefined;
  return {
    metric: velocity.triggeredMetrics.map((m) => m.metric).join(', '),
    current_value: Math.max(...velocity.triggeredMetrics.map((m) => m.value)),
    previous_value: 0,
    velocity: Math.max(...velocity.triggeredMetrics.map((m) => m.value)),
    time_window_minutes: velocity.threshold.time_window_minutes,
    threshold_triggered: velocity.highestPriority.thresholdTriggered
  };
};

// Same prefixes alertController.clearAlertCache uses. Kept here rather than
// importing the controller so the service never depends on the HTTP layer.
const ALERT_CACHE_PREFIXES = [
  'alerts:list:v4',
  'alerts:stats:v4',
  'dashboard:v2',
  'alert_summary',
  'unread_count'
];

const invalidateAlertListCaches = async () => {
  try {
    await Promise.all(ALERT_CACHE_PREFIXES.map((p) => cacheService.invalidatePrefix(p)));
  } catch (err) {
    logger.warn(`[Alerts] Cache invalidation after alert create failed: ${err.message}`);
  }
};

const finalizeMonitoredContent = async (
  content,
  settings,
  keywords,
  { source = null, allowRiskRefresh = false } = {}
) => {
  if (!content) return null;
  if (shouldSkipContentAnalysis(content)) {
    logger.info(
      `[Analysis] Skipping content ${content.content_id || content.id || 'unknown'}: no analyzable text`
    );
    // Persist the skip marker through the shared analysis boundary.
    await performFullAnalysis(content, settings, keywords, {
      skipAlert: true,
      requireLLM: false
    });
    return {
      skipped: true,
      skip_reason: 'no_analyzable_content',
      analysis: null,
      velocity: null,
      alert: null
    };
  }

  const analysis = await performFullAnalysis(content, settings, keywords, {
    skipAlert: true,
    requireLLM: isStrictAnalysisMode()
  });

  const velocity = await checkVelocity(content, settings);
  const viralityLevel = mapVelocityPriorityToVirality(velocity?.highestPriority?.priority);
  // AI/keyword origin only — do not use alert_type as a virality proxy
  let alertType = analysis?.is_keyword_match ? 'keyword_risk' : 'ai_risk';
  const finalRiskLevel = normalizeAlertRiskLevel(analysis?.content_risk_level || 'low');

  const intent = analysis?.intent || 'Unknown';
  const intentStr = (intent !== 'Neutral' && intent !== 'Unknown' && intent !== 'Normal' && intent !== 'Monitor') ? intent + ' - ' : '';
  const title = `${finalRiskLevel.toUpperCase()} Risk: ${intentStr}${content.author}`;

  const parts = [];
  if (viralityLevel) {
    parts.push(`**Virality:** ${viralityLevel.toUpperCase()} (${velocity.triggeredMetrics.map((m) => m.metric).join(', ')})`);
  }
  if (analysis?.detailedDescription) {
    parts.push(analysis.detailedDescription);
  } else if (analysis?.reasons?.length > 0) {
    parts.push(`**Analysis:**\n${analysis.reasons.map((r) => `• ${r}`).join('\n')}`);
  } else {
    parts.push(`**Analysis:** ${analysis?.explanation || 'Routine content analysis complete.'}`);
  }
  const description = parts.join('\n\n');

  const aiRiskScore = Number(analysis?.risk_score) || 0;
  const velocityData = buildVelocityData(velocity);

  const existingAlert = await Alert.findOne({ content_id: content.id });

  // A failed analysis is NOT a low-risk analysis. Never mint an alert from one —
  // the content keeps no Analysis record, so retryPendingAnalyses reclaims it.
  if (!existingAlert && !isUsableAnalysis(analysis)) {
    logger.warn(
      `[Analysis] No alert created for ${content.content_id || content.id}: analysis status=${analysis?.status || 'unknown'}`
    );
    if (content.engagement) {
      await updateEngagementHistory(content.id, content.engagement);
    }
    return { analysis, velocity, alert: null };
  }

  if (!existingAlert) {
    const alertData = {
      content_id: content.id,
      content_published_at: content.published_at || new Date(),
      analysis_id: analysis?.analysis_id,
      alert_type: alertType,
      risk_level: finalRiskLevel,
      // Legacy mirror while priority still exists — only set when viral
      ...(viralityLevel
        ? {
            virality_level: viralityLevel,
            virality_detected_at: new Date(),
            priority: String(velocity.highestPriority.priority).toUpperCase(),
            velocity_data: velocityData
          }
        : {
            virality_level: null,
            virality_detected_at: null
          }),
      title,
      description,
      classification_explanation: analysis?.explanation || '',
      threat_details: {
        intent: analysis?.intent || 'Monitor',
        reasons: analysis?.reasons || [],
        highlights: analysis?.highlights || [],
        risk_score: aiRiskScore,
        violated_policies: analysis?.violated_policies || [],
        legal_sections: analysis?.legal_sections || []
      },
      violated_policies: analysis?.violated_policies || [],
      legal_sections: analysis?.legal_sections || [],
      llm_analysis: analysis?.llm_analysis || null,
      content_url: content.content_url,
      platform: content.platform,
      author: content.author,
      author_handle: content.author_handle,
      content_ref_id: content.id,
      source_id: source?.id || content.source_id || null,
      source_category: source?.category || null,
      matched_keywords_normalized: (analysis?.triggered_keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean)
    };

    const newAlert = new Alert(alertData);
    await newAlert.save();

    // The alerts list is cached for 20s. Without this a freshly created alert
    // sat invisible until the TTL lapsed, which read as "the alert never fired".
    await invalidateAlertListCaches();

    if (settings.enable_email_alerts && settings.alert_emails?.length > 0) {
      await sendAlertEmail(settings.smtp_config, settings.alert_emails, {
        risk_level: finalRiskLevel,
        platform: content.platform,
        author: content.author,
        content_url: content.content_url,
        description,
        triggered_keywords: analysis?.triggered_keywords || [],
        created_at: newAlert.created_at
      });
    }

    if (content.engagement) {
      await updateEngagementHistory(content.id, content.engagement);
    }
    return { analysis, velocity, alert: newAlert };
  }

  // Existing alert: its intelligence is frozen from the first analysis. Only a
  // genuine virality upgrade moves, and only the explicit rescan tool may
  // re-derive risk (and then only from a usable analysis).
  const riskRefresh = (allowRiskRefresh && isUsableAnalysis(analysis))
    ? {
        risk_level: finalRiskLevel,
        analysis_id: analysis.analysis_id || existingAlert.analysis_id,
        title,
        description,
        classification_explanation: analysis.explanation || existingAlert.classification_explanation || '',
        'threat_details.intent': analysis.intent || existingAlert.threat_details?.intent || 'Monitor',
        'threat_details.reasons': analysis.reasons || existingAlert.threat_details?.reasons || [],
        'threat_details.highlights': analysis.highlights || existingAlert.threat_details?.highlights || [],
        'threat_details.risk_score': aiRiskScore,
        violated_policies: analysis.violated_policies || existingAlert.violated_policies || [],
        legal_sections: analysis.legal_sections || existingAlert.legal_sections || [],
        matched_keywords_normalized: (analysis.triggered_keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean)
      }
    : null;

  const update = buildExistingAlertUpdate(existingAlert, {
    viralityLevel,
    velocityData,
    velocityPriority: velocity?.highestPriority?.priority || null,
    riskRefresh
  });

  if (update) {
    await Alert.updateOne({ id: existingAlert.id }, update, { runValidators: false });
  }

  if (content.engagement) {
    await updateEngagementHistory(content.id, content.engagement);
  }

  const updated = update ? await Alert.findOne({ id: existingAlert.id }) : existingAlert;
  return { analysis, velocity, alert: updated };
};

const scanSourceOnce = async (source, options = {}) => {
  if (!source) throw new Error('Source is required');

  const settings = await Settings.findOne({ id: 'global_settings' });
  if (!settings) throw new Error('Settings not found');

  const youtubeApiKey = settings.youtube_api_key || process.env.YOUTUBE_API_KEY;
  const xBearerToken = process.env.X_BEARER_TOKEN || settings.x_bearer_token;
  const fbAccessToken = settings.facebook_access_token || process.env.FACEBOOK_ACCESS_TOKEN;
  const rapidApiKey = process.env.RAPIDAPI_KEY || settings.rapidapi_key;
  const rapidApiInstagramKey = settings.rapidapi_instagram_key || process.env.RAPIDAPI_INSTAGRAM_KEY;
  const rapidApiInstagramKeys = settings.rapidapi_instagram_keys || process.env.RAPIDAPI_INSTAGRAM_KEYS;
  const rapidApiInstagramHost = settings.rapidapi_instagram_host || process.env.RAPIDAPI_INSTAGRAM_HOST;

  // Some services read from process.env; keep env in sync with DB settings.
  if (youtubeApiKey) process.env.YOUTUBE_API_KEY = youtubeApiKey;
  if (xBearerToken) process.env.X_BEARER_TOKEN = xBearerToken;
  if (rapidApiKey) process.env.RAPIDAPI_KEY = rapidApiKey;
  if (rapidApiInstagramKey) process.env.RAPIDAPI_INSTAGRAM_KEY = rapidApiInstagramKey;
  if (rapidApiInstagramKeys) process.env.RAPIDAPI_INSTAGRAM_KEYS = rapidApiInstagramKeys;
  if (rapidApiInstagramHost) process.env.RAPIDAPI_INSTAGRAM_HOST = rapidApiInstagramHost;

  const keywords = await Keyword.find({ is_active: true });

  // Platform-level quota/rate-limit breaker: while a platform is paused we make
  // no request to it at all — but the source is still reported as failed so the
  // scheduler summary stays truthful. Other platforms are unaffected.
  const pause = getPlatformQuotaPause(source.platform);
  if (pause) {
    const minsLeft = Math.ceil((pause.retry_at.getTime() - Date.now()) / 60000);
    logger.warn(`[Monitor:${source.platform}] ⛔ ${pause.outcome} pause active — skipping ${source.display_name} without an API call (re-check in ~${minsLeft} min)`);
    return {
      scanned: 0,
      ingested: 0,
      ok: false,
      outcome: pause.outcome,
      detail: `platform paused until ${pause.retry_at.toISOString()}`,
      stats: null
    };
  }

  // Same account added twice (different identifier shapes) — keep the oldest
  // source and skip the provider call on the duplicate.
  const duplicateOf = await deactivateIfDuplicateIdentity(source);
  if (duplicateOf) {
    return {
      scanned: 0,
      ingested: 0,
      ok: true,
      outcome: SCAN_OUTCOME.OK,
      detail: `deactivated duplicate identity of ${duplicateOf.identifier}`,
      stats: null
    };
  }

  let result = scanResult([]);
  if (source.platform === 'youtube') {
    result = youtubeApiKey
      ? await monitorYoutubeSource(source, youtubeApiKey)
      : scanResult([], SCAN_OUTCOME.AUTH_CONFIG, 'YouTube API key not configured');
  } else if (source.platform === 'x') {
    result = await monitorXSource(source);
  } else if (source.platform === 'instagram') {
    const normalized = normalizeInstagramHandle(source.identifier);
    if (normalized && normalized !== source.identifier) {
      source.identifier = normalized;
      await Source.findOneAndUpdate({ id: source.id }, { identifier: normalized });
    }
    result = await monitorInstagramSource(source, fbAccessToken);
  } else if (source.platform === 'facebook') {
    result = await monitorFacebookSource(source, fbAccessToken, { throwOnCooldown: !!options.throwOnCooldown });
  }

  const newContent = result.items || [];
  const ok = result.outcome === SCAN_OUTCOME.OK;

  // Arm/disarm the platform breaker from this source's outcome.
  if (result.outcome === SCAN_OUTCOME.QUOTA_EXCEEDED || result.outcome === SCAN_OUTCOME.RATE_LIMIT) {
    markPlatformQuotaLimited(source.platform, result.outcome, result.detail);
  } else if (ok) {
    clearPlatformQuotaLimit(source.platform);
  }

  // Queue analysis in background — don't block the monitoring loop
  if (newContent.length > 0) {
    setImmediate(async () => {
      for (const content of newContent) {
        try {
          await finalizeMonitoredContent(content, settings, keywords, { source });
        } catch (bgErr) {
          logger.error(`[Analysis:BG] Error analyzing content ${content.content_id || content.id}: ${bgErr.message}`);
        }
      }
      logger.info(`[Analysis:BG] Finished background analysis for ${newContent.length} items from ${source?.display_name || 'unknown'}`);
    });
  }

  // `scanned`/`ingested` keep their original meaning and shape for existing
  // callers (sourceController); ok/outcome/stats are additive.
  return {
    scanned: newContent.length,
    ingested: newContent.length,
    ok,
    outcome: result.outcome,
    detail: result.detail,
    stats: result.stats
  };
};

const toContentRiskLevel = (analysisRiskLevel) => {
  const v = String(analysisRiskLevel || '').toLowerCase();
  if (v === 'high') return 'high';
  if (v === 'critical') return 'critical';
  if (v === 'medium') return 'medium';
  return 'low';
};

const toAlertRiskLevel = (analysisRiskLevel) => {
  const v = String(analysisRiskLevel || '').toLowerCase();
  if (v === 'critical') return 'critical';
  if (v === 'high') return 'high';
  if (v === 'medium') return 'medium';
  if (v === 'low') return 'low';
  return null;
};

const markContentSkippedNoText = async (content) => {
  if (!content?.id && !content?.content_id) return;
  const patch = {
    risk_score: 0,
    risk_level: 'low',
    threat_intent: 'Skipped',
    threat_reasons: ['No analyzable text content'],
    sentiment: 'neutral',
    risk_factors: []
  };
  const updated = content.id
    ? await Content.findOneAndUpdate({ id: content.id }, patch, { new: true })
    : null;
  if (!updated && content.content_id) {
    await Content.findOneAndUpdate(
      { content_id: content.content_id, platform: content.platform },
      patch
    );
  }
  Object.assign(content, patch);
};

const performFullAnalysis = async (content, settings, keywords, options = {}) => {
  try {
    const textToAnalyze = getAnalyzableContentText(content);
    if (!textToAnalyze) {
      logger.info(
        `[Analysis] Skipping content ${content?.content_id || content?.id || 'unknown'}: no analyzable text`
      );
      try {
        await markContentSkippedNoText(content);
      } catch (markErr) {
        logger.info(
          `[Analysis] Could not persist skip marker for ${content?.content_id || content?.id || 'unknown'}: ${markErr.message}`
        );
      }
      return {
        status: ANALYSIS_STATUS.SKIPPED_NO_TEXT,
        skipped: true,
        skip_reason: 'no_analyzable_content',
        content_risk_level: null,
        risk_score: 0
      };
    }

    const high = settings.high_risk_threshold ?? settings.risk_threshold_high ?? 70;
    const medium = settings.medium_risk_threshold ?? settings.risk_threshold_medium ?? 40;
    logger.info(`[Analysis] Thresholds from settings: medium=${medium}, high=${high}`);

    //(() => {})(`[Analysis] Analyzing content ${content.content_id}...`);
    //(() => {})(`[Analysis] Text sample: ${textToAnalyze.substring(0, 50)}...`);
    //(() => {})(`[Analysis] Active Keywords for matching: ${keywords.length}`);

    // --- Layer 1: Explicit User Keyword Matching ---
    const matchedKeywords = [];
    let keywordRiskScore = 0;

    // Normalize text for matching
    const normalize = (str) => String(str || '').toLowerCase().trim();
    const normalizedText = normalize(textToAnalyze);

    keywords.forEach(k => {
      if (!k.keyword) return;
      const keyLog = normalize(k.keyword);
      // Simple inclusion check, can be enhanced to regex if needed
      if (normalizedText.includes(keyLog)) {
        matchedKeywords.push({
          keyword: k.keyword,
          weight: k.weight || 50,
          category: k.category || 'other'
        });
        // Take the highest weight found
        if ((k.weight || 50) > keywordRiskScore) {
          keywordRiskScore = k.weight || 50;
        }
      }
    });

    if (matchedKeywords.length > 0) {
      //(() => {})(`[Analysis] Layer 1 Match: Found ${matchedKeywords.length} keywords.`);
    }

    // --- Layer 2: LLM Analysis ---
    const analysisId = uuidv4();
    const analysisData = await analyzeContent(textToAnalyze, {
      platform: content.platform,
      content_id: content.content_id,
      media_urls: content.media ? content.media.map(m => m.url) : [],
      requireLLM: options.requireLLM ?? true
    });

    // --- Layer 3: Hybrid Merging ---
    // Merge Keywords into analysis data
    if (matchedKeywords.length > 0) {
      // 1. Merge Triggers
      const existingTriggers = new Set(analysisData.triggered_keywords || []);
      matchedKeywords.forEach(m => {
        if (!existingTriggers.has(m.keyword)) {
          analysisData.triggered_keywords.push(m.keyword);
        }
      });

      // 2. Merge Evidence (Custom Evidence)
      if (!analysisData.custom_evidence) analysisData.custom_evidence = [];
      matchedKeywords.forEach(m => {
        analysisData.custom_evidence.push({
          keyword: m.keyword,
          weight: m.weight,
          category: m.category,
          context: 'User Keyword Match'
        });
      });

      // 3. Override Risk Score if Keyword Weight is higher
      if (keywordRiskScore > analysisData.risk_score) {
        analysisData.risk_score = keywordRiskScore;
      }
    }

    // --- Derive risk_level from risk_score using settings thresholds ---
    if (analysisData.risk_score >= high) analysisData.risk_level = 'high';
    else if (analysisData.risk_score >= medium) analysisData.risk_level = 'medium';
    else analysisData.risk_level = 'low';

    logger.info(`[Analysis] Final Result for ${content.content_id}: Score=${analysisData.risk_score}, Level=${analysisData.risk_level}`);

    const analysis = new Analysis({
      id: analysisId,
      content_id: content.id,
      risk_score: Math.round(analysisData.risk_score || 0),
      risk_level: toContentRiskLevel(analysisData.risk_level),
      intent: analysisData.intent || 'unknown',
      explanation: analysisData.explanation,
      sentiment: analysisData.sentiment || 'neutral',

      // REQUIRED FIELDS (Mapped from Risk Score or specific intent)
      violence_score: (analysisData.intent === 'Violence' || analysisData.category === 'Communal_Violence' || analysisData.category === 'Sexual_Violence' ? Math.round((analysisData.risk_score || 0) * 10) : 0) || 0,
      threat_score: (analysisData.category === 'threat' || analysisData.category === 'threat_incitement' || analysisData.category === 'Hate_Speech_Threat' || analysisData.category === 'Hate_Speech_Threat_Extremist' ? Math.round((analysisData.risk_score || 0) * 10) : 0) || 0,
      hate_score: (analysisData.category === 'Hate_Speech' || analysisData.category === 'Hate_Speech_Threat' || analysisData.category === 'Hate_Speech_Threat_Extremist' ? Math.round((analysisData.risk_score || 0) * 10) : 0) || 0,

      triggered_keywords: analysisData.triggered_keywords || [],
      legal_sections: analysisData.legal_sections || [],
      violated_policies: analysisData.violated_policies || [],
      reasons: analysisData.reasons || [],
      highlights: analysisData.triggered_keywords || [],
      confidence: 0,
      language: 'en',
      llm_analysis: analysisData.llm_analysis || null // Save rich LLM data
    });
    await analysis.save();

    // Persist derived intelligence back onto the content record for dashboard/reporting.
    const normalizeText = (value) => String(value || '')
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\u2060\uFE0F]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();

    const textNormalized = normalizeText(content.text || '');
    const customEvidence = Array.isArray(analysisData.custom_evidence) ? analysisData.custom_evidence : [];
    const aiEvidence = Array.isArray(analysisData.ai_evidence) ? analysisData.ai_evidence : [];
    const filteredCustomEvidence = customEvidence.filter(e => {
      const keyword = String(e.keyword || '').trim();
      if (!keyword) return false;
      if (keyword.toLowerCase().startsWith('[ai]')) return true;
      if (!textNormalized) return true;
      return textNormalized.includes(normalizeText(keyword));
    });
    const riskEvidence = [...filteredCustomEvidence, ...aiEvidence];
    const uniqueRiskFactors = [];
    const seenRiskKeywords = new Set();
    for (const e of riskEvidence) {
      const key = String(e.keyword || '').trim().toLowerCase();
      if (!key || seenRiskKeywords.has(key)) continue;
      seenRiskKeywords.add(key);
      uniqueRiskFactors.push({
        keyword: e.keyword,
        weight: e.weight ?? 10,
        category: e.category || 'other',
        context: e.context || ''
      });
    }

    const updateQuery = { id: content.id };
    logger.info(`[Monitor] Updating Content with query:`, updateQuery);
    const updateResult = await Content.findOneAndUpdate(
      updateQuery,
      {
        risk_score: analysisData.risk_score ?? 0,
        risk_level: toContentRiskLevel(analysisData.risk_level),
        threat_intent: analysisData.intent || 'Neutral',  // Save intent (e.g., Violence, Political)
        threat_reasons: analysisData.reasons || [],       // Save reasons (The "Why")
        risk_factors: uniqueRiskFactors,
        sentiment: analysisData.sentiment || 'neutral'
      },
      { new: true }
    );
    if (!updateResult) {
      logger.info(`[Monitor] WARNING: Content update returned null! Query:`, updateQuery);
      // Try fallback to content_id
      logger.info(`[Monitor] Trying fallback update by content_id: ${content.content_id}`);
      await Content.findOneAndUpdate({ content_id: content.content_id, platform: content.platform }, {
        risk_score: analysisData.risk_score ?? 0,
        risk_level: toContentRiskLevel(analysisData.risk_level),
        threat_intent: analysisData.intent || 'Neutral',
        threat_reasons: analysisData.reasons || [],
        risk_factors: uniqueRiskFactors,
        sentiment: analysisData.sentiment || 'neutral'
      });
    } else {
      logger.info(`[Monitor] Content updated successfully. New Score: ${updateResult.risk_score}`);
    }

    // Manual propagation for in-memory object (used by subsequent velocity/newpost alerts)
    content.risk_score = analysisData.risk_score ?? 0;
    content.risk_level = toContentRiskLevel(analysisData.risk_level);
    content.threat_intent = analysisData.intent || 'Neutral';
    content.threat_reasons = analysisData.reasons || [];
    content.risk_factors = uniqueRiskFactors;
    content.sentiment = analysisData.sentiment || 'neutral';
    content.violated_policies = analysisData.violated_policies || [];
    content.legal_sections = analysisData.legal_sections || [];

    const alertRiskLevel = toAlertRiskLevel(analysisData.risk_level);
    // No usable risk level means the analysis did not actually land — report it
    // as a failure so no caller mistakes it for a genuine LOW result.
    if (!alertRiskLevel) {
      logger.warn(
        `[Analysis] Unusable risk level for ${content.content_id || content.id}: ` +
        `"${analysisData.risk_level}" — treating as analysis failure`
      );
      return {
        status: ANALYSIS_STATUS.FAILED,
        failure_reason: 'unusable_risk_level',
        content_risk_level: null,
        risk_score: 0
      };
    }

    const hasKeywordMatch = filteredCustomEvidence.length > 0;
    const hasAiMatch = aiEvidence.length > 0;
    const hasPolicyViolation = (analysisData.violated_policies || []).length > 0;
    const hasLegalViolation = (analysisData.legal_sections || []).length > 0;
    const hasTriggeredKeywords = (analysisData.triggered_keywords || []).length > 0;

    // Explicitly allow High Risk AI content even if no specific "keyword" matched
    const isHighRiskAI = (alertRiskLevel === 'high' || alertRiskLevel === 'critical');

    // FORCE-ALLOW: Create alert for every post regardless of risk score (User Request)
    // The user explicitly requested: "dont skip or archive any alert if risk score is o also it is low alert"
    // So we bypass the filter below.

    /* 
    if (!hasKeywordMatch && !hasAiMatch && !hasPolicyViolation && !hasLegalViolation && !hasTriggeredKeywords && !settings.alert_for_every_post) {
      // Fallback: If it's High Risk AI, we SHOULD alert
      if (!isHighRiskAI) {
        return false;
      }
    }
    */

    let existingAlert = await Alert.findOne({
      content_id: content.id,
      alert_type: { $in: ['keyword_risk', 'ai_risk', null, undefined] }
    });

    // Second, if not found, check if alert exists for this *Tweet ID* (platform ID) via lookup
    // OR via content_url (strong secondary signal for Tweets)
    if (!existingAlert) {
      const sameContents = await Content.find({
        $or: [
          { content_id: content.content_id, platform: content.platform },
          { content_url: content.content_url } // Backup check
        ]
      });
      const sameContentIds = sameContents.map(c => c.id);

      // Also check explicitly by content_url on Alert if schema supports it (it does)
      const orConditions = [
        { content_id: { $in: sameContentIds } },
        { content_url: content.content_url }
      ];

      existingAlert = await Alert.findOne({
        $or: orConditions,
        alert_type: { $in: ['keyword_risk', 'ai_risk', null, undefined] }
      });
    }

    // An alert already existing is NOT an analysis failure. It only means this
    // function must not mint a second one — the analysis itself is still valid
    // and must be returned so callers never mistake it for "no result".
    if (existingAlert) {
      logger.info(`[Analysis] Alert already exists for ${content.content_id} (AlertID: ${existingAlert.id}), not creating a duplicate`);
    }

    // Build detailed description with reasons
    const reasons = analysisData.reasons || [];
    const intent = analysisData.intent || 'Unknown';
    const highlights = analysisData.highlights || [];

    let detailedDescription = '';

    // Add intent information
    if (intent && intent !== 'Neutral' && intent !== 'Unknown') {
      detailedDescription += `**Intent Detected:** ${intent}\n\n`;
    }

    // Add structured reasons (Expert Logic, Local Context, etc)
    if (reasons.length > 0) {
      reasons.forEach(reason => {
        // Skip duplicated entries that we show in specific sections below
        if (reason.startsWith('Legal: ') || reason.startsWith('Policy: ')) return;
        detailedDescription += `• ${reason}\n`;
      });
      detailedDescription += '\n';
    }

    // Explicitly Add Legal and Policy Sections if present in analysisData
    if (analysisData.legal_sections?.length > 0) {
      detailedDescription += `**Indian Laws Violated:**\n`;
      analysisData.legal_sections.forEach(l => {
        detailedDescription += `• ${l.act} ${l.section}${l.description ? ': ' + l.description : ''}\n`;
      });
      detailedDescription += '\n';
    }

    if (analysisData.violated_policies?.length > 0) {
      detailedDescription += `**Platform Policies Violated:**\n`;
      analysisData.violated_policies.forEach(p => {
        detailedDescription += `• ${p.policy_name} (${content.platform})\n`;
      });
      detailedDescription += '\n';
    }

    // Add highlighted dangerous phrases
    if (highlights.length > 0) {
      detailedDescription += `**Flagged terms:** ${highlights.join(', ')}\n\n`;
    }

    // Add risk score
    detailedDescription += `**Risk Score:** ${analysisData.risk_score || 0}%`;

    // Fallback if no details
    if (!detailedDescription.trim()) {
      detailedDescription = analysisData.explanation || 'Threat content detected by AI analysis.';
    }

    if (!options.skipAlert && !existingAlert) {
      const alert = new Alert({
        content_id: content.id,
        content_published_at: content.published_at || new Date(),
        analysis_id: analysis.id,
        alert_type: hasKeywordMatch ? 'keyword_risk' : 'ai_risk',
        risk_level: alertRiskLevel,
        title: `${alertRiskLevel.toUpperCase()} Risk: ${intent !== 'Neutral' && intent !== 'Unknown' && intent !== 'Normal' && intent !== 'Monitor' ? intent + ' - ' : ''}${content.author}`,
        description: detailedDescription,
        threat_details: {
          intent: analysisData.intent || analysisData.violated_policies?.[0]?.policy_name || analysisData.violated_policies?.[0]?.name || 'Generic Risk',
          reasons: analysisData.reasons && analysisData.reasons.length > 0 ? analysisData.reasons : [
            ...(analysisData.violated_policies || []).map(p => p.policy_name || p.name),
            ...(analysisData.legal_sections || []).map(l => l.act + ' ' + l.section),
            ...(analysisData.explanation ? analysisData.explanation.split(' | ') : [])
          ].filter(Boolean),
          highlights: analysisData.triggered_keywords || [],
          risk_score: analysisData.risk_score || 0,
          confidence: 0
        },
        violated_policies: analysisData.violated_policies || [],
        legal_sections: analysisData.legal_sections || [],
        complaint_text: analysisData.complaint_text || '',
        classification_explanation: analysisData.explanation || '',
        content_url: content.content_url,
        platform: content.platform,
        author: content.author,
        author_handle: content.author_handle,
        llm_analysis: analysisData.llm_analysis || null
      });

      await alert.save();
    }

    // 4. Analysis record already created above (Line 1452)

    // Return the enriched data object for Alert Construction
    return {
      ...analysisData,
      status: ANALYSIS_STATUS.ANALYZED,
      analysis_id: analysis.id,
      content_risk_level: toContentRiskLevel(analysisData.risk_level),
      risk_score: analysisData.risk_score ?? 0,
      uniqueRiskFactors: uniqueRiskFactors,
      violated_policies: analysisData.violated_policies || [],
      legal_sections: analysisData.legal_sections || [],
      intent: analysisData.intent,
      reasons: analysisData.reasons,
      highlights: analysisData.highlights,
      explanation: analysisData.explanation,
      detailedDescription: detailedDescription
    };
  } catch (error) {
    logger.error(`Error analyzing content ${content.id}:`, error);
    throw error;
  }
};


const rescanContent = async () => {
  try {
    //(() => {})("Starting retroactive content scan...");

    const settings = await Settings.findOne({ id: 'global_settings' });
    if (!settings) throw new Error("Settings not found");

    const keywords = await Keyword.find({ is_active: true });

    const yesterday = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));
    const recentContent = await Content.find({ created_at: { $gte: yesterday } });

    //(() => {})(`Found ${recentContent.length} items to rescan.`);

    let alertCount = 0;
    for (const content of recentContent) {
      const contentSource = content.source_id
        ? await Source.findOne({ id: content.source_id }).select('id category').lean()
        : null;

      const existingBefore = await Alert.findOne({ content_id: content.id }).select('id').lean();
      // Explicit retroactive rescan is the ONE path allowed to re-derive risk on
      // an existing alert — the monitoring loop must never do it.
      const result = await finalizeMonitoredContent(content, settings, keywords, {
        source: contentSource,
        allowRiskRefresh: true
      });

      if (!existingBefore && result?.alert) {
        const risk = normalizeAlertRiskLevel(result.alert.risk_level || result?.analysis?.content_risk_level || 'low');
        const hasVirality = Boolean(result.alert.virality_level);
        if (risk === 'low' && !hasVirality) {
          await Alert.deleteOne({ content_id: content.id });
        } else {
          alertCount += 1;
        }
      }
    }

    return { scanned: recentContent.length, alerts_triggered: alertCount };

  } catch (error) {
    //(() => {})("Rescan failed:", error);
    throw error;
  }
};

const retryPendingAnalyses = async () => {
  try {
    const settings = await Settings.findOne({ id: 'global_settings' });
    if (!settings) return 0;

    const keywords = await Keyword.find({ is_active: true });
    const retryLimit = Math.max(10, Number(process.env.ANALYSIS_RETRY_BATCH_SIZE || 100));
    const retryWindowHours = Math.max(1, Number(process.env.ANALYSIS_RETRY_WINDOW_HOURS || 48));
    const since = new Date(Date.now() - retryWindowHours * 60 * 60 * 1000);

    const scanWidth = retryLimit * 3;
    const projection = 'id content_id platform author published_at created_at risk_level text scraped_content quoted_content url_cards';

    // Two bounded reads over the same 48h window: newest-first and oldest-first.
    const [newest, oldest] = await Promise.all([
      Content.find({ created_at: { $gte: since } })
        .sort({ created_at: -1 })
        .limit(scanWidth)
        .select(projection)
        .lean(),
      Content.find({ created_at: { $gte: since } })
        .sort({ created_at: 1 })
        .limit(scanWidth)
        .select(projection)
        .lean()
    ]);

    if (!newest.length && !oldest.length) return 0;

    const candidateIds = Array.from(new Set([...newest, ...oldest].map((c) => c.id).filter(Boolean)));
    const analyzedIds = await Analysis.distinct('content_id', { content_id: { $in: candidateIds } });

    const pendingIds = selectPendingForRetry({
      newest,
      oldest,
      analyzedIds: new Set(analyzedIds),
      limit: retryLimit
    });

    const pending = pendingIds.length > 0
      ? await Content.find({ id: { $in: pendingIds } }).sort({ created_at: 1 })
      : [];

    if (!pending.length) return 0;

    // Resolve sources once so recovered alerts carry the same source metadata a
    // monitor-created alert would.
    const sourceIds = Array.from(new Set(pending.map((c) => c.source_id).filter(Boolean)));
    const sources = sourceIds.length > 0
      ? await Source.find({ id: { $in: sourceIds } }).select('id category').lean()
      : [];
    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    let retried = 0;
    for (const content of pending) {
      try {
        // Canonical path — same alert construction as the monitoring loop, so a
        // recovered alert is structurally identical to a normally-created one
        // (source_id, source_category, matched_keywords_normalized, virality).
        await finalizeMonitoredContent(content, settings, keywords, {
          source: sourceMap.get(content.source_id) || null
        });
        retried += 1;
      } catch (err) {
        logger.error(`[Monitor:retry] Analysis retry failed for ${content.content_id || content.id}: ${err.message}`);
      }
    }

    if (retried > 0) {
      logger.info(`[Monitor:retry] Re-analyzed ${retried}/${pending.length} pending content item(s)`);
    }

    return retried;
  } catch (err) {
    logger.error(`[Monitor:retry] Retry sweep failed: ${err.message}`);
    return 0;
  }
};

const startMonitoring = async () => {
  // ─── Per-Platform Parallel Monitoring ────────────────────────────────────
  // Each platform runs its OWN independent loop. Within each platform,
  // sources are grouped by category and each category has its own frequency
  // from settings.api_config.monitoring.frequencies.[platform].[category].
  // Only categories whose timer has elapsed get scanned in each tick.

  const PLATFORMS = ['x', 'youtube', 'instagram', 'facebook'];
  const CATEGORIES = ['political', 'communal', 'trouble_makers', 'defamation', 'narcotics', 'history_sheeters', 'others'];

  // Concurrency limits per platform (how many sources scanned in parallel within that platform)
  const PLATFORM_CONCURRENCY = {
    x: 2,
    youtube: 3,
    instagram: 2,
    facebook: 2
  };

  // Per-platform isolated state
  const platformState = {};
  for (const p of PLATFORMS) {
    platformState[p] = {
      running: false,
      completedSourceIds: new Set(),
      cycleInProgress: false,
      // Track last scan time per category (in-memory, resets on server restart)
      lastCategoryScannedAt: {}
    };
    for (const c of CATEGORIES) {
      platformState[p].lastCategoryScannedAt[c] = 0; // epoch 0 = never scanned → will scan immediately
    }
  }

  // ─── Platform Loop (one per platform, runs independently) ─────────────
  const runPlatformLoop = async (platform) => {
    const state = platformState[platform];

    if (state.running) {
      logger.info(`[Monitor:${platform}] Previous cycle still running, skipping this trigger.`);
      setTimeout(() => runPlatformLoop(platform), 30000);
      return;
    }

    state.running = true;
    const loopStartedAt = Date.now();
    let nextCheckSeconds = 60; // default: re-check in 1 minute

    try {
      const settings = await Settings.findOne({ id: 'global_settings' });
      if (!settings) {
        nextCheckSeconds = 60;
        return;
      }

      // Sync API keys to process.env
      const youtubeApiKey = settings.youtube_api_key || process.env.YOUTUBE_API_KEY;
      const xBearerToken = process.env.X_BEARER_TOKEN || settings.x_bearer_token;
      const rapidApiKey = process.env.RAPIDAPI_KEY || settings.rapidapi_key;
      if (youtubeApiKey) process.env.YOUTUBE_API_KEY = youtubeApiKey;
      if (xBearerToken) process.env.X_BEARER_TOKEN = xBearerToken;

      // Platform-specific startup logging
      if (platform === 'x') {
        logger.info(`[Monitor:x] RAPIDAPI_KEY: ${rapidApiKey?.substring(0, 15)}...`);
      }
      if (platform === 'instagram') {
        const igKeys = rapidApiInstagramService.getInstagramRapidApiKeys();
        logger.info(`[Monitor:instagram] Keys available this cycle: ${igKeys.length}`);
      }

      // Check if monitoring is enabled
      const monitoringEnabled = settings.api_config?.monitoring?.enabled !== false;
      if (!monitoringEnabled) {
        nextCheckSeconds = 300; // check again in 5 min in case user re-enables
        return;
      }

      // ─── Platform quota/rate-limit pause ───────────────────────────
      // Sleep this platform's loop only. Categories are deliberately NOT
      // marked scanned, so everything becomes due again the moment the
      // platform recovers. Other platform loops keep running untouched.
      const quotaPause = getPlatformQuotaPause(platform);
      if (quotaPause) {
        nextCheckSeconds = Math.max(60, Math.ceil((quotaPause.retry_at.getTime() - Date.now()) / 1000));
        logger.warn(
          `[Monitor:${platform}] ⛔ Paused (${quotaPause.outcome}) since ${quotaPause.since.toISOString()} — ` +
          `no requests will be made; next re-check in ${(nextCheckSeconds / 60).toFixed(1)} min`
        );
        return;
      }

      // ─── Determine which categories are due for scanning ──────────
      const now = Date.now();
      const frequencies = settings.api_config?.monitoring?.frequencies?.[platform] || {};
      const dueCategories = [];

      for (const cat of CATEGORIES) {
        const intervalMin = frequencies[cat] || 60;
        const intervalMs = intervalMin * 60 * 1000;
        const lastScanned = state.lastCategoryScannedAt[cat] || 0;
        if (now - lastScanned >= intervalMs) {
          dueCategories.push(cat);
        }
      }

      if (dueCategories.length === 0) {
        // Nothing due yet — compute when the next category will be due
        let soonest = Infinity;
        for (const cat of CATEGORIES) {
          const intervalMs = (frequencies[cat] || 60) * 60 * 1000;
          const lastScanned = state.lastCategoryScannedAt[cat] || 0;
          const nextDue = lastScanned + intervalMs - now;
          if (nextDue < soonest) soonest = nextDue;
        }
        nextCheckSeconds = Math.max(30, Math.floor(soonest / 1000));
        logger.info(`[Monitor:${platform}] No categories due. Next check in ${(nextCheckSeconds / 60).toFixed(1)} min`);
        return;
      }

      logger.info(`[Monitor:${platform}] Categories due: ${dueCategories.join(', ')}`);

      // ─── Fetch sources ──────────────────────────────────────────────
      // Normalize: sources with unknown/empty category map to 'others'
      const sources = await Source.find({ is_active: true, platform });

      // Map sources to their effective category
      const sourcesWithCategory = sources.map(s => {
        const cat = (s.category || 'unknown').toLowerCase().trim();
        const effectiveCat = CATEGORIES.includes(cat) ? cat : 'others';
        return { source: s, category: effectiveCat };
      });

      // Sort by priority: high > medium > low
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };

      const CONCURRENCY = PLATFORM_CONCURRENCY[platform] || 5;

      // ─── Process ONE category at a time, mark done immediately ─────
      for (const cat of dueCategories) {
        const catSources = sourcesWithCategory
          .filter(({ category }) => category === cat);

        if (catSources.length === 0) {
          state.lastCategoryScannedAt[cat] = Date.now();
          logger.info(`[Monitor:${platform}:${cat}] No sources, marked done`);
          continue;
        }

        catSources.sort((a, b) => (priorityOrder[b.source.priority] || 2) - (priorityOrder[a.source.priority] || 2));
        logger.info(`[Monitor:${platform}:${cat}] Scanning ${catSources.length} sources...`);

        const catStartedAt = Date.now();
        let completed = 0;
        let failed = 0;
        let succeeded = 0;
        let skippedInactive = 0;
        let postsFetched = 0;
        let postsNew = 0;
        let postsUpdated = 0;
        let postsFailed = 0;
        let postsSkipped = 0;
        const failureOutcomes = {};

        for (let i = 0; i < catSources.length; i += CONCURRENCY) {
          const batch = catSources.slice(i, i + CONCURRENCY);

          await Promise.allSettled(batch.map(async ({ source }) => {
            try {
              const currentSource = await Source.findOne({ id: source.id });
              if (!currentSource || !currentSource.is_active) {
                skippedInactive++;
                completed++;
                return;
              }
              const result = await scanSourceOnce(source);
              completed++;

              // `ok === false` means we never learned what this source has —
              // an API/quota/identity failure, not an empty-but-healthy source.
              if (result?.ok === false) {
                failed++;
                failureOutcomes[result.outcome] = (failureOutcomes[result.outcome] || 0) + 1;
                logger.error(`[Monitor:${platform}:${cat}] FETCH FAILED ${source.display_name || source.identifier}: ${result.outcome}${result.detail ? ` — ${result.detail}` : ''}`);
                return;
              }

              succeeded++;
              const stats = result?.stats;
              if (stats) {
                postsFetched += stats.posts_attempted || 0;
                postsNew += stats.new || 0;
                postsUpdated += stats.updated || 0;
                postsFailed += stats.posts_failed || 0;
                postsSkipped += stats.posts_skipped || 0;
                if (stats.posts_failed > 0) {
                  logger.error(`[Monitor:${platform}:${cat}] PARTIAL ${source.display_name || source.identifier}: fetched ok, ${stats.posts_failed}/${stats.posts_attempted} post(s) failed to process`);
                }
              }
            } catch (err) {
              failed++;
              completed++;
              const outcome = classifyScanError(err);
              failureOutcomes[outcome] = (failureOutcomes[outcome] || 0) + 1;
              logger.error(`[Monitor:${platform}:${cat}] Error scanning ${source.display_name || source.identifier} (${outcome}): ${err.message}`);
            }
          }));

          if (completed % 25 === 0 || i + CONCURRENCY >= catSources.length) {
            logger.info(`[Monitor:${platform}:${cat}] Progress: ${completed}/${catSources.length} (${failed} failed)`);
          }

          if ((platform === 'x' || platform === 'instagram' || platform === 'facebook') && i + CONCURRENCY < catSources.length) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        // Mark THIS category done immediately after finishing it
        state.lastCategoryScannedAt[cat] = Date.now();
        const catSeconds = ((Date.now() - catStartedAt) / 1000).toFixed(1);
        const breakdown = Object.keys(failureOutcomes).length > 0
          ? ` failures=[${Object.entries(failureOutcomes).map(([k, v]) => `${k}:${v}`).join(', ')}]`
          : '';
        logger.info(
          `[Monitor:${platform}:${cat}] DONE: attempted=${catSources.length} successful=${succeeded} failed=${failed} ` +
          `skipped_inactive=${skippedInactive} posts_fetched=${postsFetched} new=${postsNew} updated=${postsUpdated} ` +
          `posts_failed=${postsFailed} posts_skipped=${postsSkipped} duration=${catSeconds}s${breakdown}`
        );
      }

      const elapsed = ((Date.now() - loopStartedAt) / 1000).toFixed(1);
      logger.info(`[Monitor:${platform}] Cycle COMPLETE: ${dueCategories.join(', ')} (${elapsed}s)`);

      // Compute next check: find the soonest category that will be due
      let soonest = Infinity;
      for (const cat of CATEGORIES) {
        const intervalMs = (frequencies[cat] || 60) * 60 * 1000;
        const lastScanned = state.lastCategoryScannedAt[cat] || 0;
        const nextDue = lastScanned + intervalMs - Date.now();
        if (nextDue < soonest) soonest = nextDue;
      }
      nextCheckSeconds = Math.max(30, Math.floor(soonest / 1000));

    } catch (error) {
      logger.error(`[Monitor:${platform}] Cycle error: ${error.message}`);
      nextCheckSeconds = 60;
    } finally {
      state.running = false;
      logger.info(`[Monitor:${platform}] Next check in ${(nextCheckSeconds / 60).toFixed(2)} min`);
      setTimeout(() => runPlatformLoop(platform), nextCheckSeconds * 1000);
    }
  };

  // ─── Housekeeping Loop (events + media backfill, independent of platforms) ─
  const runHousekeepingLoop = async () => {
    try {
      await autoArchiveEndedEvents();
      const settings = await Settings.findOne({ id: 'global_settings' });
      const activeEvents = await getActiveEvents();

      const eventsEnabled = settings?.api_config?.events?.enabled !== false;
      for (const event of activeEvents) {
        if (!eventsEnabled) break;
        // Use per-event override, or compute from the event's selected platforms
        let pollMinutes = event.polling_interval_minutes;
        if (!pollMinutes) {
          const evtPlatforms = event.platforms && event.platforms.length > 0
            ? event.platforms
            : ['x', 'instagram', 'facebook', 'youtube'];
          const intervals = evtPlatforms.map(p => settings?.api_config?.events?.[p] || 60);
          pollMinutes = Math.min(...intervals);
        }
        if (!shouldPollEvent(event, pollMinutes)) continue;
        await scanEventOnce({ event, settings });
      }

      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (rapidApiKey && Date.now() - lastMediaBackfillAt > MEDIA_BACKFILL_INTERVAL_MS) {
        lastMediaBackfillAt = Date.now();
        await backfillRecentXMedia();
        await backfillRecentInstagramMedia();
      }

      // Guarantee eventual analysis for items that failed in background analysis path.
      await retryPendingAnalyses();
    } catch (err) {
      logger.error(`[Monitor:housekeeping] Error: ${err.message}`);
    } finally {
      setTimeout(runHousekeepingLoop, 5 * 60 * 1000); // Every 5 minutes
    }
  };

  // ─── Launch all platform loops in TRUE parallel + housekeeping ─────────
  logger.info(`[Monitor] Starting per-platform parallel monitoring: ${PLATFORMS.join(', ')}`);
  for (const platform of PLATFORMS) {
    runPlatformLoop(platform);
  }
  runHousekeepingLoop();
};

module.exports = {
  startMonitoring,
  performFullAnalysis,
  finalizeMonitoredContent,
  rescanContent,
  scanSourceOnce,
  SCAN_OUTCOME,
  getPlatformQuotaStatus,
  __private: {
    ANALYSIS_STATUS,
    isUsableAnalysis,
    buildExistingAlertUpdate,
    selectPendingForRetry,
    formatCooldown,
    classifyScanError,
    scanResult,
    markPlatformQuotaLimited,
    clearPlatformQuotaLimit,
    getPlatformQuotaPause,
    monitorXSource,
    monitorInstagramSource,
    archiveXTweetMedia,
    queueXTweetMediaArchive,
    hasS3Gaps,
    queueInstagramMediaArchive,
    backfillRecentInstagramMedia,
    shouldSkipContentAnalysis
  }
};
