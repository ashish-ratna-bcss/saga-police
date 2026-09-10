const logger = require('../../lib/logger');
const { getOverview } = require('./dashboard.service');
const { getAdminConsoleStats } = require('../user/user.service');
const { ROLE_SLUGS } = require('../role/role.utils');

const getDashboardOverview = async (req, res) => {
  try {
    if (req.user?.role === ROLE_SLUGS.SUPERADMIN) {
      const data = await getAdminConsoleStats(req.user);
      return res.json({ mode: 'superadmin', ...data });
    }
    const data = await getOverview({
      range: req.query.range,
      platform: req.query.platform,
      db: req.tenantPrisma,
    });
    return res.json({ mode: 'ops', ...data });
  } catch (error) {
    logger.error(`[Dashboard] overview failed: ${error.message}`);
    return res.status(error.status || 500).json({
      error: error.message || 'Failed to load dashboard overview',
    });
  }
};

module.exports = {
  getDashboardOverview,
};
