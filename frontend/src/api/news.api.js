import apiHandler from './apiHandler';

// Blura News API via BluGate (backend /api/news → gateway news-api).
// Multi-select filters are comma-separated strings: values within one filter are ORed,
// different filters are ANDed.
export const newsApi = {
  health: async () => {
    const response = await apiHandler.get('/news/health');
    return response.data;
  },

  // params = { country?, state?, language?, source? } → Source[]
  getSources: async (params = {}) => {
    const response = await apiHandler.get('/news/sources', { params });
    return response.data;
  },

  // params = { keyword?, country?, language?, location?, state?, district?, source?, limit?, offset?, search_id? }
  // → { count, limit, offset, articles[], saved: { search_id, stored } | null }.
  // A cold search can take 60–90 s (live scraping). Results are also stored in the
  // tenant's own DB; pass search_id back when paging so pages join the same search.
  getArticles: async (params = {}) => {
    const response = await apiHandler.get('/news/articles', { params });
    return response.data;
  },

  // Live copy while upstream still caches it (~10 min), else the tenant's stored copy.
  getArticle: async (articleId) => {
    const response = await apiHandler.get(`/news/articles/${encodeURIComponent(articleId)}`);
    return response.data;
  },

  // Tenant archive: params = article filters + { from?, to? (YYYY-MM-DD), limit?, offset? }
  // → { count, limit, offset, articles[] } (without full text).
  getSaved: async (params = {}) => {
    const response = await apiHandler.get('/news/saved', { params });
    return response.data;
  },

  // Searches run in this tenant → { count, limit, offset, items[] }
  getSearches: async (params = {}) => {
    const response = await apiHandler.get('/news/searches', { params });
    return response.data;
  },

  // Articles a stored search returned → { search, count, limit, offset, articles[] }
  getSearchArticles: async (searchId, params = {}) => {
    const response = await apiHandler.get(`/news/searches/${encodeURIComponent(searchId)}/articles`, { params });
    return response.data;
  },

  // Own searches only; the articles stay saved.
  deleteSearch: async (searchId) => {
    await apiHandler.delete(`/news/searches/${encodeURIComponent(searchId)}`);
  },
};
