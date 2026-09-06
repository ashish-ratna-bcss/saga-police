const prisma = require('../../../prisma/client');
const callXApi = require('../../services/blugate/x/blugate.x.api_client');
const callFacebookApi = require('../../services/blugate/facebook/blugate.facebook.api_client');
const callYouTubeApi = require('../../services/blugate/youtube/blugate.youtube.api_client');
// Instagram has no Blugate keyword search yet — keep RapidAPI for IG only.
const rapidApiInstagramService = require('../../services/rapidApiInstagramService');
const { engagementFromXMetricsBag } = require('../../utils/engagementMetrics');
const { asJson } = require('./event.utils');
const { recordFetch } = require('./event.service');
const logger = require('../../utils/logger');

const squeezeWhitespace = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const formatQueryTerm = (term) => {
  const t = squeezeWhitespace(term);
  if (!t) return '';
  if (t.startsWith('#') || t.startsWith('@')) return t;
  return t.includes(' ') ? `"${t}"` : t;
};

const normalizeEventKeywords = (event) =>
  (asJson(event.keywords, []) || [])
    .map((k) => (typeof k === 'string' ? k : k?.keyword))
    .map((k) => squeezeWhitespace(k))
    .filter(Boolean);

const buildEventQueries = (event) => {
  const queries = [];
  for (const keyword of normalizeEventKeywords(event)) {
    const term = formatQueryTerm(keyword);
    if (term) queries.push(term);
  }
  if (!queries.length && event.name) {
    const nameTerm = formatQueryTerm(event.name);
    if (nameTerm) queries.push(nameTerm);
  }
  if (!queries.length && event.location) {
    const locationTerm = formatQueryTerm(event.location);
    if (locationTerm) queries.push(locationTerm);
  }
  return Array.from(new Set(queries));
};

