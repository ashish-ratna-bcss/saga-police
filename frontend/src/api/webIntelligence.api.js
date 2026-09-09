import apiHandler from './apiHandler';

const BASE = '/web-intelligence';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SAFE_MESSAGES = {
  URL_INVALID: 'Enter a valid http(s) URL.',
  DNS_RESOLUTION_FAILED: 'Could not resolve that hostname.',
  URL_BLOCKED: 'That URL is not allowed.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
  DOMAIN_STATS_INCONSISTENT: 'Crawl failed due to an internal data inconsistency.',
};

export const formatBluwebError = (error) => {
  const data = error?.response?.data;
  const requestId =
    error?.response?.headers?.['x-request-id'] ||
    data?.error?.request_id ||
    null;

  if (data?.error) {
    const code = data.error.code;
    const msg =
      SAFE_MESSAGES[code] ||
      data.error.message ||
      code ||
      'Request failed';
    const looksTechnical =
      /Do53|Multiple rows were found|Traceback|sqlalchemy|dnspython/i.test(String(msg));
    const safe = looksTechnical
      ? SAFE_MESSAGES[code] || 'Request failed. Please try again.'
      : msg;
    return requestId ? `${safe} (request_id: ${requestId})` : safe;
  }

  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((d) => d.msg || JSON.stringify(d))
      .join('; ');
  }

  if (typeof data?.detail === 'string') return data.detail;
  if (data?.message) return data.message;
  if (error?.code === 'ABORTED' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
    return '';
  }
  return error?.message || 'Request failed';
};

export const webIntelligenceApi = {
  health() {
    return apiHandler.get(`${BASE}/health`);
  },

  healthReady() {
    return apiHandler.get(`${BASE}/health/ready`);
  },

  // Preflight
  createPreflight(body) {
    return apiHandler.post(`${BASE}/api/v1/preflight`, body, { timeout: 120000 });
  },

  getPreflight(preflightId) {
    return apiHandler.get(`${BASE}/api/v1/preflight/${preflightId}`);
  },

  // Crawls
  createCrawl(body) {
    return apiHandler.post(`${BASE}/api/v1/crawls`, body);
  },

  listCrawls() {
    return apiHandler.get(`${BASE}/api/v1/crawls`);
  },

  getCrawl(crawlId) {
    return apiHandler.get(`${BASE}/api/v1/crawls/${crawlId}`);
  },

  getCrawlPages(crawlId) {
    return apiHandler.get(`${BASE}/api/v1/crawls/${crawlId}/pages`);
  },

  cancelCrawl(crawlId) {
    return apiHandler.post(`${BASE}/api/v1/crawls/${crawlId}/cancel`);
  },

  async pollCrawl(crawlId, { signal, onUpdate, maxMs = 10 * 60 * 1000, pausedRef } = {}) {
    const started = Date.now();
    let delay = 1500;
    let polls = 0;

    while (true) {
      if (signal?.aborted) {
        const err = new Error('Polling cancelled');
        err.code = 'ABORTED';
        throw err;
      }

      while (pausedRef?.current) {
        if (signal?.aborted) {
          const err = new Error('Polling cancelled');
          err.code = 'ABORTED';
          throw err;
        }
        await sleep(500);
      }

      const { data } = await this.getCrawl(crawlId);
      if (onUpdate) onUpdate(data);
      polls += 1;

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

      if (polls >= 2) {
        delay = Math.min(3000, Math.max(delay, 2000));
      }
      if (Date.now() - started > 30_000) {
        delay = Math.min(5000, delay + 500);
      }

      await sleep(delay);
    }
  },

  // Documents
  listDocuments(params) {
    return apiHandler.get(`${BASE}/api/v1/documents`, { params });
  },

  getDocument(documentId) {
    return apiHandler.get(`${BASE}/api/v1/documents/${documentId}`);
  },

  getDocumentChanges(documentId, params) {
    return apiHandler.get(`${BASE}/api/v1/documents/${documentId}/changes`, { params });
  },

  getDocumentVersions(documentId) {
    return apiHandler.get(`${BASE}/api/v1/documents/${documentId}/versions`);
  },

  getDocumentVersion(documentId, versionNumber) {
    return apiHandler.get(`${BASE}/api/v1/documents/${documentId}/versions/${versionNumber}`);
  },

  getDocumentDiff(documentId, params) {
    return apiHandler.get(`${BASE}/api/v1/documents/${documentId}/diff`, { params });
  },

  // Sources
  createSource(body) {
    return apiHandler.post(`${BASE}/api/v1/sources`, body);
  },

  listSources() {
    return apiHandler.get(`${BASE}/api/v1/sources`);
  },

  getSource(sourceId) {
    return apiHandler.get(`${BASE}/api/v1/sources/${sourceId}`);
  },

  updateSource(sourceId, body) {
    return apiHandler.patch(`${BASE}/api/v1/sources/${sourceId}`, body);
  },

  deleteSource(sourceId) {
    return apiHandler.delete(`${BASE}/api/v1/sources/${sourceId}`);
  },

  startSource(sourceId) {
    return apiHandler.post(`${BASE}/api/v1/sources/${sourceId}/start`);
  },

  pauseSource(sourceId) {
    return apiHandler.post(`${BASE}/api/v1/sources/${sourceId}/pause`);
  },

  getSourceEvents(sourceId) {
    return apiHandler.get(`${BASE}/api/v1/sources/${sourceId}/events`);
  },

  getSourceStatistics(sourceId) {
    return apiHandler.get(`${BASE}/api/v1/sources/${sourceId}/statistics`);
  },

  // Search
  search(body, { signal } = {}) {
    return apiHandler.post(`${BASE}/api/v1/search`, body, { signal });
  },

  instantSearch(body, { signal } = {}) {
    return apiHandler.post(`${BASE}/api/v1/search/instant`, body, { timeout: 60000, signal });
  },

  // Domains
  getDomainProfile(domain) {
    return apiHandler.get(`${BASE}/api/v1/domains/${encodeURIComponent(domain)}/profile`);
  },

  getDomainCapabilities(domain) {
    return apiHandler.get(`${BASE}/api/v1/domains/${encodeURIComponent(domain)}/capabilities`);
  },

  // Intelligence
  listEntities(params) {
    return apiHandler.get(`${BASE}/api/v1/entities`, { params });
  },

  getEntity(entityId) {
    return apiHandler.get(`${BASE}/api/v1/entities/${entityId}`);
  },

  getEntityDocuments(entityId) {
    return apiHandler.get(`${BASE}/api/v1/entities/${entityId}/documents`);
  },

  getEntityStories(entityId) {
    return apiHandler.get(`${BASE}/api/v1/entities/${entityId}/stories`);
  },

  listStories(params) {
    return apiHandler.get(`${BASE}/api/v1/stories`, { params });
  },

  getStory(storyId) {
    return apiHandler.get(`${BASE}/api/v1/stories/${storyId}`);
  },

  getStoryDocuments(storyId) {
    return apiHandler.get(`${BASE}/api/v1/stories/${storyId}/documents`);
  },

  getStoryEntities(storyId) {
    return apiHandler.get(`${BASE}/api/v1/stories/${storyId}/entities`);
  },

  getStorySources(storyId) {
    return apiHandler.get(`${BASE}/api/v1/stories/${storyId}/sources`);
  },

  getStoryTimeline(storyId) {
    return apiHandler.get(`${BASE}/api/v1/stories/${storyId}/timeline`);
  },
};

export const bluwebApi = webIntelligenceApi;
export default webIntelligenceApi;
