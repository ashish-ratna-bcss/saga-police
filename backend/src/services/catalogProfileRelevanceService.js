const prisma = require('../../prisma/client');
const {
  scoreProfileStatic,
  scorePostText,
  describeBlend,
  confidenceFromCount,
} = require('../utils/apRelevanceScorer');

const WINDOW_DAYS = 30;
const QUALIFYING = new Set(['high', 'medium']);

const previewBio = (preview) => {
  if (!preview || typeof preview !== 'object') return '';
  const summary = preview.summary || {};
  return [
    summary.biography,
    summary.bio,
    summary.description,
    summary.about,
    summary.name,
  ]
    .filter(Boolean)
    .join(' ');
};

const computeAccountRelevance = (account, posts = []) => {
  const displayName = account.display_name || account.profile?.display_name || '';
  const handle = account.handle || '';
  const biography = previewBio(account.preview_data);
  const notes = account.notes || account.profile?.notes || '';

  const staticResult = scoreProfileStatic({
    handle,
    display_name: displayName,
    biography,
    notes,
  });

  const qualifyingScores = [];
  for (const post of posts) {
    const scored = scorePostText(post.text || '');
    if (!QUALIFYING.has(scored.priority)) continue;
    qualifyingScores.push(scored.score);
  }

  const qualifyingCount = qualifyingScores.length;
  const contentAvg = qualifyingCount
    ? qualifyingScores.reduce((sum, v) => sum + v, 0) / qualifyingCount
    : null;

  const blend = describeBlend(staticResult.score, contentAvg, qualifyingCount);

  return {
    score: blend.score,
    static_score: staticResult.score,
    profile_text_score: staticResult.profile_text_score,
    handle_score: staticResult.handle_score,
    content_avg_score: contentAvg == null ? null : Math.round(contentAvg * 10) / 10,
    qualifying_post_count: qualifyingCount,
    total_post_count: posts.length,
    static_weight: blend.static_weight,
    content_weight: blend.content_weight,
    blend_mode: blend.blend_mode,
    confidence: confidenceFromCount(qualifyingCount),
    reason: staticResult.reason,
    matched_terms: staticResult.matched_terms || [],
    computed_at: new Date().toISOString(),
  };
};

/**
 * Attach dynamically computed `relevance` to flattened account rows.
 * No DB write — score is derived from profile fields + recent posts.
 */
const attachRelevanceToAccounts = async (accounts = []) => {
  if (!accounts.length) return accounts;

  const ids = accounts.map((a) => a.id).filter((id) => Number.isInteger(id));
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const posts = ids.length
    ? await prisma.social_media_posts.findMany({
        where: {
          account_id: { in: ids },
          OR: [
            { posted_at: { gte: windowStart } },
            { posted_at: null, fetched_at: { gte: windowStart } },
          ],
        },
        select: { account_id: true, text: true },
        take: Math.min(ids.length * 80, 4000),
      })
    : [];

  const byAccount = new Map();
  for (const post of posts) {
    if (!byAccount.has(post.account_id)) byAccount.set(post.account_id, []);
    byAccount.get(post.account_id).push(post);
  }

  return accounts.map((account) => ({
    ...account,
    relevance: computeAccountRelevance(account, byAccount.get(account.id) || []),
  }));
};

module.exports = {
  computeAccountRelevance,
  attachRelevanceToAccounts,
  WINDOW_DAYS,
};
