// Read-only: where does the stored-80 risk come from on records the model scored low?
require('dotenv').config();
const mongoose = require('mongoose');
const Analysis = require('../models/Analysis');
const Content = require('../models/Content');
const logger = require('../utils/logger');
const say = (m) => logger.info(m);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const sample = await Analysis.find({ 'llm_analysis.score': { $lt: 40 }, risk_score: { $gte: 70 } })
    .select('content_id risk_score triggered_keywords analyzed_at llm_analysis.score -_id')
    .limit(300).lean();

  let byId = 0, byContentId = 0, orphan = 0;
  const weights = new Map();
  const terms = new Map();
  for (const a of sample) {
    let c = await Content.findOne({ id: a.content_id }).select('risk_factors author_handle -_id').lean();
    if (c) byId++;
    else {
      c = await Content.findOne({ content_id: a.content_id }).select('risk_factors author_handle -_id').lean();
      if (c) byContentId++; else { orphan++; continue; }
    }
    (c.risk_factors || []).forEach((r) => {
      weights.set(r.weight, (weights.get(r.weight) || 0) + 1);
      terms.set(r.keyword, (terms.get(r.keyword) || 0) + 1);
    });
  }
  say(`sample=${sample.length} joined-by-Content.id=${byId} joined-by-content_id=${byContentId} orphan=${orphan}`);
  say(`risk_factors weight histogram: ${JSON.stringify([...weights.entries()].sort((a, b) => b[1] - a[1]))}`);
  say(`risk_factors terms: ${JSON.stringify([...terms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))}`);

  const dates = sample.map((s) => s.analyzed_at).filter(Boolean).sort();
  say(`analyzed_at range on these: ${dates[0]} .. ${dates[dates.length - 1]}`);

  const total = await Analysis.countDocuments({});
  const withScore80 = await Analysis.countDocuments({ risk_score: 80 });
  const withScore50 = await Analysis.countDocuments({ risk_score: 50 });
  say(`analyses total=${total} exactly-50=${withScore50} exactly-80=${withScore80}`);

  const contentTotal = await Content.countDocuments({});
  say(`content total=${contentTotal} (analyses outnumber content ${(total / contentTotal).toFixed(1)}x)`);

  await mongoose.disconnect();
})().catch((e) => { logger.error('failed', e); process.exit(1); });
