import apiHandler from './apiHandler';

export const osintApi = {
  search: (body) => apiHandler.post('/osint/search', body),
  getInfrastructureIntel: (params) => apiHandler.get('/osint/infrastructure', { params }),
  phoneLookup: (body) => apiHandler.post('/osint/phone-lookup', body),
  emailLookup: (body) => apiHandler.post('/osint/email-lookup', body),
  askAI: (body) => apiHandler.post('/osint/ai-assistant', body),
  runMasterPrompt: (body) => apiHandler.post('/osint/master-prompt', body),
};

export default osintApi;
