import apiHandler from './apiHandler';

/**
 * Tools → Profile Report.
 *   Add profile: fetchAccount per platform (resolves it AND starts collecting every post), then save or discard.
 *   Report: same shape as the event report: get → saved | { status: 'running' | 'none' | 'failed' | 'cancelled' }.
 */
export const profileReportApi = {
  list: (params) => apiHandler.get('/profile-report/subjects', { params }),
  get: (id) => apiHandler.get(`/profile-report/subjects/${id}`),
  remove: (id) => apiHandler.delete(`/profile-report/subjects/${id}`),

  // Add / Edit dialog
  fetchAccount: (body) => apiHandler.post('/profile-report/accounts/fetch', body),
  removeDraftAccount: (accountId) => apiHandler.delete(`/profile-report/accounts/${accountId}`),
  save: (id, body) => apiHandler.post(`/profile-report/subjects/${id}/save`, body),
  discard: (id) => apiHandler.post(`/profile-report/subjects/${id}/discard`),

  // Posts and collection
  posts: (id, params) => apiHandler.get(`/profile-report/subjects/${id}/posts`, { params }),
  refresh: (id) => apiHandler.post(`/profile-report/subjects/${id}/refresh`),
  retry: (id) => apiHandler.post(`/profile-report/subjects/${id}/retry`),

  // AI report
  getReport: (id) => apiHandler.get(`/profile-report/subjects/${id}/report`, { params: { _t: Date.now() } }),
  startReport: (id) => apiHandler.post(`/profile-report/subjects/${id}/report`),
  cancelReport: (id) => apiHandler.post(`/profile-report/subjects/${id}/report/cancel`),
  // evidence: true = the full report (every cited post listed and linked), false = the executive summary without the post list
  downloadReportPdf: (id, { evidence = true } = {}) =>
    apiHandler.get(`/profile-report/subjects/${id}/report/pdf`, {
      params: { include_evidence: evidence ? 'true' : 'false' },
      responseType: 'blob',
      timeout: 240000,
    }),
};

export default profileReportApi;
