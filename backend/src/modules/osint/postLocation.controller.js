const callInstagramApi = require('../../services/blugate/instagram/blugate.instagram.api_client');
const { unwrapPayload } = require('../../services/blugate/instagram/blugate.instagram.helpers');
const callXApi = require('../../services/blugate/x/blugate.x.api_client');
const logger = require('../../lib/logger');

// ── URL parsers ─────────────────────────────────────────────────────────────
const extractInstagramShortcode = (url) => {
  // Accept formats:
  //   https://www.instagram.com/p/<shortcode>/
  //   https://www.instagram.com/reel/<shortcode>/
  //   https://www.instagram.com/tv/<shortcode>/
  //   https://instagram.com/<user>/p/<shortcode>/
  const match = String(url).match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
};

const extractTweetId = (url) => {
  // Accept https://x.com/<handle>/status/<id> and twitter.com variants
  const match = String(url).match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i);
  return match ? match[1] : null;
};

const detectPlatform = (url) => {
  const u = String(url || '').toLowerCase();
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x';
  if (u.includes('facebook.com') || u.includes('fb.com')) return 'facebook';
  return null;
};

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

const normalizeInstagramMedia = (item) => {
  if (!item) return [];
  const collectVariantUrls = (versions) =>
    (Array.isArray(versions) ? versions : [])
      .map((variant) => (typeof variant === 'string' ? variant : variant?.url))
      .filter((url) => typeof url === 'string' && url.trim());

  const normOne = (mediaItem) => {
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
      mediaItem.display_uri ||
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
    };
  };

  if (Array.isArray(item.carousel_media) && item.carousel_media.length) {
    return item.carousel_media.map(normOne).filter(Boolean);
  }
  const single = normOne(item);
  return single ? [single] : [];
};

const fetchInstagramPostViaBlugate = async (shortcode) => {
  const code = String(shortcode || '').trim();
  if (!code) return null;

  let data = null;
  try {
    data = await callInstagramApi('MEDIA_BY_SHORTCODE', { shortcode: code });
  } catch (err) {
    logger.warn(`[Post Location] Instagram MEDIA_BY_SHORTCODE failed: ${err.message}`);
  }

  if (!data) {
    try {
      data = await callInstagramApi('LINKS', {
        url: `https://www.instagram.com/p/${code}/`,
      });
    } catch (err) {
      logger.warn(`[Post Location] Instagram LINKS fallback failed: ${err.message}`);
      return null;
    }
  }

  // LINKS shape: [{ urls: [...], meta: {...} }]
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

    const takenAt = meta.taken_at || meta.taken_at_ts || meta.timestamp || null;
    return {
      id: meta.shortcode || code,
      location: extractInstagramLocation(meta),
      author: meta.owner_fullname || meta.full_name || meta.username || null,
      author_handle: meta.username || meta.owner?.username || null,
      author_avatar: meta.profile_pic_url || null,
      text: meta.title || meta.caption || '',
      created_at: takenAt
        ? new Date(Number(takenAt) > 1e12 ? Number(takenAt) : Number(takenAt) * 1000).toISOString()
        : null,
      media,
      metrics: {
        likes: meta.likeCount || meta.like_count || 0,
        comments: meta.commentCount || meta.comment_count || 0,
        views: meta.viewCount || meta.play_count || 0,
      },
    };
  }

  const payload = unwrapPayload(data) || data;
  const item = Array.isArray(payload) ? payload[0] : payload;
  if (!item) return null;

  const user = item.user || item.owner || {};
  const takenAt = item.taken_at || item.taken_at_ts || item.timestamp || item.device_timestamp || null;
  const caption =
    (typeof item.caption === 'string' ? item.caption : null) ||
    item.caption?.text ||
    item.title ||
    item.text ||
    '';

  return {
    id: item.id || item.pk || code,
    location: extractInstagramLocation(item),
    author: user.full_name || user.username || null,
    author_handle: user.username || null,
    author_avatar: user.profile_pic_url || user.profile_pic_url_hd || null,
    text: caption,
    created_at: takenAt
      ? new Date(Number(takenAt) > 1e12 ? Number(takenAt) : Number(takenAt) * 1000).toISOString()
      : null,
    media: normalizeInstagramMedia(item),
    metrics: {
      likes: item.like_count || item.likes || 0,
      comments: item.comment_count || item.comments || 0,
      views: item.view_count || item.play_count || item.video_view_count || 0,
    },
  };
};

const extractXLocation = (tweet, userLegacy = {}) => {
  const legacy = tweet?.legacy || {};
  const placeRaw = legacy.place || tweet?.place || null;

  if (placeRaw && typeof placeRaw === 'object') {
    const name = placeRaw.full_name || placeRaw.name || null;
    if (name) {
      const bbox = placeRaw.bounding_box?.coordinates?.[0];
      let lat = null;
      let lng = null;
      if (Array.isArray(bbox) && bbox.length >= 4) {
        const lngs = bbox.map((p) => (Array.isArray(p) ? p[0] : null)).filter((v) => typeof v === 'number');
        const lats = bbox.map((p) => (Array.isArray(p) ? p[1] : null)).filter((v) => typeof v === 'number');
        if (lngs.length && lats.length) {
          lng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
          lat = lats.reduce((a, b) => a + b, 0) / lats.length;
        }
      }
      return {
        name,
        address: placeRaw.full_name || null,
        city: placeRaw.name || null,
        country: placeRaw.country || null,
        lat,
        lng,
        place_id: placeRaw.id || null,
        source: 'tweet_place',
      };
    }
  }

  const profileLocation =
    userLegacy.location ||
    (typeof tweet?.core?.user_results?.result?.location === 'string'
      ? tweet.core.user_results.result.location
      : null);
  if (profileLocation) {
    return {
      name: profileLocation,
      address: null,
      city: null,
      country: null,
      lat: null,
      lng: null,
      place_id: null,
      source: 'author_profile',
    };
  }

  return null;
};

