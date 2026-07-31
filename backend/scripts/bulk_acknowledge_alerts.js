#!/usr/bin/env node
/**
 * Bulk-move alerts from `active` to `acknowledged`.
 *
 * Only alerts currently in `active` are touched, so the script is idempotent —
 * re-running it does nothing.
 *
 * ── Why the --kpi flag matters ────────────────────────────────────────────────
 * The dashboard Workflow KPI (GET /api/alerts/workflow-kpi) counts a transition
 * from TWO places:
 *   1. status_history entries whose `at` falls in the queried range
 *   2. alerts with no status_history, using `acknowledged_at` as the timestamp
 *
 * So a naive bulk update that stamps acknowledged_at = now would report ~6,800
 * acknowledgements TODAY and make the KPI meaningless. Choose deliberately:
 *
 *   --kpi=skip      (default) acknowledged_at left null, no history pushed.
 *                   The migration is invisible to the KPI. Recommended: this
 *                   was a data cleanup, not officer triage work.
 *   --kpi=backdate  acknowledged_at = the alert's own created_at, history
 *                   stamped the same. Transitions appear on the dates the
 *                   alerts were originally raised.
 *   --kpi=today     acknowledged_at = now. Everything lands on today — expect
 *                   a large spike.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   node scripts/bulk_acknowledge_alerts.js                       # dry run
 *   node scripts/bulk_acknowledge_alerts.js --apply
 *   node scripts/bulk_acknowledge_alerts.js --apply --kpi=backdate
 *   node scripts/bulk_acknowledge_alerts.js --apply --platform=x
 *   node scripts/bulk_acknowledge_alerts.js --apply --before=2026-07-01
 *   node scripts/bulk_acknowledge_alerts.js --apply --risk=low,medium
 *   node scripts/bulk_acknowledge_alerts.js --apply --by=<userId> --notes="Backlog cleared"
 *
 * DRY RUN BY DEFAULT — nothing is written without --apply.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Alert = require('../src/models/Alert');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const APPLY = has('--apply');
const KPI_MODE = (val('kpi', 'skip') || 'skip').toLowerCase();
const PLATFORM = val('platform');
const RISK = val('risk');
const BEFORE = val('before');
const ACK_BY = val('by', 'system_bulk_acknowledge');
const NOTES = val('notes', 'Bulk acknowledged — backlog cleanup');
const BATCH = Math.max(100, Math.min(2000, Number(val('batch', 500)) || 500));

if (!['skip', 'backdate', 'today'].includes(KPI_MODE)) {
  console.error(`Invalid --kpi=${KPI_MODE}. Use skip | backdate | today.`);
  process.exit(1);
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — run this from the backend directory.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  // ── Build the filter ──────────────────────────────────────────────────────
  const filter = { status: 'active' };
  if (PLATFORM) filter.platform = PLATFORM;
  if (RISK) {
    const levels = RISK.split(',').map((s) => s.trim()).filter(Boolean);
    if (levels.length) filter.risk_level = { $in: levels };
  }
  if (BEFORE) {
    const cutoff = new Date(BEFORE);
    if (Number.isNaN(cutoff.getTime())) {
      console.error(`Invalid --before=${BEFORE}. Use YYYY-MM-DD.`);
      process.exit(1);
    }
    filter.created_at = { $lt: cutoff };
  }

  console.log(`Mode        : ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no changes)'}`);
  console.log(`KPI mode    : ${KPI_MODE}${KPI_MODE === 'skip' ? '  (migration hidden from Workflow KPI)' : ''}`);
  console.log(`Filter      : ${JSON.stringify(filter)}`);
  console.log(`Batch size  : ${BATCH}`);
  console.log(`acknowledged_by : ${ACK_BY}`);
  console.log('');

  // ── Before picture ────────────────────────────────────────────────────────
  const statusCounts = await Alert.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } }
  ]);
  console.log('Current status distribution (all alerts):');
  for (const r of statusCounts) console.log(`   ${String(r._id || '(none)').padEnd(16)} ${r.n}`);

  const target = await Alert.countDocuments(filter);
  console.log(`\nAlerts matching filter: ${target}`);
  if (target === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Breakdown so it's clear what is about to move.
  const breakdown = await Alert.aggregate([
    { $match: filter },
    { $group: { _id: { platform: '$platform', risk: '$risk_level' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } }
  ]);
  console.log('\nBreakdown of what would move:');
  console.log(`   ${'PLATFORM'.padEnd(12)}${'RISK'.padEnd(12)}COUNT`);
  for (const r of breakdown.slice(0, 25)) {
    console.log(`   ${String(r._id.platform || '?').padEnd(12)}${String(r._id.risk || '?').padEnd(12)}${r.n}`);
  }
  if (breakdown.length > 25) console.log(`   ... and ${breakdown.length - 25} more combinations`);

  const oldest = await Alert.findOne(filter).sort({ created_at: 1 }).select('created_at').lean();
  const newest = await Alert.findOne(filter).sort({ created_at: -1 }).select('created_at').lean();
  console.log(`\nDate range  : ${oldest?.created_at?.toISOString().slice(0, 10) || '?'}  ->  ${newest?.created_at?.toISOString().slice(0, 10) || '?'}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    if (KPI_MODE === 'skip') {
      console.log('KPI mode "skip" will leave acknowledged_at null so the Workflow KPI is unaffected.');
    } else if (KPI_MODE === 'today') {
      console.log(`⚠  KPI mode "today" will add ${target} acknowledgements to TODAY on the Workflow KPI.`);
    } else {
      console.log('KPI mode "backdate" will spread these across the alerts\' original created_at dates.');
    }
    await mongoose.disconnect();
    return;
  }

  // ── Apply in batches ──────────────────────────────────────────────────────
  const now = new Date();
  let processed = 0;
  let modified = 0;
  const startedAt = Date.now();

  while (true) {
    const batch = await Alert.find(filter)
      .select('_id status created_at')
      .limit(BATCH)
      .lean();
    if (batch.length === 0) break;

    const ops = batch.map((a) => {
      const setDoc = { status: 'acknowledged', acknowledged_by: ACK_BY };
      const update = {};

      if (KPI_MODE === 'today') {
        setDoc.acknowledged_at = now;
      } else if (KPI_MODE === 'backdate') {
        setDoc.acknowledged_at = a.created_at || now;
      }
      // 'skip' deliberately leaves acknowledged_at untouched (null), which is
      // what keeps these out of the Workflow KPI's legacy fallback branch.

      update.$set = setDoc;

      if (KPI_MODE !== 'skip') {
        update.$push = {
          status_history: {
            from: a.status || 'active',
            to: 'acknowledged',
            changed_by: ACK_BY,
            changed_by_email: null,
            notes: NOTES,
            at: KPI_MODE === 'backdate' ? (a.created_at || now) : now
          }
        };
      }

      return { updateOne: { filter: { _id: a._id }, update } };
    });

    const res = await Alert.bulkWrite(ops, { ordered: false });
    processed += batch.length;
    modified += res.modifiedCount || 0;

    const pct = Math.min(100, Math.round((processed / target) * 100));
    const rate = processed / Math.max(1, (Date.now() - startedAt) / 1000);
    process.stdout.write(`\r  ${processed}/${target} (${pct}%)  ~${rate.toFixed(0)}/s   `);
  }

  console.log('');

  // ── After picture ─────────────────────────────────────────────────────────
  const after = await Alert.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } }
  ]);
  console.log('\nStatus distribution after:');
  for (const r of after) console.log(`   ${String(r._id || '(none)').padEnd(16)} ${r.n}`);

  const remaining = await Alert.countDocuments(filter);
  console.log(`\nModified   : ${modified}`);
  console.log(`Remaining matching filter : ${remaining}`);
  console.log(`Took       : ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('\nFAILED:', e);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
