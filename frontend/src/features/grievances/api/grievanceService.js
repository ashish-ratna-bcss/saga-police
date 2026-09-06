import api from '../../../lib/api';

const withCatalogParams = (params = {}) => ({
  store: 'catalog',
  ...params,
});

export const GrievanceService = {
  list(params = {}, config = {}) {
    return api.get('/grievances', { params: withCatalogParams(params), ...config });
  },

  getStats(params = {}) {
    return api.get('/grievances/stats', { params: withCatalogParams(params) });
  },

  listSources(params = {}) {
    return api.get('/grievances/sources', { params: withCatalogParams(params) });
  },

  addSource(body = {}) {
    return api.post('/grievances/sources', body, { params: withCatalogParams() });
  },

  deleteSource(id) {
    return api.delete(`/grievances/sources/${id}`, { params: withCatalogParams() });
  },

  fetchSource(id, body = {}) {
    return api.post(`/grievances/sources/${id}/fetch`, withCatalogParams(body), {
      params: withCatalogParams(),
    });
  },

  fetchAll(body = {}) {
    return api.post('/grievances/fetch-all', withCatalogParams(body), {
      params: withCatalogParams(),
    });
  },
};

export default GrievanceService;
