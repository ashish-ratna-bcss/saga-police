const logger = require('../../lib/logger');
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

const handleProviderError = (res, error, fallbackMessage) => {
  const status = error?.response?.status || error?.status;
  if (status === 429) {
    return res.status(429).json({
      error: 'Search is temporarily rate limited. Please retry later.',
      retryAfterSeconds: getRetryAfterSeconds(error),
    });
  }
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return res.status(status === 404 ? 502 : status).json({
      error: error.message || fallbackMessage,
    });
  }
  logger.error(`[Search] ${fallbackMessage}: ${error?.message || error}`);
  return res.status(500).json({ error: fallbackMessage });
};

const listPlatformsHandler = async (req, res) => {
  try {
    const platforms = await listConfiguredPlatforms({ db: req.tenantPrisma });
    return res.json({ platforms });
  } catch (error) {
    logger.error(`[Search] list platforms: ${error.message}`);
    return res.status(error.status || 500).json({
      error: error.message || 'Failed to list platforms',
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
