const logger = require('../../lib/logger');
const {
  getOverview,
  getEventsAnalytics,
  getEventDetails,
  getAlertsAnalytics,
  getGrievancesAnalytics,
  getProfilesAnalytics,
} = require('./analyticsHub.service');

const wrap = (fn, label) => async (req, res) => {
  try {
    const data = await fn({
      range: req.query.range,
      platform: req.query.platform,
      event_id: req.query.event_id || req.params.id,
      db: req.tenantPrisma,
    });
    return res.json(data);
  } catch (error) {
    logger.error(`[AnalyticsHub] ${label} failed: ${error.message}`);
    return res.status(error.status || 500).json({
      error: error.message || `Failed to load ${label} analytics`,
    });
  }
};

module.exports = {
  getOverviewAnalytics: wrap(getOverview, 'overview'),
  getEventsAnalyticsHandler: wrap(getEventsAnalytics, 'events'),
  getEventDetailsHandler: wrap(getEventDetails, 'event-details'),
  getAlertsAnalyticsHandler: wrap(getAlertsAnalytics, 'alerts'),
  getGrievancesAnalyticsHandler: wrap(getGrievancesAnalytics, 'grievances'),
  getProfilesAnalyticsHandler: wrap(getProfilesAnalytics, 'profiles'),
};
