const {
  listCatalogGrievances,
  getCatalogGrievance,
  getCatalogStats,
  fetchAllCatalogGrievances,
} = require('./grievance.service');
const {
  listCatalogSources,
  fetchCatalogSourceGrievances,
} = require('./grievance.source.service');
const logger = require('../../utils/logger');

const listSources = async (req, res) => {
  try {
    const sources = await listCatalogSources(req.query.platform);
    return res.status(200).json(sources);
  } catch (error) {
    logger.error('[Grievances] listSources failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

const fetchSource = async (req, res) => {
  try {
    const { start_date, end_date } = req.body || {};
    const result = await fetchCatalogSourceGrievances(
      req.params.id,
      start_date,
      end_date
    );
    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    logger.error('[Grievances] fetchSource failed:', error.message);
    return res.status(status).json({ message: error.message });
  }
};

const fetchAll = async (req, res) => {
  try {
    const { start_date, end_date } = req.body || {};
    const result = await fetchAllCatalogGrievances(start_date, end_date);
    return res.status(200).json(result);
  } catch (error) {
    logger.error('[Grievances] fetchAll failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

const listGrievances = async (req, res) => {
  try {
    const payload = await listCatalogGrievances(req.query);
    return res.status(200).json(payload);
  } catch (error) {
    logger.error('[Grievances] list failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

const getGrievance = async (req, res) => {
  try {
    const row = await getCatalogGrievance(req.params.id);
    if (!row) return res.status(404).json({ message: 'Grievance not found' });
    return res.status(200).json(row);
  } catch (error) {
    logger.error('[Grievances] get failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

const getStats = async (req, res) => {
  try {
    const stats = await getCatalogStats(req.query);
    return res.status(200).json(stats);
  } catch (error) {
    logger.error('[Grievances] stats failed:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  listSources,
  fetchSource,
  fetchAll,
  listGrievances,
  getGrievance,
  getStats,
};
