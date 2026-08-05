/**
 * Alerts HTTP API — single place for /alerts* contracts.
 * Methods return the raw Axios response (same as direct api.* calls).
 * Do not reshape payloads here — behaviour parity with legacy call sites.
 */
import api from '@/lib/api';

export const AlertService = {
  list(params, config = {}) {
    return api.get('/alerts', { params, ...config });
  },

  getById(id) {
    return api.get(`/alerts/${id}`);
  },

  update(id, body) {
    return api.put(`/alerts/${id}`, body);
  },

  changeCategory(id, category) {
    return api.put(`/alerts/${id}/change-category`, { category });
  },

  getSummary() {
    return api.get('/alerts/summary');
  },

  getStats(params) {
    return api.get('/alerts/stats', { params });
  },

  getUnread() {
    return api.get('/alerts/unread');
  },

  markAllRead() {
    return api.put('/alerts/read');
  },

  getWorkflowKpi(params, config = {}) {
    return api.get('/alerts/workflow-kpi', { params, ...config });
  },

  getDashboardStats() {
    return api.get('/alerts/dashboard-stats');
  },

  bulk(ids) {
    return api.post('/alerts/bulk', { ids });
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
};

export default AlertService;
