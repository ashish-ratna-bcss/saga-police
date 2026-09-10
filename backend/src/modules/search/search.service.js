/**
 * Global Search — Blugate keyword/profile lookup per platform.
 * Frontend calls GET /search/profiles|content?platform=&query=&limit=
 */
const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');
const callXApi = require('../../services/blugate/x/blugate.x.api_client');
const callFacebookApi = require('../../services/blugate/facebook/blugate.facebook.api_client');
const callInstagramApi = require('../../services/blugate/instagram/blugate.instagram.api_client');
const callYouTubeApi = require('../../services/blugate/youtube/blugate.youtube.api_client');
const callTelegramApi = require('../../services/blugate/telegram/blugate.telegram.api_client');
const {
  listItems: listIgItems,
  pickUser,
  cleanUsername: cleanIgUsername,
  mapNodesToSearchPosts,
  mapUserToSearchProfile,
} = require('../../services/blugate/instagram/blugate.instagram.helpers');
const {
  listItems: listTelegramItems,
  cleanUsername: cleanTelegramUsername,
} = require('../../services/blugate/telegram/blugate.telegram.helpers');

const PROFILE_PLATFORMS = new Set(['x', 'youtube', 'facebook', 'telegram']);
const CONTENT_PLATFORMS = new Set(['x', 'youtube', 'facebook', 'telegram']);
const KNOWN_SEARCH_SLUGS = new Set([...PROFILE_PLATFORMS, ...CONTENT_PLATFORMS]);

const normalizePlatformSlug = (slug) => {
  const s = String(slug || '').trim().toLowerCase();
  if (s === 'twitter') return 'x';
  return s;
};

/** Only platforms the admin activated in Settings → Platforms. */
const assertPlatformConfigured = async (prisma, platform) => {
  const slug = normalizePlatformSlug(platform);
  if (!PROFILE_PLATFORMS.has(slug) && !CONTENT_PLATFORMS.has(slug)) {
    const err = new Error('Invalid platform. Use x, youtube, facebook, or telegram.');
    err.status = 400;
    throw err;
  }
  const slugs = slug === 'x' ? ['x', 'twitter'] : [slug];
  const row = await prisma.platforms.findFirst({
    where: { slug: { in: slugs }, is_active: true },
    select: { id: true, slug: true },
  });
  if (!row) {
    const err = new Error(`Platform "${slug}" is not configured for this account`);
    err.status = 400;
    throw err;
  }
  return slug;
};

const withTimeout = (promise, ms = 35000, label = 'operation') => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

const loadPlatformAuth = async (prisma, slugs, authFn) => {
  const platformRow = await prisma.platforms.findFirst({
    where: { slug: { in: slugs }, is_active: true },
    select: { api_key: true, blugate_client_key: true },
  });
  return authFn(platformRow);
};

/* ── X ── */

const extractTweetFromContent = (content) => {
  if (!content) return null;
  return (
    content.itemContent?.tweet_results?.result ||
    content.tweetResult?.result ||
    content.tweet_results?.result ||
    null
  );
};

const unwrapTweet = (raw) => {
  if (!raw) return null;
  if (raw.tweet) return unwrapTweet(raw.tweet);
  if (raw.result && (raw.result.legacy || raw.result.rest_id)) return raw.result;
  return raw;
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
  }
  return all;
};

const collectUsersFromInstructions = (instructions = []) => {
  const users = [];
  const seen = new Set();
  for (const instruction of instructions) {
    for (const entry of instruction.entries || []) {
      const userResult =
        entry?.content?.itemContent?.user_results?.result ||
        entry?.content?.itemContent?.user_result?.result ||
        null;
      if (!userResult) continue;
      const legacy = userResult.legacy || {};
      const core = userResult.core || {};
      const screenName = core.screen_name || legacy.screen_name || '';
      if (!screenName || seen.has(screenName)) continue;
      seen.add(screenName);
      users.push({
        id: userResult.rest_id,
        name: core.name || legacy.name || screenName,
        screen_name: screenName,
        description: userResult.profile_bio?.description || legacy.description || '',
        profile_image_url:
          userResult.avatar?.image_url ||
          legacy.profile_image_url_https ||
          'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
        followers_count: legacy.followers_count || 0,
        friends_count: legacy.friends_count || 0,
        verified: Boolean(userResult.is_blue_verified || legacy.verified),
        url: `https://x.com/${screenName}`,
        platform: 'x',
      });
    }
  }
  return users;
};

