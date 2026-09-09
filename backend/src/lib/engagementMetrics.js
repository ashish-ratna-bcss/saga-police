/**
 * Presence-preserving engagement helpers.
 *
 * Missing / null / ''  → unavailable (field omitted)
 * Explicit 0           → stored and displayed as 0
 *
 * Do not invent defaults. Callers must only pass values that came from the API.
 */

const hasOwn = (obj, key) =>
  obj != null && Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Read the first present numeric candidate from a list of {source, key} or raw values.
 * A key is "present" when it exists on the object (even if value is 0).
 * Bare values (numbers/strings) are treated as present when finite after Number().
 *
 * @param  {...any} candidates
 * @returns {number|undefined}
 */
function readPresentCount(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;

    if (typeof candidate === 'object' && !Array.isArray(candidate) && candidate.__path) {
      const { obj, key } = candidate.__path;
      if (!obj || !hasOwn(obj, key)) continue;
      const n = Number(obj[key]);
      if (Number.isFinite(n)) return n;
      continue;
    }

    // { obj, keys: ['a','b'] } shorthand
    if (typeof candidate === 'object' && !Array.isArray(candidate) && candidate.obj && candidate.keys) {
      for (const key of candidate.keys) {
        if (!hasOwn(candidate.obj, key)) continue;
        const n = Number(candidate.obj[key]);
        if (Number.isFinite(n)) return n;
      }
      continue;
    }

    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Helper to mark an object key path for readPresentCount */
const fromKey = (obj, key) => ({ __path: { obj, key } });

/**
 * Build a sparse engagement object — only includes keys with finite numbers.
 * @param {Record<string, number|undefined|null>} fields
 * @returns {Record<string, number>}
 */
function buildEngagement(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    out[key] = n;
  }
  return out;
}

/**
 * Merge newly observed engagement onto an existing document engagement without
 * inventing zeros for metrics the latest payload omitted.
 */
function mergeEngagement(existing = {}, incoming = {}) {
  return { ...existing, ...buildEngagement(incoming) };
}

/**
 * X / Twitter metrics from RapidAPI legacy + views blob or official public_metrics.
 */
function extractXEngagement({ legacy, views, publicMetrics } = {}) {
  if (publicMetrics && typeof publicMetrics === 'object') {
    return buildEngagement({
      likes: readPresentCount(fromKey(publicMetrics, 'like_count')),
      retweets: readPresentCount(fromKey(publicMetrics, 'retweet_count')),
      replies: readPresentCount(fromKey(publicMetrics, 'reply_count')),
      views: readPresentCount(fromKey(publicMetrics, 'impression_count')),
      quotes: readPresentCount(fromKey(publicMetrics, 'quote_count'))
    });
  }

  const viewsObj = views && typeof views === 'object' ? views : null;
  return buildEngagement({
    likes: readPresentCount(fromKey(legacy || {}, 'favorite_count')),
    retweets: readPresentCount(fromKey(legacy || {}, 'retweet_count')),
    replies: readPresentCount(fromKey(legacy || {}, 'reply_count')),
    views: readPresentCount(fromKey(viewsObj || {}, 'count')),
    quotes: readPresentCount(fromKey(legacy || {}, 'quote_count'))
  });
}

/**
 * Facebook post engagement from RapidAPI scraper shapes.
 */
function extractFacebookEngagement(post = {}) {
  const reactions = post.reactions && typeof post.reactions === 'object' ? post.reactions : {};
  return buildEngagement({
    likes: readPresentCount(
      fromKey(post, 'likes'),
      fromKey(reactions, 'likes'),
      fromKey(post, 'reactions_count'),
      fromKey(post, 'reaction_count')
    ),
    comments: readPresentCount(
      fromKey(post, 'comments'),
      fromKey(post, 'comments_count'),
      fromKey(post, 'comment_count')
    ),
    shares: readPresentCount(
      fromKey(post, 'shares'),
      fromKey(post, 'shares_count'),
      fromKey(post, 'share_count'),
      fromKey(post, 'reshare_count')
    ),
    views: readPresentCount(fromKey(post, 'views'), fromKey(post, 'view_count'))
  });
}

