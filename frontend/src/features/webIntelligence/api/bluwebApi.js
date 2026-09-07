import api from '../../../api/apiHandler';

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
    // Never surface raw DNS/ORM internals even if the backend forgot to sanitize.
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

      // WI-01: while paused (e.g. left Crawl tab), wait without hitting the API.
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

      // Mild backoff after first couple of polls (WI-01).
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
  search(body, { signal } = {}) {
    return api.post(`${BASE}/api/v1/search`, body, { signal });
  },

  instantSearch(body, { signal } = {}) {
    return api.post(`${BASE}/api/v1/search/instant`, body, { timeout: 60000, signal });
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
