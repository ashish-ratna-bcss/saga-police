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
  getEventSummaryRegionView,
  regenerateEventSummaryLLM,
  cancelEventSummaryLLM,
  saveEventSummaryPdfHandler,
  getEventIntelligenceReportPdf,
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
router.get('/:id/summary-llm/region', getEventSummaryRegionView);
router.post('/:id/summary-llm', regenerateEventSummaryLLM);
router.post('/:id/summary-llm/cancel', cancelEventSummaryLLM);
router.put('/:id/summary-llm/pdf', saveEventSummaryPdfHandler);
router.get('/:id/summary-llm/report.pdf', getEventIntelligenceReportPdf);


router.post('/', createEvent);
router.put('/:id', updateEvent);
router.put('/:id/monitoring', toggleMonitoring);
router.post('/:id/pause', pauseEvent);
router.post('/:id/resume', resumeEvent);
router.post('/:id/run', runEventScan);
router.delete('/:id', deleteEvent);

module.exports = router;
