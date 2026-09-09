import apiHandler from './apiHandler';

const CATALOG_STORE = 'catalog';

const withCatalogParams = (params = {}) => ({
  store: CATALOG_STORE,
  ...params,
});

const withCatalogBody = (body = {}) => ({
  store: CATALOG_STORE,
  ...body,
});

export const alertsApi = {
  list(params, config = {}) {
    return apiHandler.get('/alerts', { params: withCatalogParams(params), ...config });
  },

  getById(id) {
    return apiHandler.get(`/alerts/${id}`, { params: withCatalogParams() });
  },

  update(id, body) {
    return apiHandler.put(`/alerts/${id}`, withCatalogBody(body), {
      params: withCatalogParams(),
    });
  },

  changeCategory(id, category) {
    return apiHandler.put(`/alerts/${id}/change-category`, { category });
  },

  getSummary() {
    return apiHandler.get('/alerts/summary');
  },

  getStats(params) {
    return apiHandler.get('/alerts/stats', { params: withCatalogParams(params) });
  },

  getUnread() {
    return apiHandler.get('/alerts/unread', { params: withCatalogParams() });
  },

  markAllRead() {
    return apiHandler.put('/alerts/read', withCatalogBody(), {
      params: withCatalogParams(),
    });
  },

  getWorkflowKpi(params, config = {}) {
    return apiHandler.get('/alerts/workflow-kpi', {
      params: withCatalogParams(params),
      ...config,
    });
  },

  getDashboardStats() {
    return apiHandler.get('/alerts/dashboard-stats');
  },

  bulk(ids) {
    return apiHandler.post('/alerts/bulk', withCatalogBody({ ids }), {
      params: withCatalogParams(),
    });
  },

  topByCategory(params = {}) {
    return apiHandler.get('/alerts/top-by-category', {
      params: withCatalogParams(params),
    });
  },

  listEngagers() {
    return apiHandler.get('/alerts/engagers', { params: withCatalogParams() });
  },

  getEngagers(handle, params = {}) {
    const clean = String(handle || '').replace(/^@/, '').trim();
    return apiHandler.get(`/alerts/engagers/${encodeURIComponent(clean)}`, {
      params: withCatalogParams(params),
    });
  },

  analyzeEngagers(handle, body = {}) {
    const clean = String(handle || '').replace(/^@/, '').trim();
    return apiHandler.post(`/alerts/engagers/${encodeURIComponent(clean)}`, withCatalogBody({
      handle: clean,
      ...body,
    }), { params: withCatalogParams() });
  },

  investigate(url) {
    return apiHandler.post('/alerts/investigate', { url });
  },

  translate(text) {
    return apiHandler.post('/alerts/translate', { text });
  },

  similar(text) {
    return apiHandler.post('/alerts/similar', { text });
  },

  listKeywords(params) {
    return apiHandler.get('/alerts/keywords', { params });
  },

  addKeyword(body) {
    return apiHandler.post('/alerts/keywords', body);
  },

  updateKeyword(id, body) {
    return apiHandler.put(`/alerts/keywords/${id}`, body);
  },

  deleteKeyword(id) {
    return apiHandler.delete(`/alerts/keywords/${id}`);
  },
};

export const AlertService = alertsApi;
export default alertsApi;
