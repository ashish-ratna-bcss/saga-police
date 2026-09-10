const dbOf = require('../../lib/dbOf');
const {
  buildKeywordMatchers,
  scoreProfileStatic,
  scorePostText,
  describeBlend,
  confidenceFromCount,
} = require('../../lib/apRelevanceScorer');

const WINDOW_DAYS = 30;
const QUALIFYING = new Set(['high', 'medium']);
const KEYWORD_CACHE_MS = 60_000;

let keywordCache = { at: 0, terms: [], matchers: [] };

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

/** Collect live catalog keywords (+ event keywords). No hard-coded list. */
const loadCatalogKeywordTerms = async ({ db } = {}) => {
  const prisma = dbOf(db);
  const now = Date.now();
  // Module-level keyword cache is main-db only; skip when a tenant client is passed.
  if (!db && keywordCache.matchers.length && now - keywordCache.at < KEYWORD_CACHE_MS) {
    return keywordCache;
  }

  const terms = new Set();

  const rows = await prisma.keywords.findMany({
    select: { keyword: true },
    take: 2000,
  });
  for (const row of rows) {
    const t = String(row.keyword || '').trim();
    if (t) terms.add(t);
  }

  try {
    const events = await prisma.social_media_events.findMany({
      select: { keywords: true },
      take: 200,
    });
    for (const ev of events) {
      const list = Array.isArray(ev.keywords) ? ev.keywords : [];
      for (const item of list) {
        const t = String(item?.keyword || item || '').trim();
        if (t) terms.add(t);
      }
    }
  } catch (_) {
    // events table optional for scoring
  }

  const termList = [...terms];
  const pack = {
    at: now,
    terms: termList,
    matchers: buildKeywordMatchers(termList),
  };
  if (!db) keywordCache = pack;
  return pack;
};

const computeAccountRelevance = (account, posts = [], matchers = [], keywordCount = 0) => {
  const displayName = account.display_name || account.profile?.display_name || '';
  const handle = account.handle || '';
  const biography = previewBio(account.preview_data);
  const notes = account.notes || account.profile?.notes || '';

  const staticResult = scoreProfileStatic(
    {
      handle,
      display_name: displayName,
      biography,
      notes,
    },
    matchers
  );

  const qualifyingScores = [];
  const postMatched = new Set();
  for (const post of posts) {
    const scored = scorePostText(post.text || '', matchers);
    for (const t of scored.matched_terms || []) postMatched.add(t);
    if (!QUALIFYING.has(scored.priority)) continue;
    qualifyingScores.push(scored.score);
  }

  const qualifyingCount = qualifyingScores.length;
  const contentAvg = qualifyingCount
    ? qualifyingScores.reduce((sum, v) => sum + v, 0) / qualifyingCount
    : null;

  const blend = describeBlend(staticResult.score, contentAvg, qualifyingCount);

  const matched_terms = [...new Set([
    ...(staticResult.matched_terms || []),
    ...[...postMatched].slice(0, 6),
  ])].slice(0, 12);

  const ownPosts = posts.filter((p) => p.account_id === account.id).length;

  return {
    score: blend.score,
    static_score: staticResult.score,
    profile_text_score: staticResult.profile_text_score,
    handle_score: staticResult.handle_score,
    content_avg_score: contentAvg == null ? null : Math.round(contentAvg * 10) / 10,
    qualifying_post_count: qualifyingCount,
    total_post_count: posts.length,
    own_post_count: ownPosts,
    posts_scope: ownPosts === posts.length ? 'account' : 'profile',
    static_weight: blend.static_weight,
    content_weight: blend.content_weight,
    blend_mode: blend.blend_mode,
    confidence: confidenceFromCount(qualifyingCount),
    reason: staticResult.reason,
    matched_terms,
    profile_matched_terms: staticResult.matched_terms || [],
    keyword_count: keywordCount,
    computed_at: new Date().toISOString(),
  };
};

/**
 * Attach dynamically computed `relevance` to flattened account rows.
 * Recent posts: this account first; if none, sibling accounts on the same profile.
 * No DB write / no schema column.
 */
const attachRelevanceToAccounts = async (accounts = [], { db } = {}) => {
  const prisma = dbOf(db);
  if (!accounts.length) return accounts;

  const { matchers, terms } = await loadCatalogKeywordTerms({ db: prisma });

  const accountIds = accounts.map((a) => a.id).filter((id) => Number.isInteger(id));
  const profileIds = [
    ...new Set(accounts.map((a) => a.profile_id).filter((id) => Number.isInteger(id))),
  ];

  const accountToProfile = new Map();
  let fetchIds = [...accountIds];

  if (profileIds.length) {
    const siblings = await prisma.social_media_accounts.findMany({
      where: { profile_id: { in: profileIds } },
      select: { id: true, profile_id: true },
    });
    for (const s of siblings) accountToProfile.set(s.id, s.profile_id);
    fetchIds = [...new Set(siblings.map((s) => s.id))];
  } else {
    for (const a of accounts) {
      if (Number.isInteger(a.id)) accountToProfile.set(a.id, a.profile_id ?? null);
    }
  }

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const posts = fetchIds.length
    ? await prisma.social_media_posts.findMany({
        where: {
          account_id: { in: fetchIds },
          OR: [
            { posted_at: { gte: windowStart } },
            { fetched_at: { gte: windowStart } },
          ],
        },
        select: { account_id: true, text: true },
        take: Math.min(fetchIds.length * 80, 4000),
      })
    : [];

  const byAccount = new Map();
  const byProfile = new Map();
  for (const post of posts) {
    if (!byAccount.has(post.account_id)) byAccount.set(post.account_id, []);
    byAccount.get(post.account_id).push(post);

    const pid = accountToProfile.get(post.account_id);
    if (pid != null) {
      if (!byProfile.has(pid)) byProfile.set(pid, []);
      byProfile.get(pid).push(post);
    }
  }

  return accounts.map((account) => {
    const own = byAccount.get(account.id) || [];
    const profilePosts =
      account.profile_id != null ? byProfile.get(account.profile_id) || [] : [];
    const postsForScore = own.length ? own : profilePosts;

    return {
      ...account,
      relevance: computeAccountRelevance(
        account,
        postsForScore,
        matchers,
        terms.length
      ),
    };
  });
};

module.exports = {
  computeAccountRelevance,
  attachRelevanceToAccounts,
  loadCatalogKeywordTerms,
  WINDOW_DAYS,
};
