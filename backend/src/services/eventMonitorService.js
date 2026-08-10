const Event = require('../models/Event');
const Content = require('../models/Content');

const youtubeService = require('./youtube.service');
const rapidApiXService = require('./rapidApiXService');
const rapidApiFacebookService = require('./rapidApiFacebookService');
const rapidApiInstagramService = require('./rapidApiInstagramService');
const { archiveTwitterMedia, archiveContentMedia } = require('./contentS3Service');
const { scoreContentDoc } = require('../utils/relevanceScorer');
const { classifyOneAsync } = require('./llmRelevanceSweeper');
const logger = require('../utils/logger');

const normalizeText = (text) => String(text || '').toLowerCase();
const squeezeWhitespace = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const formatQueryTerm = (term) => {
  const t = squeezeWhitespace(term);
  if (!t) return '';
  if (t.startsWith('#') || t.startsWith('@')) return t;
  return t.includes(' ') ? `"${t}"` : t;
};

const normalizeEventKeywords = (event) =>
  (event.keywords || [])
    .map((k) => (typeof k === 'string' ? k : k.keyword))
    .map((k) => squeezeWhitespace(k))
    .filter(Boolean);

const uniqueById = (items = []) => {
  const map = new Map();
  for (const item of items) {
    const id = String(item?.id || '').trim();
    if (!id) continue;
    if (!map.has(id)) map.set(id, item);
  }
  return Array.from(map.values());
};

const nowUtc = () => new Date();

const getActiveEvents = async () => {
  // Only return events the user has explicitly set to 'active' (via Resume)
  const events = await Event.find({ status: 'active' }).sort({ start_date: 1 });
  return events;
};

// Auto-archive disabled — all status transitions are manual
const autoArchiveEndedEvents = async () => {
  return { archived: 0 };
};

const buildEventQueries = (event) => {
  const queries = [];
  const keywords = normalizeEventKeywords(event);

  // Search each keyword individually.
  if (keywords.length > 0) {
    for (const keyword of keywords) {
      const term = formatQueryTerm(keyword);
      if (term) queries.push(term);
    }
  }

  // Fallback for events with no keyword config.
  if (queries.length === 0 && event.name) {
    const nameTerm = formatQueryTerm(event.name);
    if (nameTerm) queries.push(nameTerm);
  }

  // Secondary fallback.
  if (queries.length === 0 && event.location) {
    const locationTerm = formatQueryTerm(event.location);
    if (locationTerm) queries.push(locationTerm);
  }

  return Array.from(new Set(queries)).filter(Boolean);
};

const normalizeForKeywordMatch = (text) =>
  squeezeWhitespace(String(text || '').toLowerCase());