/**
 * Instagram post engagement from GraphQL / RapidAPI node shapes.
 * Plays are stored as `views` only when a play/view field is actually present.
 */
function extractInstagramEngagement(post = {}) {
  const previewLike = post.edge_media_preview_like;
  const likedBy = post.edge_liked_by;
  const likesObj = post.likes;
  const toComment = post.edge_media_to_comment;
  const commentsObj = post.comments;
  const media = post.media && typeof post.media === 'object' ? post.media : {};
  const statistics = post.statistics && typeof post.statistics === 'object' ? post.statistics : {};

  return buildEngagement({
    likes: readPresentCount(
      fromKey(previewLike || {}, 'count'),
      fromKey(likedBy || {}, 'count'),
      fromKey(likesObj || {}, 'count'),
      fromKey(post, 'like_count')
    ),
    comments: readPresentCount(
      fromKey(toComment || {}, 'count'),
      fromKey(post, 'comment_count'),
      fromKey(commentsObj || {}, 'count')
    ),
    views: readPresentCount(
      fromKey(post, 'video_view_count'),
      fromKey(post, 'view_count'),
      fromKey(post, 'play_count'),
      fromKey(post, 'video_play_count'),
      fromKey(post, 'clips_view_count'),
      fromKey(media, 'view_count'),
      fromKey(statistics, 'view_count'),
      fromKey(post, 'reel_play_count'),
      fromKey(post, 'reel_view_count')
    ),
    shares: readPresentCount(
      fromKey(post, 'share_count'),
      fromKey(post, 'shares'),
      fromKey(post, 'reshare_count')
    ),
    saves: readPresentCount(
      fromKey(post, 'save_count'),
      fromKey(post, 'saves'),
      fromKey(post, 'bookmark_count')
    )
  });
}

/**
 * YouTube Data API v3 statistics — only keys present on the statistics object.
 */
function extractYouTubeEngagement(statistics = {}) {
  return buildEngagement({
    views: readPresentCount(fromKey(statistics, 'viewCount')),
    likes: readPresentCount(fromKey(statistics, 'likeCount')),
    comments: readPresentCount(fromKey(statistics, 'commentCount'))
  });
}

/**
 * Convert sparse X engagement into the legacy metrics string bag used by
 * older monitor paths (omit unavailable keys entirely).
 */
function xEngagementToMetricsBag(engagement = {}) {
  const metrics = {};
  if (engagement.likes !== undefined) metrics.like = String(engagement.likes);
  if (engagement.retweets !== undefined) metrics.retweet = String(engagement.retweets);
  if (engagement.replies !== undefined) metrics.reply = String(engagement.replies);
  if (engagement.views !== undefined) metrics.views = String(engagement.views);
  if (engagement.quotes !== undefined) metrics.quote = String(engagement.quotes);
  return metrics;
}

/**
 * Build Content.engagement from X tweet.metrics bag without inventing zeros.
 */
function engagementFromXMetricsBag(metrics = {}) {
  return buildEngagement({
    likes: readPresentCount(fromKey(metrics, 'like'), fromKey(metrics, 'likes')),
    retweets: readPresentCount(fromKey(metrics, 'retweet'), fromKey(metrics, 'retweets')),
    replies: readPresentCount(fromKey(metrics, 'reply'), fromKey(metrics, 'replies')),
    views: readPresentCount(fromKey(metrics, 'view'), fromKey(metrics, 'views')),
    quotes: readPresentCount(fromKey(metrics, 'quote'), fromKey(metrics, 'quotes'))
  });
}

module.exports = {
  readPresentCount,
  fromKey,
  buildEngagement,
  mergeEngagement,
  extractXEngagement,
  extractFacebookEngagement,
  extractInstagramEngagement,
  extractYouTubeEngagement,
  xEngagementToMetricsBag,
  engagementFromXMetricsBag
};
