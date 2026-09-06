import api from '../../../api/apiHandler';

const BASE = '/web-intelligence';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const formatBluwebError = (error) => {
  const data = error?.response?.data;
  const requestId =
    error?.response?.headers?.['x-request-id'] ||
    data?.error?.request_id ||
    null;

  if (data?.error) {
    const msg = data.error.message || data.error.code || 'Request failed';
    return requestId ? `${msg} (request_id: ${requestId})` : msg;
  }

  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((d) => d.msg || JSON.stringify(d))
      .join('; ');
  }

  if (typeof data?.detail === 'string') return data.detail;
  if (data?.message) return data.message;
  return error?.message || 'Request failed';
};

export const bluwebApi = {
  health() {
    return api.get(`${BASE}/health`);
  },

  healthReady() {
    return api.get(`${BASE}/health/ready`);
  },

  // Preflight
  createPreflight(body) {
    return api.post(`${BASE}/api/v1/preflight`, body, { timeout: 120000 });
  },

  getPreflight(preflightId) {
    return api.get(`${BASE}/api/v1/preflight/${preflightId}`);
  },

  // Crawls
  createCrawl(body) {
    return api.post(`${BASE}/api/v1/crawls`, body);
  },

  listCrawls() {
    return api.get(`${BASE}/api/v1/crawls`);
  },

  getCrawl(crawlId) {
    return api.get(`${BASE}/api/v1/crawls/${crawlId}`);
  },

  getCrawlPages(crawlId) {
    return api.get(`${BASE}/api/v1/crawls/${crawlId}/pages`);
  },

  cancelCrawl(crawlId) {
    return api.post(`${BASE}/api/v1/crawls/${crawlId}/cancel`);
  },

  /**
   * Poll crawl until terminal status.
   * @returns {Promise<object>} final crawl job
   */
  async pollCrawl(crawlId, { signal, onUpdate, maxMs = 10 * 60 * 1000 } = {}) {
    const started = Date.now();
    let delay = 1500;

    while (true) {
      if (signal?.aborted) {
        const err = new Error('Polling cancelled');
        err.code = 'ABORTED';
        throw err;
      }

      const { data } = await this.getCrawl(crawlId);
      if (onUpdate) onUpdate(data);

      const status = String(data?.status || '').toLowerCase();
      if (['completed', 'failed', 'cancelled'].includes(status)) {
        return data;
      }

      if (Date.now() - started > maxMs) {
        const err = new Error('Crawl poll timed out');
        err.code = 'POLL_TIMEOUT';
        err.crawl = data;
        throw err;
      }

      await sleep(delay);
      if (Date.now() - started > 30_000) {
        delay = Math.min(5000, delay + 500);
      }
    }
  },

  // Documents
  listDocuments(params) {
    return api.get(`${BASE}/api/v1/documents`, { params });
  },

  getDocument(documentId) {
    return api.get(`${BASE}/api/v1/documents/${documentId}`);
  },

  getDocumentChanges(documentId, params) {
    return api.get(`${BASE}/api/v1/documents/${documentId}/changes`, { params });
  },

  getDocumentVersions(documentId) {
    return api.get(`${BASE}/api/v1/documents/${documentId}/versions`);
  },

  getDocumentVersion(documentId, versionNumber) {
    return api.get(`${BASE}/api/v1/documents/${documentId}/versions/${versionNumber}`);
  },

  getDocumentDiff(documentId, params) {
    return api.get(`${BASE}/api/v1/documents/${documentId}/diff`, { params });
  },

  // Sources
  createSource(body) {
    return api.post(`${BASE}/api/v1/sources`, body);
  },

  listSources() {
    return api.get(`${BASE}/api/v1/sources`);
  },

  getSource(sourceId) {
    return api.get(`${BASE}/api/v1/sources/${sourceId}`);
  },

  updateSource(sourceId, body) {
    return api.patch(`${BASE}/api/v1/sources/${sourceId}`, body);
  },

  deleteSource(sourceId) {
    return api.delete(`${BASE}/api/v1/sources/${sourceId}`);
  },

  startSource(sourceId) {
    return api.post(`${BASE}/api/v1/sources/${sourceId}/start`);
  },

  pauseSource(sourceId) {
    return api.post(`${BASE}/api/v1/sources/${sourceId}/pause`);
  },

  getSourceEvents(sourceId) {
    return api.get(`${BASE}/api/v1/sources/${sourceId}/events`);
  },

  getSourceStatistics(sourceId) {
    return api.get(`${BASE}/api/v1/sources/${sourceId}/statistics`);
  },

  // Search
  search(body) {
    return api.post(`${BASE}/api/v1/search`, body);
  },

  instantSearch(body) {
    return api.post(`${BASE}/api/v1/search/instant`, body, { timeout: 60000 });
  },

  // Domains
  getDomainProfile(domain) {
    return api.get(`${BASE}/api/v1/domains/${encodeURIComponent(domain)}/profile`);
  },

  getDomainCapabilities(domain) {
    return api.get(`${BASE}/api/v1/domains/${encodeURIComponent(domain)}/capabilities`);
  },

  // Intelligence
  listEntities(params) {
    return api.get(`${BASE}/api/v1/entities`, { params });
  },

  getEntity(entityId) {
    return api.get(`${BASE}/api/v1/entities/${entityId}`);
  },

  getEntityDocuments(entityId) {
    return api.get(`${BASE}/api/v1/entities/${entityId}/documents`);
  },

  getEntityStories(entityId) {
    return api.get(`${BASE}/api/v1/entities/${entityId}/stories`);
  },

  listStories(params) {
    return api.get(`${BASE}/api/v1/stories`, { params });
  },

  getStory(storyId) {
    return api.get(`${BASE}/api/v1/stories/${storyId}`);
  },

  getStoryDocuments(storyId) {
    return api.get(`${BASE}/api/v1/stories/${storyId}/documents`);
  },

  getStoryEntities(storyId) {
    return api.get(`${BASE}/api/v1/stories/${storyId}/entities`);
  },

  getStorySources(storyId) {
    return api.get(`${BASE}/api/v1/stories/${storyId}/sources`);
  },

  getStoryTimeline(storyId) {
    return api.get(`${BASE}/api/v1/stories/${storyId}/timeline`);
  },
};

export default bluwebApi;
