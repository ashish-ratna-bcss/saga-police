/**
 * Shared Instagram payload helpers for the Blugate flow.
 * Used by monitoringsocialmedia, preview, events, and Global Search.
 * Keep RapidAPI-named wrappers thin — prefer callInstagramApi + these.
 */

const unwrapPayload = (data) => {
  if (!data || typeof data !== 'object') return data;
  return data.result || data.results || data.data || data;
};

const pickUser = (payload) => {
  const raw = unwrapPayload(payload);
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0]?.user || raw[0] || null;
  return raw.user || raw;
};

const listItems = (payload) => {
  const raw = unwrapPayload(payload);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.posts)) return raw.posts;
  if (Array.isArray(raw.reels)) return raw.reels;
  if (Array.isArray(raw.stories)) return raw.stories;
  if (Array.isArray(raw.media)) return raw.media;
  if (Array.isArray(raw.edges)) return raw.edges.map((e) => e.node || e);
  return [];
};

const cleanUsername = (value) =>
  String(value || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .split(/[/?#]/)[0] || null;

/** Map one IG feed node → monitoringsocialmedia upsert row. */
const mapFeedItemToUpsert = (node, accountId, mediaType = 'post') => {
  const code = String(node.code || node.shortcode || node.id || node.pk || '').trim();
  if (!code) return null;

  const taken = node.taken_at || node.taken_at_ts || node.timestamp || node.created_at || null;
  let posted_at = null;
  if (taken != null) {
    const n = Number(taken);
    if (Number.isFinite(n)) {
      posted_at = new Date(n > 1e12 ? n : n * 1000);
    } else {
      const d = new Date(taken);
      if (!Number.isNaN(d.getTime())) posted_at = d;
    }
  }

  const caption =
    (typeof node.caption === 'string' ? node.caption : null) ||
    node.caption?.text ||
    node.title ||
    node.text ||
    '';

  return {
    account_id: accountId,
    platform: 'instagram',
    external_id: code,
    url: node.url || `https://www.instagram.com/p/${code}/`,
    text: caption || null,
    author_name: node.user?.full_name || node.owner?.full_name || null,
    author_handle: node.user?.username || node.owner?.username || null,
    media_type: mediaType,
    media_urls: [],
    engagement: {
      likes: node.like_count || node.likes || 0,
      comments: node.comment_count || node.comments || 0,
      views: node.view_count || node.play_count || node.video_view_count || 0,
    },
    posted_at,
    raw_data: node,
  };
};

/**
 * Username-as-query content search (IG Downloader has no keyword search).
 * Returns Global Search / event-scan friendly post objects.
 */
const mapNodesToSearchPosts = (nodes, username, limit = 50) => {
  const clean = cleanUsername(username) || '';
  return (nodes || [])
    .slice(0, Math.max(1, Number(limit) || 50))
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
        author: user.username || clean,
        author_name: user.full_name || user.username || clean,
        screen_name: user.username || clean,
        author_handle: user.username || clean,
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
};

const mapUserToSearchProfile = (user, fallbackUsername) => {
  if (!user) return null;
  const username = user.username || fallbackUsername;
  if (!username) return null;
  return {
    id: String(user.pk || user.id || user.userId || username),
    username,
    full_name: user.full_name || user.fullName || user.name || null,
    profile_pic_url: user.profile_pic_url || user.profilePicUrl || user.avatar || null,
    is_verified: Boolean(user.is_verified || user.isVerified),
    platform: 'instagram',
  };
};

module.exports = {
  unwrapPayload,
  pickUser,
  listItems,
  cleanUsername,
  mapFeedItemToUpsert,
  mapNodesToSearchPosts,
  mapUserToSearchProfile,
};
