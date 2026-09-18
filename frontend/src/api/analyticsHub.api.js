import apiHandler from './apiHandler';

export const analyticsHubApi = {
  overview: (params) => apiHandler.get('/analytics-hub/overview', { params }),
  events: (params) => apiHandler.get('/analytics-hub/events', { params }),
  eventDetails: (eventId, params) => apiHandler.get(`/analytics-hub/events/${eventId}/details`, { params }),
  alerts: (params) => apiHandler.get('/analytics-hub/alerts', { params }),
  grievances: (params) => apiHandler.get('/analytics-hub/grievances', { params }),
  profiles: (params) => apiHandler.get('/analytics-hub/profiles', { params }),
};

export default analyticsHubApi;
