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
  // Every page the crawl visited: { url, depth, status, fetch_strategy, http_status, document_id, error }
  getCrawlPages: async (crawlId) => {
    const response = await apiHandler.get(`/scrape/api/v1/crawls/${crawlId}/pages`);
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

  // One version of a document; `content` is the extracted page text.
  getDocumentVersion: async (documentId, version) => {
    const response = await apiHandler.get(`/scrape/api/v1/documents/${documentId}/versions/${version}`);
    return response.data;
  },

  // Entities
  getEntities: async (params = {}) => {
    const response = await apiHandler.get('/scrape/api/v1/entities', { params });
    return response.data;
  },
  // Which documents an entity appears in: { entity_id, document_ids }
  getEntityDocuments: async (entityId) => {
    const response = await apiHandler.get(`/scrape/api/v1/entities/${entityId}/documents`);
    return response.data;
  },

  // Sources
  getSources: async (params = {}) => {
    const response = await apiHandler.get('/scrape/api/v1/sources', { params });
    return response.data;
  },
};
