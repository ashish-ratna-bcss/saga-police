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
  runEventScan,
  getEventsReport,
} = require('./event.controller');

const router = express.Router();

router.use(authorize({ pages: ['/events'] }));

router.get('/', listEvents);
router.get('/report', getEventsReport);
router.get('/:id', getEvent);
router.get('/:id/dashboard', getEventDashboard);
router.get('/:id/content', getEventContent);

router.post('/', createEvent);
router.put('/:id', updateEvent);
router.put('/:id/monitoring', toggleMonitoring);
router.post('/:id/pause', pauseEvent);
router.post('/:id/resume', resumeEvent);
router.post('/:id/run', runEventScan);
router.delete('/:id', deleteEvent);

module.exports = router;
