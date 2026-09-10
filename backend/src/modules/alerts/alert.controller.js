const logger = require('../../lib/logger');
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
  getCatalogWorkflowKpi,
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
    const db = req.tenantPrisma;

    const result = await listCatalogAlerts({
      query: req.query,
      page,
      limit: limitNum,
      db,
    });

    const payload = {
      ...result,
      store: 'catalog',
    };

    if (includeStats) {
      payload.stats = await buildCatalogStats(req.query, { db });
    }

    return res.status(200).json(payload);
  } catch (error) {
    logger.error('[Alerts] list failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const getAlert = async (req, res) => {
  try {
    const alert = await getCatalogAlertById(req.params.id, { db: req.tenantPrisma });
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
    const alerts = await getCatalogAlertsByIds(ids, { db: req.tenantPrisma });
    return res.status(200).json({ alerts });
  } catch (error) {
    logger.error('[Alerts] bulk failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const putAlert = async (req, res) => {
  try {
    const alert = await updateCatalogAlert(req.params.id, req.body || {}, {
      db: req.tenantPrisma,
    });
    return res.status(200).json(alert);
  } catch (error) {
    logger.error('[Alerts] update failed:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getStats = async (req, res) => {
  try {
    const stats = await buildCatalogStats(req.query || {}, { db: req.tenantPrisma });
    return res.status(200).json(stats);
  } catch (error) {
    logger.error('[Alerts] stats failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const getUnread = async (req, res) => {
  try {
    if (!req.tenantDbName || !req.tenantPrisma) {
      return res.status(200).json({ count: 0 });
    }
    const count = await getUnreadCount({ db: req.tenantPrisma });
    return res.status(200).json({ count });
  } catch (error) {
    if (error.code === 'P2021' || error.code === 'NO_TENANT_DB') {
      return res.status(200).json({ count: 0 });
    }
    logger.error('[Alerts] unread failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const putMarkAllRead = async (req, res) => {
  try {
    const updated = await markAllRead({ db: req.tenantPrisma });
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
      db: req.tenantPrisma,
    });
    return res.status(200).json(data);
  } catch (error) {
    logger.error('[Alerts] top-by-category failed:', error);
    return res.status(500).json({ message: error.message });
  }
};

const getWorkflowKpi = async (req, res) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    const now = new Date();
    const istTodayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const [yy, mm, dd] = istTodayStr.split('-').map(Number);
    const defaultStart = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0) - 5.5 * 3600 * 1000);
    const defaultEnd = new Date(Date.UTC(yy, mm - 1, dd, 23, 59, 59, 999) - 5.5 * 3600 * 1000);

    const parseIstBoundary = (s, endOfDay) => {
      if (!s) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
      const [y, m, d] = s.split('-').map(Number);
      const base = Date.UTC(
        y,
        m - 1,
        d,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
      );
      return new Date(base - 5.5 * 3600 * 1000);
    };
    const start = parseIstBoundary(req.query.start, false) || defaultStart;
    const end = parseIstBoundary(req.query.end, true) || defaultEnd;
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const data = await getCatalogWorkflowKpi({ start, end, db: req.tenantPrisma });

    if (format === 'csv') {
      const header = ['date', ...data.statuses, 'total'];
      const lines = [header.join(',')];
      for (const row of data.daily) {
        lines.push(header.map((h) => row[h] ?? 0).join(','));
      }
      lines.push(
        ['TOTAL', ...data.statuses.map((s) => data.totals[s]), data.totals.total].join(',')
      );
      const csv = lines.join('\n');
      const filename = `alert-workflow-${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    }

    return res.status(200).json(data);
  } catch (error) {
    logger.error('[Alerts] workflow-kpi failed:', error);
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
  getWorkflowKpi,
  // used by sentiment pipeline
  createAlertFromCatalogPost,
};
