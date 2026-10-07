const logger = require('../../lib/logger');
const { callNewsApi } = require('../../services/blugate/news/blugate.news.api_client');
const { resolveGlobalAuth } = require('../../services/blugate/global/blugate.global.api_client');
const store = require('./news.store.service');
const { MAX_KEYWORD_LENGTH } = require('./news.keywords');

/** Long keyword lists travel in the URL; refuse ones proxies would reject anyway. */
const keywordTooLong = (req, res) => {
  if (String(req.query.keyword || '').length <= MAX_KEYWORD_LENGTH) return false;
  res.status(400).json({
    ok: false,
    code: 'KEYWORD_TOO_LONG',
    message: `Keyword list is too long — keep it under ${MAX_KEYWORD_LENGTH.toLocaleString()} characters.`,
  });
  return true;
};

const NOT_CONFIGURED_MESSAGE =
  'No platform has a BluGate API key & client key set yet — add one under Settings → Platforms.';

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

/**
 * Live search, then keep the page in the caller's tenant DB. Storage failing never
 * fails the search — the user still gets live results, with `saved.error` set.
 * Accounts without a tenant DB (superadmin) get live results only (`saved: null`).
 */
const getArticles = async (req, res) => {
  if (keywordTooLong(req, res)) return undefined;
  let data;
  try {
    data = await callUpstream(req, 'ARTICLES', req.query);
  } catch (error) {
    return sendError(res, error);
  }

  let saved = null;
  if (req.tenantPrisma) {
    try {
      saved = await store.recordSearchPage(req.tenantPrisma, { user: req.user, query: req.query, data });
    } catch (error) {
      logger.error(`[News] could not store articles for ${req.tenantDbName}: ${error.message}`);
      saved = { error: 'Results could not be saved to your workspace.' };
    }
  }
  return res.status(200).json({ ...data, saved });
};

/**
 * Upstream only holds an article for ~10 min; after that the tenant's stored copy
 * answers. Tries upstream first so a fresh copy wins while it exists.
 */
const getArticle = async (req, res) => {
  const { articleId } = req.params;
  let upstreamError;
  try {
    return res.status(200).json(await callUpstream(req, 'ARTICLE', { article_id: articleId }));
  } catch (error) {
    upstreamError = error;
  }
  if (req.tenantPrisma) {
    try {
      const stored = await store.getSavedArticle(req.tenantPrisma, articleId);
      if (stored) return res.status(200).json(stored);
    } catch (error) {
      logger.error(`[News] stored article lookup failed for ${req.tenantDbName}: ${error.message}`);
    }
  }
  return sendError(res, upstreamError);
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

module.exports = {
  getHealth: forward('HEALTH', () => ({})),
  getSources: forward('SOURCES', (req) => req.query),
  getArticles,
  getArticle,
  getSavedArticles: (req, res) => (keywordTooLong(req, res)
    ? undefined
    : fromStore((r) => store.listSavedArticles(r.tenantPrisma, r.query))(req, res)),
  getSearches: fromStore((req) => store.listSearches(req.tenantPrisma, req.query, req.user)),
  getSearchArticles: fromStore((req) => store.listSearchArticles(req.tenantPrisma, req.params.searchId, req.query)),
  deleteSearch: fromStore((req) => store.deleteSearch(req.tenantPrisma, req.params.searchId, req.user)),
};
