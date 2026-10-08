const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  toggleMonitoring,
  pauseEvent,
  resumeEvent,
  deleteEvent,
  getEventDashboard,
  getEventContent,
  getEventKeywordAnalytics,
  getEventSummaryLLM,
  regenerateEventSummaryLLM,
  saveEventSummaryPdfHandler,
  getEventIntelligenceReportPdf,
  getEventReportReview,
  saveEventReportReview,
  approveEventReport,
  reopenEventReport,
  runEventScan,
  getEventsReport,
  generateEventTerms,
} = require('./event.controller');

const router = express.Router();

router.use(authorize({ pages: ['/events'] }));

router.get('/', listEvents);
router.get('/report', getEventsReport);
router.post('/generate-event-terms', generateEventTerms);
router.get('/:id', getEvent);
router.get('/:id/dashboard', getEventDashboard);
router.get('/:id/content', getEventContent);
router.get('/:id/keyword-analytics', getEventKeywordAnalytics);
router.get('/:id/summary-llm', getEventSummaryLLM);
router.post('/:id/summary-llm', regenerateEventSummaryLLM);
router.put('/:id/summary-llm/pdf', saveEventSummaryPdfHandler);
router.get('/:id/summary-llm/report.pdf', getEventIntelligenceReportPdf);
router.get('/:id/summary-llm/review', getEventReportReview);
router.put('/:id/summary-llm/review', saveEventReportReview);
router.post('/:id/summary-llm/review/approve', approveEventReport);
router.post('/:id/summary-llm/review/reopen', reopenEventReport);


router.post('/', createEvent);
router.put('/:id', updateEvent);
router.put('/:id/monitoring', toggleMonitoring);
router.post('/:id/pause', pauseEvent);
router.post('/:id/resume', resumeEvent);
router.post('/:id/run', runEventScan);
router.delete('/:id', deleteEvent);

module.exports = router;