// Collapse whitespace and strip non-word punctuation so that "Telangana Fest",
// "telanganafest", and "#TelanganaFest" all collide on a single comparable form.
const collapseForFuzzyMatch = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[\s_\-.,!?'"():;/\\#@]+/g, '');

const keywordMatchesText = (keyword, text) => {
  const k = normalizeForKeywordMatch(keyword);
  if (!k) return false;
  if (!text) return false;

  // 1) Direct substring (works for hashtags, mentions, multi-word phrases)
  if (text.includes(k)) return true;

  // 2) Strip leading # / @ and try again — a keyword like "#TelanganaFest"
  //    should still match plain "telangana fest" appearing in body text.
  if (k.startsWith('#') || k.startsWith('@')) {
    const bare = k.slice(1);
    if (bare && text.includes(bare)) return true;
  }

  // 3) Whitespace/punctuation-insensitive fallback — "Telangana Fest" matches
  //    "#TelanganaFest", "telanganafest", etc.
  const kFuzzy = collapseForFuzzyMatch(k);
  if (kFuzzy && kFuzzy.length >= 3) {
    const tFuzzy = collapseForFuzzyMatch(text);
    if (tFuzzy.includes(kFuzzy)) return true;
  }

  return false;
};

const filterTweetsByEventRelevance = (tweets, event) => {
  const keywords = normalizeEventKeywords(event);
  if (keywords.length === 0) return tweets;

  return (tweets || []).filter((t) => {
    const text = normalizeForKeywordMatch(t?.text || '');
    if (!text) return false;
    return keywords.some((keyword) => keywordMatchesText(keyword, text));
  });
};

const filterPostsByEventRelevance = (posts, event, getText) => {
  const keywords = normalizeEventKeywords(event);
  if (keywords.length === 0) return posts || [];

  return (posts || []).filter((post) => {
    const text = normalizeForKeywordMatch(getText(post));
    if (!text) return false;
    return keywords.some((keyword) => keywordMatchesText(keyword, text));
  });
};

const fetchUniqueByQueries = async (queries, fetcher) => {
  const merged = [];
  for (const query of queries) {
    try {
      const batch = await fetcher(query);
      if (Array.isArray(batch) && batch.length > 0) {
        merged.push(...batch);
      }
    } catch (error) {
      logger.error(`[EventMonitor] Query failed "${query}": ${error.message}`);
    }
  }
  return uniqueById(merged);
};



const upsertEventContent = async ({ eventId, platform, contentId, payload }) => {
  const existing = await Content.findOne({ platform, content_id: contentId });

  if (!existing) {
    const relevance = scoreContentDoc({ ...payload, platform });
    // The regex score is stored for SORTING only — it must never decide what
    // gets ingested or shown. Ollama (llmRelevanceSweeper) is the single
    // authority on Hyderabad/Telangana relevance.
    //
    // This used to drop any post scoring 0 with an exclusion term matched
    // ("delhi", "mumbai", "cricket"...). That discarded content before it was
    // ever written, so the sweeper never saw it and no operator could review
    // it. Opt back in with EVENT_INGEST_PREFILTER=1 if it is ever wanted.
    const PREFILTER = process.env.EVENT_INGEST_PREFILTER === '1';
    if (PREFILTER && relevance.score === 0 && relevance.excluded) {
      return { content: null, isNew: false, skipped: 'off_topic_prefilter' };
    }
    const created = await Content.create({
      ...payload,
      platform,
      content_id: contentId,
      event_ids: [eventId],
      relevance,
      llm_verdict: { status: 'pending', attempts: 0 }
    });
    classifyOneAsync(created.toObject ? created.toObject() : created);
    return { content: created, isNew: true };
  }

  const updatedEventIds = Array.isArray(existing.event_ids) ? existing.event_ids : [];
  if (!updatedEventIds.includes(eventId)) updatedEventIds.push(eventId);

  existing.event_ids = updatedEventIds;

  // Best-effort engagement history
  if (payload.engagement) {
    existing.engagement = { ...existing.engagement, ...payload.engagement };
    existing.engagement_history = existing.engagement_history || [];
    existing.engagement_history.push({
      timestamp: new Date(),
      views: existing.engagement.views,
      likes: existing.engagement.likes,
      comments: existing.engagement.comments
    });
  }

  // Prefer latest text
  if (payload.text) existing.text = payload.text;
  if (payload.published_at) existing.published_at = payload.published_at;

  // Safeguard Author Updates: Don't overwrite valid author with "Unknown"
  const isUnknown = (val) => !val || String(val).trim().toLowerCase() === 'unknown' || String(val).trim().toLowerCase() === 'unknown user';

  if (payload.author && (!isUnknown(payload.author) || isUnknown(existing.author))) {
    existing.author = payload.author;
  }
  if (payload.author_handle && (!isUnknown(payload.author_handle) || isUnknown(existing.author_handle))) {
    existing.author_handle = payload.author_handle;
  }

  if (payload.content_url) existing.content_url = payload.content_url;
  if (payload.thumbnails) existing.thumbnails = payload.thumbnails;
  if (payload.duration) existing.duration = payload.duration;
  if (payload.tags) existing.tags = payload.tags;
  if (payload.media) existing.media = payload.media;
  if (payload.quoted_content) {
    // Only overwrite if new one is valid (not Unknown) or if existing is already Unknown/missing
    const isNewUnknown = !payload.quoted_content.author_name || payload.quoted_content.author_name === 'Unknown';
    const isExistingUnknown = !existing.quoted_content || !existing.quoted_content.author_name || existing.quoted_content.author_name === 'Unknown';

    if (!isNewUnknown || isExistingUnknown) {
      existing.quoted_content = payload.quoted_content;
    }
  }
  if (payload.url_cards) existing.url_cards = payload.url_cards;
  if (payload.scraped_content) existing.scraped_content = payload.scraped_content;
  if (payload.raw_data) existing.raw_data = payload.raw_data;

  // Re-score if text/scraped/tags changed or relevance was never computed.
  if (!existing.relevance || !existing.relevance.classified_at || payload.text || payload.scraped_content || payload.tags) {
    existing.relevance = scoreContentDoc(existing.toObject ? existing.toObject() : existing);
  }

  await existing.save();
  return { content: existing, isNew: false };
};

const scanEventOnce = async ({ event, settings }) => {

  // Respect api_config.events.enabled (defensive — monitorService also checks)
  if (settings?.api_config?.events?.enabled === false) {
    return { scanned: 0, ingested: 0, alerts: 0 };
  }

  const queries = buildEventQueries(event);
  if (!queries.length) return { scanned: 0, ingested: 0, alerts: 0, queries: [], by_platform: {}, errors: [] };

  let ingested = 0;
  let alerts = 0;
  let scanned = 0;
  const byPlatform = {};
  const errors = [];
  const trackPlatform = (platform, delta) => {
    const cur = byPlatform[platform] || { scanned: 0, ingested: 0 };
    if (delta.scanned) cur.scanned += delta.scanned;
    if (delta.ingested) cur.ingested += delta.ingested;
    byPlatform[platform] = cur;
  };

  const tweetMediaCache = new Map();
  const getHandleMediaMap = async (handle) => {
    if (!handle) return null;
    const cleanHandle = String(handle).replace('@', '').trim();
    if (!cleanHandle) return null;

    if (tweetMediaCache.has(cleanHandle)) return tweetMediaCache.get(cleanHandle);

    try {
      const result = await rapidApiXService.fetchUserTweets(cleanHandle);
      const tweets = Array.isArray(result) ? result : (result?.tweets || []);
      const map = new Map();
      for (const t of tweets) {
        if (t?.id) map.set(t.id, t);
      }
      tweetMediaCache.set(cleanHandle, map);
      return map;
    } catch (error) {
      logger.error(`[EventScan] Failed to hydrate media for @${cleanHandle}:`, error.message);
      tweetMediaCache.set(cleanHandle, null);
      return null;
    }
  };

  const platforms = event.platforms && event.platforms.length > 0 ? event.platforms : ['youtube', 'x', 'facebook', 'instagram'];

  // X / Twitter
  if (platforms.includes('x')) {
    try {
      const tweets = await fetchUniqueByQueries(queries, (q) => rapidApiXService.searchTweets(q));
      const relevantTweets = filterTweetsByEventRelevance(tweets, event);
      scanned += relevantTweets.length;
      trackPlatform('x', { scanned: relevantTweets.length });
      const xIngestedBefore = ingested;

      for (const t of relevantTweets) {
        if ((!t.media || t.media.length === 0) && t.author_handle) {
          // Add a delay to avoid spraying requests if many tweets need hydration
          await new Promise(r => setTimeout(r, 1500));
          const mediaMap = await getHandleMediaMap(t.author_handle);
          const enriched = mediaMap?.get(t.id);
          if (enriched?.media?.length) {
            t.media = enriched.media;
            if (!t.quoted_content && enriched.quoted_content) t.quoted_content = enriched.quoted_content;
            if ((!t.url_cards || t.url_cards.length === 0) && enriched.url_cards) t.url_cards = enriched.url_cards;
          }
        }

        const { content, isNew } = await upsertEventContent({
          eventId: event.id,
          platform: 'x',
          contentId: t.id,
          payload: {
            source_id: null,
            content_url: t.url,
            text: t.text || '',
            author: t.author || t.author_handle || 'Unknown',
            author_handle: t.author_handle || 'unknown',
            published_at: t.created_at ? new Date(t.created_at) : new Date(),
            engagement: {
              views: Number(t.metrics?.views || 0),
              likes: Number(t.metrics?.likes || 0),
              retweets: Number(t.metrics?.retweets || 0),
              comments: Number(t.metrics?.reply || 0)
            },
            media: t.media || [],
            quoted_content: t.quoted_content,
            raw_data: t.raw_data,
            url_cards: t.url_cards || [],
            scraped_content: t.media && t.media.length > 0 ? `Media Count: ${t.media.length}` : ''
          }
        });

        if (!content) continue; // prefiltered as off-topic (Telangana relevance gate)
        if (isNew) ingested++;

        // Trigger S3 Archiving for X
        if (content.media && content.media.length > 0) {
          try {
            const archivedMedia = await archiveTwitterMedia(content.media, content.content_id, {
              postUrl: content.content_url
            });
            if (archivedMedia && archivedMedia.length > 0) {
              await Content.findByIdAndUpdate(content._id, {
                media: archivedMedia,
                is_media_archived: true
              });
            }
          } catch (err) {
            logger.error(`[EventMonitor] S3 Archive failed for X ${content.content_id}:`, err.message);
          }
        }
      }
      trackPlatform('x', { ingested: ingested - xIngestedBefore });
    } catch (error) {
      logger.error(`[EventMonitor] Error monitoring X for event ${event.name}: ${error.message}`);
      errors.push({ platform: 'x', message: error.message });
    }
  }

  // YouTube
  if (platforms.includes('youtube')) {
    try {
      const videos = await fetchUniqueByQueries(queries, (q) => youtubeService.searchVideos(q));
      const relevantVideos = filterPostsByEventRelevance(
        videos,
        event,
        (v) => `${v?.title || ''} ${v?.description || ''} ${(v?.tags || []).join(' ')}`
      );
      scanned += relevantVideos.length;
      trackPlatform('youtube', { scanned: relevantVideos.length });
      const ytIngestedBefore = ingested;

      for (const v of relevantVideos) {
        const text = `${v.title || ''}\n${v.description || ''}`.trim();
        const { content, isNew } = await upsertEventContent({
          eventId: event.id,
          platform: 'youtube',
          contentId: v.id,
          payload: {
            source_id: null,
            content_url: `https://www.youtube.com/watch?v=${v.id}`,
            text: text || v.title || 'Untitled',
            author: v.channelTitle || 'Unknown',
            author_handle: v.channelId || 'unknown',
            published_at: v.publishedAt ? new Date(v.publishedAt) : new Date(),
            duration: v.duration,
            thumbnails: v.thumbnails,
            tags: v.tags,
            category_id: v.categoryId,
            engagement: {
              views: Number(v.statistics?.viewCount || 0),
              likes: Number(v.statistics?.likeCount || 0),
              comments: Number(v.statistics?.commentCount || 0)
            },
            media: [{
              url: `https://www.youtube.com/watch?v=${v.id}`,
              type: 'video'
            }]
          }
        });

        if (!content) continue; // prefiltered as off-topic (Telangana relevance gate)
        if (isNew) ingested++;
      }
      trackPlatform('youtube', { ingested: ingested - ytIngestedBefore });
    } catch (error) {
      if (error.code === 403 || (error.message && error.message.includes('quota'))) {
        logger.info(`[EventMonitor] YouTube Quota Exceeded for event ${event.name}. Skipping YouTube scan.`);
        errors.push({ platform: 'youtube', message: 'YouTube API quota exceeded' });
      } else {
        logger.error(`[EventMonitor] Error monitoring YouTube for event ${event.name}: ${error.message}`);
        errors.push({ platform: 'youtube', message: error.message });
      }
    }
  }

  // Facebook
  if (platforms.includes('facebook')) {
    try {
      const posts = await fetchUniqueByQueries(queries, (q) => rapidApiFacebookService.searchPosts(q));
      const relevantPosts = filterPostsByEventRelevance(posts, event, (p) => p?.text || '');
      scanned += relevantPosts.length;
      trackPlatform('facebook', { scanned: relevantPosts.length });
      const fbIngestedBefore = ingested;

      for (const p of relevantPosts) {
        // Normalize media: searchPosts returns plain URL strings, Content model expects {type, url}
        const normalizedMedia = (Array.isArray(p.media) ? p.media : []).map(m => {
          if (typeof m === 'string') {
            const isVideo = /\.(mp4|m3u8|webm|mov)(\?|$)/i.test(m) || /video/i.test(m);
            return { type: isVideo ? 'video' : 'photo', url: m };
          }
          return m;
        }).filter(m => m && m.url);

        const { content, isNew } = await upsertEventContent({
          eventId: event.id,
          platform: 'facebook',
          contentId: p.id,
          payload: {
            source_id: null,
            content_url: p.url || `https://facebook.com/${p.id}`,
            text: p.text || '',
            author: p.author || 'Unknown',
            author_handle: p.author_handle || 'unknown',
            author_avatar: p.author_avatar || '',
            published_at: p.created_at ? new Date(p.created_at) : new Date(),
            engagement: {
              views: Number(p.metrics?.views || 0),
              likes: Number(p.metrics?.likes || 0),
              comments: Number(p.metrics?.comments || 0),
              retweets: Number(p.metrics?.shares || 0)
            },
            media: normalizedMedia,
            raw_data: p
          }
        });

        if (!content) continue; // prefiltered as off-topic (Telangana relevance gate)
        if (isNew) ingested++;

        // Trigger S3 Archiving for Facebook
        if (content.media && content.media.length > 0) {
          try {
            const archivedMedia = await archiveContentMedia(content.media, content.content_id, {
              folder: 'facebook-content',
              useUniqueFileName: true,
              postUrl: content.content_url
            });
            if (archivedMedia && archivedMedia.length > 0) {
              await Content.findByIdAndUpdate(content._id, {
                media: archivedMedia,
                is_media_archived: true
              });
            }
          } catch (err) {
            logger.error(`[EventMonitor] S3 Archive failed for Facebook ${content.content_id}:`, err.message);
          }
        }
      }
      trackPlatform('facebook', { ingested: ingested - fbIngestedBefore });
    } catch (error) {
      logger.error(`[EventMonitor] Error monitoring Facebook for event ${event.name}: ${error.message}`);
      errors.push({ platform: 'facebook', message: error.message });
    }
  }

  // Instagram
  if (platforms.includes('instagram')) {
    try {
      const posts = await fetchUniqueByQueries(queries, (q) => rapidApiInstagramService.searchPosts(q));
      const relevantPosts = filterPostsByEventRelevance(posts, event, (p) => p?.text || '');
      scanned += relevantPosts.length;
      trackPlatform('instagram', { scanned: relevantPosts.length });
      const igIngestedBefore = ingested;

      for (const p of relevantPosts) {
        const { content, isNew } = await upsertEventContent({
          eventId: event.id,
          platform: 'instagram',
          contentId: p.id,
          payload: {
            source_id: null,
            content_url: p.url,
            text: p.text || '',
            author: p.author || 'Unknown',
            author_handle: p.author_handle || 'unknown',
            published_at: p.created_at ? new Date(p.created_at) : new Date(),
            engagement: {
              views: Number(p.metrics?.views || 0),
              likes: Number(p.metrics?.likes || 0),
              comments: Number(p.metrics?.comments || 0)
            },
            media: p.media || []
          }
        });

        if (!content) continue; // prefiltered as off-topic (Telangana relevance gate)
        if (isNew) ingested++;

        // Trigger S3 Archiving for Instagram
        if (content.media && content.media.length > 0) {
          try {
            const archivedMedia = await archiveContentMedia(content.media, content.content_id, {
              folder: 'instagram-content',
              useUniqueFileName: true,
              postUrl: content.content_url
            });
            if (archivedMedia && archivedMedia.length > 0) {
              await Content.findByIdAndUpdate(content._id, {
                media: archivedMedia,
                is_media_archived: true
              });
            }
          } catch (err) {
            logger.error(`[EventMonitor] S3 Archive failed for Instagram ${content.content_id}:`, err.message);
          }
        }
      }
      trackPlatform('instagram', { ingested: ingested - igIngestedBefore });
    } catch (error) {
      logger.error(`[EventMonitor] Error monitoring Instagram for event ${event.name}: ${error.message}`);
      errors.push({ platform: 'instagram', message: error.message });
    }
  }

  event.last_polled_at = new Date();
  // Status is controlled manually — don't auto-set to active
  await event.save();

  return { scanned, ingested, alerts, queries, by_platform: byPlatform, errors };
};

const shouldPollEvent = (event, pollingIntervalMinutes) => {
  if (!pollingIntervalMinutes) return true;
  if (!event.last_polled_at) return true;
  const last = new Date(event.last_polled_at).getTime();
  const now = Date.now();
  return now - last >= pollingIntervalMinutes * 60 * 1000;
};

module.exports = {
  getActiveEvents,
  autoArchiveEndedEvents,
  scanEventOnce,
  shouldPollEvent
};
