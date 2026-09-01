const Source = require('../models/Source');
const Content = require('../models/Content');
const { scoreContentDoc } = require('../utils/relevanceScorer');
const {
  scoreProfileStatic,
  blendProfileScore,
  describeBlend,
  confidenceFromCount,
  priorityFromScore
} = require('../utils/profileRelevanceScorer');
const logger = require('../utils/logger');

const WINDOW_DAYS = 30;
const QUALIFYING_PRIORITIES = new Set(['high', 'medium']);

const getWindowStart = () => new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

const resolvePostRelevance = (post) => {
  const existing = post?.relevance;
  if (existing?.score != null && existing?.priority) {
    return existing;
  }

  const scored = scoreContentDoc(post);
  if (scored?.score == null) return null;

  if (!scored.priority) {
    scored.priority = priorityFromScore(scored.score);
  }
  return scored;
};

const getQualifyingPostStats = async (sourceId) => {
  if (!sourceId) {
    return {
      content_avg_score: null,
      qualifying_post_count: 0,
      total_post_count: 0,
      qualifying_scores: []
    };
  }

  const posts = await Content.find({
    source_id: sourceId,
    published_at: { $gte: getWindowStart() }
  })
    .select('text relevance scraped_content author_handle tags title description location media_location raw_data published_at')
    .lean();

  const qualifyingScores = [];

  for (const post of posts) {
    const relevance = resolvePostRelevance(post);
    if (!relevance || !QUALIFYING_PRIORITIES.has(relevance.priority)) continue;
    qualifyingScores.push(Number(relevance.score) || 0);
  }

  const qualifyingCount = qualifyingScores.length;
  const contentAvg = qualifyingCount
    ? qualifyingScores.reduce((sum, value) => sum + value, 0) / qualifyingCount
    : null;

  return {
    content_avg_score: contentAvg == null ? null : Math.round(contentAvg * 10) / 10,
    qualifying_post_count: qualifyingCount,
    total_post_count: posts.length,
    qualifying_scores: qualifyingScores
  };
};

const computeSourceRelevance = async (sourceLike = {}) => {
  const staticResult = scoreProfileStatic(sourceLike);
  const stats = await getQualifyingPostStats(sourceLike.id);

  const blend = describeBlend(
    staticResult.score,
    stats.content_avg_score,
    stats.qualifying_post_count
  );

  return {
    score: blend.score,
      static_score: staticResult.score,
      profile_text_score: staticResult.profile_text_score,
      handle_score: staticResult.handle_score,
      content_avg_score: stats.content_avg_score,
    qualifying_post_count: stats.qualifying_post_count,
    total_post_count: stats.total_post_count,
    static_weight: blend.static_weight,
    content_weight: blend.content_weight,
    blend_mode: blend.blend_mode,
    confidence: confidenceFromCount(stats.qualifying_post_count),
    reason: staticResult.reason,
    matched_terms: staticResult.matched_terms || [],
    computed_at: new Date()
  };
};

const persistSourceRelevance = async (sourceIdOrDoc) => {
  const source = sourceIdOrDoc?.id
    ? sourceIdOrDoc
    : await Source.findOne(
      typeof sourceIdOrDoc === 'string' ? { id: sourceIdOrDoc } : { _id: sourceIdOrDoc }
    ).lean();

  if (!source?.id) return null;

  const relevance = await computeSourceRelevance(source);
  await Source.updateOne({ id: source.id }, { $set: { relevance } });
  return { ...source, relevance };
};

const refreshSourceRelevance = async (sourceId) => {
  try {
    return await persistSourceRelevance(sourceId);
  } catch (error) {
    logger.warn(`[ProfileRelevance] Failed to refresh source ${sourceId}: ${error.message}`);
    return null;
  }
};

const recomputeAllSourceRelevance = async () => {
  const sources = await Source.find({}).select('id').lean();
  let updated = 0;

  for (const source of sources) {
    try {
      await persistSourceRelevance(source.id);
      updated += 1;
    } catch (error) {
      logger.warn(`[ProfileRelevance] Backfill failed for ${source.id}: ${error.message}`);
    }
  }

  logger.info(`[ProfileRelevance] Recomputed relevance for ${updated}/${sources.length} source(s)`);
  return { total: sources.length, updated };
};

module.exports = {
  computeSourceRelevance,
  getQualifyingPostStats,
  persistSourceRelevance,
  refreshSourceRelevance,
  recomputeAllSourceRelevance,
  WINDOW_DAYS,
  QUALIFYING_PRIORITIES
};
