import apiHandler from './apiHandler';

export const eventsApi = {
  list: (params) => apiHandler.get('/events', { params }),
  getById: (id) => apiHandler.get(`/events/${id}`),
  create: (body) => apiHandler.post('/events', body),
  update: (id, body) => apiHandler.put(`/events/${id}`, body),
  delete: (id) => apiHandler.delete(`/events/${id}`),
  getDashboard: (id) => apiHandler.get(`/events/${id}/dashboard`),
  getContent: (id, params) => apiHandler.get(`/events/${id}/content`, { params }),
  getReport: () => apiHandler.get('/events/report'),
  generateKeywords: (body, config) => apiHandler.post('/events/generate-keywords', body, config),
  /** Proxies Event-Hashtag-Generator POST /event-terms (hashtags + keywords) */
  generateEventTerms: (body, config) =>
    apiHandler.post('/events/generate-event-terms', body, { timeout: 120000, ...config }),
  getOccasionCalendar: (params) => apiHandler.get('/occasion-calendar', { params }),
  getDailyProgrammes: (params) => apiHandler.get('/daily-programmes', { params }),
  createDailyProgrammesBulk: (body) => apiHandler.post('/daily-programmes/bulk', body),
};

export default eventsApi;
