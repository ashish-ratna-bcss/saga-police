// Read-only: reconstruct the six reviewer-flagged false positives end to end.
// Writes nothing.
//
// Usage:
//   node src/scripts/audit_cases.js

require('dotenv').config();
const mongoose = require('mongoose');
const Keyword = require('../models/Keyword');
const Analysis = require('../models/Analysis');
const Alert = require('../models/Alert');
const Content = require('../models/Content');
const logger = require('../utils/logger');

const say = (m) => logger.info(m);

// Reviewer's six cases: handle plus a distinctive phrase from the audit notes.
const CASES = [
  { label: 'Case 1 political support', handle: 'raj_daripally', needle: 'Geetha' },
  { label: 'Case 2 quran/auto', handle: 'HYDDeccanNEWS', needle: 'Quran' },
  { label: 'Case 3 celebrity', handle: 'NewsMeter_In', needle: 'Mahesh Babu' },
  { label: 'Case 4 local news', handle: null, needle: 'Indiramma' },
  { label: 'Case 5 bonalu', handle: 'Hyderabad_Mail', needle: 'Bonalu' },
  { label: 'Case 6 abvp drive', handle: 'abvptelangana', needle: 'membership' }
];

async function dump(label, doc, kwSet) {
  if (!doc) { say(`\n--- ${label}: no matching content found`); return; }
  const an = await Analysis.findOne({ content_id: doc.id })
    .select('risk_score risk_level intent triggered_keywords llm_analysis explanation reasons -_id')
    .lean();
  const al = await Alert.findOne({ content_id: doc.id })
    .select('risk_level alert_type title threat_details -_id')
    .lean();

  say(`\n--- ${label}`);
  say(`  author=${doc.author} handle=${doc.author_handle} platform=${doc.platform} content_id=${doc.content_id}`);
  say(`  text: ${String(doc.text || '').replace(/\s+/g, ' ').slice(0, 300)}`);
  say(`  CONTENT: risk=${doc.risk_score}/${doc.risk_level} intent=${doc.threat_intent}`);
  say(`  risk_factors (keyword-collection matches only): ${JSON.stringify(doc.risk_factors || [])}`);
  if (an) {
    say(`  MODEL:   score=${an.llm_analysis?.score} category=${an.llm_analysis?.category} intent=${an.intent}`);
    say(`  STORED:  score=${an.risk_score} level=${an.risk_level}`);
    const tk = an.triggered_keywords || [];
    const scoring = tk.filter((k) => kwSet.has(String(k).toLowerCase()));
    const display = tk.filter((k) => !kwSet.has(String(k).toLowerCase()));
    say(`  triggered (KEYWORD-DB, scores): ${JSON.stringify(scoring)}`);
    say(`  triggered (KR_MAP, display only): ${JSON.stringify(display)}`);
    say(`  reasoning: ${String(an.llm_analysis?.reasoning || an.explanation || '').slice(0, 240)}`);
  } else {
    say(`  no Analysis record`);
  }
  say(`  ALERT: ${al ? `${al.risk_level} type=${al.alert_type} title="${al.title}"` : 'none'}`);
}

(async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) { say('MONGODB_URI not set. Aborting.'); process.exit(1); }
  await mongoose.connect(mongoUri);

  const kwSet = new Set(
    (await Keyword.find({ is_active: true }).select('keyword -_id').lean())
      .map((k) => String(k.keyword).trim().toLowerCase())
  );

  const select = 'id content_id author author_handle platform text risk_score risk_level threat_intent risk_factors -_id';

  for (const c of CASES) {
    const and = [{ text: new RegExp(c.needle, 'i') }];
    if (c.handle) {
      const rx = new RegExp(`^@?${c.handle}$`, 'i');
      and.push({ $or: [{ author_handle: rx }, { author: rx }] });
    }
    const doc = await Content.findOne({ $and: and }).sort({ created_at: -1 }).select(select).lean();
    await dump(c.label, doc, kwSet);
  }

  // Worst offenders overall: what does a weight-80 monitoring hashtag do?
  say(`\n===== SAMPLES: model said low, stored says HIGH =====`);
  const worst = await Analysis.find({ 'llm_analysis.score': { $lt: 40 }, risk_score: { $gte: 70 } })
    .select('content_id risk_score triggered_keywords llm_analysis.score llm_analysis.category -_id')
    .limit(8)
    .lean();
  for (const w of worst) {
    const c = await Content.findOne({ id: w.content_id }).select('author_handle text risk_factors -_id').lean();
    const scoring = (w.triggered_keywords || []).filter((k) => kwSet.has(String(k).toLowerCase()));
    say(`  @${c?.author_handle} model=${w.llm_analysis?.score}/${w.llm_analysis?.category} stored=${w.risk_score}`);
    say(`     scoring terms: ${JSON.stringify(scoring)}  weights: ${JSON.stringify((c?.risk_factors || []).map((r) => `${r.keyword}=${r.weight}`))}`);
    say(`     text: ${String(c?.text || '').replace(/\s+/g, ' ').slice(0, 140)}`);
  }

  await mongoose.disconnect();
})().catch((err) => { logger.error('Audit failed:', err); process.exit(1); });