const mapXTweetForSearch = (raw) => {
  const tweet = unwrapTweet(raw);
  if (!tweet?.legacy) return null;
  const legacy = tweet.legacy;
  const id = String(tweet.rest_id || legacy.id_str || '');
  if (!id) return null;
  const user = tweet.core?.user_results?.result || tweet.user_results?.result || null;
  const screenName = user?.core?.screen_name || user?.legacy?.screen_name || 'unknown';
  const authorName = user?.core?.name || user?.legacy?.name || screenName;
  return {
    id,
    text: legacy.full_text || legacy.text || '',
    url: screenName ? `https://x.com/${screenName}/status/${id}` : null,
    author: authorName,
    author_handle: screenName,
    author_avatar:
      user?.avatar?.image_url || user?.legacy?.profile_image_url_https || null,
    created_at: legacy.created_at || null,
    metrics: {
      likes: legacy.favorite_count || 0,
      comments: legacy.reply_count || 0,
      retweets: legacy.retweet_count || 0,
      shares: legacy.retweet_count || 0,
      views: tweet.views?.count != null ? Number(tweet.views.count) : 0,
    },
    platform: 'x',
  };
};

const searchXProfiles = async (query, limit, auth) => {
  const data = await callXApi(
    'SEARCH',
    { query, type: 'People', count: String(Math.min(limit, 20)) },
    auth
  );
  const instructions =
    data?.result?.timeline?.instructions ||
    data?.timeline?.instructions ||
    data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
    [];
  return collectUsersFromInstructions(instructions).slice(0, limit);
};

const searchXContent = async (query, limit, auth) => {
  const data = await callXApi(
    'SEARCH',
    { query, type: 'Latest', count: String(Math.min(limit, 20)) },
    auth
  );
  const instructions =
    data?.result?.timeline?.instructions ||
    data?.timeline?.instructions ||
    data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ||
    [];
  const seen = new Set();
  const out = [];
  for (const raw of collectRawTweets(instructions)) {
    const t = mapXTweetForSearch(raw);
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
};

/* ── Facebook ── */

const searchFacebookProfiles = async (query, limit, auth) => {
  const data = await callFacebookApi('SEARCH_PAGES', { query }, auth);
  const raw = Array.isArray(data?.results) ? data.results : [];
  return raw.slice(0, limit).map((page) => {
    const id = page.facebook_id || page.page_id || page.id || page.profile_id;
    return {
      id: id != null ? String(id) : null,
      name: page.name || page.title || 'Unknown Page',
      screen_name: page.username || page.screen_name || id,
      description: page.about || page.description || '',
      profile_image_url: page.image?.uri || page.image || page.profile_pic || page.picture || '',
      followers_count: page.followers_count || page.followers || 0,
      verified: Boolean(page.is_verified),
      url: page.profile_url || page.url || (id ? `https://facebook.com/${id}` : ''),
      page_id: id != null ? String(id) : undefined,
      platform: 'facebook',
    };
  });
};

const searchFacebookContent = async (query, limit, auth) => {
  const data = await callFacebookApi('SEARCH_POSTS', { query }, auth);
  const raw = Array.isArray(data?.results) ? data.results : [];
  return raw
    .slice(0, limit)
    .map((post) => {
      const id = post.post_id || post.id;
      if (!id) return null;
      const authorObj = typeof post.author === 'object' && post.author ? post.author : null;
      let createdAt = null;
      const ts = post.timestamp || post.time || post.created_time;
      if (ts != null) {
        const d = typeof ts === 'number' ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts);
        if (!Number.isNaN(d.getTime())) createdAt = d.toISOString();
      }
      return {
        id: String(id),
        text: post.message || post.text || '',
        url: post.url || `https://facebook.com/${id}`,
        author: authorObj?.name || post.author_name || 'Unknown',
        author_handle: authorObj?.username || authorObj?.id || post.page_id || '',
        created_at: createdAt,
        metrics: {
          likes: post.reactions_count ?? 0,
          comments: post.comments_count ?? 0,
          shares: post.reshare_count ?? post.shares ?? 0,
          views: 0,
        },
        platform: 'facebook',
      };
    })
    .filter(Boolean);
};