const normalizeForKeywordMatch = (text) => squeezeWhitespace(String(text || '').toLowerCase());
const collapseForFuzzyMatch = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[\s_\-.,!?'"():;/\\#@]+/g, '');

const keywordMatchesText = (keyword, text) => {
  const k = normalizeForKeywordMatch(keyword);
  if (!k || !text) return false;
  if (text.includes(k)) return true;
  if (k.startsWith('#') || k.startsWith('@')) {
    const bare = k.slice(1);
    if (bare && text.includes(bare)) return true;
  }
  const kFuzzy = collapseForFuzzyMatch(k);
  if (kFuzzy && kFuzzy.length >= 3) {
    const tFuzzy = collapseForFuzzyMatch(text);
    if (tFuzzy.includes(kFuzzy)) return true;
  }
  return false;
};

const filterByKeywords = (items, event, getText) => {
  const keywords = normalizeEventKeywords(event);
  if (!keywords.length) return items || [];
  return (items || []).filter((item) => {
    const text = normalizeForKeywordMatch(getText(item));
    if (!text) return false;
    return keywords.some((keyword) => keywordMatchesText(keyword, text));
  });
};

const uniqueById = (items = []) => {
  const map = new Map();
  for (const item of items) {
    const id = String(item?.id || '').trim();
    if (!id || map.has(id)) continue;
    map.set(id, item);
  }
  return Array.from(map.values());
};

const fetchUniqueByQueries = async (queries, fetcher) => {
  const merged = [];
  for (const query of queries) {
    try {
      const batch = await fetcher(query);
      if (Array.isArray(batch) && batch.length) merged.push(...batch);
    } catch (error) {
      logger.error(`[EventScan] Query failed "${query}": ${error.message}`);
    }
  }
  return uniqueById(merged);
};

const upsertMedia = async ({ eventId, platform, externalId, payload }) => {
  const existing = await prisma.social_media_event_media.findUnique({
    where: {
      event_id_platform_external_id: {
        event_id: Number(eventId),
        platform,
        external_id: String(externalId),
      },
    },
  });

  if (!existing) {
    await prisma.social_media_event_media.create({
      data: {
        event_id: Number(eventId),
        platform,
        external_id: String(externalId),
        url: payload.url || null,
        text: payload.text || null,
        author_name: payload.author_name || null,
        author_handle: payload.author_handle || null,
        engagement: payload.engagement || {},
        media: payload.media || [],
        raw_data: payload.raw_data || {},
        posted_at: payload.posted_at || null,
      },
    });
    return { isNew: true };
  }

  await prisma.social_media_event_media.update({
    where: { id: existing.id },
    data: {
      url: payload.url || existing.url,
      text: payload.text || existing.text,
      author_name: payload.author_name || existing.author_name,
      author_handle: payload.author_handle || existing.author_handle,
      engagement: { ...asJson(existing.engagement, {}), ...(payload.engagement || {}) },
      media: payload.media?.length ? payload.media : existing.media,
      raw_data: payload.raw_data || existing.raw_data,
      posted_at: payload.posted_at || existing.posted_at,
    },
  });
  return { isNew: false };
};

const normalizeFbMedia = (media) =>
  (Array.isArray(media) ? media : [])
    .map((m) => {
      if (!m) return null;
      if (typeof m === 'string') return { type: 'photo', url: m };
      const url = m.url || m.preview || null;
      if (!url) return null;
      return { type: m.type || 'photo', url, preview: m.preview || url };
    })
    .filter(Boolean);

/* ── Blugate X search helpers ── */

const unwrapTweet = (tweetResult) => {
  let tweet = tweetResult;
  for (let i = 0; i < 6; i++) {
    if (!tweet || typeof tweet !== 'object') break;
    if (tweet.__typename === 'TweetWithVisibilityResults' && tweet.tweet) tweet = tweet.tweet;
    else if (tweet.result) tweet = tweet.result;
    else if (tweet.tweet) tweet = tweet.tweet;
    else break;
  }
  if (tweet?.__typename === 'TweetUnavailable' || tweet?.__typename === 'TweetTombstone') return null;
  return tweet?.legacy ? tweet : null;
};

const extractTweetFromContent = (content) => {
  if (!content) return null;
  return (
    content.itemContent?.tweet_results?.result ||
    content.tweetResult?.result ||
    content.tweet_results?.result ||
    null
  );
};

const collectRawTweets = (instructions = []) => {
  const all = [];
  for (const instruction of instructions) {
    if (instruction.type === 'TimelineAddEntries' || instruction.entries) {
      for (const entry of instruction.entries || []) {
        const entryId = entry.entryId || '';
        if (entryId.startsWith('cursor-') || entry.content?.cursorType) continue;
        if (entryId.startsWith('promoted-') || entryId.startsWith('who-to-follow')) continue;

        const single = extractTweetFromContent(entry.content);
        if (single) {
          all.push(single);
          continue;
        }
        for (const item of entry.content?.items || []) {
          const nested =
            extractTweetFromContent(item?.item?.itemContent ? item.item : null) ||
            extractTweetFromContent(item?.item) ||
            extractTweetFromContent(item);
          if (nested) all.push(nested);
        }
      }
    }
    if (instruction.type === 'TimelinePinEntry' && instruction.entry) {
      const pin = extractTweetFromContent(instruction.entry?.content);
      if (pin) all.push(pin);
    }
    if (instruction.type === 'TimelineAddToModule' && instruction.moduleItems) {
      for (const modItem of instruction.moduleItems) {
        const mod =
          extractTweetFromContent(modItem?.item?.itemContent ? modItem.item : null) ||
          extractTweetFromContent(modItem?.item) ||
          extractTweetFromContent(modItem);
        if (mod) all.push(mod);
      }
    }
  }
  return all;
};

const mapBlugateTweet = (raw) => {
  const tweet = unwrapTweet(raw);
  if (!tweet?.legacy) return null;
  const legacy = tweet.legacy;
  const id = String(tweet.rest_id || legacy.id_str || '');
  if (!id) return null;

  const user = tweet.core?.user_results?.result || tweet.user_results?.result || null;
  const screenName =
    user?.core?.screen_name || user?.legacy?.screen_name || 'unknown';
  const authorName = user?.core?.name || user?.legacy?.name || screenName;
  const mediaEntities = legacy.extended_entities?.media || legacy.entities?.media || [];

  return {
    id,
    text: legacy.full_text || legacy.text || '',
    url: screenName ? `https://x.com/${screenName}/status/${id}` : null,
    author: authorName,
    author_handle: screenName,
    created_at: legacy.created_at || null,
    metrics: {
      like: legacy.favorite_count,
      retweet: legacy.retweet_count,
      reply: legacy.reply_count,
      quote: legacy.quote_count,
      view: tweet.views?.count != null ? Number(tweet.views.count) : undefined,
    },
    media: mediaEntities
      .map((m) => ({
        type: m.type || 'photo',
        url: m.media_url_https || m.media_url || null,
        preview: m.media_url_https || m.media_url || null,
      }))
      .filter((m) => m.url),
    raw_data: tweet,
  };
};

const searchXViaBlugate = async (query) => {
  const data = await callXApi('SEARCH', {
    query,
    type: 'Latest',
    count: '20',
  });
  const instructions =
    data?.result?.timeline?.instructions ||
    data?.timeline?.instructions ||
    data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
    [];
  const mapped = [];
  const seen = new Set();
  for (const raw of collectRawTweets(instructions)) {
    const t = mapBlugateTweet(raw);
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    mapped.push(t);
  }
  return mapped;
};

/* ── Blugate Facebook search ── */

const mapBlugateFacebookPost = (post) => {
  if (!post) return null;
  const id = post.post_id || post.id;
  if (!id) return null;
  const authorObj = typeof post.author === 'object' && post.author ? post.author : null;
  let createdAt = null;
  const ts = post.timestamp || post.time || post.created_time;
  if (ts != null) {
    const d = typeof ts === 'number' ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts);
    if (!Number.isNaN(d.getTime())) createdAt = d;
  }
  const media = [];
  if (Array.isArray(post.album_preview)) {
    media.push(...post.album_preview.map((a) => a?.url || a).filter(Boolean));
  }
  if (Array.isArray(post.images)) media.push(...post.images);
  if (post.full_picture) media.push(post.full_picture);
  if (post.picture) media.push(post.picture);
  if (post.image) media.push(post.image);
  if (post.video) media.push(post.video);

  return {
    id: String(id),
    post_id: String(id),
    url: post.url || `https://facebook.com/${id}`,
    message: post.message || post.text || '',
    text: post.message || post.text || '',
    author: authorObj?.name || post.author_name || 'Unknown',
    author_name: authorObj?.name || post.author_name || 'Unknown',
    author_handle: authorObj?.id || authorObj?.url || '',
    created_at: createdAt,
    timestamp: ts,
    comments_count: post.comments_count ?? 0,
    reactions_count: post.reactions_count ?? 0,
    shares: post.reshare_count ?? post.shares ?? 0,
    media,
    raw_data: post,
  };
};

