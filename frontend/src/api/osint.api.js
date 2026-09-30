import apiHandler from './apiHandler';

export const osintApi = {
  // Investigations
  createInvestigation: async (data) => {
    // data = { target: string, investigation_type: string, ... }
    const response = await apiHandler.post('/osint/api/v1/investigations', data);
    return response.data;
  },
  getInvestigationStatus: async (id) => {
    const response = await apiHandler.get(`/osint/api/v1/investigations/${id}/status`);
    return response.data;
  },
  getInvestigation: async (id) => {
    const response = await apiHandler.get(`/osint/api/v1/investigations/${id}`);
    return response.data;
  },

  // Lookups
  lookupPhone: async (phone) => {
    const response = await apiHandler.post('/osint/api/v1/phone/lookup', { phone });
    return response.data;
  },
  lookupEmail: async (email) => {
    const response = await apiHandler.post('/osint/api/v1/email/lookup', { email });
    return response.data;
  },
  lookupUsername: async (username) => {
    const response = await apiHandler.post('/osint/api/v1/username/lookup', { username });
    return response.data;
  },
};