/* ── Instagram (username lookup — provider has no keyword search) ── */

/** Build likely Instagram usernames from a free-text query. */
const igUsernameCandidates = (query) => {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const cleaned = cleanIgUsername(raw) || raw.replace(/^@+/, '').trim();
  const noSpaces = cleaned.replace(/[\s]+/g, '');
  const underscored = cleaned.replace(/[\s-]+/g, '_');
  const dotted = cleaned.replace(/[\s_]+/g, '.');
  const firstToken = cleaned.split(/[\s,/|]+/).filter(Boolean)[0] || '';
  const candidates = [cleaned, noSpaces, underscored, dotted, firstToken]
    .map((c) => String(c || '').trim().replace(/^@+/, '').toLowerCase())
    .filter((c) => /^[a-z0-9._]{1,30}$/.test(c));
  return [...new Set(candidates)];
};

const lookupInstagramUser = async (username, auth) => {
  try {
    return await callInstagramApi('USER_INFO', { username }, auth);
  } catch (err) {
    const status = err?.status || err?.response?.status;
    if (status === 429) throw err;
    try {
      return await callInstagramApi('PROFILE', { username }, auth);
    } catch (err2) {
      const status2 = err2?.status || err2?.response?.status;
      if (status2 === 429) throw err2;
      return null;
    }
  }
};

const searchInstagramProfiles = async (query, limit, auth) => {
  const candidates = igUsernameCandidates(query);
  if (!candidates.length) return [];

  for (const username of candidates) {
    const raw = await lookupInstagramUser(username, auth);
    if (!raw) continue;
    const mapped = mapUserToSearchProfile(pickUser(raw), username);
    if (!mapped) continue;
    return [
      {
        ...mapped,
        name: mapped.full_name || mapped.username,
        screen_name: mapped.username,
        profile_image_url: mapped.profile_pic_url,
        followers_count: mapped.followers_count || 0,
        verified: mapped.is_verified,
        url: `https://instagram.com/${mapped.username}`,
        platform: 'instagram',
      },
    ].slice(0, limit);
  }
  return [];
};

const searchInstagramContent = async (query, limit, auth) => {
  const candidates = igUsernameCandidates(query);
  if (!candidates.length) return [];

  for (const username of candidates) {
    try {
      const raw = await callInstagramApi('POSTS', { username, maxId: '' }, auth);
      const posts = mapNodesToSearchPosts(listIgItems(raw), username, limit);
      if (posts.length) return posts;
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 429) throw err;
    }
  }
  return [];
};

/* ── YouTube ── */

const searchYouTubeProfiles = async (query, limit, auth) => {
  const search = await callYouTubeApi(
    'SEARCH_LIST',
    { part: 'snippet', q: query, type: 'channel', maxResults: Math.min(limit, 25) },
    auth
  );
  const channelIds = (search?.items || [])
    .map((item) => item?.snippet?.channelId || item?.id?.channelId)
    .filter(Boolean);
  if (!channelIds.length) return [];

  const details = await callYouTubeApi(
    'CHANNELS_LIST',
    { part: 'snippet,statistics', id: channelIds.join(',') },
    auth
  );

  return (details?.items || []).slice(0, limit).map((channel) => {
    const stats = channel.statistics || {};
    const sn = channel.snippet || {};
    const custom = sn.customUrl ? String(sn.customUrl).replace(/^@/, '') : '';
    return {
      id: channel.id,
      channel_id: channel.id,
      title: sn.title || '',
      name: sn.title || '',
      description: sn.description || '',
      screen_name: custom || channel.id,
      thumbnails: sn.thumbnails || {},
      profile_image_url: sn.thumbnails?.default?.url || sn.thumbnails?.medium?.url || '',
      publishedAt: sn.publishedAt || null,
      url: custom
        ? `https://www.youtube.com/@${custom}`
        : `https://www.youtube.com/channel/${channel.id}`,
      followers_count: Number(stats.subscriberCount || 0),
      statistics: {
        subscriberCount: Number(stats.subscriberCount || 0),
        viewCount: Number(stats.viewCount || 0),
        videoCount: Number(stats.videoCount || 0),
      },
      platform: 'youtube',
    };
  });
};

