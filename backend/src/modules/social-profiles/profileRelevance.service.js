const dbOf = require('../../lib/dbOf');
const { deriveViralityFromEngagement, DEFAULT_VIRALITY_THRESHOLDS } = require('../alerts/alert.utils');

/**
 * Profile Relevance Score: a per-account (per platform identity) aggregation of
 * that account's OWN posts' existing risk and virality classifications.
 * Medium = 1 point, High = 2 points, any other/unknown value = 0 points.
 * Not to be confused with `relevance` (catalogRelevance.service.js), which is a
 * separate, alert-count-based score with a 30-day window and sibling fallback.
 */

const calculateRiskRelevance = ({ totalPosts, mediumRiskPosts, highRiskPosts }) => {
  if (!totalPosts) return 0;
  const weighted = (mediumRiskPosts * 1) + (highRiskPosts * 2);
  return Math.min(100, (weighted / totalPosts) * 100);
};

const calculateViralityRelevance = ({ totalPosts, mediumViralityPosts, highViralityPosts }) => {
  if (!totalPosts) return 0;
  const weighted = (mediumViralityPosts * 1) + (highViralityPosts * 2);
  return Math.min(100, (weighted / totalPosts) * 100);
};

const calculateProfileRelevance = (riskRelevanceScore, viralityRelevanceScore) =>
  Math.min(100, Math.max(0, (riskRelevanceScore + viralityRelevanceScore) / 2));

/** post.analysis_result is a Json blob; risk_level lives at analysis_result.risk_level. */
const extractRiskLevel = (post) => {
  const result = post?.analysis_result;
  const level = result && typeof result === 'object' ? result.risk_level : null;
  return String(level || '').toLowerCase().trim();
};

const computeProfileRelevance = ({
  totalPosts,
  mediumRiskPosts,
  highRiskPosts,
  mediumViralityPosts,
  highViralityPosts,
}) => {
  const riskRelevanceScore = calculateRiskRelevance({ totalPosts, mediumRiskPosts, highRiskPosts });
  const viralityRelevanceScore = calculateViralityRelevance({
    totalPosts,
    mediumViralityPosts,
    highViralityPosts,
  });
  const profileRelevanceScore = calculateProfileRelevance(riskRelevanceScore, viralityRelevanceScore);

  return {
    total_posts: totalPosts,
    medium_risk_posts: mediumRiskPosts,
    high_risk_posts: highRiskPosts,
    medium_virality_posts: mediumViralityPosts,
    high_virality_posts: highViralityPosts,
    risk_relevance_score: Math.round(riskRelevanceScore),
    virality_relevance_score: Math.round(viralityRelevanceScore),
    profile_relevance_score: Math.round(profileRelevanceScore),
  };
};

/**
 * Attach dynamically computed `profile_relevance` to flattened account rows,
 * based ONLY on each account's own posts (no sibling/profile-level fallback —
 * unlike catalogRelevance's alert-based `relevance`). No DB write / no schema column.
 */
const attachProfileRelevanceToAccounts = async (accounts = [], { db } = {}) => {
  const prisma = dbOf(db);
  if (!accounts.length) return accounts;

  const accountIds = accounts.map((a) => a.id).filter((id) => Number.isInteger(id));
  if (!accountIds.length) {
    return accounts.map((a) => ({ ...a, profile_relevance: computeProfileRelevance({
      totalPosts: 0, mediumRiskPosts: 0, highRiskPosts: 0, mediumViralityPosts: 0, highViralityPosts: 0,
    }) }));
  }

  const posts = await prisma.social_media_posts.findMany({
    where: { account_id: { in: accountIds } },
    select: { account_id: true, platform: true, analysis_result: true, engagement: true },
  });

  const distinctSlugs = [...new Set(posts.map((p) => p.platform).filter(Boolean))];
  const platformRows = distinctSlugs.length
    ? await prisma.platforms.findMany({
        where: { slug: { in: distinctSlugs } },
        select: { slug: true, low_threshold: true, medium_threshold: true, high_threshold: true },
      })
    : [];
  const thresholdsBySlug = new Map(
    platformRows.map((p) => [p.slug, {
      low_threshold: p.low_threshold,
      medium_threshold: p.medium_threshold,
      high_threshold: p.high_threshold,
    }])
  );

  const byAccount = new Map();
  for (const post of posts) {
    if (!byAccount.has(post.account_id)) byAccount.set(post.account_id, []);
    byAccount.get(post.account_id).push(post);
  }

  return accounts.map((account) => {
    const accountPosts = byAccount.get(account.id) || [];
    let mediumRiskPosts = 0;
    let highRiskPosts = 0;
    let mediumViralityPosts = 0;
    let highViralityPosts = 0;

    for (const post of accountPosts) {
      const riskLevel = extractRiskLevel(post);
      if (riskLevel === 'high') highRiskPosts++;
      else if (riskLevel === 'medium') mediumRiskPosts++;

      const thresholds = thresholdsBySlug.get(post.platform) || DEFAULT_VIRALITY_THRESHOLDS;
      const viralityLevel = deriveViralityFromEngagement(post.engagement, thresholds);
      if (viralityLevel === 'high') highViralityPosts++;
      else if (viralityLevel === 'medium') mediumViralityPosts++;
    }

    return {
      ...account,
      profile_relevance: computeProfileRelevance({
        totalPosts: accountPosts.length,
        mediumRiskPosts,
        highRiskPosts,
        mediumViralityPosts,
        highViralityPosts,
      }),
    };
  });
};

module.exports = {
  calculateRiskRelevance,
  calculateViralityRelevance,
  calculateProfileRelevance,
  computeProfileRelevance,
  attachProfileRelevanceToAccounts,
};
