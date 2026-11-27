const logger = require('../../lib/logger');
const dbOf = require('../../lib/dbOf');
const {
  listCatalogXAccounts,
  analyzeHandleLive,
  normalizeHandle,
} = require('./alert.engager.service');
const { listProfiles, analyzeProfileFromDb } = require('./alert.engager.db.service');
const {
  listTargets,
  addTarget,
  removeTarget,
  listTargetProfileIds,
} = require('./alert.engager.targets');

/** GET /alerts/engagers — catalog X accounts with posts (live list, no Mongo). */
const listEngagers = async (req, res) => {
  try {
    const analyses = await listCatalogXAccounts({ db: req.tenantPrisma });
    return res.status(200).json({ analyses, live: true });
  } catch (error) {
    logger.error('[AlertsEngagers] list failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

/** GET /alerts/engagers/:handle — live retweet-profile analysis (not stored). */
const getEngagersForHandle = async (req, res) => {
  try {
    const handle = normalizeHandle(req.params.handle || req.query.handle);
    if (!handle) {
      return res.status(400).json({ message: 'handle is required' });
    }
    const periodDays = req.query.period_days || req.body?.period_days || 30;
    const analysis = await analyzeHandleLive(handle, {
      periodDays,
      db: req.tenantPrisma,
    });
    return res.status(200).json(analysis);
  } catch (error) {
    logger.error('[AlertsEngagers] analyze failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** POST /alerts/engagers — same live analysis (compat with old “start” button). */
const postEngagersForHandle = async (req, res) => {
  try {
    const handle = normalizeHandle(req.body?.handle || req.params.handle);
    if (!handle) {
      return res.status(400).json({ message: 'handle is required' });
    }
    const periodDays = req.body?.period_days || 30;
    const analysis = await analyzeHandleLive(handle, {
      periodDays,
      db: req.tenantPrisma,
    });
    return res.status(200).json({ status: 'completed', handle, analysis, live: true });
  } catch (error) {
    logger.error('[AlertsEngagers] post analyze failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** GET /alerts/engagers-db — curated Frequent Engagers targets only (not all monitored). */
const listEngagerProfiles = async (req, res) => {
  try {
    const targetIds = await listTargetProfileIds({ db: req.tenantPrisma });
    const targets = await listTargets({ db: req.tenantPrisma });
    if (!targetIds.length && !targets.length) {
      return res.status(200).json({ analyses: [], live: false, curated: true });
    }
    const all = await listProfiles({ db: req.tenantPrisma });
    const idSet = new Set(targetIds);
    const handleSet = new Set(
      targets.map((t) => String(t.handle || '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean)
    );
    const analyses = all.filter((row) => {
      if (idSet.has(Number(row.profile_id))) return true;
      const h = String(row.handle || '')
        .replace(/^@/, '')
        .trim()
        .toLowerCase();
      return h && handleSet.has(h);
    });
    // Include curated stubs that are not yet linked to a monitored profile with posts.
    for (const t of targets) {
      const h = String(t.handle || '')
        .replace(/^@/, '')
        .trim()
        .toLowerCase();
      if (!h) continue;
      const already = analyses.some(
        (a) =>
          Number(a.profile_id) === Number(t.profile_id) ||
          String(a.handle || '')
            .replace(/^@/, '')
            .trim()
            .toLowerCase() === h
      );
      if (already) continue;
      analyses.push({
        profile_id: t.profile_id || `target:${t.id}`,
        handle: h,
        display_name: t.display_name || h,
        avatar: t.avatar || null,
        platforms: [{ platform: t.platform, handle: h, posts: 0 }],
        tweets_analyzed: 0,
        unique_retweeters: 0,
        engagers: [],
        live: false,
        curated_only: true,
      });
    }
    return res.status(200).json({ analyses, live: false, curated: true });
  } catch (error) {
    logger.error('[AlertsEngagers] db list failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** GET /alerts/engagers-targets — curated handles for green card icons. */
const listEngagerTargets = async (req, res) => {
  try {
    const targets = await listTargets({ db: req.tenantPrisma });
    return res.status(200).json({ targets });
  } catch (error) {
    logger.error('[AlertsEngagers] list targets failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** POST /alerts/engagers-targets — add author from a post card to curated list. */
const postEngagerTarget = async (req, res) => {
  try {
    const target = await addTarget({
      platform: req.body?.platform,
      handle: req.body?.handle || req.body?.identifier,
      display_name: req.body?.display_name,
      avatar: req.body?.avatar,
      db: req.tenantPrisma,
    });
    return res.status(200).json({ target, added: true });
  } catch (error) {
    logger.error('[AlertsEngagers] add target failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** DELETE /alerts/engagers-targets — remove from curated list. */
const deleteEngagerTarget = async (req, res) => {
  try {
    const result = await removeTarget({
      id: req.body?.id ?? req.query?.id,
      platform: req.body?.platform || req.query?.platform,
      handle: req.body?.handle || req.query?.handle,
      db: req.tenantPrisma,
    });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('[AlertsEngagers] remove target failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** Resolve a profile id or X/FB handle to a numeric profile_id. */
const resolveProfileId = async (raw, db) => {
  const token = String(raw || '').trim();
  if (/^\d+$/.test(token)) return Number(token);
  const handle = normalizeHandle(token);
  if (!handle) return null;
  const prisma = dbOf(db);
  const account = await prisma.social_media_accounts.findFirst({
    where: {
      OR: [
        { handle: { equals: handle, mode: 'insensitive' } },
        { handle: { equals: `@${handle}`, mode: 'insensitive' } },
      ],
    },
    select: { profile_id: true },
    orderBy: { updated_at: 'desc' },
  });
  return account?.profile_id || null;
};

/** GET /alerts/engagers-db/:profileId — combined engagers from stored posts (no external APIs).
 *  `:profileId` may be a numeric profile id or an account handle. */
const getEngagersFromDb = async (req, res) => {
  try {
    const platforms = String(req.query.platforms || '')
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const profileId = await resolveProfileId(req.params.profileId, req.tenantPrisma);
    if (!profileId) {
      return res.status(404).json({ message: 'Profile not found for this handle' });
    }
    const analysis = await analyzeProfileFromDb(profileId, {
      periodDays: req.query.period_days,
      platforms,
      db: req.tenantPrisma,
    });
    return res.status(200).json(analysis);
  } catch (error) {
    logger.error('[AlertsEngagers] db analyze failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  listEngagerProfiles,
  getEngagersFromDb,
  listEngagers,
  getEngagersForHandle,
  postEngagersForHandle,
  listEngagerTargets,
  postEngagerTarget,
  deleteEngagerTarget,
};
