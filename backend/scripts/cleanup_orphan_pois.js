#!/usr/bin/env node
/**
 * Remove POI profiles that no longer have a monitored handle.
 *
 * Two kinds of orphan are reported:
 *
 *   EMPTY   — socialMedia is [] / missing. Left behind when a source was
 *             deleted: the entry was $pulled but the POI document survived.
 *   DANGLING— every socialMedia entry points at a sourceId that no longer
 *             exists in the sources collection (source removed directly in the
 *             DB, or before the unlink cleanup existed).
 *
 * POIs that still have at least one live monitored handle are never touched.
 *
 * DRY RUN BY DEFAULT — nothing is deleted unless you pass --apply.
 *
 *   node scripts/cleanup_orphan_pois.js                 # report only
 *   node scripts/cleanup_orphan_pois.js --apply         # delete both kinds
 *   node scripts/cleanup_orphan_pois.js --apply --empty-only
 *   node scripts/cleanup_orphan_pois.js --keep-with-intel
 *
 * --keep-with-intel  skips any POI that holds manually-entered intelligence
 *                    (phone/whatsapp numbers, email, address, FIR, summary,
 *                    aliases, incidents). Recommended for a first pass.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const POI = require('../src/models/POI');
const Source = require('../src/models/Source');

const APPLY = process.argv.includes('--apply');
const EMPTY_ONLY = process.argv.includes('--empty-only');
const KEEP_WITH_INTEL = process.argv.includes('--keep-with-intel');

const nonEmptyArray = (v) => Array.isArray(v) && v.filter((x) => {
  if (x === null || x === undefined) return false;
  if (typeof x === 'string') return x.trim() !== '';
  return true;
}).length > 0;

const nonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

// What counts as "an officer put real work into this record".
const describeIntel = (poi) => {
  const held = [];
  if (nonEmptyArray(poi.mobileNumbers)) held.push(`${poi.mobileNumbers.length} mobile`);
  if (nonEmptyArray(poi.whatsappNumbers)) held.push(`${poi.whatsappNumbers.length} whatsapp`);
  if (nonEmptyArray(poi.emailIds)) held.push(`${poi.emailIds.length} email`);
  if (nonEmptyArray(poi.aliasNames)) held.push(`${poi.aliasNames.length} alias`);
  if (nonEmptyArray(poi.firDetails)) held.push(`${poi.firDetails.length} FIR`);
  if (nonEmptyArray(poi.customFields)) held.push(`${poi.customFields.length} custom`);
  if (nonEmptyString(poi.currentAddress)) held.push('address');
  if (nonEmptyString(poi.briefSummary)) held.push('summary');
  if (nonEmptyString(poi.firNo)) held.push('FIR no');
  if (nonEmptyString(poi.lastUsedIp)) held.push('IP');
  if (nonEmptyString(poi.psLimits)) held.push('PS limits');
  if (nonEmptyString(poi.districtCommisionerate)) held.push('district');
  if (nonEmptyString(poi.softwareHardwareIdentifiers)) held.push('device ids');
  if (Number(poi.linkedIncidents) > 0) held.push(`${poi.linkedIncidents} incidents`);
  return held;
};

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — run this from the backend directory.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  console.log(`Mode            : ${APPLY ? 'APPLY (deleting)' : 'DRY RUN (no changes)'}`);
  console.log(`Scope           : ${EMPTY_ONLY ? 'EMPTY orphans only' : 'EMPTY + DANGLING orphans'}`);
  console.log(`Intel handling  : ${KEEP_WITH_INTEL ? 'SKIP records holding intel' : 'delete regardless of intel'}`);
  console.log('');

  const liveSourceIds = new Set(
    (await Source.find({}, { id: 1, _id: 1 }).lean())
      .flatMap((s) => [s.id, s._id?.toString()])
      .filter(Boolean)
  );
  console.log(`Live sources    : ${liveSourceIds.size / 2 | 0} (${liveSourceIds.size} id forms)`);

  const pois = await POI.find({}).lean();
  console.log(`POI documents   : ${pois.length}`);

  const empty = [];
  const dangling = [];
  const healthy = [];

  for (const poi of pois) {
    const sm = Array.isArray(poi.socialMedia) ? poi.socialMedia : [];
    if (sm.length === 0) { empty.push(poi); continue; }

    // A handle is "live" if it has no sourceId (manually entered by an officer,
    // so not an orphan) or its sourceId still exists.
    const hasLive = sm.some((e) => !e?.sourceId || liveSourceIds.has(e.sourceId));
    if (hasLive) healthy.push(poi);
    else dangling.push(poi);
  }

  const line = (t) => console.log('\n' + t + '\n' + '='.repeat(t.length));

  const report = (label, list) => {
    line(`${label} (${list.length})`);
    if (!list.length) return;
    list.slice(0, 80).forEach((p) => {
      const intel = describeIntel(p);
      const flag = intel.length ? `  ⚠ HOLDS: ${intel.join(', ')}` : '';
      const nm = p.realName || p.name || '(no name)';
      console.log(`  ${String(nm).slice(0, 38).padEnd(40)} status=${String(p.status || '?').padEnd(9)} created=${p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : '?'}${flag}`);
    });
    if (list.length > 80) console.log(`  ... and ${list.length - 80} more`);
  };

  report('EMPTY — no socialMedia entries at all', empty);
  if (!EMPTY_ONLY) report('DANGLING — all handles point at deleted sources', dangling);

  const candidates = EMPTY_ONLY ? empty : [...empty, ...dangling];
  const withIntel = candidates.filter((p) => describeIntel(p).length > 0);
  const toDelete = KEEP_WITH_INTEL ? candidates.filter((p) => describeIntel(p).length === 0) : candidates;

  line('SUMMARY');
  console.log(`  healthy (keep)              : ${healthy.length}`);
  console.log(`  empty orphans               : ${empty.length}`);
  console.log(`  dangling orphans            : ${dangling.length}`);
  console.log(`  orphans holding intel       : ${withIntel.length}${withIntel.length ? '   <-- review these' : ''}`);
  console.log(`  would delete                : ${toDelete.length}`);
  console.log(`  dashboard count after       : ${healthy.length}`);

  if (APPLY && toDelete.length > 0) {
    const res = await POI.deleteMany({ _id: { $in: toDelete.map((p) => p._id) } });
    console.log(`\n  DELETED ${res.deletedCount} POI document(s).`);
  } else if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to delete.');
    if (withIntel.length > 0) {
      console.log('Consider --keep-with-intel to spare the records flagged above.');
    }
  }

  console.log('');
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('FAILED:', e);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
