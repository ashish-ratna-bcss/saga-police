/**
 * Tools → Profile Report: what the screen does with profiles.
 *
 *   Add profile  →  Fetch on a platform account: look the account up (same preview as Profiles → Add profile), keep it as a
 *                   draft and start collecting all of its posts right away. Save names the profile and keeps the drafts;
 *                   Cancel throws them away. Saved profiles are not monitored: posts are collected once on Fetch (and again
 *                   only when someone asks for a refresh).
 */
const dbOf = require('../../lib/dbOf');
const { authForPlatform } = require('../../services/blugate/authForPlatform');
const { previewProfile } = require('../../services/monitoringsocialmedia/previewProfile');
const { resolvePlatform, prepareAccountFields } = require('../social-profiles/socialProfile.controller');
const store = require('./profileReport.store');
const { SUPPORTED_PLATFORMS } = require('./profileReport.collect');
const { httpError, toId } = require('./profileReport.util');

const normalisePlatform = (slug) => {
  const s = String(slug || '').trim().toLowerCase();
  return s === 'twitter' ? 'x' : s;
};

/**
 * Fetch clicked for one platform account.
 * Resolves the account, stores it as a draft of the (possibly new) profile and queues the collection of all its posts.
 * Clicking Fetch again for the same account never restarts a collection that is under way.
 */
const fetchAccount = async ({ db, dbName, user, subjectId, platform, data }) => {
  const prisma = dbOf(db);
  const slug = normalisePlatform(platform);
  if (!slug) throw httpError(400, 'Select a platform');
  if (!SUPPORTED_PLATFORMS.includes(slug)) {
    throw httpError(400, 'Posts of this platform cannot be collected here. Reddit offers keyword search only, not a user timeline.');
  }
  const platformRow = await resolvePlatform(platform, { db: prisma });
  if (!platformRow) throw httpError(400, 'platform is invalid or not active');

  const auth = authForPlatform(platformRow, { tenantKey: dbName });
  const result = await previewProfile(platformRow.slug, data || {}, auth);
  const merged = { ...(data || {}), ...(result.data_patch || {}) };
  const { normalized, handle } = prepareAccountFields({ platformRow, data: merged, preview_data: result.preview_data });

  let subject;
  if (subjectId) {
    subject = await store.getSubject(prisma, toId(subjectId, 'profile id'));
    if (!subject) throw httpError(404, 'Profile not found');
  } else {
    subject = await store.createDraftSubject(prisma, { userId: user?.id ?? null, userName: user?.name || user?.username || null });
  }
  const account = await store.upsertDraftAccount(prisma, {
    subjectId: subject.id,
    platform: slug,
    handle,
    data: { ...normalized, ...(result.data_patch || {}) },
    previewData: result.preview_data,
  });
  return {
    subject_id: subject.id,
    account_id: account.id,
    fetch_status: account.fetch_status,
    preview: result.preview,
    preview_data: result.preview_data,
    data_patch: result.data_patch || {},
  };
};

/** Save in the dialog: name the profile, keep the listed accounts, and let analysis begin. */
const saveSubject = async ({ db, id, displayName, notes, accountIds }) => {
  const prisma = dbOf(db);
  const subjectId = toId(id, 'profile id');
  const subject = await store.getSubject(prisma, subjectId);
  if (!subject) throw httpError(404, 'Profile not found');

  const detail = await store.getSubjectDetail(prisma, subjectId);
  const have = new Set(detail.accounts.map((a) => a.id));
  const keep = (Array.isArray(accountIds) ? accountIds : detail.accounts.map((a) => a.id)).map(Number).filter((n) => have.has(n));
  if (!keep.length) throw httpError(400, 'Fetch at least one platform account before saving');

  const first = detail.accounts.find((a) => a.id === keep[0]);
  const name = String(displayName || '').trim() || first?.preview?.name || first?.handle || 'Profile';
  return store.finalizeSubject(prisma, subjectId, { displayName: name.slice(0, 200), notes: String(notes || '').trim().slice(0, 2000), keepAccountIds: keep });
};

const discardDrafts = async ({ db, id }) => {
  await store.discardDrafts(dbOf(db), toId(id, 'profile id'));
  return { ok: true };
};

/** Remove one draft account (its slot was removed in the dialog); stops its collection and deletes what it collected. */
const deleteDraftAccount = async ({ db, accountId }) => {
  const prisma = dbOf(db);
  const account = await store.getAccount(prisma, toId(accountId, 'account id'));
  if (!account) return { ok: true };
  if (!account.is_draft) throw httpError(400, 'Saved accounts are removed from the profile with Save.');
  await store.deleteAccount(prisma, account.id);
  return { ok: true };
};

const requireSubject = async (prisma, id) => {
  const subject = await store.getSubjectDetail(prisma, toId(id, 'profile id'));
  if (!subject) throw httpError(404, 'Profile not found');
  return subject;
};

module.exports = {
  SUPPORTED_PLATFORMS,
  fetchAccount,
  saveSubject,
  discardDrafts,
  deleteDraftAccount,
  requireSubject,
};
