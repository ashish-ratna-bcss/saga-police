const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const { isCatalogStore } = require('./grievance.utils');
const {
  listSources: listCatalogSources,
  fetchSource: fetchCatalogSource,
  fetchAll: fetchCatalogAll,
  listGrievances: listCatalogGrievances,
  getGrievance: getCatalogGrievance,
  getStats: getCatalogStats,
  getReportStats,
} = require('./grievance.controller');

// Legacy Mongo handlers (opt-in via store=mongo only)
const {
  getSources,
  addSource,
  updateSource,
  deleteSource,
  fetchSourceGrievances,
  fetchAllGrievances,
  getGrievances,
  getGrievance,
  acknowledgeGrievance,
  markAsComplaint,
  updateComplaintStatus,
  updateWorkflowStatus,
  convertToFir,
  escalateGrievance,
  ingestWhatsAppWebhook,
  generateReport,
  recordShare,
  getStats,
  getDashboardStats,
  getSettings,
  updateSettings,
  revertGrievance,
  enrichGrievanceContext,
} = require('../../controllers/grievanceController');

const router = express.Router();

const withCatalog = (catalogHandler, mongoHandler) => (req, res, next) => {
  if (isCatalogStore(req)) return catalogHandler(req, res, next);
  return mongoHandler(req, res, next);
};

// Public webhook (must stay unauthenticated)
router.post('/whatsapp/webhook', ingestWhatsAppWebhook);

router.use(authorize({ pages: ['/grievances'] }));

router.get('/stats', withCatalog(getCatalogStats, getStats));
router.get('/report-stats', getReportStats);
router.get('/dashboard-stats', getDashboardStats);

router.route('/settings').get(getSettings).put(updateSettings);

router
  .route('/sources')
  .get(withCatalog(listCatalogSources, getSources))
  .post(addSource);

router.route('/sources/:id').put(updateSource).delete(deleteSource);

router.post(
  '/sources/:id/fetch',
  withCatalog(fetchCatalogSource, fetchSourceGrievances)
);

router.post('/fetch-all', withCatalog(fetchCatalogAll, fetchAllGrievances));

router.route('/').get(withCatalog(listCatalogGrievances, getGrievances));
router.route('/:id').get(withCatalog(getCatalogGrievance, getGrievance));

router.put('/:id/acknowledge', acknowledgeGrievance);
router.put('/:id/complaint', markAsComplaint);
router.put('/:id/status', updateComplaintStatus);
router.put('/:id/workflow', updateWorkflowStatus);
router.post('/:id/convert-to-fir', convertToFir);
router.post('/:id/escalate', escalateGrievance);
router.post('/:id/enrich-context', enrichGrievanceContext);
router.put('/:id/revert', revertGrievance);

router.get('/:id/report', generateReport);
router.post('/:id/share', recordShare);

router.get('/debug', (req, res) =>
  res.json({
    version: '1.1.0',
    store: 'module/grievances',
    default: 'postgres',
    timestamp: new Date(),
  })
);

module.exports = router;
