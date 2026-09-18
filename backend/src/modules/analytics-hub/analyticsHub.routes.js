const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const {
  getOverviewAnalytics,
  getEventsAnalyticsHandler,
  getEventDetailsHandler,
  getAlertsAnalyticsHandler,
  getGrievancesAnalyticsHandler,
  getProfilesAnalyticsHandler,
} = require('./analyticsHub.controller');

const router = express.Router();

router.use(authorize({ pages: ['/analytics-hub'] }));

router.get('/overview', getOverviewAnalytics);
router.get('/events', getEventsAnalyticsHandler);
router.get('/events/:id/details', getEventDetailsHandler);
router.get('/alerts', getAlertsAnalyticsHandler);
router.get('/grievances', getGrievancesAnalyticsHandler);
router.get('/profiles', getProfilesAnalyticsHandler);

module.exports = router;
