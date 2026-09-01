// Read-only audit: how much of the current risk classification is driven by
// topical monitoring keywords rather than by the model?
//
// Layer 1 of performFullAnalysis() overrides the model score with the highest
// matched Keyword.weight (default 50). Any active keyword — including purely
// topical ones like #Hyderabad — therefore forces >= medium risk on its own.
// This script measures that. It writes nothing.
//
// Usage:
//   node src/scripts/audit_keyword_risk.js

require('dotenv').config();
const mongoose = require('mongoose');
const Keyword = require('../models/Keyword');
const Analysis = require('../models/Analysis');
const Settings = require('../models/Settings');
const logger = require('../utils/logger');

const RISK_CATEGORIES = ['violence', 'threat', 'hate'];

(async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    logger.info('MONGODB_URI / MONGO_URI not set in env. Aborting.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  const settings = await Settings.findOne({ id: 'global_settings' }).lean();
  const high = settings?.high_risk_threshold ?? settings?.risk_threshold_high ?? 70;
  const medium = settings?.medium_risk_threshold ?? settings?.risk_threshold_medium ?? 40;
  logger.info(`Thresholds: medium=${medium}, high=${high}`);

  // 1. What is actually in the keyword table?
  const keywords = await Keyword.find({ is_active: true }).select('keyword category weight -_id').lean();
  const buckets = new Map();
  keywords.forEach((k) => {
    const key = `${k.category || 'other'} / weight=${k.weight ?? 50}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  logger.info(`\nActive keywords: ${keywords.length}`);
  [...buckets.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => logger.info(`  ${k}: ${n}`));

  const topical = keywords.filter((k) => !RISK_CATEGORIES.includes(k.category));
  const aboveMedium = topical.filter((k) => (k.weight ?? 50) >= medium);
  logger.info(`\nNon-risk-category keywords: ${topical.length} (${aboveMedium.length} carry weight >= medium threshold)`);
  logger.info(`  sample: ${aboveMedium.slice(0, 25).map((k) => k.keyword).join(', ')}`);

  // 2. How many stored analyses were pushed up by that override?
  // llm_analysis.score is the model's own score, written before the override,
  // so the two can be compared directly on existing records.
  const total = await Analysis.countDocuments({});
  const withLlmScore = await Analysis.countDocuments({ 'llm_analysis.score': { $ne: null } });
  const inflated = await Analysis.countDocuments({
    'llm_analysis.score': { $lt: medium },
    risk_level: { $in: ['medium', 'high', 'critical'] }
  });
  logger.info(`\nAnalyses: total=${total}, with model score recorded=${withLlmScore}`);
  logger.info(`Stored >= medium while the model itself scored < ${medium}: ${inflated}`);

  // 3. Which keywords are doing the inflating?
  const offenders = await Analysis.aggregate([
    { $match: { 'llm_analysis.score': { $lt: medium }, risk_level: { $in: ['medium', 'high', 'critical'] } } },
    { $unwind: '$triggered_keywords' },
    { $group: { _id: '$triggered_keywords', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 30 }
  ]);
  logger.info('\nTop terms on inflated records:');
  offenders.forEach((o) => logger.info(`  ${o._id}: ${o.n}`));

  // 4. Eyeball a few.
  const samples = await Analysis.find({
    'llm_analysis.score': { $lt: medium },
    risk_level: { $in: ['medium', 'high', 'critical'] }
  })
    .select('content_id risk_score risk_level triggered_keywords llm_analysis.score llm_analysis.category -_id')
    .limit(5)
    .lean();
  logger.info('\nSamples:');
  samples.forEach((s) => {
    logger.info(
      `  content=${s.content_id} stored=${s.risk_score}/${s.risk_level} ` +
      `model=${s.llm_analysis?.score}/${s.llm_analysis?.category} ` +
      `terms=[${(s.triggered_keywords || []).join(', ')}]`
    );
  });

  await mongoose.disconnect();
})().catch((err) => {
  logger.error('Audit failed:', err);
  process.exit(1);
});
