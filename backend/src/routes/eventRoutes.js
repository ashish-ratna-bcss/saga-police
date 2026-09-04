const express = require('express');
const router = express.Router();

const {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  archiveEvent,
  pauseEvent,
  resumeEvent,
  deleteEvent,
  getEventDashboard,
  getEventContent,
  runEventScan,
  generateKeywords,
  getMonitoringInterval,
  updateMonitoringInterval,
  getEventsReport,
  generateEventReportPdf
} = require('../controllers/eventController');

const { authorize } = require('../middleware/auth.middleware');

router.use(authorize({ pages: ['/events'] }));

router.get('/', listEvents);
router.get('/report', getEventsReport);
router.get('/:id', getEvent);
router.get('/:id/dashboard', getEventDashboard);
router.get('/:id/content', getEventContent);

router.post('/', createEvent);
router.get('/monitoring-interval', getMonitoringInterval);
router.put('/monitoring-interval', updateMonitoringInterval);
router.post('/generate-keywords', generateKeywords);
router.put('/:id', updateEvent);
router.post('/:id/archive', archiveEvent);
router.post('/:id/pause', pauseEvent);
router.post('/:id/resume', resumeEvent);
router.post('/:id/run', runEventScan);
router.post('/:id/generate-report-pdf', generateEventReportPdf);
router.delete('/:id', deleteEvent);

module.exports = router;
