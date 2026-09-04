const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
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
    getWorkflowKpi
} = require('../controllers/alertController');
const { authorize } = require('../middleware/auth.middleware');

const normalizeAlertStatus = (value) => {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.toLowerCase();
    if (normalized === 'falsepositive' || normalized === 'false-positive') return 'false_positive';
    if (normalized === 'resolved') return 'acknowledged';
    return normalized;
};

const resolveAlertStatusFromQuery = (req) => (
    normalizeAlertStatus(req.query.status || req.query.status_filter || req.query.tab) || 'active'
);

const resolveAlertStatusFromBody = (req) => (
    normalizeAlertStatus(req.body.status || req.body.next_status)
);

router.use(authorize({ pages: ['/alerts'] }));

router.get('/', authorize({ pages: ['/alerts'] }), getAlerts);
router.get('/stats', getAlertStats);
router.get('/summary', getAlertSummary);
router.get('/dashboard-stats', getDashboardStats);
router.get('/workflow-kpi', getWorkflowKpi);
router.get('/unread', authorize({ pages: ['/alerts'] }), getUnreadCount);
router.post('/investigate', authorize({ pages: ['/alerts'] }), (req, res, next) => {
    logger.info('[AlertRoutes] POST /investigate reached');
    investigateLink(req, res, next);
});
router.post('/public-investigate', (req, res) => {
    logger.info('[AlertRoutes] POST /public-investigate reached');
    investigateLink(req, res);
});
router.post('/translate', translateAlertContent);
router.post('/bulk', getAlertsByIds);
router.get('/debug', (req, res) => res.json({ version: '1.0.2', timestamp: new Date() }));
router.get('/:id', getAlertById);
router.put('/read', authorize({ pages: ['/alerts'] }), markAllAsRead);
router.put('/:id/change-category', changeAlertCategory);
router.put('/:id', authorize({ pages: ['/alerts'] }), updateAlert);
router.post('/similar', getSimilarEscalatedAlerts);

module.exports = router;
