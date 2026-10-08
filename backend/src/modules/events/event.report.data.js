const cfg = require('./event.config');
const { getGenericTokens } = require('./event.corpus.service');
const { isRelevantRow } = require('./event.service');
const { dedupeKey } = require('../../lib/textNormalize');
const { asJson } = require('./event.utils');

/**
 * The single source of posts for reports: only posts that are about the event
 * (own text or stored English translation), with reposts / copy-pastes merged.
 * Every number, table and evidence row in a report must be built from `posts`
 * so counts agree everywhere.
 */

const engagementOf = (e) => {
  const x = asJson(e, {}) || {};
  const n = (...k) => {
    for (const key of k) if (Number.isFinite(Number(x[key]))) return Number(x[key]);
    return 0;
  };
  return {
    likes: n('likes', 'like_count', 'favorite_count', 'reactions', 'reactions_count'),
    shares: n('shares', 'retweet_count', 'retweets', 'share_count', 'reshares'),
    comments: n('comments', 'reply_count', 'replies', 'comment_count'),
    views: n('views', 'impression_count', 'view_count'),
  };
};

const addEngagement = (a, b) => ({
  likes: a.likes + b.likes,
  shares: a.shares + b.shares,
  comments: a.comments + b.comments,
  views: a.views + b.views,
});

/**
 * @param {object} prisma tenant prisma
 * @param {object} event  social_media_events row
 * @param {object[]} rows social_media_event_media rows (need text, analysis_result, posted_at, id)
 * @returns {{posts: object[], excluded: {irrelevant:number, duplicates:number}, total:number}}
 */
const buildEventDataset = async (prisma, event, rows) => {
  const genericTokens = await getGenericTokens(prisma);
  const ctx = { genericTokens };

  const relevant = [];
  let irrelevant = 0;
  for (const r of rows) {
    if (isRelevantRow(r, event, ctx)) relevant.push(r);
    else irrelevant += 1;
  }

  // oldest first so the representative of a repost group is the original
  relevant.sort((a, b) => new Date(a.posted_at || 0) - new Date(b.posted_at || 0) || Number(a.id) - Number(b.id));

  const groups = new Map();
  const posts = [];
  let duplicates = 0;
  for (const r of relevant) {
    const key = dedupeKey(r.text || '');
    const dedupable = key.length >= 20;
    if (dedupable && groups.has(key)) {
      const rep = groups.get(key);
      rep._repost_count += 1;
      rep._dup_ids.push(String(r.id));
      rep._engagement_merged = addEngagement(rep._engagement_merged, engagementOf(r.engagement));
      duplicates += 1;
      continue;
    }
    const rep = Object.assign({}, r, {
      _repost_count: 1,
      _dup_ids: [],
      _engagement_merged: engagementOf(r.engagement),
    });
    if (dedupable) groups.set(key, rep);
    posts.push(rep);
  }

  // newest first (the order reports expect)
  posts.sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0) || Number(b.id) - Number(a.id));
  return { posts, excluded: { irrelevant, duplicates }, total: rows.length, rowCap: cfg.maxRowsScanned };
};

module.exports = { buildEventDataset, engagementOf };