const fetchTweetViaBlugate = async (tweetId) => {
  const pid = String(tweetId || '').trim();
  if (!pid) return null;

  const data = await callXApi('TWEET_DETAILS', { pid });
  let tweet = data?.result?.tweetResult?.result || null;
  if (tweet?.__typename === 'TweetWithVisibilityResults' && tweet.tweet) {
    tweet = tweet.tweet;
  }
  if (!tweet?.legacy && !tweet?.rest_id) return null;

  const legacy = tweet.legacy || {};
  const userResult = tweet.core?.user_results?.result || {};
  const userLegacy = userResult.legacy || {};
  const userCore = userResult.core || {};
  const screenName = userCore.screen_name || userLegacy.screen_name || 'i';
  const mediaEntities = legacy.extended_entities?.media || legacy.entities?.media || [];

  return {
    id: legacy.id_str || tweet.rest_id || pid,
    location: extractXLocation(tweet, userLegacy),
    author: userCore.name || userLegacy.name || null,
    author_handle: screenName !== 'i' ? screenName : null,
    author_avatar: userLegacy.profile_image_url_https || userResult.avatar?.image_url || null,
    text: legacy.full_text || legacy.text || '',
    created_at: legacy.created_at || null,
    url: `https://x.com/${screenName}/status/${legacy.id_str || pid}`,
    media: mediaEntities.map((m) => ({
      url: m.media_url_https || m.media_url || m.url,
      type: m.type || 'photo',
      preview: m.media_url_https || m.media_url || undefined,
      video_url: m.video_info?.variants?.find((v) => v.content_type === 'video/mp4')?.url,
    })),
    metrics: {
      likes: legacy.favorite_count ?? 0,
      retweets: legacy.retweet_count ?? 0,
      replies: legacy.reply_count ?? 0,
      quotes: legacy.quote_count ?? 0,
      views: tweet.views?.count != null ? Number(tweet.views.count) || 0 : 0,
    },
  };
};

// ── Endpoint ────────────────────────────────────────────────────────────────
// POST /api/post-location/lookup  { url: string }
// Response shape:
//   { platform, post_id, location: {...}|null, post: {...}, message? }
const lookupPostLocation = async (req, res) => {
  const url = String(req.body?.url || req.query?.url || '').trim();
  if (!url) {
    return res.status(400).json({ error: 'Post URL is required' });
  }

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({
      error: 'Unsupported URL — provide an Instagram, X/Twitter, or Facebook post link',
    });
  }

  try {
    if (platform === 'instagram') {
      const shortcode = extractInstagramShortcode(url);
      if (!shortcode) {
        return res.status(400).json({ error: 'Could not parse Instagram shortcode from URL' });
      }
      const detail = await fetchInstagramPostViaBlugate(shortcode);
      if (!detail) {
        return res.status(404).json({ error: 'Instagram post not found or Blugate provider failed' });
      }
      return res.json({
        platform: 'instagram',
        post_id: detail.id || shortcode,
        location: detail.location || null,
        post: {
          author: detail.author,
          author_handle: detail.author_handle,
          author_avatar: detail.author_avatar,
          text: detail.text,
          created_at: detail.created_at,
          content_url: `https://www.instagram.com/p/${shortcode}/`,
          media: Array.isArray(detail.media) ? detail.media : [],
          metrics: detail.metrics || {},
        },
        message: detail.location ? null : 'No location tag was set by the author on this post.',
      });
    }

    if (platform === 'x') {
      const tweetId = extractTweetId(url);
      if (!tweetId) {
        return res.status(400).json({ error: 'Could not parse tweet ID from URL' });
      }
      const detail = await fetchTweetViaBlugate(tweetId);
      if (!detail) {
        return res.status(404).json({ error: 'Tweet not found or Blugate provider failed' });
      }
      const locSource = detail.location?.source || null;
      let message = null;
      if (!detail.location) {
        message = 'This tweet has no place tag and the author has no profile location set.';
      } else if (locSource === 'author_profile') {
        message =
          "Twitter does not expose precise post geotags for most tweets — showing the author's profile location instead.";
      } else if (locSource === 'tweet_coordinates') {
        message = 'Precise GPS coordinates attached to the tweet (no place name).';
      }

      return res.json({
        platform: 'x',
        post_id: detail.id || tweetId,
        location: detail.location || null,
        post: {
          author: detail.author,
          author_handle: detail.author_handle,
          author_avatar: detail.author_avatar,
          text: detail.text,
          created_at: detail.created_at,
          content_url: detail.url || `https://x.com/i/web/status/${tweetId}`,
          media: Array.isArray(detail.media) ? detail.media : [],
          metrics: detail.metrics || {},
        },
        message,
      });
    }

    // Facebook intentionally not supported in single-link lookup — no reliable
    // post-by-URL endpoint on the current Blugate Facebook provider.
    return res.status(400).json({
      error:
        'Facebook single-link lookup is not supported. Add the Facebook page as a source to capture posts with location.',
    });
  } catch (err) {
    logger.error('[Post Location Lookup] Error:', err);
    return res.status(500).json({ error: 'Lookup failed', details: err.message });
  }
};

module.exports = { lookupPostLocation };
