/**
 * Higher-level Instagram helpers on top of blugate.instagram.api_client
 * (same split as FB/X: blugate = HTTP, this file = normalize / product ops).
 * No Mongo — Postgres catalog only.
 */
const callInstagramApi = require('./blugate/instagram/blugate.instagram.api_client');
const { getInstagramBaseUrl, getInstagramApiKey } = require('./blugate/instagram/blugate.instagram.env');
const { INSTAGRAM_ENDPOINTS } = require('./blugate/instagram/blugate.instagram.endpoints');
const logger = require('../utils/logger');

const callEndpoint = async (endpointKey, body) => callInstagramApi(endpointKey, body);

const extractInstagramLocation = (post) => {
  if (!post || typeof post !== 'object') return null;
  const candidates = [post.location, post.location_info, post.place?.location, post.place].filter(
    (c) => c && typeof c === 'object'
  );
  for (const loc of candidates) {
    const name = loc.name || loc.short_name || loc.title || null;
    if (!name) continue;
    const lat =
      typeof loc.lat === 'number' ? loc.lat : typeof loc.latitude === 'number' ? loc.latitude : null;
    const lng =
      typeof loc.lng === 'number' ? loc.lng : typeof loc.longitude === 'number' ? loc.longitude : null;
    return {
      name,
      address: loc.address || loc.street_address || null,
      city: loc.city || loc.city_name || null,
      country: loc.country || loc.country_name || null,
      lat,
      lng,
      place_id: loc.pk ? String(loc.pk) : loc.id ? String(loc.id) : null,
      source: 'instagram_post',
    };
  }
  return null;
};

const {
  unwrapPayload,
  pickUser,
  listItems,
  mapFeedItemToUpsert,
} = require('./blugate/instagram/blugate.instagram.helpers');

const getInstagramRapidApiKeys = () => {
  const key = getInstagramApiKey();
  return key ? [key] : [];
};

const getInstagramRapidApiHost = () => {
  try {
    return new URL(getInstagramBaseUrl()).host;
  } catch (_) {
    return 'ig-downloader-api.p.rapidapi.com';
  }
};

const getKeyHealthStatus = () => {
  const keys = getInstagramRapidApiKeys();
  return keys.map((k, i) => ({
    index: i,
    key: `${k.substring(0, 8)}...`,
    available: true,
    host: getInstagramRapidApiHost(),
  }));
};

const fetchUserProfile = async (username) => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  try {
    return await callEndpoint('USER_INFO', { username: clean });
  } catch (err) {
    logger.warn(`[Instagram] userInfo failed for ${clean}: ${err.message}`);
  }
  try {
    return await callEndpoint('PROFILE', { username: clean });
  } catch (err) {
    logger.warn(`[Instagram] profile failed for ${clean}: ${err.message}`);
  }
  return null;
};

const fetchUserProfileById = async (userId) => {
  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId) return null;
  try {
    return await callEndpoint('USER_INFO', { userId: cleanUserId });
  } catch (err) {
    logger.warn(`[Instagram] userInfo by id failed: ${err.message}`);
    return null;
  }
};

const inferUsernameFromProfileUrl = async (profileUrl) => {
  const url = String(profileUrl || '').trim();
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (/instagram\.com$/i.test(u.hostname) || /\.instagram\.com$/i.test(u.hostname)) {
      const part = u.pathname.split('/').filter(Boolean)[0];
      if (part && !['p', 'reel', 'reels', 'stories', 'tv'].includes(part.toLowerCase())) {
        return part.replace(/^@/, '').toLowerCase();
      }
    }
  } catch (_) {}

  try {
    const data = await callEndpoint('LINKS', { url });
    const raw = unwrapPayload(data);
    const candidates = [
      raw?.username,
      raw?.user?.username,
      raw?.owner?.username,
      ...(Array.isArray(raw) ? raw.map((x) => x?.username) : []),
    ].filter(Boolean);
    if (candidates[0]) return String(candidates[0]).replace(/^@/, '').toLowerCase();
  } catch (_) {}
  return null;
};

const fetchUserPosts = async (username, maxId = '') => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  const body = { username: clean };
  if (maxId) body.maxId = maxId;
  return callEndpoint('POSTS', body);
};

const fetchUserReels = async (username, maxId = '') => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  const body = { username: clean };
  if (maxId) body.maxId = maxId;
  return callEndpoint('REELS', body);
};

const fetchTaggedPosts = async (username, maxId = '') => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  const body = { username: clean };
  if (maxId) body.maxId = maxId;
  return callEndpoint('TAGGED_POSTS', body);
};

