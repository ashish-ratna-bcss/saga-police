import apiHandler from './apiHandler';

export const reportsApi = {
  list: (params) => apiHandler.get('/reports', { params }),
  getById: (id) => apiHandler.get(`/reports/${id}`),
  getStats: () => apiHandler.get('/reports/stats'),
  update: (id, body) => apiHandler.put(`/reports/${id}`, body),
  escalate: (alertId) => apiHandler.post(`/reports/escalate/${alertId}`),
  generateFromTemplate: (templateId, alertId) =>
    apiHandler.post(`/templates/${templateId}/generate/${alertId}`),
  getTemplates: (platform) =>
    apiHandler.get('/templates', { params: { platform } }),
  getUnifiedAnalytics: (params) =>
    apiHandler.get('/analytics/unified-reports', { params }),
  getDial100Incidents: (params) =>
    apiHandler.get('/dial100-incidents', { params }),
  createDial100IncidentBulk: (data) =>
    apiHandler.post('/dial100-incidents/bulk', data),
};

export default reportsApi;
