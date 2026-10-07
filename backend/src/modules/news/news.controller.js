const logger = require('../../lib/logger');
const { callNewsApi } = require('../../services/blugate/news/blugate.news.api_client');
const { resolveGlobalAuth } = require('../../services/blugate/global/blugate.global.api_client');
const store = require('./news.store.service');
const { MAX_KEYWORD_LENGTH } = require('./news.keywords');

const NOT_CONFIGURED_MESSAGE =
  'No platform has a BluGate API key & client key set yet — add one under Settings → Platforms.';
const NO_TENANT_DB_MESSAGE = 'This account has no tenant workspace, so news can’t be saved or shown for it.';

// A live fetch saves up to COLLECT_MAX articles, in pages small enough that full
// article bodies stay under BluGate's 2 MB response cap.
const COLLECT_PAGE_SIZE = 50;
const COLLECT_MAX = 150;
// What a live fetch forwards. Not min_match: every keyword match is saved, so a
// later, stricter search still finds them in the database.
const LIVE_FILTER_KEYS = ['keyword', 'country', 'language', 'state', 'district', 'source', 'location'];

/** Long keyword lists travel in the URL; refuse ones proxies would reject anyway. */
const keywordTooLong = (keyword, res) => {
  if (String(keyword || '').length <= MAX_KEYWORD_LENGTH) return false;
  res.status(400).json({
    ok: false,
    code: 'KEYWORD_TOO_LONG',
    message: `Keyword list is too long — keep it under ${MAX_KEYWORD_LENGTH.toLocaleString()} characters.`,
  });
  return true;
};

/**
 * Status to send the browser for a failed gateway call. A gateway 401/403 means our
 * BluGate key was rejected — not that the user's session expired — so it must not
 * reach the frontend as 401, which apiHandler treats as "log out".
 */
const clientStatus = (status) => {
  if (status === 401 || status === 403) return 502;
  return status || 502;
};

const sendError = (res, error) =>
  res.status(clientStatus(error.status)).json({ ok: false, code: error.code, message: error.message });

/** Calls one news-api endpoint with the shared BluGate client account. */
const callUpstream = async (req, endpointKey, params) => {
  const auth = await resolveGlobalAuth(req.tenantPrisma);
  if (!auth) {
    const err = new Error(NOT_CONFIGURED_MESSAGE);
    err.status = 503;
    err.code = 'NEWS_NOT_CONFIGURED';
    throw err;
  }
  return callNewsApi(endpointKey, params, auth);
};

const forward = (endpointKey, paramsOf) => async (req, res) => {
  try {
    return res.status(200).json(await callUpstream(req, endpointKey, paramsOf(req)));
  } catch (error) {
    return sendError(res, error);
  }
};

const fromStore = (fn) => async (req, res) => {
  try {
    const result = await fn(req);
    return result === undefined ? res.status(204).end() : res.status(200).json(result);
  } catch (error) {
    if (!error.status) logger.error(`[News] store error for ${req.tenantDbName}: ${error.message}`);
    return res.status(error.status || 500).json({ ok: false, code: error.code, message: error.message });
  }
};

/** What the News page shows: the tenant's saved articles with every filter applied. */
const getArticles = (req, res) => (keywordTooLong(req.query.keyword, res)
  ? undefined
  : fromStore((r) => store.listArticles(r.tenantPrisma, r.query))(req, res));

/**
 * Fetch the latest matching articles from the news API (via BluGate) and save them in
 * the caller's tenant DB. The page then re-reads the DB, so it shows these plus older
 * coverage. Body: the search's filters (+ optional search_id to update that history row).
 */
const collect = async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (keywordTooLong(body.keyword, res)) return undefined;
  if (!req.tenantPrisma) {
    return res.status(400).json({ ok: false, code: 'NO_TENANT_DB', message: NO_TENANT_DB_MESSAGE });
  }

  const live = Object.fromEntries(LIVE_FILTER_KEYS.filter((k) => body[k] != null && body[k] !== '').map((k) => [k, body[k]]));
  const articles = [];
  let liveCount = 0;
  let pending = 0;
  try {
    for (let offset = 0; offset < COLLECT_MAX; offset += COLLECT_PAGE_SIZE) {
      const data = await callUpstream(req, 'ARTICLES', { ...live, limit: COLLECT_PAGE_SIZE, offset });
      // Later pages answer from the upstream cache and see sources that finished
      // since the first call, so the latest count/pending wins.
      liveCount = Number(data?.count) || 0;
      pending = Number(data?.pending_sources) || 0;
      articles.push(...(Array.isArray(data?.articles) ? data.articles : []));
      if (offset + COLLECT_PAGE_SIZE >= liveCount) break;
    }
  } catch (error) {
    if (!articles.length) return sendError(res, error);
    logger.warn(`[News] live fetch stopped early for ${req.tenantDbName}: ${error.message}`);
  }

  try {
    const saved = await store.saveCollected(req.tenantPrisma, { user: req.user, query: body, articles, liveCount });
    return res.status(200).json({ ok: true, ...saved, live_count: liveCount, pending_sources: pending });
  } catch (error) {
    logger.error(`[News] could not save articles for ${req.tenantDbName}: ${error.message}`);
    return res.status(error.status || 500).json({ ok: false, code: error.code, message: 'Fetched news could not be saved to your workspace.' });
  }
};

/** One article with its full text: the tenant's saved copy, else (no workspace / not saved) live. */
const getArticle = async (req, res) => {
  const { articleId } = req.params;
  if (req.tenantPrisma) {
    try {
      const stored = await store.getSavedArticle(req.tenantPrisma, articleId);
      if (stored) return res.status(200).json(stored);
    } catch (error) {
      logger.error(`[News] stored article lookup failed for ${req.tenantDbName}: ${error.message}`);
    }
  }
  try {
    return res.status(200).json(await callUpstream(req, 'ARTICLE', { article_id: articleId }));
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  getHealth: forward('HEALTH', () => ({})),
  getSources: forward('SOURCES', (req) => req.query),
  getArticles,
  collect,
  getArticle,
  getSearches: fromStore((req) => store.listSearches(req.tenantPrisma, req.query, req.user)),
  deleteSearch: fromStore((req) => store.deleteSearch(req.tenantPrisma, req.params.searchId, req.user)),
};
