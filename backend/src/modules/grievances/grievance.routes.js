const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const {
  listSources: listCatalogSources,
  fetchSource: fetchCatalogSource,
  fetchAll: fetchCatalogAll,
  listGrievances: listCatalogGrievances,
  getGrievance: getCatalogGrievance,
  getStats: getCatalogStats,
  getReportStats,
} = require('./grievance.controller');

const router = express.Router();

const goneMongo = (feature) => (req, res) =>
  res.status(410).json({
    error: 'Mongo grievance path retired',
    message: `${feature} is unavailable on Postgres-only mode. Use catalog sources / G-S-C-Q report APIs.`,
  });

// WhatsApp webhook was Mongo-backed — retired
router.post('/whatsapp/webhook', goneMongo('whatsapp-webhook'));

router.use(authorize({ pages: ['/grievances'] }));

router.get('/stats', getCatalogStats);
router.get('/report-stats', getReportStats);
router.get('/dashboard-stats', getReportStats);

router.route('/settings').get(goneMongo('settings')).put(goneMongo('settings'));

router
  .route('/sources')
  .get(listCatalogSources)
  .post(goneMongo('add-source'));

router.route('/sources/:id').put(goneMongo('update-source')).delete(goneMongo('delete-source'));

router.post('/sources/:id/fetch', fetchCatalogSource);
router.post('/fetch-all', fetchCatalogAll);

router.route('/').get(listCatalogGrievances);
router.route('/:id').get(getCatalogGrievance);

router.put('/:id/acknowledge', goneMongo('acknowledge'));
router.put('/:id/complaint', goneMongo('complaint'));
router.put('/:id/status', goneMongo('status'));
router.put('/:id/workflow', goneMongo('workflow'));
router.post('/:id/convert-to-fir', goneMongo('convert-to-fir'));
router.post('/:id/escalate', goneMongo('escalate'));
router.post('/:id/enrich-context', goneMongo('enrich-context'));
router.put('/:id/revert', goneMongo('revert'));

router.get('/:id/report', goneMongo('legacy-report'));
router.post('/:id/share', goneMongo('legacy-share'));

router.get('/debug', (req, res) =>
  res.json({
    version: '2.0.0',
    store: 'postgres-catalog',
    default: 'postgres',
    timestamp: new Date(),
  })
);

module.exports = router;