const fetchInstagramPostDetail = async (shortcode) => {
  const code = String(shortcode || '').trim();
  if (!code) return null;

  let data = null;
  try {
    data = await callEndpoint('MEDIA_BY_SHORTCODE', { shortcode: code });
  } catch (err) {
    logger.warn(`[Instagram] mediaByShortcode failed: ${err.message}`);
  }

  if (!data) {
    try {
      data = await callEndpoint('LINKS', { url: `https://www.instagram.com/p/${code}/` });
    } catch (err) {
      logger.warn(`[Instagram] links fallback failed: ${err.message}`);
      return null;
    }
  }

  if (Array.isArray(data) && data[0]?.urls) {
    const entry = data[0];
    const meta = entry.meta || {};
    const media = (entry.urls || [])
      .map((u) => {
        const url = typeof u === 'string' ? u : u?.url;
        if (!url) return null;
        const ext = String(u.extension || '').toLowerCase();
        const isVideo = ext === 'mp4' || /video|\.mp4/i.test(url);
        return {
          url,
          type: isVideo ? 'video' : 'photo',
          video_url: isVideo ? url : undefined,
          preview: !isVideo ? url : undefined,
          quality: u.quality || u.subName || null,
        };
      })
      .filter(Boolean);

    return {
      id: meta.shortcode || code,
      shortcode: meta.shortcode || code,
      caption: meta.title || meta.caption || '',
      media,
      metrics: {
        likes: meta.likeCount || meta.like_count || 0,
        comments: meta.commentCount || meta.comment_count || 0,
        views: meta.viewCount || meta.play_count || 0,
      },
      location: extractInstagramLocation(meta),
      raw: entry,
      platform: 'instagram',
    };
  }

  const payload = unwrapPayload(data) || data;
  const item = Array.isArray(payload) ? payload[0] : payload;
  if (!item) return null;

  const collectVariantUrls = (versions) =>
    (Array.isArray(versions) ? versions : [])
      .map((variant) => (typeof variant === 'string' ? variant : variant?.url))
      .filter((url) => typeof url === 'string' && url.trim());

  const normApiMedia = (mediaItem) => {
    if (!mediaItem) return null;
    if (Array.isArray(mediaItem.urls) && mediaItem.urls.length) {
      const first = mediaItem.urls[0];
      const url = typeof first === 'string' ? first : first?.url;
      if (!url) return null;
      const isVideo = /\.mp4|video/i.test(url) || String(first.extension || '').toLowerCase() === 'mp4';
      return {
        url,
        type: isVideo ? 'video' : 'photo',
        video_url: isVideo ? url : undefined,
        preview: !isVideo ? url : undefined,
      };
    }
    const videoVersions = [
      ...(Array.isArray(mediaItem.video_versions) ? mediaItem.video_versions : []),
      ...(Array.isArray(mediaItem.videoVersions) ? mediaItem.videoVersions : []),
    ];
    const videoUrls = collectVariantUrls(videoVersions);
    const videoUrl =
      mediaItem.video_url || mediaItem.videoUrl || mediaItem.video || videoUrls[0] || null;
    const imageUrl =
      mediaItem.image_versions2?.candidates?.[0]?.url ||
      mediaItem.image_versions?.[0]?.url ||
      mediaItem.thumbnail_url ||
      mediaItem.display_url ||
      mediaItem.preview ||
      mediaItem.image ||
      null;
    const isVideo =
      mediaItem.media_type === 2 ||
      mediaItem.media_type === '2' ||
      Boolean(mediaItem.is_video) ||
      Boolean(videoUrl) ||
      videoVersions.length > 0;
    const url = isVideo ? videoUrl || imageUrl : imageUrl;
    if (!url) return null;
    return {
      url,
      type: isVideo ? 'video' : 'photo',
      video_url: isVideo ? videoUrl || undefined : undefined,
      preview: imageUrl || undefined,
      video_versions: videoVersions.length ? videoVersions : undefined,
    };
  };

  let mediaArr = [];
  if (Array.isArray(item.carousel_media) && item.carousel_media.length) {
    mediaArr = item.carousel_media.map(normApiMedia).filter(Boolean);
  } else {
    const single = normApiMedia(item);
    if (single) mediaArr = [single];
  }

  return {
    id: item.id || item.pk || code,
    shortcode: item.code || item.shortcode || item.meta?.shortcode || code,
    caption:
      item.caption?.text || item.caption || item.title || item.meta?.title || item.text || '',
    media: mediaArr,
    metrics: {
      likes: item.like_count || item.likes || item.meta?.likeCount || 0,
      comments: item.comment_count || item.comments || item.meta?.commentCount || 0,
      views: item.view_count || item.play_count || item.video_view_count || 0,
    },
    location: extractInstagramLocation(item),
    raw: item,
    platform: 'instagram',
  };
};

const fetchMediaLinks = async (url) => {
  const clean = String(url || '').trim();
  if (!clean) return null;
  return callEndpoint('LINKS', { url: clean });
};

const fetchUserStories = async (username) => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  return callEndpoint('STORIES', { username: clean });
};

