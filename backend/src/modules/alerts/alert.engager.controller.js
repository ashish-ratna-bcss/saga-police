const logger = require('../../lib/logger');
const {
  listCatalogXAccounts,
  analyzeHandleLive,
  normalizeHandle,
} = require('./alert.engager.service');

/** GET /alerts/engagers — catalog X accounts with posts (live list, no Mongo). */
const listEngagers = async (req, res) => {
  try {
    const analyses = await listCatalogXAccounts();
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
    const analysis = await analyzeHandleLive(handle, { periodDays });
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
    const analysis = await analyzeHandleLive(handle, { periodDays });
    return res.status(200).json({ status: 'completed', handle, analysis, live: true });
  } catch (error) {
    logger.error('[AlertsEngagers] post analyze failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  listEngagers,
  getEngagersForHandle,
  postEngagersForHandle,
};
