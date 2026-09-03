// Read-only forensic audit of the risk-scoring pipeline. Writes nothing.
//
// Usage:
//   node src/scripts/audit_risk_pipeline.js

require('dotenv').config();
const mongoose = require('mongoose');
const Keyword = require('../models/Keyword');
const Analysis = require('../models/Analysis');
const Alert = require('../models/Alert');
const Content = require('../models/Content');
const Settings = require('../models/Settings');
const PolicyMapping = require('../models/PolicyMapping');
const logger = require('../utils/logger');

const say = (msg) => logger.info(msg);

const CASE_HANDLES = [
  'raj_daripally',
  'HYDDeccanNEWS',
  'NewsMeter_In',
  'Hyderabad_Mail',
  'abvptelangana'
];

(async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    say('MONGODB_URI / MONGO_URI not set. Aborting.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  const settings = await Settings.findOne({ id: 'global_settings' }).lean();
  const high = settings?.high_risk_threshold ?? settings?.risk_threshold_high ?? 70;
  const medium = settings?.medium_risk_threshold ?? settings?.risk_threshold_medium ?? 40;
  say(`\n===== THRESHOLDS =====`);
  say(`medium_risk_threshold=${settings?.medium_risk_threshold} risk_threshold_medium=${settings?.risk_threshold_medium} -> effective medium=${medium}`);
  say(`high_risk_threshold=${settings?.high_risk_threshold} risk_threshold_high=${settings?.risk_threshold_high} -> effective high=${high}`);
  say(`alert_for_every_post=${settings?.alert_for_every_post}`);

  // ---------- KEYWORDS ----------
  say(`\n===== KEYWORDS =====`);
  const kwTotal = await Keyword.countDocuments({});
  const kwActive = await Keyword.countDocuments({ is_active: true });
  say(`total=${kwTotal} active=${kwActive} inactive=${kwTotal - kwActive}`);

  const byBucket = await Keyword.aggregate([
    { $group: {
      _id: { category: '$category', weight: '$weight', language: '$language', active: '$is_active' },
      n: { $sum: 1 },
      examples: { $push: '$keyword' }
    } },
    { $sort: { n: -1 } }
  ]);
  say(`category | weight | language | active | count | examples`);
  byBucket.forEach((b) => {
    say(`  ${b._id.category} | ${b._id.weight} | ${b._id.language} | ${b._id.active} | ${b.n} | ${b.examples.slice(0, 8).join(', ')}`);
  });

  const missingWeight = await Keyword.countDocuments({ $or: [{ weight: null }, { weight: { $exists: false } }] });
  const zeroWeight = await Keyword.countDocuments({ weight: 0 });
  say(`weight null/absent=${missingWeight}  weight===0=${zeroWeight}`);

  const allActive = await Keyword.find({ is_active: true }).select('keyword category weight -_id').lean();
  say(`\nfull active keyword list:`);
  allActive
    .sort((a, b) => (b.weight ?? 50) - (a.weight ?? 50))
    .forEach((k) => say(`  w=${k.weight} cat=${k.category} ${JSON.stringify(k.keyword)}`));

  // ---------- POLICY MAPPINGS (LLM category universe) ----------
  say(`\n===== POLICY MAPPINGS =====`);
  const pmActive = await PolicyMapping.find({ is_active: true })
    .select('category_id severity_level keywords -_id')
    .lean();
  say(`active category_mappings=${pmActive.length}`);
  pmActive.forEach((m) => say(`  ${m.category_id} severity=${m.severity_level} keywords=${(m.keywords || []).length}`));
  say(`Normal present in mappings: ${pmActive.some((m) => m.category_id === 'Normal')}`);

  // ---------- ANALYSES ----------
  say(`\n===== ANALYSES =====`);
  const anTotal = await Analysis.countDocuments({});
  say(`total=${anTotal}`);
  const byLevel = await Analysis.aggregate([{ $group: { _id: '$risk_level', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  byLevel.forEach((b) => say(`  risk_level=${b._id}: ${b.n}`));

  const scoreBuckets = await Analysis.aggregate([
    { $bucket: {
      groupBy: '$risk_score',
      boundaries: [0, 1, 20, 40, 50, 51, 70, 80, 81, 101],
      default: 'other',
      output: { n: { $sum: 1 } }
    } }
  ]);
  say(`stored risk_score distribution (boundary = lower bound):`);
  scoreBuckets.forEach((b) => say(`  >=${b._id}: ${b.n}`));

  const modelBuckets = await Analysis.aggregate([
    { $match: { 'llm_analysis.score': { $ne: null } } },
    { $bucket: {
      groupBy: '$llm_analysis.score',
      boundaries: [0, 1, 20, 40, 50, 51, 70, 80, 81, 101],
      default: 'other',
      output: { n: { $sum: 1 } }
    } }
  ]);
  say(`model (llm_analysis.score) distribution:`);
  modelBuckets.forEach((b) => say(`  >=${b._id}: ${b.n}`));

  // ---------- OVERRIDE IMPACT ----------
  say(`\n===== KEYWORD OVERRIDE IMPACT =====`);
  const agreed = await Analysis.countDocuments({ $expr: { $eq: ['$risk_score', '$llm_analysis.score'] } });
  const raised = await Analysis.countDocuments({ $expr: { $gt: ['$risk_score', '$llm_analysis.score'] } });
  const lowered = await Analysis.countDocuments({ $expr: { $lt: ['$risk_score', '$llm_analysis.score'] } });
  say(`stored == model: ${agreed}`);
  say(`stored >  model (override fired): ${raised}`);
  say(`stored <  model: ${lowered}`);

  const toMedium = await Analysis.countDocuments({
    'llm_analysis.score': { $lt: medium }, risk_score: { $gte: medium, $lt: high }
  });
  const toHigh = await Analysis.countDocuments({
    'llm_analysis.score': { $lt: high }, risk_score: { $gte: high }
  });
  const modelLowToHigh = await Analysis.countDocuments({
    'llm_analysis.score': { $lt: medium }, risk_score: { $gte: high }
  });
  say(`model < ${medium} but stored medium band: ${toMedium}`);
  say(`model < ${high} but stored high band: ${toHigh}`);
  say(`model < ${medium} but stored high band: ${modelLowToHigh}`);

  // Which of the offending terms are Keyword-collection entries (score-bearing)
  // versus mappingService KR_MAP hits (display-only)?
  const kwSet = new Set(allActive.map((k) => String(k.keyword).toLowerCase()));
  const offenders = await Analysis.aggregate([
    { $match: { $expr: { $gt: ['$risk_score', '$llm_analysis.score'] } } },
    { $unwind: '$triggered_keywords' },
    { $group: { _id: '$triggered_keywords', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 60 }
  ]);
  say(`\nterms present on override-fired analyses (source-tagged):`);
  offenders.forEach((o) => {
    const src = kwSet.has(String(o._id).toLowerCase()) ? 'KEYWORD-DB (scores)' : 'KR_MAP/policy (display only)';
    say(`  ${o._id}: ${o.n}   [${src}]`);
  });

  // ---------- ALERTS ----------
  say(`\n===== ALERTS =====`);
  const alTotal = await Alert.countDocuments({});
  say(`total=${alTotal}`);
  const alByLevel = await Alert.aggregate([{ $group: { _id: '$risk_level', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  alByLevel.forEach((b) => say(`  risk_level=${b._id}: ${b.n}`));
  const alByType = await Alert.aggregate([{ $group: { _id: '$alert_type', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  alByType.forEach((b) => say(`  alert_type=${b._id}: ${b.n}`));

  // ---------- CONTENT ----------
  say(`\n===== CONTENT =====`);
  const cTotal = await Content.countDocuments({});
  const cByLevel = await Content.aggregate([{ $group: { _id: '$risk_level', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  say(`total=${cTotal}`);
  cByLevel.forEach((b) => say(`  risk_level=${b._id}: ${b.n}`));

  // ---------- NAMED FALSE-POSITIVE CASES ----------
  say(`\n===== AUDIT CASES =====`);
  for (const handle of CASE_HANDLES) {
    const rx = new RegExp(`^@?${handle}$`, 'i');
    const doc = await Content.findOne({ $or: [{ author_handle: rx }, { author: rx }] })
      .sort({ created_at: -1 })
      .select('id content_id author author_handle platform text risk_score risk_level threat_intent risk_factors -_id')
      .lean();
    if (!doc) { say(`\n[${handle}] no content found`); continue; }
    const an = await Analysis.findOne({ content_id: doc.id })
      .select('risk_score risk_level intent triggered_keywords llm_analysis explanation -_id')
      .lean();
    say(`\n[${handle}] platform=${doc.platform} content=${doc.content_id}`);
    say(`  text: ${String(doc.text || '').replace(/\s+/g, ' ').slice(0, 220)}`);
    say(`  content.risk=${doc.risk_score}/${doc.risk_level} intent=${doc.threat_intent}`);
    say(`  risk_factors: ${JSON.stringify(doc.risk_factors || [])}`);
    if (an) {
      say(`  model: score=${an.llm_analysis?.score} category=${an.llm_analysis?.category} intent=${an.intent}`);
      say(`  stored analysis: ${an.risk_score}/${an.risk_level}`);
      say(`  triggered_keywords: ${JSON.stringify(an.triggered_keywords || [])}`);
      say(`  reasoning: ${String(an.llm_analysis?.reasoning || an.explanation || '').slice(0, 200)}`);
    } else {
      say(`  no Analysis record`);
    }
  }

  await mongoose.disconnect();
})().catch((err) => {
  logger.error('Audit failed:', err);
  process.exit(1);
});
