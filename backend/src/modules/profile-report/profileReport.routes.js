const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const c = require('./profileReport.controller');

const router = express.Router();

// Same access rule as the other Tools modules (News, Scrape, OSINT).
router.use(authorize({ pages: ['/analysis-tools'] }));

router.get('/subjects', c.listSubjects);
router.post('/accounts/fetch', c.fetchAccount);
router.delete('/accounts/:accountId', c.deleteDraftAccount);

router.route('/subjects/:id').get(c.getSubject).delete(c.deleteSubject);
router.post('/subjects/:id/save', c.saveSubject);
router.post('/subjects/:id/discard', c.discardDrafts);
router.get('/subjects/:id/posts', c.listPosts);
router.post('/subjects/:id/refresh', c.refresh);
router.post('/subjects/:id/retry', c.retry);

// The AI report: same shape as /events/:id/summary-llm.
router.get('/subjects/:id/report/pdf', c.getReportPdf);
router.post('/subjects/:id/report/cancel', c.cancelReport);
router.route('/subjects/:id/report').get(c.getReport).post(c.startReport);

module.exports = router;
