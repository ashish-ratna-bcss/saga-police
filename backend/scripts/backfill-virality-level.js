/**
 * Backfill Alert.virality_level + virality_detected_at from legacy velocity signals.
 *
 * Safe rules (does NOT touch risk_level or risk_score):
 *  1. Skip docs that already have virality_level set
 *  2. Only treat as viral when alert_type === 'velocity'
 *     OR velocity_data.threshold_triggered is present
 *  3. Map legacy priority HIGH/MEDIUM/LOW → virality_level high/medium/low
 *  4. Set virality_detected_at = created_at (best historical proxy)
 *
 * Usage (from backend/):
 *   DRY_RUN=1 node scripts/backfill-virality-level.js
 *   node scripts/backfill-virality-level.js
 *
 * Env:
 *   MONGO_URI / MONGODB_URI  — required
 *   DRY_RUN=1                — print only
 *   BATCH_SIZE=500           — update batch size
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === '1' || process.env.DRY_RUN === 'true';
const BATCH_SIZE = Math.max(parseInt(process.env.BATCH_SIZE || '500', 10) || 500, 50);

const mapPriorityToVirality = (priority) => {
  if (!priority) return null;
  const p = String(priority).toUpperCase();
  if (p === 'HIGH') return 'high';
  if (p === 'MEDIUM') return 'medium';
  if (p === 'LOW') return 'low';
  return null;
};

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI / MONGODB_URI is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection('alerts');

  const filter = {
    $and: [
      {
        $or: [
          { virality_level: null },
          { virality_level: { $exists: false } }
        ]
      },
      {
        $or: [
          { alert_type: 'velocity' },
          { 'velocity_data.threshold_triggered': { $exists: true, $ne: null } }
        ]
      }
    ]
  };

  const total = await col.countDocuments(filter);
  console.log(`[backfill-virality] candidates=${total} dry_run=${DRY_RUN}`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = col.find(filter).project({
    id: 1,
    priority: 1,
    alert_type: 1,
    created_at: 1,
    velocity_data: 1,
    virality_level: 1
  }).batchSize(BATCH_SIZE);

  const ops = [];
  const flush = async () => {
    if (!ops.length) return;
    if (!DRY_RUN) {
      await col.bulkWrite(ops, { ordered: false });
    }
    updated += ops.length;
    ops.length = 0;
  };

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned += 1;
    const virality = mapPriorityToVirality(doc.priority);
    if (!virality) {
      skipped += 1;
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            virality_level: virality,
            virality_detected_at: doc.created_at || new Date()
          }
        }
      }
    });
    if (ops.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log(JSON.stringify({ scanned, updated, skipped, dry_run: DRY_RUN }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
