#!/usr/bin/env node
/**
 * Repair existing Source records and their POI links.
 *
 *   1. Canonicalise Facebook identifiers  (/@Name, /Name/, /people/x/123 -> one form)
 *   2. Report Sources that collapse to the same identifier (duplicates)
 *   3. Backfill POI socialMedia.sourceId where a POI clearly matches a Source
 *   4. List Sources with no POI at all
 *
 * DRY RUN BY DEFAULT — nothing is written unless you pass --apply.
 *
 *   node scripts/fix_source_poi_links.js              # report only
 *   node scripts/fix_source_poi_links.js --apply      # write changes
 *   node scripts/fix_source_poi_links.js --apply --platform=facebook
 *
 * Duplicate Sources are never deleted automatically — they are only reported,
 * because choosing which row to keep (and its linked content) is your call.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Source = require('../src/models/Source');
const POI = require('../src/models/POI');

const APPLY = process.argv.includes('--apply');
const platformArg = process.argv.find((a) => a.startsWith('--platform='));
const ONLY_PLATFORM = platformArg ? platformArg.split('=')[1].toLowerCase() : null;

// ── identifier canonicalisation (mirrors sourceController.js) ───────────────

const canonicalFacebookSlug = (value) => String(value || '')
  .trim()
  .replace(/^@+/, '')
  .replace(/[#?&/]+$/, '')
  .toLowerCase();

const canonicaliseFacebook = (raw) => {
  const input = String(raw || '').trim();
  if (!input) return '';
  if (/facebook\.com\/(?:groups)\//i.test(input)) return null; // groups unsupported

  if (/^https?:\/\//i.test(input) || /facebook\.com\//i.test(input) || /fb\.me\//i.test(input)) {
    try {
      const url = new URL(input.startsWith('http') ? input : `https://${input}`);
      const pathname = url.pathname || '';

      if (/profile\.php/i.test(pathname)) {
        const id = url.searchParams.get('id');
        if (id) return `https://www.facebook.com/profile.php?id=${id}`;
      }
      const people = pathname.match(/^\/people\/(?:[^/]+)\/(\d+)/i);
      if (people?.[1]) return `https://www.facebook.com/profile.php?id=${people[1]}`;

      const pages = pathname.match(/^\/pages\/(?:[^/]+)\/([^/]+)/i);
      if (pages?.[1]) {
        const s = canonicalFacebookSlug(pages[1]);
        return /^\d+$/.test(s)
          ? `https://www.facebook.com/profile.php?id=${s}`
          : `https://www.facebook.com/${s}`;
      }

      const first = (pathname.split('/').filter(Boolean))[0];
      if (!first) return input;
      const banned = new Set(['watch', 'reel', 'share', 'photo', 'photos', 'videos', 'events', 'marketplace', 'help', 'login', 'search']);
      if (banned.has(canonicalFacebookSlug(first))) return input;

      const slug = canonicalFacebookSlug(first);
      if (!slug) return input;
      return /^\d+$/.test(slug)
        ? `https://www.facebook.com/profile.php?id=${slug}`
        : `https://www.facebook.com/${slug}`;
    } catch (_) { /* fall through */ }
  }

  const slug = canonicalFacebookSlug(input);
  if (!slug) return '';
  return /^\d+$/.test(slug)
    ? `https://www.facebook.com/profile.php?id=${slug}`
    : `https://www.facebook.com/${slug}`;
};

// Identifiers that are clearly not handles at all — a category name, a
// placeholder, or free text that someone typed into the handle field.
// These must never be canonicalised into a URL; they need manual correction.
const isInvalidIdentifier = (platform, identifier) => {
  const id = String(identifier || '').trim();
  if (!id) return 'empty';
  if (/^https?:\/\//i.test(id)) return null;      // real URLs are fine
  if (/\s/.test(id)) return 'contains spaces';
  if (/^(some_username|username|handle|test|na|n\/a|none)$/i.test(id)) return 'placeholder value';
  return null;
};

const canonicaliseIdentifier = (platform, identifier) => {
  const p = String(platform || '').toLowerCase();
  const id = String(identifier || '').trim();
  if (!id) return '';
  if (p === 'facebook') return canonicaliseFacebook(id);
  if (p === 'x' || p === 'twitter') return id.replace(/^@/, '').toLowerCase();
  if (p === 'instagram') {
    let v = id;
    if (/^https?:\/\//i.test(v) || /instagram\.com\//i.test(v)) {
      try {
        const url = new URL(v.startsWith('http') ? v : `https://${v}`);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length) v = parts[0];
      } catch (_) { /* ignore */ }
    }
    return v.replace(/^@/, '').toLowerCase();
  }
  if (p === 'youtube') {
    if (/^UC[A-Za-z0-9_-]{20,}$/.test(id)) return id; // keep channel-id casing
    return id.toLowerCase();
  }
  return id;
};

