const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth.middleware');
const {
  createReport,
  shareReport,
  closeReport,
  updateReportStatus,
  getReports,
  getReport,
  exportReports,
  getContacts,
  updateReport,
  generateReportPdf,
  getDashboardStats,
  addCommunicationLog
} = require('../controllers/grievanceWorkflowController');

router.use(authorize({ pages: ['/grievances', '/unified-reports'] }));

/* ── Dashboard stats (lightweight) ── */
router.get('/dashboard-stats', getDashboardStats);

/* ── Reports ── */
router.get('/reports/export', exportReports); // before :id
router.get('/reports', getReports);
router.post('/reports', createReport);
router.get('/reports/:id', getReport);
router.put('/reports/:id', updateReport);
router.put('/reports/:id/share', shareReport);
router.put('/reports/:id/close', closeReport);
router.put('/reports/:id/status', updateReportStatus);
router.post('/reports/:id/generate-pdf', generateReportPdf);
router.post('/reports/:id/communication-log', addCommunicationLog);

/* ── Contacts (reuse criticism contacts) ── */
router.get('/contacts', getContacts);

module.exports = router;