const searchFacebookViaBlugate = async (query) => {
  const data = await callFacebookApi('SEARCH_POSTS', { query });
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map(mapBlugateFacebookPost).filter(Boolean);
};

/* ── Blugate YouTube search ── */

const searchYouTubeViaBlugate = async (query) => {
  const search = await callYouTubeApi('SEARCH_LIST', {
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: 25,
  });
  const ids = (search?.items || [])
    .map((item) => item?.id?.videoId)
    .filter(Boolean);
  if (!ids.length) return [];

  const details = await callYouTubeApi('VIDEOS_LIST', {
    part: 'snippet,statistics,contentDetails',
    id: ids.join(','),
  });

  return (details?.items || []).map((video) => ({
    id: video.id,
    title: video.snippet?.title || '',
    description: video.snippet?.description || '',
    publishedAt: video.snippet?.publishedAt || null,
    thumbnails: video.snippet?.thumbnails || {},
    channelId: video.snippet?.channelId || '',
    channelTitle: video.snippet?.channelTitle || '',
    tags: video.snippet?.tags || [],
    statistics: {
      viewCount: Number(video.statistics?.viewCount || 0),
      likeCount: Number(video.statistics?.likeCount || 0),
      commentCount: Number(video.statistics?.commentCount || 0),
    },
  }));
};

/** One in-flight scan per event — prevents duplicate kickoff/scheduler/manual overlap. */
const inflightScans = new Map();

/**
 * Keyword search for one event → upsert social_media_event_media.
 * X / Facebook / YouTube use Blugate; Instagram uses RapidAPI until Blugate search exists.
 * @param {object} event
 * @param {{ source?: 'scheduler'|'manual'|'kickoff' }} [options]
 */
