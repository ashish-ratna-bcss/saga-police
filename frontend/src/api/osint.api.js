import apiHandler from './apiHandler';

/** UI investigation kinds → OSINT API mode enum (quick | standard | deep). */
const INVESTIGATION_MODE = {
  general: 'standard',
  quick: 'quick',
  standard: 'standard',
  deep: 'deep',
};

export const osintApi = {
  // Investigations — API expects { input_identifier, mode?, identifier_type?, analyst_notes? }
  createInvestigation: async (data = {}) => {
    const {
      target,
      investigation_type,
      input_identifier,
      mode,
      identifier_type,
      analyst_notes,
    } = data;
    const body = {
      input_identifier: input_identifier || target,
      mode: mode || INVESTIGATION_MODE[investigation_type] || investigation_type || 'standard',
    };
    if (identifier_type) body.identifier_type = identifier_type;
    if (analyst_notes != null && analyst_notes !== '') body.analyst_notes = analyst_notes;
    const response = await apiHandler.post('/osint/api/v1/investigations', body);
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
