const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth.middleware');
const {
  createReport,
  shareReport,
  closeReport,
  getReports,
  getReport,
  exportReports,
  getContacts,
  generateReportPdf
} = require('../controllers/queryController');

router.use(authorize({ pages: ['/grievances', '/unified-reports'] }));

/* ── Reports ── */
router.get('/reports/export', exportReports); // must be before :id
router.get('/reports', getReports);
router.post('/reports', createReport);
router.get('/reports/:id', getReport);
router.put('/reports/:id/share', shareReport);
router.put('/reports/:id/close', closeReport);
router.post('/reports/:id/generate-pdf', generateReportPdf);

/* ── Contacts (reuses criticism contacts) ── */
router.get('/contacts', getContacts);

module.exports = router;
