const dbOf = require('../../lib/dbOf');
const callXApi = require('../../services/blugate/x/blugate.x.api_client');
const callFacebookApi = require('../../services/blugate/facebook/blugate.facebook.api_client');
const callYouTubeApi = require('../../services/blugate/youtube/blugate.youtube.api_client');
const callTelegramApi = require('../../services/blugate/telegram/blugate.telegram.api_client');
const {
  listItems: listTelegramItems,
} = require('../../services/blugate/telegram/blugate.telegram.helpers');
const { engagementFromXMetricsBag } = require('../../lib/engagementMetrics');
const { asJson, resolveEventPlatforms } = require('./event.utils');
const { recordFetch } = require('./event.service');
const logger = require('../../lib/logger');

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

const upsertMedia = async ({ eventId, platform, externalId, payload, db, dbName }) => {
  const prisma = dbOf(db);
  const existing = await prisma.social_media_event_media.findUnique({
    where: {
      event_id_platform_external_id: {
        event_id: Number(eventId),
        platform,
        external_id: String(externalId),
      },
    },
  });

  const { enqueueEventMedia } = require('../../services/media_post_analysis');

  if (!existing) {
    const created = await prisma.social_media_event_media.create({
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
        analysis_status: 'pending',
      },
    });
    try {
      enqueueEventMedia(created.id, { dbName });
    } catch (_) {
      /* queue optional */
    }
    return { isNew: true, id: created.id };
  }

  const textChanged =
    payload.text &&
    String(payload.text).trim() &&
    String(payload.text).trim() !== String(existing.text || '').trim();

  const updated = await prisma.social_media_event_media.update({
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
      ...(textChanged
        ? {
            analysis_status: 'pending',
            analysis_error: null,
            analysis_attempts: 0,
          }
        : {}),
    },
  });

  if (textChanged || existing.analysis_status === 'pending' || existing.analysis_status === 'failed') {
    try {
      enqueueEventMedia(updated.id, { dbName });
    } catch (_) {
      /* optional */
    }
  }

  return { isNew: false, id: updated.id };
};

/**
 * Build media items from a raw facebook-scraper3 post object.
 * The API has no `media` array — real image/video CDN URLs live at
 * `image.uri`, `album_preview[].image_file_uri`, and `video_files.video_sd_file`.
 * `video` and `album_preview[].url` are Facebook PAGE permalinks (e.g.
 * facebook.com/photo.php?...&type=3), not media files — using them as an
 * <img>/<video> src 404s (browsers block cross-origin embedding of the page).
 */
const normalizeFbMedia = (post) => {
  const items = [];
  if (post?.image?.uri) {
    items.push({ type: 'photo', url: post.image.uri, preview: post.image.uri });
  }
  if (Array.isArray(post?.album_preview)) {
    for (const a of post.album_preview) {
      const uri = a?.image_file_uri;
      if (uri) items.push({ type: 'photo', url: uri, preview: uri });
    }
  }
  const videoFile = post?.video_files?.video_sd_file || post?.video_files?.video_hd_file;
  if (videoFile) {
    items.push({ type: 'video', url: videoFile, preview: post?.video_thumbnail || null });
  }
  return items;
};

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

  const pickBestVideoUrl = (variants = []) => {
    const list = Array.isArray(variants) ? variants : [];
    const mp4 = list
      .filter((v) => v?.url && String(v.content_type || '').includes('mp4'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    if (mp4?.url) return mp4.url;
    const hls = list.find((v) => v?.url && /mpegurl|m3u8/i.test(String(v.content_type || v.url)));
    return hls?.url || list.find((v) => v?.url)?.url || null;
  };

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
      .map((m) => {
        const type = m.type || 'photo';
        const preview = m.media_url_https || m.media_url || null;
        let url = preview;
        if (type === 'video' || type === 'animated_gif') {
          url =
            pickBestVideoUrl(m.video_info?.variants) ||
            m.video_url ||
            m.player_stream_url ||
            preview;
        }
        if (!url) return null;
        return {
          type,
          url,
          preview: preview || url,
          ...(type === 'video' || type === 'animated_gif' ? { video_url: url } : {}),
        };
      })
      .filter(Boolean),
    raw_data: tweet,
  };
};

const searchXViaBlugate = async (query, auth = null) => {
  const data = await callXApi(
    'SEARCH',
    {
      query,
      type: 'Latest',
      count: '20',
    },
    auth
  );
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
    author_handle:
      authorObj?.url ||
      authorObj?.username ||
      authorObj?.id ||
      post.author_url ||
      post.page_id ||
      '',
    created_at: createdAt,
    timestamp: ts,
    comments_count: post.comments_count ?? 0,
    reactions_count: post.reactions_count ?? 0,
    shares: post.reshare_count ?? post.shares ?? 0,
    media,
    raw_data: post,
  };
};

const searchFacebookViaBlugate = async (query, auth = null) => {
  const data = await callFacebookApi('SEARCH_POSTS', { query }, auth);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map(mapBlugateFacebookPost).filter(Boolean);
};

/* ── Blugate Telegram search ── */

