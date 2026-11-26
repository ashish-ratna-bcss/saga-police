const logger = require('../../lib/logger');
const dbOf = require('../../lib/dbOf');
const {
  listCatalogXAccounts,
  analyzeHandleLive,
  normalizeHandle,
} = require('./alert.engager.service');
const { listProfiles, analyzeProfileFromDb } = require('./alert.engager.db.service');

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

/** GET /alerts/engagers-db — profiles with stored posts (database only). */
const listEngagerProfiles = async (req, res) => {
  try {
    const analyses = await listProfiles({ db: req.tenantPrisma });
    return res.status(200).json({ analyses, live: false });
  } catch (error) {
    logger.error('[AlertsEngagers] db list failed:', error);
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
};
