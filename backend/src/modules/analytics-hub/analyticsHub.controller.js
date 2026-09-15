const logger = require('../../lib/logger');
const {
  getOverview,
  getEventsAnalytics,
  getAlertsAnalytics,
  getGrievancesAnalytics,
  getProfilesAnalytics,
} = require('./analyticsHub.service');

const wrap = (fn, label) => async (req, res) => {
  try {
    const data = await fn({
      range: req.query.range,
      platform: req.query.platform,
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
  getAlertsAnalyticsHandler: wrap(getAlertsAnalytics, 'alerts'),
  getGrievancesAnalyticsHandler: wrap(getGrievancesAnalytics, 'grievances'),
  getProfilesAnalyticsHandler: wrap(getProfilesAnalytics, 'profiles'),
};
