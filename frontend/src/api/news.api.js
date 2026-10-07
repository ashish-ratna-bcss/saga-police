import apiHandler from './apiHandler';

// Tools → News. The page shows the tenant's own saved articles (database); a live
// fetch from the news API (via BluGate) only adds to them.
// Keyword: one phrase, or a list of phrases separated by commas / new lines.
// Facet filters are comma-separated strings: values within one filter are ORed,
// different filters are ANDed.
export const newsApi = {
  health: async () => {
    const response = await apiHandler.get('/news/health');
    return response.data;
  },

  // params = { country?, state?, language?, source? } → Source[] (live registry)
  getSources: async (params = {}) => {
    const response = await apiHandler.get('/news/sources', { params });
    return response.data;
  },

  // Saved articles with filters — what the page shows.
  // params = { keyword?, min_match?, country?, language?, state?, source?, location?, from?, to?, limit?, offset? }
  // → { count, limit, offset, articles[], query_terms, query_phrases }
  getArticles: async (params = {}) => {
    const response = await apiHandler.get('/news/articles', { params });
    return response.data;
  },

  // Fetch the latest matching articles from news sites and save them (up to ~30 s).
  // body = the search's filters (+ search_id to update that history entry)
  // → { search_id, fetched, new, live_count, pending_sources }
  collect: async (body = {}) => {
    const response = await apiHandler.post('/news/collect', body);
    return response.data;
  },

  // One article with full text (saved copy, else live).
  getArticle: async (articleId) => {
    const response = await apiHandler.get(`/news/articles/${encodeURIComponent(articleId)}`);
    return response.data;
  },

  // Searches run in this workspace → { count, limit, offset, items[] }
  getSearches: async (params = {}) => {
    const response = await apiHandler.get('/news/searches', { params });
    return response.data;
  },

  // Own searches only; the articles stay saved.
  deleteSearch: async (searchId) => {
    await apiHandler.delete(`/news/searches/${encodeURIComponent(searchId)}`);
  },
};
