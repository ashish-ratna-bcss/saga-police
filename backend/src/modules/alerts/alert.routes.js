const express = require('express');
const logger = require('../../lib/logger');
const {
  listAlerts,
  getAlert,
  getAlertsBulk,
  putAlert,
  getStats,
  getUnread,
  putMarkAllRead,
  getTopByCategory,
  getWorkflowKpi,
  translateAlertContent,
} = require('./alert.controller');
const { getKeywords, postKeyword, putKeyword, removeKeyword } = require('./alert.keyword.controller');
const {
  listEngagers,
  getEngagersForHandle,
  postEngagersForHandle,
} = require('./alert.engager.controller');
const { authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

const goneMongo = (feature) => (req, res) =>
  res.status(410).json({
    error: 'Mongo alert path retired',
    message: `${feature} is unavailable on Postgres-only mode.`,
  });

router.use(authorize({ pages: ['/alerts'] }));

// Postgres catalog alerts only
router.get('/', authorize({ pages: ['/alerts'] }), listAlerts);
router.get('/stats', getStats);
router.get('/summary', getStats);
router.get('/dashboard-stats', getStats);
router.get('/workflow-kpi', getWorkflowKpi);
router.get('/unread', authorize({ pages: ['/alerts'] }), getUnread);
router.get('/top-by-category', authorize({ pages: ['/alerts'] }), getTopByCategory);
router.post('/top-by-category', authorize({ pages: ['/alerts'] }), getTopByCategory);

router.get('/keywords', getKeywords);
router.post('/keywords', postKeyword);
router.put('/keywords/:id', putKeyword);
router.delete('/keywords/:id', removeKeyword);

router.get('/engagers', listEngagers);
router.get('/engagers/:handle', getEngagersForHandle);
router.post('/engagers', postEngagersForHandle);
router.post('/engagers/:handle', postEngagersForHandle);

router.post('/investigate', authorize({ pages: ['/alerts'] }), goneMongo('investigate'));
router.post('/public-investigate', goneMongo('investigate'));
router.post('/translate', translateAlertContent);
router.post('/bulk', getAlertsBulk);
router.get('/debug', (req, res) =>
  res.json({ version: '2.0.0', store: 'postgres-catalog', timestamp: new Date() })
);
router.get('/:id', getAlert);
router.put('/read', authorize({ pages: ['/alerts'] }), putMarkAllRead);
router.put('/:id/change-category', goneMongo('change-category'));
router.put('/:id', authorize({ pages: ['/alerts'] }), putAlert);
router.post('/similar', goneMongo('similar-escalated'));

module.exports = router;
