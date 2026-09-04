const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth.middleware');
const {
  createReport,
  shareReport,
  getReports,
  getReport,
  exportReports,
  getContacts,
  addContact,
  updateContact,
  deleteContact,
  generateReportPdf
} = require('../controllers/criticismController');

router.use(authorize({ pages: ['/grievances', '/unified-reports'] }));

/* ── Reports ── */
router.get('/reports/export', exportReports); // must be before :id
router.get('/reports', getReports);
router.post('/reports', createReport);
router.get('/reports/:id', getReport);
router.put('/reports/:id/share', shareReport);
router.post('/reports/:id/generate-pdf', generateReportPdf);

/* ── Contacts ── */
router.get('/contacts', getContacts);
router.post('/contacts', addContact);
router.put('/contacts/:id', updateContact);
router.delete('/contacts/:id', deleteContact);

module.exports = router;