// ── handle variants for POI matching (mirrors poiController.js) ─────────────

const NOT_A_HANDLE = new Set(['profile.php', 'people', 'pages', 'p', 'profile']);

const buildHandleVariants = (rawHandle, platform) => {
  const input = String(rawHandle || '').trim();
  if (!input) return [];
  const variants = new Set();
  const add = (v) => {
    const s = String(v || '').trim().replace(/^@+/, '').replace(/\/+$/, '');
    if (!s) return;
    const bare = s.replace(/^https?:\/\/[^/]+\//i, '');
    if (NOT_A_HANDLE.has(bare.toLowerCase())) return;
    variants.add(s);
  };

  add(input);

  if (/^https?:\/\//i.test(input) || /(facebook|instagram|twitter|x)\.com\//i.test(input)) {
    try {
      const url = new URL(input.startsWith('http') ? input : `https://${input}`);
      const id = url.searchParams.get('id');
      if (id) add(id);
      const segments = (url.pathname || '').split('/').filter(Boolean);
      const people = (url.pathname || '').match(/^\/people\/(?:[^/]+)\/(\d+)/i);
      if (people?.[1]) add(people[1]);
      else if (segments.length) add(segments[segments.length - 1]);
      if (segments.length) add(segments[0]);
    } catch (_) { /* ignore */ }
  }

  if (platform === 'facebook') {
    for (const v of [...variants]) {
      if (/^https?:\/\//i.test(v)) continue;
      if (/^\d+$/.test(v)) add(`https://www.facebook.com/profile.php?id=${v}`);
      else add(`https://www.facebook.com/${v}`);
    }
  }
  return [...variants];
};

const escapeRegex = (v) => String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── main ───────────────────────────────────────────────────────────────────

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — run this from the backend directory.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no changes)'}`);
  if (ONLY_PLATFORM) console.log(`Restricted to platform: ${ONLY_PLATFORM}`);
  console.log('');

  const query = ONLY_PLATFORM ? { platform: ONLY_PLATFORM } : {};
  const sources = await Source.find(query).lean();
  console.log(`Loaded ${sources.length} sources\n`);

  const renamed = [];
  const dupes = new Map();      // `${platform}::${canonical}` -> [sources]
  const linked = [];
  const unlinked = [];
  const skippedGroups = [];

  const invalid = [];

  for (const src of sources) {
    const badReason = isInvalidIdentifier(src.platform, src.identifier);
    if (badReason) {
      invalid.push({ ...src, badReason });
      continue;   // never rewrite junk into a URL
    }

    const canonical = canonicaliseIdentifier(src.platform, src.identifier);

    if (canonical === null) {
      skippedGroups.push(src);
      continue;
    }

    // 1. identifier canonicalisation
    if (canonical && canonical !== src.identifier) {
      renamed.push({ id: src.id, platform: src.platform, from: src.identifier, to: canonical });
    }

    const key = `${src.platform}::${(canonical || src.identifier).toLowerCase()}`;
    if (!dupes.has(key)) dupes.set(key, []);
    dupes.get(key).push(src);

    // 2. POI link
    const already = await POI.findOne({ 'socialMedia.sourceId': src.id }).select('_id').lean();
    if (already) continue;

    const variants = buildHandleVariants(canonical || src.identifier, src.platform);
    const alsoRaw = buildHandleVariants(src.identifier, src.platform);
    const allVariants = [...new Set([...variants, ...alsoRaw])];
    if (allVariants.length === 0) { unlinked.push(src); continue; }

    const poi = await POI.findOne({
      socialMedia: {
        $elemMatch: {
          platform: src.platform === 'twitter' ? 'x' : src.platform,
          handle: { $in: allVariants.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) }
        }
      }
    });

    if (!poi) { unlinked.push(src); continue; }

    const idx = poi.socialMedia.findIndex((sm) => {
      if (String(sm.platform) !== (src.platform === 'twitter' ? 'x' : src.platform)) return false;
      const h = String(sm.handle || '').trim();
      return allVariants.some((v) => v.toLowerCase() === h.toLowerCase());
    });
    if (idx === -1) { unlinked.push(src); continue; }

    linked.push({ source: src.identifier, platform: src.platform, poi: poi.realName || poi.name || poi._id });

    if (APPLY) {
      poi.socialMedia[idx].sourceId = src.id;
      if (src.platform_user_id && !poi.socialMedia[idx].platformUserId) {
        poi.socialMedia[idx].platformUserId = src.platform_user_id;
      }
      await poi.save();
    }
  }

  // apply identifier renames (skip any that would collide with an existing row)
  let renameApplied = 0;
  let renameSkipped = 0;
  if (APPLY) {
    for (const r of renamed) {
      const clash = await Source.findOne({
        platform: r.platform,
        identifier: { $regex: `^${escapeRegex(r.to)}$`, $options: 'i' },
        id: { $ne: r.id }
      }).select('id identifier').lean();
      if (clash) { renameSkipped++; continue; }
      await Source.updateOne({ id: r.id }, { $set: { identifier: r.to } });
      renameApplied++;
    }
  }

  // ── report ───────────────────────────────────────────────────────────────
  const line = (t) => console.log('\n' + t + '\n' + '='.repeat(t.length));

  line(`IDENTIFIERS TO CANONICALISE (${renamed.length})`);
  renamed.slice(0, 60).forEach((r) => console.log(`  [${r.platform}] ${r.from}\n      -> ${r.to}`));
  if (renamed.length > 60) console.log(`  ... and ${renamed.length - 60} more`);
  if (APPLY) console.log(`\n  applied: ${renameApplied}   skipped (would collide with existing row): ${renameSkipped}`);

  const dupeGroups = [...dupes.entries()].filter(([, arr]) => arr.length > 1);
  line(`DUPLICATE SOURCES (${dupeGroups.length} groups) — NOT changed, review manually`);
  dupeGroups.forEach(([key, arr]) => {
    console.log(`  ${key}`);
    arr.forEach((s) => console.log(`      id=${s.id}  "${s.display_name}"  last_checked=${s.last_checked || 'Never'}`));
  });

  line(`POI LINKS ${APPLY ? 'REPAIRED' : 'THAT WOULD BE REPAIRED'} (${linked.length})`);
  linked.slice(0, 60).forEach((l) => console.log(`  [${l.platform}] ${l.source}  ->  ${l.poi}`));
  if (linked.length > 60) console.log(`  ... and ${linked.length - 60} more`);

  line(`SOURCES WITH NO MATCHING POI (${unlinked.length})`);
  unlinked.slice(0, 60).forEach((s) => console.log(`  [${s.platform}] ${s.identifier}  "${s.display_name}"`));
  if (unlinked.length > 60) console.log(`  ... and ${unlinked.length - 60} more`);
  if (unlinked.length) {
    console.log('\n  These have no POI record at all — clicking them will still show');
    console.log('  "No POI profile linked". They need a profile created, or the row');
    console.log('  should not be clickable.');
  }

  if (invalid.length) {
    line(`INVALID IDENTIFIERS — NEED MANUAL CORRECTION (${invalid.length})`);
    invalid.forEach((s) => console.log(`  [${s.platform}] "${s.identifier}"  (${s.badReason})  display="${s.display_name}"  id=${s.id}`));
    console.log('\n  These are not handles — someone typed a category or placeholder into');
    console.log('  the handle field. They are skipped entirely (never rewritten). Fix the');
    console.log('  handle in the UI, or delete the source if it was added by mistake.');
  }

  if (skippedGroups.length) {
    line(`SKIPPED — FACEBOOK GROUPS, NOT SUPPORTED (${skippedGroups.length})`);
    skippedGroups.forEach((s) => console.log(`  ${s.identifier}`));
  }

  console.log(`\n${APPLY ? 'Changes applied.' : 'DRY RUN — nothing was written. Re-run with --apply to commit.'}\n`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('FAILED:', e);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
