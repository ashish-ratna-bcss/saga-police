const logger = require('../../lib/logger');
const { gatewayClientStatus } = require('../../services/blugate/blugate.http');
const { searchProfiles, searchContent, listConfiguredPlatforms } = require('./search.service');
const {
  saveSearchHistory,
  listSearchHistory,
  getSearchHistoryById,
} = require('./search.history.service');

const getRetryAfterSeconds = (error) => {
  const header = error?.response?.headers?.['retry-after'];
  const parsedHeader = Number(header);
  if (Number.isFinite(parsedHeader) && parsedHeader > 0) return parsedHeader;
  if (Number.isFinite(error?.retryAfterSeconds) && error.retryAfterSeconds > 0) {
    return error.retryAfterSeconds;
  }
  return 90;
};

/**
 * What a person is told when a platform search fails. The provider's own message (gateway URLs,
 * key names, internal codes) goes to the log only: it means nothing to an analyst and exposes how
 * the system is wired.
 */
const USER_MESSAGES = {
  401: 'This platform is not available right now. Please contact your administrator.',
  403: 'This platform is not available right now. Please contact your administrator.',
  400: 'This search could not be run. Try different words.',
  404: 'This platform did not respond. Please try again later.',
};
const GENERIC_MESSAGE = 'This search could not be completed right now. Please try again later.';

const handleProviderError = (res, error, fallbackMessage) => {
  const status = error?.response?.status || error?.status;
  logger.warn(`[Search] ${fallbackMessage}: HTTP ${status || '-'} ${error?.message || error}`);
  if (status === 429) {
    return res.status(429).json({
      error: 'Search is temporarily rate limited. Please retry later.',
      retryAfterSeconds: getRetryAfterSeconds(error),
    });
  }
  if (USER_MESSAGES[status]) {
    return res.status(status === 404 ? 502 : gatewayClientStatus(status)).json({
      error: USER_MESSAGES[status],
    });
  }
  return res.status(500).json({ error: GENERIC_MESSAGE });
};

const listPlatformsHandler = async (req, res) => {
  try {
    const platforms = await listConfiguredPlatforms({ db: req.tenantPrisma });
    return res.json({ platforms });
  } catch (error) {
    logger.error(`[Search] list platforms: ${error.message}`);
    return res.status(error.status || 500).json({
      error: 'The list of platforms could not be loaded. Please try again later.',
    });
  }
};

const searchProfilesHandler = async (req, res) => {
  try {
    const { platform, query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const results = await searchProfiles({
      platform,
      query,
      limit: req.query.limit,
      db: req.tenantPrisma,
    });
    return res.json(Array.isArray(results) ? results : []);
  } catch (error) {
    return handleProviderError(res, error, 'Failed to search profiles');
  }
};

const searchContentHandler = async (req, res) => {
  try {
    const { platform, query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const results = await searchContent({
      platform,
      query,
      limit: req.query.limit,
      db: req.tenantPrisma,
    });
    return res.json(Array.isArray(results) ? results : []);
  } catch (error) {
    return handleProviderError(res, error, 'Failed to search content');
  }
};

const saveHistoryHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const body = req.body || {};
    const result = await saveSearchHistory({
      db: req.tenantPrisma,
      userId,
      query: body.query,
      searchType: body.searchType,
      platform: body.platform,
      results: body.results,
      platformCounts: body.platformCounts,
      platformErrors: body.platformErrors,
      durationMs: body.durationMs,
      searchedAt: body.searchedAt,
    });
    return res.status(201).json({ success: true, id: result.id });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    logger.error(`[SearchHistory] save error: ${error.message}`);
    return res.status(500).json({ error: 'Failed to save search history' });
  }
};

const listHistoryHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const data = await listSearchHistory({
      db: req.tenantPrisma,
      userId,
      page: req.query.page,
      limit: req.query.limit,
      searchType: req.query.searchType,
      platform: req.query.platform,
      q: req.query.q,
      from: req.query.from,
      to: req.query.to,
    });
    return res.json(data);
  } catch (error) {
    logger.error(`[SearchHistory] list error: ${error.message}`);
    return res.status(500).json({ error: 'Failed to fetch search history' });
  }
};

const getHistoryByIdHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const item = await getSearchHistoryById({
      db: req.tenantPrisma,
      userId,
      id: req.params.id,
    });
    return res.json(item);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    logger.error(`[SearchHistory] detail error: ${error.message}`);
    return res.status(500).json({ error: 'Failed to fetch search history detail' });
  }
};

/** Glance AI path was removed with Mongo services; keep route so UI is not 404. */
const glanceSearchHandler = async (_req, res) => {
  return res.status(501).json({
    error: 'Glance search is temporarily unavailable',
    message: 'AI Glance was retired with the Mongo stack. Use Global Search profiles/content instead.',
  });
};

module.exports = {
  listPlatformsHandler,
  searchProfilesHandler,
  searchContentHandler,
  saveHistoryHandler,
  listHistoryHandler,
  getHistoryByIdHandler,
  glanceSearchHandler,
};
