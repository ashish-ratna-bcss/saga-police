import apiHandler from './apiHandler';

const withCatalogParams = (params = {}) => ({
  store: 'catalog',
  ...params,
});

export const grievancesApi = {
  list(params = {}, config = {}) {
    return apiHandler.get('/grievances', { params: withCatalogParams(params), ...config });
  },

  getStats(params = {}) {
    return apiHandler.get('/grievances/stats', { params: withCatalogParams(params) });
  },

  listSources(params = {}) {
    return apiHandler.get('/grievances/sources', { params: withCatalogParams(params) });
  },

  addSource(body = {}) {
    return apiHandler.post('/grievances/sources', body, { params: withCatalogParams() });
  },

  deleteSource(id) {
    return apiHandler.delete(`/grievances/sources/${id}`, { params: withCatalogParams() });
  },

  fetchSource(id, body = {}) {
    return apiHandler.post(`/grievances/sources/${id}/fetch`, withCatalogParams(body), {
      params: withCatalogParams(),
    });
  },

  fetchAll(body = {}) {
    return apiHandler.post('/grievances/fetch-all', withCatalogParams(body), {
      params: withCatalogParams(),
    });
  },
};

export const GrievanceService = grievancesApi;
export default grievancesApi;
