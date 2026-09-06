const logger = require('../../utils/logger');
const {
  createAlertFromCatalogPost,
  buildCatalogStats,
  listCatalogAlerts,
  getCatalogAlertById,
  getCatalogAlertsByIds,
  updateCatalogAlert,
  getUnreadCount,
  markAllRead,
  listTopCatalogAlertsByCategory,
} = require('./alert.service');

const listAlerts = async (req, res) => {
  try {
    const pageNum = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10) || 20));
    const cursor = req.query.cursor;
    let page = pageNum;
    if (cursor && String(cursor).startsWith('p:')) {
      const c = parseInt(String(cursor).slice(2), 10);
      if (!Number.isNaN(c) && c > 0) page = c;
    }
    const includeStats = String(req.query.includeStats || '').toLowerCase() === 'true';

    const result = await listCatalogAlerts({
      query: req.query,
      page,
      limit: limitNum,
    });

    const payload = {
      ...result,
      store: 'catalog',
    };

    if (includeStats) {
      payload.stats = await buildCatalogStats(req.query);
    }

    return res.status(200).json(payload);
  } catch (error) {
    logger.error('[Alerts] list failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const getAlert = async (req, res) => {
  try {
    const alert = await getCatalogAlertById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    return res.status(200).json(alert);
  } catch (error) {
    logger.error('[Alerts] getById failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const getAlertsBulk = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const alerts = await getCatalogAlertsByIds(ids);
    return res.status(200).json({ alerts });
  } catch (error) {
    logger.error('[Alerts] bulk failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const putAlert = async (req, res) => {
  try {
    const alert = await updateCatalogAlert(req.params.id, req.body || {});
    return res.status(200).json(alert);
  } catch (error) {
    logger.error('[Alerts] update failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getStats = async (req, res) => {
  try {
    const stats = await buildCatalogStats(req.query || {});
    return res.status(200).json(stats);
  } catch (error) {
    logger.error('[Alerts] stats failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const getUnread = async (req, res) => {
  try {
    const count = await getUnreadCount();
    return res.status(200).json({ count });
  } catch (error) {
    logger.error('[Alerts] unread failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const putMarkAllRead = async (req, res) => {
  try {
    const updated = await markAllRead();
    return res.status(200).json({ updated });
  } catch (error) {
    logger.error('[Alerts] mark read failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const getTopByCategory = async (req, res) => {
  try {
    const hours = req.query.hours ?? req.body?.hours ?? 24;
    const topN = req.query.top_n_per_category ?? req.body?.top_n_per_category ?? 50;
    const data = await listTopCatalogAlertsByCategory({
      hours,
      topNPerCategory: topN,
    });
    return res.status(200).json(data);
  } catch (error) {
    logger.error('[Alerts] top-by-category failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  listAlerts,
  getAlert,
  getAlertsBulk,
  putAlert,
  getStats,
  getUnread,
  putMarkAllRead,
  getTopByCategory,
  // used by sentiment pipeline
  createAlertFromCatalogPost,
};
