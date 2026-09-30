import apiHandler from './apiHandler';

export const scrapeApi = {
  // Preflight
  preflight: async (url) => {
    const response = await apiHandler.post('/scrape/api/v1/preflight', { url });
    return response.data;
  },

  // Crawls
  createCrawl: async (data) => {
    // data = { url, max_pages, max_depth, same_domain_only }
    const response = await apiHandler.post('/scrape/api/v1/crawls', data);
    return response.data;
  },
  getCrawls: async (params = {}) => {
    const response = await apiHandler.get('/scrape/api/v1/crawls', { params });
    return response.data;
  },
  getCrawlStatus: async (crawlId) => {
    const response = await apiHandler.get(`/scrape/api/v1/crawls/${crawlId}`);
    return response.data;
  },

  // Search
  instantSearch: async (query) => {
    const response = await apiHandler.post('/scrape/api/v1/search/instant', { query });
    return response.data;
  },

  // Documents
  getDocuments: async (params = {}) => {
    const response = await apiHandler.get('/scrape/api/v1/documents', { params });
    return response.data;
  },

  // Entities
  getEntities: async (params = {}) => {
    const response = await apiHandler.get('/scrape/api/v1/entities', { params });
    return response.data;
  },

  // Sources
  getSources: async (params = {}) => {
    const response = await apiHandler.get('/scrape/api/v1/sources', { params });
    return response.data;
  },
};