const scanEventOnce = async (event, options = {}) => {
  const eventId = Number(event?.id);
  if (Number.isFinite(eventId) && inflightScans.has(eventId)) {
    logger.info(`[EventScan] event=${eventId} already scanning — skipping duplicate ${options.source || 'scheduler'}`);
    return inflightScans.get(eventId);
  }

  const work = runScanEventOnce(event, options).finally(() => {
    if (Number.isFinite(eventId)) inflightScans.delete(eventId);
  });
  if (Number.isFinite(eventId)) inflightScans.set(eventId, work);
  return work;
};

const runScanEventOnce = async (event, options = {}) => {
  const source = options.source || 'scheduler';
  const queries = buildEventQueries(event);
  if (!queries.length) {
    await recordFetch(event.id, {
      api_hits: 0,
      posts_returned: 0,
      posts_new: 0,
      items_returned: 0,
      items_new: 0,
      ok: true,
      message: 'No keywords to search',
      source,
    });
    return { scanned: 0, ingested: 0, alerts: 0, queries: [], by_platform: {}, errors: [] };
  }

  let ingested = 0;
  let scanned = 0;
  let apiHits = 0;
  const byPlatform = {};
  const errors = [];
  const track = (platform, delta) => {
    const cur = byPlatform[platform] || { scanned: 0, ingested: 0 };
    if (delta.scanned) cur.scanned += delta.scanned;
    if (delta.ingested) cur.ingested += delta.ingested;
    byPlatform[platform] = cur;
  };

  const platforms =
    event.platforms && event.platforms.length > 0
      ? event.platforms
      : ['youtube', 'x', 'facebook', 'instagram'];

  const fetchUniqueByQueriesCounted = async (qs, fetcher) => {
    const merged = [];
    for (const query of qs) {
      try {
        apiHits += 1;
        const batch = await fetcher(query);
        if (Array.isArray(batch) && batch.length) merged.push(...batch);
      } catch (error) {
        logger.error(`[EventScan] Query failed "${query}": ${error.message}`);
      }
    }
    return uniqueById(merged);
  };

  if (platforms.includes('x')) {
    try {
      const tweets = await fetchUniqueByQueriesCounted(queries, searchXViaBlugate);
      const relevant = filterByKeywords(tweets, event, (t) => t?.text || '');
      scanned += relevant.length;
      track('x', { scanned: relevant.length });
      let xIn = 0;
      for (const t of relevant) {
        const { isNew } = await upsertMedia({
          eventId: event.id,
          platform: 'x',
          externalId: t.id,
          payload: {
            url: t.url || null,
            text: t.text || '',
            author_name: t.author || t.author_handle || 'Unknown',
            author_handle: t.author_handle || 'unknown',
            posted_at: t.created_at ? new Date(t.created_at) : new Date(),
            engagement: engagementFromXMetricsBag(t.metrics || {}),
            media: t.media || [],
            raw_data: t.raw_data || {},
          },
        });
        if (isNew) xIn += 1;
      }
      ingested += xIn;
      track('x', { ingested: xIn });
    } catch (error) {
      logger.error(`[EventScan] X failed for ${event.name}: ${error.message}`);
      errors.push({ platform: 'x', message: error.message });
    }
  }

  if (platforms.includes('youtube')) {
    try {
      const videos = await fetchUniqueByQueriesCounted(queries, searchYouTubeViaBlugate);
      const relevant = filterByKeywords(
        videos,
        event,
        (v) => `${v?.title || ''} ${v?.description || ''} ${(v?.tags || []).join(' ')}`
      );
      scanned += relevant.length;
      track('youtube', { scanned: relevant.length });
      let ytIn = 0;
      for (const v of relevant) {
        const text = `${v.title || ''}\n${v.description || ''}`.trim();
        const { isNew } = await upsertMedia({
          eventId: event.id,
          platform: 'youtube',
          externalId: v.id,
          payload: {
            url: `https://www.youtube.com/watch?v=${v.id}`,
            text: text || v.title || 'Untitled',
            author_name: v.channelTitle || 'Unknown',
            author_handle: v.channelId || 'unknown',
            posted_at: v.publishedAt ? new Date(v.publishedAt) : new Date(),
            engagement: {
              views: v.statistics?.viewCount,
              likes: v.statistics?.likeCount,
              comments: v.statistics?.commentCount,
            },
            media: [
              {
                url: `https://www.youtube.com/watch?v=${v.id}`,
                type: 'video',
                preview: v.thumbnails?.high?.url || v.thumbnails?.default?.url || null,
              },
            ],
            raw_data: v,
          },
        });
        if (isNew) ytIn += 1;
      }
      ingested += ytIn;
      track('youtube', { ingested: ytIn });
    } catch (error) {
      logger.error(`[EventScan] YouTube failed for ${event.name}: ${error.message}`);
      errors.push({ platform: 'youtube', message: error.message });
    }
  }

  if (platforms.includes('facebook')) {
    try {
      const posts = await fetchUniqueByQueriesCounted(queries, searchFacebookViaBlugate);
      const relevant = filterByKeywords(posts, event, (p) => p?.message || p?.text || '');
      scanned += relevant.length;
      track('facebook', { scanned: relevant.length });
      let fbIn = 0;
      for (const p of relevant) {
        const pid = p.id || p.post_id;
        if (!pid) continue;
        const { isNew } = await upsertMedia({
          eventId: event.id,
          platform: 'facebook',
          externalId: String(pid),
          payload: {
            url: p.url || `https://facebook.com/${pid}`,
            text: p.message || p.text || '',
            author_name: p.author || p.author_name || 'Unknown',
            author_handle: p.author_handle || '',
            posted_at: p.created_at || (p.timestamp ? new Date(p.timestamp < 1e12 ? p.timestamp * 1000 : p.timestamp) : new Date()),
            engagement: {
              comments: p.comments_count ?? p.comments ?? 0,
              reactions: p.reactions_count ?? p.reactions ?? 0,
              shares: p.shares ?? p.reshare_count ?? 0,
            },
            media: normalizeFbMedia(p.media),
            raw_data: p.raw_data || p,
          },
        });
        if (isNew) fbIn += 1;
      }
      ingested += fbIn;
      track('facebook', { ingested: fbIn });
    } catch (error) {
      logger.error(`[EventScan] Facebook failed for ${event.name}: ${error.message}`);
      errors.push({ platform: 'facebook', message: error.message });
    }
  }

  if (platforms.includes('instagram')) {
    try {
      const posts = await fetchUniqueByQueriesCounted(queries, (q) => rapidApiInstagramService.searchPosts(q));
      const relevant = filterByKeywords(posts, event, (p) => p?.text || '');
      scanned += relevant.length;
      track('instagram', { scanned: relevant.length });
      let igIn = 0;
      for (const p of relevant) {
        if (!p.id) continue;
        const { isNew } = await upsertMedia({
          eventId: event.id,
          platform: 'instagram',
          externalId: String(p.id),
          payload: {
            url: p.url || null,
            text: p.text || '',
            author_name: p.author || p.author_handle || 'Unknown',
            author_handle: p.author_handle || '',
            posted_at: p.created_at ? new Date(p.created_at) : new Date(),
            engagement: p.metrics || {},
            media: p.media || [],
            raw_data: p,
          },
        });
        if (isNew) igIn += 1;
      }
      ingested += igIn;
      track('instagram', { ingested: igIn });
    } catch (error) {
      logger.error(`[EventScan] Instagram failed for ${event.name}: ${error.message}`);
      errors.push({ platform: 'instagram', message: error.message });
    }
  }

  const ok = errors.length === 0;
  const message =
    source === 'manual'
      ? 'Manual fetch'
      : source === 'kickoff'
        ? 'Kickoff fetch after Start'
        : ok
          ? null
          : errors.map((e) => `${e.platform}: ${e.message}`).join('; ');

  await recordFetch(event.id, {
    api_hits: apiHits,
    posts_returned: scanned,
    posts_new: ingested,
    items_returned: scanned,
    items_new: ingested,
    ok,
    message,
    source,
    by_platform: byPlatform,
  });

  return { scanned, ingested, alerts: 0, queries, by_platform: byPlatform, errors };
};

module.exports = {
  scanEventOnce,
  buildEventQueries,
};
