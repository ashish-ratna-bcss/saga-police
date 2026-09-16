import apiHandler from './apiHandler';

export const periscopeApi = {
  getByDate: (date) => apiHandler.get('/periscope/by-date', { params: { date } }),
  getFeed: (params) => apiHandler.get('/periscope/feed', { params }),
  save: (data) => apiHandler.post('/periscope/save', data),

  saveReport: (data) => apiHandler.post('/periscope/save', data),
  list: (params) => apiHandler.get('/periscope/list', { params }),
  uploadDocx: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiHandler.post('/periscope/upload-docx', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  parseDocx: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiHandler.post('/periscope/upload-docx', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  exportDocx: async (reportData) => {
    const response = await apiHandler.post('/periscope/export-docx', reportData, {
      responseType: 'blob',
    });
    return response;
  },
  importEvents: (date) => apiHandler.get('/periscope/import-events', { params: { date } }),
  delete: (id) => apiHandler.delete(`/periscope/${id}`),
};

export default periscopeApi;
