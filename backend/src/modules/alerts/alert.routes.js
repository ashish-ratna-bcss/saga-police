const express = require('express');
const logger = require('../../utils/logger');
const {
  listAlerts,
  getAlert,
  getAlertsBulk,
  putAlert,
  getStats,
  getUnread,
  putMarkAllRead,
  getTopByCategory,
} = require('./alert.controller');
const { getKeywords, postKeyword, putKeyword, removeKeyword } = require('./alert.keyword.controller');
const {
  listEngagers,
  getEngagersForHandle,
  postEngagersForHandle,
} = require('./alert.engager.controller');
const { isCatalogStore } = require('./alert.utils');
const { authorize } = require('../../middleware/auth.middleware');

// Legacy Mongo handlers (kept until Mongo alert path is retired)
const {
  getAlerts,
  getAlertById,
  getAlertsByIds,
  updateAlert,
  getAlertStats,
  getAlertSummary,
  getDashboardStats,
  getUnreadCount,
  markAllAsRead,
  investigateLink,
  translateAlertContent,
  getSimilarEscalatedAlerts,
  changeAlertCategory,
  getWorkflowKpi,
} = require('../../controllers/alertController');

const router = express.Router();

/** Prefer Postgres catalog when store=catalog (Alerts UI default). */
const withCatalog = (catalogHandler, mongoHandler) => (req, res, next) => {
  if (isCatalogStore(req)) return catalogHandler(req, res, next);
  return mongoHandler(req, res, next);
};

router.use(authorize({ pages: ['/alerts'] }));

router.get('/', authorize({ pages: ['/alerts'] }), withCatalog(listAlerts, getAlerts));
router.get('/stats', withCatalog(getStats, getAlertStats));
router.get('/summary', getAlertSummary);
router.get('/dashboard-stats', getDashboardStats);
router.get('/workflow-kpi', getWorkflowKpi);
router.get('/unread', authorize({ pages: ['/alerts'] }), withCatalog(getUnread, getUnreadCount));
router.get('/top-by-category', authorize({ pages: ['/alerts'] }), getTopByCategory);
router.post('/top-by-category', authorize({ pages: ['/alerts'] }), getTopByCategory);

// Catalog alert keywords (must be before /:id)
router.get('/keywords', getKeywords);
router.post('/keywords', postKeyword);
router.put('/keywords/:id', putKeyword);
router.delete('/keywords/:id', removeKeyword);

// Frequent engagers — live from Postgres posts + Blugate (no Mongo store)
router.get('/engagers', listEngagers);
router.get('/engagers/:handle', getEngagersForHandle);
router.post('/engagers', postEngagersForHandle);
router.post('/engagers/:handle', postEngagersForHandle);

router.post('/investigate', authorize({ pages: ['/alerts'] }), (req, res, next) => {
  logger.info('[AlertRoutes] POST /investigate reached');
  investigateLink(req, res, next);
});
router.post('/public-investigate', (req, res) => {
  logger.info('[AlertRoutes] POST /public-investigate reached');
  investigateLink(req, res);
});
router.post('/translate', translateAlertContent);
router.post('/bulk', withCatalog(getAlertsBulk, getAlertsByIds));
router.get('/debug', (req, res) => res.json({ version: '1.0.2', store: 'module/alerts', timestamp: new Date() }));
router.get('/:id', withCatalog(getAlert, getAlertById));
router.put('/read', authorize({ pages: ['/alerts'] }), withCatalog(putMarkAllRead, markAllAsRead));
router.put('/:id/change-category', changeAlertCategory);
router.put('/:id', authorize({ pages: ['/alerts'] }), withCatalog(putAlert, updateAlert));
router.post('/similar', getSimilarEscalatedAlerts);

module.exports = router;
