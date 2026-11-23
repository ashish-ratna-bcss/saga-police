import apiHandler from './apiHandler';

export const socialProfilesApi = {
  listPlatforms: (params) => apiHandler.get('/social-profiles/platforms', { params }),
  getPlatform: (id) => apiHandler.get(`/social-profiles/platforms/${id}`),
  getPagePlatformsMapping: () => apiHandler.get('/social-profiles/platforms/page-mapping'),
  createPlatform: (body) => apiHandler.post('/social-profiles/platforms', body),
  updatePlatform: (id, body) => apiHandler.put(`/social-profiles/platforms/${id}`, body),
  deletePlatform: (id) => apiHandler.delete(`/social-profiles/platforms/${id}`),

  list: (params) => apiHandler.get('/social-profiles', { params }),
  get: (id) => apiHandler.get(`/social-profiles/${id}`),
  listPosts: (id, params) => apiHandler.get(`/social-profiles/${id}/posts`, { params }),
  create: (body) => apiHandler.post('/social-profiles', body),
  createBatch: (body) => apiHandler.post('/social-profiles/batch', body),
  update: (id, body) => apiHandler.put(`/social-profiles/${id}`, body),
  remove: (id) => apiHandler.delete(`/social-profiles/${id}`),
  toggleMonitoring: (id) => apiHandler.put(`/social-profiles/${id}/monitoring`),
  getPrerequisites: () => apiHandler.get('/social-profiles/monitoring/prerequisites'),
  startAllMonitoring: (params) =>
    apiHandler.put('/social-profiles/monitoring/start-all', {}, { params }),
  stopAllMonitoring: (params) =>
    apiHandler.put('/social-profiles/monitoring/stop-all', {}, { params }),
  preview: (body) => apiHandler.post('/social-profiles/preview', body),

  // Human behaviour report (AI). GET → saved report | { status: 'running' | 'none' | 'failed' | 'cancelled' }.
  getBehaviorReport: (id) =>
    apiHandler.get(`/social-profiles/${id}/behavior-report`, { params: { _t: Date.now() } }),
  startBehaviorReport: (id) => apiHandler.post(`/social-profiles/${id}/behavior-report`),
  cancelBehaviorReport: (id) => apiHandler.post(`/social-profiles/${id}/behavior-report/cancel`),
  downloadBehaviorReportPdf: (id) =>
    apiHandler.get(`/social-profiles/${id}/behavior-report/report.pdf`, {
      responseType: 'blob',
      timeout: 240000,
    }),
};

export default socialProfilesApi;
