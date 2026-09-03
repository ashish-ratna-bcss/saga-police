require('dotenv').config();
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const intel = require('./src/services/intelligenceClientService');
  console.log('engine mode:', intel.getEngineMode());
  const t0 = Date.now();
  console.log('calling analyzeText (bulk lane) with the app\'s real code path...');
  const res = await intel.analyzeText('Protest planned near Charminar tomorrow evening', { lane: 'bulk' });
  console.log(`elapsed=${((Date.now()-t0)/1000).toFixed(1)}s`);
  console.log('result:', res === null ? 'NULL  <-- analyzeContent would THROW here' : JSON.stringify(res).slice(0, 400));
  if (intel.getStats) { try { console.log('lane stats:', JSON.stringify(intel.getStats())); } catch(e){} }
  await mongoose.disconnect();
  process.exit(0);
})().catch(e => { console.error('PROBE ERR', e.message); process.exit(1); });
