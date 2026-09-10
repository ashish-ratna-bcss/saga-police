const logger = require('../../lib/logger');
const intelligenceService = require('./intelligence.service');

/** GET /api/intelligence/alerts — Postgres catalog */
const getAlertsIntelligence = async (req, res) => {
  try {
    const data = await intelligenceService.getAlertsIntelligence({ ...req.query, db: req.tenantPrisma });
    return res.status(200).json(data);
  } catch (error) {
    logger.error('Alerts intelligence error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/** GET /api/intelligence/grievances — Postgres catalog */
const getGrievancesIntelligence = async (req, res) => {
  try {
    const data = await intelligenceService.getGrievancesIntelligence({ ...req.query, db: req.tenantPrisma });
    return res.status(200).json(data);
  } catch (error) {
    logger.error('Grievances intelligence error:', error);
    return res.status(500).json({ message: error.message });
  }
};

/** GET /api/intelligence/profiles — Postgres catalog profiles/accounts */
const getProfilesIntelligence = async (req, res) => {
  try {
    const data = await intelligenceService.getProfilesIntelligence({ ...req.query, db: req.tenantPrisma });
    return res.status(200).json(data);
  } catch (error) {
    logger.error('Profiles intelligence error:', error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAlertsIntelligence,
  getGrievancesIntelligence,
  getProfilesIntelligence,
};