const fetchStory = async (username, storyId) => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  let id = String(storyId || '').trim();
  if (!clean) return null;
  // If no storyId, pick the first active story for the user.
  if (!id) {
    const stories = await fetchUserStories(clean);
    const list = Array.isArray(stories?.result) ? stories.result : listItems(stories);
    id = String(list[0]?.pk || list[0]?.id || '').trim();
    if (!id) return null;
  }
  return callEndpoint('STORY', { username: clean, storyId: id });
};

const fetchHighlights = async (username) => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  return callEndpoint('HIGHLIGHTS', { username: clean });
};

const fetchHighlightStories = async (highlightId) => {
  const id = String(highlightId || '').trim();
  if (!id) return null;
  return callEndpoint('HIGHLIGHT_STORIES', { highlightId: id });
};

const fetchComments = async (url, maxId = '') => {
  const clean = String(url || '').trim();
  if (!clean) return null;
  const body = { url: clean };
  if (maxId) body.maxId = maxId;
  return callEndpoint('COMMENTS', body);
};

const fetchFollowers = async (username, maxId = '') => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  const body = { username: clean };
  if (maxId) body.maxId = maxId;
  return callEndpoint('FOLLOWERS', body);
};

const fetchFollowings = async (username, maxId = '') => {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  const body = { username: clean };
  if (maxId) body.maxId = maxId;
  return callEndpoint('FOLLOWINGS', body);
};

const searchUsers = async (query, limit = 1) => {
  const cleanQuery = String(query || '')
    .trim()
    .replace(/^@/, '');
  if (!cleanQuery) return [];
  try {
    const profileData = await fetchUserProfile(cleanQuery);
    const user = pickUser(profileData);
    if (!user) return [];
    return [
      {
        id: String(user.pk || user.id || user.userId || cleanQuery),
        username: user.username || cleanQuery,
        full_name: user.full_name || user.fullName || user.name || null,
        profile_pic_url: user.profile_pic_url || user.profilePicUrl || user.avatar || null,
        is_verified: Boolean(user.is_verified || user.isVerified),
        platform: 'instagram',
      },
    ].slice(0, Math.max(1, Number(limit) || 1));
  } catch (_) {
    return [];
  }
};

const searchPosts = async (query, limit = 50) => {
  const cleanQuery = String(query || '')
    .trim()
    .replace(/^@/, '');
  if (!cleanQuery) return [];
  try {
    // IG Downloader has no keyword search — treat query as username and return recent posts.
    const raw = await fetchUserPosts(cleanQuery);
    const items = listItems(raw).slice(0, Math.max(1, Number(limit) || 50));
    return items
      .map((node) => {
        const code = node.code || node.shortcode || node.id;
        if (!code) return null;
        const caption =
          typeof node.caption === 'string'
            ? node.caption
            : node.caption?.text || node.title || '';
        const takenAt = node.taken_at || node.taken_at_ts || node.device_timestamp;
        const image =
          node.image_versions2?.candidates?.[0]?.url ||
          node.display_uri ||
          node.thumbnail_url ||
          null;
        const user = node.user || node.owner || {};
        return {
          id: String(code),
          shortcode: String(code),
          caption,
          text: caption,
          description: caption,
          url: `https://www.instagram.com/p/${code}/`,
          image,
          author: user.username || cleanQuery,
          author_name: user.full_name || user.username || cleanQuery,
          screen_name: user.username || cleanQuery,
          author_handle: user.username || cleanQuery,
          author_avatar: user.profile_pic_url || user.profile_pic_url_hd || null,
          is_verified: Boolean(user.is_verified),
          created_at: takenAt
            ? new Date(Number(takenAt) > 1e12 ? Number(takenAt) : Number(takenAt) * 1000).toISOString()
            : null,
          metrics: {
            likes: node.like_count || node.edge_liked_by?.count || 0,
            comments: node.comment_count || node.edge_media_to_comment?.count || 0,
            views: node.view_count || node.play_count || 0,
          },
          platform: 'instagram',
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
};

module.exports = {
  INSTAGRAM_ENDPOINTS,
  callEndpoint,
  listItems,
  pickUser,
  unwrapPayload,
  mapFeedItemToUpsert,
  fetchUserPosts,
  fetchUserReels,
  fetchTaggedPosts,
  fetchUserStories,
  fetchStory,
  fetchHighlights,
  fetchHighlightStories,
  fetchUserProfile,
  fetchUserProfileById,
  inferUsernameFromProfileUrl,
  fetchInstagramPostDetail,
  fetchMediaLinks,
  fetchComments,
  fetchFollowers,
  fetchFollowings,
  searchUsers,
  searchPosts,
  getKeyHealthStatus,
  getInstagramRapidApiKeys,
  getInstagramRapidApiHost,
  getInstagramBaseUrl,
  getInstagramApiKey,
  extractInstagramLocation,
};