const searchYouTubeContent = async (query, limit, auth) => {
  const search = await callYouTubeApi(
    'SEARCH_LIST',
    {
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: Math.min(limit, 25),
      order: 'date',
    },
    auth
  );
  const ids = (search?.items || []).map((item) => item?.id?.videoId).filter(Boolean);
  if (!ids.length) return [];

  const details = await callYouTubeApi(
    'VIDEOS_LIST',
    { part: 'snippet,statistics,contentDetails', id: ids.join(',') },
    auth
  );

  return (details?.items || []).slice(0, limit).map((video) => ({
    id: video.id,
    title: video.snippet?.title || '',
    description: video.snippet?.description || '',
    text: video.snippet?.title || '',
    publishedAt: video.snippet?.publishedAt || null,
    created_at: video.snippet?.publishedAt || null,
    thumbnails: video.snippet?.thumbnails || {},
    channelId: video.snippet?.channelId || '',
    channelTitle: video.snippet?.channelTitle || '',
    author: video.snippet?.channelTitle || '',
    url: `https://www.youtube.com/watch?v=${video.id}`,
    statistics: {
      viewCount: Number(video.statistics?.viewCount || 0),
      likeCount: Number(video.statistics?.likeCount || 0),
      commentCount: Number(video.statistics?.commentCount || 0),
    },
    metrics: {
      views: Number(video.statistics?.viewCount || 0),
      likes: Number(video.statistics?.likeCount || 0),
      comments: Number(video.statistics?.commentCount || 0),
    },
    platform: 'youtube',
  }));
};

/* ── Telegram ── */

const searchTelegramProfiles = async (query, limit) => {
  const q = String(query || '').trim();
  if (!q) return [];
  const out = [];
  try {
    const raw = await callTelegramApi('SEARCH_CHANNELS', { q, limit });
    for (const ch of listTelegramItems(raw)) {
      const handle = cleanTelegramUsername(ch.username || '');
      out.push({
        id: ch.id != null ? String(ch.id) : handle || q,
        name: ch.title || ch.name || handle || q,
        screen_name: handle,
        description: ch.description || '',
        profile_image_url: ch.photo_url || '',
        followers_count: ch.members_count || 0,
        url: ch.url || (handle ? `https://t.me/${handle}` : ''),
        verified: false,
        platform: 'telegram',
      });
    }
  } catch (err) {
    logger.warn(`[Search] Telegram SEARCH_CHANNELS: ${err.message}`);
  }
  if (!out.length) {
    const username = cleanTelegramUsername(q);
    if (username) {
      try {
        const ch = await callTelegramApi('CHANNEL_INFO', { username });
        const handle = cleanTelegramUsername(ch.username || username);
        out.push({
          id: ch.id != null ? String(ch.id) : handle,
          name: ch.title || ch.name || handle,
          screen_name: handle,
          description: ch.description || '',
          profile_image_url: ch.photo_url || '',
          followers_count: ch.members_count || 0,
          url: ch.url || `https://t.me/${handle}`,
          verified: false,
          platform: 'telegram',
        });
      } catch (_) {
        /* no channel */
      }
    }
  }
  return out.slice(0, limit);
};

