/**
 * Optional MongoDB cleanup / inventory after Reddit & Telegram product removal.
 *
 * Safe to run repeatedly.
 *
 * Default behavior:
 *  1. Inventory legacy platform docs (alerts, contents, sources, searchhistories, thresholds)
 *  2. Drop Telegram-only collections
 *  3. Delete orphan TempContent for telegram/reddit
 *  4. Unset settings telegram/reddit config keys
 *
 * Does NOT rewrite historical Alert/Content/Source/SearchHistory platform strings
 * (kept for audit). Alert status updates use findOneAndUpdate without runValidators,
 * so legacy enum values do not block status workflow.
 *
 * Usage (from backend/):
 *   DRY_RUN=1 node scripts/drop-reddit-telegram-collections.js
 *   node scripts/drop-reddit-telegram-collections.js
 *
 * Env:
 *   MONGO_URI / MONGODB_URI  — required
 *   DRY_RUN=1                — print only
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === '1' || process.env.DRY_RUN === 'true';
const LEGACY_PLATFORMS = ['reddit', 'telegram'];

async function countLegacy(db, collectionName) {
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  if (!exists) return { exists: false, total: 0, byPlatform: {} };
  const col = db.collection(collectionName);
  const byPlatform = {};
  let total = 0;
  for (const platform of LEGACY_PLATFORMS) {
    const n = await col.countDocuments({ platform });
    byPlatform[platform] = n;
    total += n;
  }
  return { exists: true, total, byPlatform };
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGO_URI / MONGODB_URI is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log('=== Legacy platform inventory (audit; not deleted except thresholds) ===');
  for (const name of ['alerts', 'contents', 'sources', 'searchhistories', 'alertthresholds']) {
    const info = await countLegacy(db, name);
    if (!info.exists) {
      console.log(`[inventory] ${name}: (collection missing)`);
      continue;
    }
    console.log(
      `[inventory] ${name}: total_legacy=${info.total}` +
        ` reddit=${info.byPlatform.reddit || 0}` +
        ` telegram=${info.byPlatform.telegram || 0}`
    );
  }

  console.log('=== Orphan AlertThreshold cleanup ===');
  if ((await db.listCollections({ name: 'alertthresholds' }).toArray()).length) {
    const filter = { platform: { $in: LEGACY_PLATFORMS } };
    if (DRY_RUN) {
      const count = await db.collection('alertthresholds').countDocuments(filter);
      console.log(`[dry-run] would delete ${count} alertthresholds for reddit/telegram`);
    } else {
      const res = await db.collection('alertthresholds').deleteMany(filter);
      console.log(`[cleaned] alertthresholds deleted=${res.deletedCount}`);
    }
  } else {
    console.log('[skip] alertthresholds missing');
  }

  console.log('=== Drop Telegram-only collections ===');
  const targets = ['telegramgroups', 'telegrammessages'];
  for (const name of targets) {
    const exists = (await db.listCollections({ name }).toArray()).length > 0;
    if (!exists) {
      console.log(`[skip] collection missing: ${name}`);
      continue;
    }
    if (DRY_RUN) {
      const count = await db.collection(name).countDocuments();
      console.log(`[dry-run] would drop ${name} (${count} docs)`);
    } else {
      await db.collection(name).drop();
      console.log(`[dropped] ${name}`);
    }
  }

  console.log('=== TempContent cleanup ===');
  if ((await db.listCollections({ name: 'temp_content' }).toArray()).length) {
    const temp = db.collection('temp_content');
    const filter = {
      $or: [
        { module: 'telegram' },
        { platform: { $in: LEGACY_PLATFORMS } }
      ]
    };
    if (DRY_RUN) {
      const count = await temp.countDocuments(filter);
      console.log(`[dry-run] would delete ${count} temp_content rows for telegram/reddit`);
    } else {
      const res = await temp.deleteMany(filter);
      console.log(`[cleaned] temp_content deleted=${res.deletedCount}`);
    }
  } else {
    console.log('[skip] temp_content missing');
  }

  console.log('=== Settings cleanup ===');
  if ((await db.listCollections({ name: 'settings' }).toArray()).length) {
    if (DRY_RUN) {
      console.log('[dry-run] would $unset telegram_session, api_config.telegram, frequencies.reddit, events.reddit');
    } else {
      const res = await db.collection('settings').updateMany(
        { id: 'global_settings' },
        {
          $unset: {
            telegram_session: '',
            'api_config.telegram': '',
            'api_config.monitoring.frequencies.reddit': '',
            'api_config.events.reddit': ''
          }
        }
      );
      console.log(`[cleaned] settings matched=${res.matchedCount} modified=${res.modifiedCount}`);
    }
  } else {
    console.log('[skip] settings missing');
  }

  await mongoose.disconnect();
  console.log(DRY_RUN ? 'Dry run complete.' : 'Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