const searchTelegramViaBlugate = async (query, auth = null) => {
  const q = String(query || '').trim();
  if (!q) return [];
  const raw = await callTelegramApi('SEARCH_MESSAGES', { q, limit: 25 }, auth);
  return listTelegramItems(raw)
    .map((m) => {
      const id = m.id ?? m.message_id;
      if (id == null) return null;
      const channelKey =
        m.channel_id ||
        m.peer_id ||
        m.author?.username ||
        m.channel_username ||
        m.author_handle ||
        '';
      return {
        id: channelKey ? `${channelKey}_${id}` : String(id),
        text: m.text || m.message || m.caption || '',
        url: m.url || null,
        created_at: m.date || m.posted_at || m.created_at || null,
        author_name: m.author?.name || m.author_name || m.channel_title || 'Telegram',
        author_handle: m.author?.username || m.author_handle || m.channel_username || '',
        views: m.views ?? 0,
        forwards: m.forwards ?? m.forwards_count ?? 0,
        replies: m.replies_count ?? m.replies ?? 0,
        media: Array.isArray(m.media) ? m.media : [],
        raw_data: m,
      };
    })
    .filter(Boolean);
};

/* ── Blugate YouTube search ── */

const searchYouTubeViaBlugate = async (query, auth = null) => {
  const search = await callYouTubeApi(
    'SEARCH_LIST',
    {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: 25,
    },
    auth
  );
  const ids = (search?.items || [])
    .map((item) => item?.id?.videoId)
    .filter(Boolean);
  if (!ids.length) return [];

  const details = await callYouTubeApi(
    'VIDEOS_LIST',
    {
      part: 'snippet,statistics,contentDetails',
      id: ids.join(','),
    },
    auth
  );

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

/* ── Reddit search ── */

// The Reddit RSS service allows the whole server about ONE request per minute (shared by every tenant
// and event) and answers 429 or 504 when that budget is used up. So a scan sends a single request that
// carries as many keywords as fit, never one request per keyword.
const REDDIT_MAX_KEYWORDS_PER_CALL = 25; // the service accepts at most 25 keywords
const REDDIT_MAX_QUERY_CHARS = 480; // and 512 characters once the keywords are joined with OR

const batchRedditKeywords = (queries) => {
  const batches = [];
  let current = [];
  let chars = 0;
  for (const raw of queries) {
    const q = String(raw || '').trim();
    if (!q) continue;
    const cost = q.length + 4; // " OR "
    if (current.length && (current.length >= REDDIT_MAX_KEYWORDS_PER_CALL || chars + cost > REDDIT_MAX_QUERY_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(q);
    chars += cost;
  }
  if (current.length) batches.push(current);
  return batches;
};

const searchRedditViaUnifiedApi = async (keywords) => {
  const list = (Array.isArray(keywords) ? keywords : [keywords]).map((k) => String(k || '').trim()).filter(Boolean);
  if (!list.length) return [];
  const baseUrl = process.env.REDDIT_UNIFIED_API_URL;
  if (!baseUrl) {
    throw new Error('REDDIT_UNIFIED_API_URL is not defined in environment');
  }
  const url = `${baseUrl}/api/reddit/rss/monitor`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: list, limit: 50 }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || body?.detail || '';
    } catch { /* non-JSON error body */ }
    const err = new Error(`Reddit API returned ${response.status}${detail ? `: ${detail}` : ` ${response.statusText}`}`);
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  // The RSS search also returns subreddit entries (guid t5_…). Keep real posts and comments only.
  return posts.filter((p) => !String(p?.guid || '').startsWith('t5_'));
};

/** One in-flight scan per event — prevents duplicate kickoff/scheduler/manual overlap. */
const inflightScans = new Map();

/**
 * Keyword search for one event → upsert social_media_event_media.
 * X / Facebook / YouTube use Blugate.
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
  const db = options.db;
  const dbName = options.dbName || null;
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
    }, { db });
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

  const prisma = dbOf(db);
  const platforms = await resolveEventPlatforms(prisma, event.platforms);
  const loadPlatformAuth = async (slugs, authFn) => {
    const platformRow = await prisma.platforms.findFirst({
      where: { slug: { in: slugs }, is_active: true },
      select: { api_key: true, blugate_client_key: true },
    });
    return authFn(platformRow);
  };

  const fetchUniqueByQueriesCounted = async (qs, fetcher) => {
    const merged = [];
    for (const query of qs) {
      try {
        apiHits += 1;
        const batch = await fetcher(query);
        if (Array.isArray(batch) && batch.length) merged.push(...batch);
      } catch (error) {
        logger.warn(`[EventScan] Query "${query}" skipped: ${error.message}`);
      }
    }
    return uniqueById(merged);
  };

  if (platforms.includes('x')) {
    try {
      const xAuth = await loadPlatformAuth(['x', 'twitter'], callXApi.authFromPlatformRow);
      const tweets = await fetchUniqueByQueriesCounted(queries, (q) =>
        searchXViaBlugate(q, xAuth)
      );
      const relevant = filterByKeywords(tweets, event, (t) => t?.text || '');
      scanned += relevant.length;
      track('x', { scanned: relevant.length });
      let xIn = 0;
      for (const t of relevant) {
        const { isNew } = await upsertMedia({
          db,
          dbName,
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
      const ytAuth = await loadPlatformAuth(['youtube'], callYouTubeApi.authFromPlatformRow);
      const videos = await fetchUniqueByQueriesCounted(queries, (q) =>
        searchYouTubeViaBlugate(q, ytAuth)
      );
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
          db,
          dbName,
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
      const fbAuth = await loadPlatformAuth(['facebook'], callFacebookApi.authFromPlatformRow);
      const posts = await fetchUniqueByQueriesCounted(queries, (q) =>
        searchFacebookViaBlugate(q, fbAuth)
      );
      const relevant = filterByKeywords(posts, event, (p) => p?.message || p?.text || '');
      scanned += relevant.length;
      track('facebook', { scanned: relevant.length });
      let fbIn = 0;
      for (const p of relevant) {
        const pid = p.id || p.post_id;
        if (!pid) continue;
        const { isNew } = await upsertMedia({
          db,
          dbName,
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
            media: normalizeFbMedia(p),
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

  if (platforms.includes('telegram')) {
    try {
      const tgAuth = await loadPlatformAuth(['telegram'], callTelegramApi.authFromPlatformRow);
      const posts = await fetchUniqueByQueriesCounted(queries, (q) => searchTelegramViaBlugate(q, tgAuth));
      const relevant = filterByKeywords(posts, event, (p) => p?.text || '');
      scanned += relevant.length;
      track('telegram', { scanned: relevant.length });
      let tgIn = 0;
      for (const p of relevant) {
        const pid = p.id;
        if (!pid) continue;
        const handle = String(p.author_handle || '').replace(/^@/, '');
        const url =
          p.url ||
          (handle && !/\s/.test(handle) ? `https://t.me/${handle}` : null);
        const { isNew } = await upsertMedia({
          db,
          dbName,
          eventId: event.id,
          platform: 'telegram',
          externalId: String(pid),
          payload: {
            url,
            text: p.text || '',
            author_name: p.author_name || 'Telegram',
            author_handle: handle || '',
            posted_at: p.created_at
              ? new Date(
                  typeof p.created_at === 'number' && p.created_at < 1e12
                    ? p.created_at * 1000
                    : p.created_at
                )
              : new Date(),
            engagement: {
              views: p.views ?? 0,
              shares: p.forwards ?? 0,
              comments: p.replies ?? 0,
            },
            media: normalizeFbMedia(p.media),
            raw_data: p.raw_data || p,
          },
        });
        if (isNew) tgIn += 1;
      }
      ingested += tgIn;
      track('telegram', { ingested: tgIn });
    } catch (error) {
      logger.error(`[EventScan] Telegram failed for ${event.name}: ${error.message}`);
      errors.push({ platform: 'telegram', message: error.message });
    }
  }

  if (platforms.includes('reddit')) {
    try {
      // One request per scan. A second request would have to wait about a minute for the shared budget,
      // longer than the service is willing to queue (55 s), so it would fail anyway.
      const redditBatches = batchRedditKeywords(queries);
      if (redditBatches.length > 1) {
        const skipped = redditBatches.slice(1).reduce((n, b) => n + b.length, 0);
        logger.info(`[EventScan] Reddit: sending ${redditBatches[0].length} keywords this scan, ${skipped} did not fit in one request`);
      }
      const redditPosts = [];
      if (redditBatches.length) {
        apiHits += 1;
        redditPosts.push(...(await searchRedditViaUnifiedApi(redditBatches[0])));
      }
      const posts = uniqueById(redditPosts);
      const relevant = filterByKeywords(posts, event, (p) => `${p?.title || ''} ${p?.content || ''}`);
      scanned += relevant.length;
      track('reddit', { scanned: relevant.length });
      let redditIn = 0;
      for (const p of relevant) {
        const pid = p.id || p.guid;
        if (!pid) continue;
        const { isNew } = await upsertMedia({
          db,
          dbName,
          eventId: event.id,
          platform: 'reddit',
          externalId: String(pid),
          payload: {
            url: p.url || null,
            text: `${p.title || ''}\n${p.content || ''}`.trim(),
            author_name: p.author || 'Unknown',
            author_handle: p.author || 'unknown',
            posted_at: p.published_at ? new Date(p.published_at) : new Date(),
            engagement: {},
            media: [],
            raw_data: p,
          },
        });
        if (isNew) redditIn += 1;
      }
      ingested += redditIn;
      track('reddit', { ingested: redditIn });
    } catch (error) {
      logger.error(`[EventScan] Reddit failed for ${event.name}: ${error.message}`);
      errors.push({ platform: 'reddit', message: error.message });
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
  }, { db });

  return { scanned, ingested, alerts: 0, queries, by_platform: byPlatform, errors };
};

module.exports = {
  scanEventOnce,
  buildEventQueries,
  _reddit: { batchRedditKeywords, searchRedditViaUnifiedApi },
};