const searchTelegramContent = async (query, limit) => {
  const q = String(query || '').trim();
  if (!q) return [];
  const raw = await callTelegramApi('SEARCH_MESSAGES', { q, limit });
  return listTelegramItems(raw)
    .map((m) => {
      const id = m.id ?? m.message_id;
      if (id == null) return null;
      return {
        id: String(id),
        text: m.text || m.message || m.caption || '',
        url: m.url || null,
        created_at: m.date || m.posted_at || m.created_at || null,
        author: m.author?.name || m.author_name || m.channel_title || 'Telegram',
        author_name: m.author?.name || m.author_name || m.channel_title || 'Telegram',
        author_handle: m.author?.username || m.author_handle || m.channel_username || '',
        metrics: {
          views: m.views ?? 0,
          shares: m.forwards ?? m.forwards_count ?? 0,
          comments: m.replies_count ?? m.replies ?? 0,
          likes: 0,
        },
        platform: 'telegram',
      };
    })
    .filter(Boolean)
    .slice(0, limit);
};

/* ── Public API ── */

/** Active platform slugs configured in this tenant (Settings → Platforms). */
const listConfiguredPlatforms = async ({ db }) => {
  const prisma = dbOf(db);
  const rows = await prisma.platforms.findMany({
    where: { is_active: true },
    select: { slug: true },
    orderBy: { id: 'asc' },
  });
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const slug = normalizePlatformSlug(row.slug);
    if (!KNOWN_SEARCH_SLUGS.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
};

const searchProfiles = async ({ platform, query, limit = 20, db }) => {
  const prisma = dbOf(db);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const p = await assertPlatformConfigured(prisma, platform);

  const timeout = 35000;
  if (p === 'x') {
    const auth = await loadPlatformAuth(prisma, ['x', 'twitter'], callXApi.authFromPlatformRow);
    return withTimeout(searchXProfiles(query, safeLimit, auth), timeout, 'X search');
  }
  if (p === 'youtube') {
    const auth = await loadPlatformAuth(prisma, ['youtube'], callYouTubeApi.authFromPlatformRow);
    return withTimeout(searchYouTubeProfiles(query, safeLimit, auth), timeout, 'YouTube search');
  }
  if (p === 'facebook') {
    const auth = await loadPlatformAuth(prisma, ['facebook'], callFacebookApi.authFromPlatformRow);
    return withTimeout(searchFacebookProfiles(query, safeLimit, auth), timeout, 'Facebook search');
  }
  if (p === 'instagram') {
    const auth = await loadPlatformAuth(prisma, ['instagram'], callInstagramApi.authFromPlatformRow);
    return withTimeout(searchInstagramProfiles(query, safeLimit, auth), timeout, 'Instagram search');
  }
  return withTimeout(searchTelegramProfiles(query, safeLimit), timeout, 'Telegram search');
};

const searchContent = async ({ platform, query, limit = 20, db }) => {
  const prisma = dbOf(db);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const p = await assertPlatformConfigured(prisma, platform);

  const timeout = 35000;
  if (p === 'x') {
    const auth = await loadPlatformAuth(prisma, ['x', 'twitter'], callXApi.authFromPlatformRow);
    return withTimeout(searchXContent(query, safeLimit, auth), timeout, 'X content search');
  }
  if (p === 'youtube') {
    const auth = await loadPlatformAuth(prisma, ['youtube'], callYouTubeApi.authFromPlatformRow);
    return withTimeout(searchYouTubeContent(query, safeLimit, auth), timeout, 'YouTube content search');
  }
  if (p === 'facebook') {
    const auth = await loadPlatformAuth(prisma, ['facebook'], callFacebookApi.authFromPlatformRow);
    return withTimeout(searchFacebookContent(query, safeLimit, auth), timeout, 'Facebook content search');
  }
  if (p === 'instagram') {
    const auth = await loadPlatformAuth(prisma, ['instagram'], callInstagramApi.authFromPlatformRow);
    return withTimeout(searchInstagramContent(query, safeLimit, auth), timeout, 'Instagram content search');
  }
  return withTimeout(searchTelegramContent(query, safeLimit), timeout, 'Telegram content search');
};

module.exports = {
  searchProfiles,
  searchContent,
  listConfiguredPlatforms,
  PROFILE_PLATFORMS,
  CONTENT_PLATFORMS,
};
