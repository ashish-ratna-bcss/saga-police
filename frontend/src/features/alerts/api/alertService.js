/**
 * Alerts HTTP API — single place for /alerts* contracts.
 * Methods return the raw Axios response (same as direct api.* calls).
 * Catalog (Postgres social_media_alerts) is the default store for the Alerts UI.
 */
import api from '@/lib/api';

const CATALOG_STORE = 'catalog';

const withCatalogParams = (params = {}) => ({
  store: CATALOG_STORE,
  ...params,
});

const withCatalogBody = (body = {}) => ({
  store: CATALOG_STORE,
  ...body,
});

export const AlertService = {
  list(params, config = {}) {
    return api.get('/alerts', { params: withCatalogParams(params), ...config });
  },

  getById(id) {
    return api.get(`/alerts/${id}`, { params: withCatalogParams() });
  },

  update(id, body) {
    return api.put(`/alerts/${id}`, withCatalogBody(body), {
      params: withCatalogParams(),
    });
  },

  changeCategory(id, category) {
    return api.put(`/alerts/${id}/change-category`, { category });
  },

  getSummary() {
    return api.get('/alerts/summary');
  },

  getStats(params) {
    return api.get('/alerts/stats', { params: withCatalogParams(params) });
  },

  getUnread() {
    return api.get('/alerts/unread', { params: withCatalogParams() });
  },

  markAllRead() {
    return api.put('/alerts/read', withCatalogBody(), {
      params: withCatalogParams(),
    });
  },

  getWorkflowKpi(params, config = {}) {
    return api.get('/alerts/workflow-kpi', {
      params: withCatalogParams(params),
      ...config,
    });
  },

  getDashboardStats() {
    return api.get('/alerts/dashboard-stats');
  },

  bulk(ids) {
    return api.post('/alerts/bulk', withCatalogBody({ ids }), {
      params: withCatalogParams(),
    });
  },

  topByCategory(params = {}) {
    return api.get('/alerts/top-by-category', {
      params: withCatalogParams(params),
    });
  },

  listEngagers() {
    return api.get('/alerts/engagers', { params: withCatalogParams() });
  },

  getEngagers(handle, params = {}) {
    const clean = String(handle || '').replace(/^@/, '').trim();
    return api.get(`/alerts/engagers/${encodeURIComponent(clean)}`, {
      params: withCatalogParams(params),
    });
  },

  analyzeEngagers(handle, body = {}) {
    const clean = String(handle || '').replace(/^@/, '').trim();
    return api.post(`/alerts/engagers/${encodeURIComponent(clean)}`, withCatalogBody({
      handle: clean,
      ...body,
    }), { params: withCatalogParams() });
  },

  investigate(url) {
    return api.post('/alerts/investigate', { url });
  },

  translate(text) {
    return api.post('/alerts/translate', { text });
  },

  similar(text) {
    return api.post('/alerts/similar', { text });
  },

  listKeywords(params) {
    return api.get('/alerts/keywords', { params });
  },

  addKeyword(body) {
    return api.post('/alerts/keywords', body);
  },

  updateKeyword(id, body) {
    return api.put(`/alerts/keywords/${id}`, body);
  },

  deleteKeyword(id) {
    return api.delete(`/alerts/keywords/${id}`);
  },
};

export default AlertService;
