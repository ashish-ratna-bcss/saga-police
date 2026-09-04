const express = require('express');
const router = express.Router();
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
    enrichGrievanceContext
} = require('../controllers/grievanceController');
const { authorize } = require('../middleware/auth.middleware');

// Public webhook route (must remain unauthenticated)
router.post('/whatsapp/webhook', ingestWhatsAppWebhook);

router.use(authorize({ pages: ['/grievances'] }));

// Stats route (must be before :id routes)
router.get('/stats', getStats);
router.get('/dashboard-stats', getDashboardStats);

// Settings routes
router.route('/settings')
    .get(getSettings)
    .put(updateSettings);

// Source routes
router.route('/sources')
    .get(getSources)
    .post(addSource);

router.route('/sources/:id')
    .put(updateSource)
    .delete(deleteSource);

router.post('/sources/:id/fetch', fetchSourceGrievances);

// Fetch all grievances from all sources
router.post('/fetch-all', fetchAllGrievances);

// Grievance routes
router.route('/')
    .get(getGrievances);

router.route('/:id')
    .get(getGrievance);

// Classification actions
router.put('/:id/acknowledge', authorize({ pages: ['/grievances'] }), acknowledgeGrievance);
router.put('/:id/complaint', authorize({ pages: ['/grievances'] }), markAsComplaint);
router.put('/:id/status', authorize({ pages: ['/grievances'] }), updateComplaintStatus);
router.put('/:id/workflow', authorize({ pages: ['/grievances'] }), updateWorkflowStatus);
router.post('/:id/convert-to-fir', authorize({ pages: ['/grievances'] }), convertToFir);
router.post('/:id/escalate', authorize({ pages: ['/grievances'] }), escalateGrievance);
router.post('/:id/enrich-context', enrichGrievanceContext);
router.put('/:id/revert', authorize({ pages: ['/grievances'] }), revertGrievance);

// Report generation and sharing
router.get('/:id/report', authorize({ pages: ['/grievances'] }), generateReport);
router.post('/:id/share', authorize({ pages: ['/grievances'] }), recordShare);

module.exports = router;
