import apiHandler from './apiHandler';
import { BACKEND_URL } from '../lib/backendUrl';

/**
 * Tools → E-Paper. All calls go through the Sockeye backend proxy
 * (`/api/epaper/*` → EPAPER_URL).
 */
export const epaperApi = {
  health: async () => (await apiHandler.get('/epaper/api/health')).data,
  papers: async () => (await apiHandler.get('/epaper/api/papers')).data,
  beats: async () => (await apiHandler.get('/epaper/api/beats')).data,
  corpus: async () => (await apiHandler.get('/epaper/api/corpus')).data,

  editions: async (host) =>
    (await apiHandler.get('/epaper/api/editions', { params: { host } })).data,

  dates: async (host, titleId) =>
    (await apiHandler.get('/epaper/api/dates', {
      params: { host, title_id: titleId },
    })).data,

  search: async (params = {}) =>
    (await apiHandler.get('/epaper/api/search', { params })).data,

  browse: async (params = {}) =>
    (await apiHandler.get('/epaper/api/browse', { params })).data,

  facets: async (params = {}) =>
    (await apiHandler.get('/epaper/api/facets', { params })).data,

  archiveDates: async () =>
    (await apiHandler.get('/epaper/api/corpus/dates')).data,

  categories: async () =>
    (await apiHandler.get('/epaper/api/categories')).data,

  headings: async () =>
    (await apiHandler.get('/epaper/api/categories/headings')).data,

  mergeCategories: async (payload) =>
    (await apiHandler.post('/epaper/api/categories/merge', payload)).data,

  daily: async (date) =>
    (await apiHandler.get('/epaper/api/daily', {
      params: date ? { date } : {},
    })).data,

  collectNow: async (date) =>
    (await apiHandler.post(
      `/epaper/api/daily/collect${date ? `?date=${encodeURIComponent(date)}` : ''}`
    )).data,

  sources: async () => (await apiHandler.get('/epaper/api/sources')).data,

  addSource: async (payload) =>
    (await apiHandler.post('/epaper/api/sources', payload)).data,

  deleteSource: async (id) =>
    (await apiHandler.delete(`/epaper/api/sources/${encodeURIComponent(id)}`)).data,

  setSchedule: async (enabled, at) =>
    (await apiHandler.post('/epaper/api/daily/schedule', { enabled, at })).data,

  jobs: async (limit = 30, kind) =>
    (await apiHandler.get('/epaper/api/jobs', {
      params: { limit, ...(kind ? { kind } : {}) },
    })).data,

  job: async (id) =>
    (await apiHandler.get(`/epaper/api/jobs/${encodeURIComponent(id)}`)).data,

  deleteJob: async (id) =>
    (await apiHandler.delete(`/epaper/api/jobs/${encodeURIComponent(id)}`)).data,

  fetchPage: async (payload) =>
    (await apiHandler.post('/epaper/api/jobs/fetch', payload)).data,

  ingestEdition: async (payload) =>
    (await apiHandler.post('/epaper/api/jobs/ingest', payload)).data,

  topicSearch: async (payload) =>
    (await apiHandler.post('/epaper/api/jobs/topic', payload)).data,

  uploadPage: async (file, withText = true) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('with_text', withText ? '1' : '0');
    return (await apiHandler.post('/epaper/api/jobs/upload', fd)).data;
  },

  /** Posts saved in this tenant's database. */
  posts: async (params = {}) =>
    (await apiHandler.get('/epaper/posts', { params })).data,

  /** Fetch posts from the service for these filters, save them all, return them. */
  fetchPosts: async (payload) =>
    (await apiHandler.post('/epaper/posts/fetch', payload, { timeout: 180000 })).data,

  /** Start reading a page / range / whole paper from the catalogue. Returns { job_id, kind }. */
  extractPosts: async (payload) =>
    (await apiHandler.post('/epaper/posts/extract', payload)).data,

  /** Progress; once finished the posts are saved and returned in `results`. */
  extractStatus: async (jobId, params = {}) =>
    (await apiHandler.get(`/epaper/posts/extract/${encodeURIComponent(jobId)}`, { params })).data,

  categoryTree: async () =>
    (await apiHandler.get('/epaper/api/categories/tree')).data,

  article: async (uid) =>
    (await apiHandler.get(`/epaper/api/article/${encodeURIComponent(uid)}`)).data,

  /** Whole article → English translation + short summary (backend LLM). */
  translateArticle: async (text, lang) =>
    (await apiHandler.post('/translate/article', { text, lang })).data,

  mediaUrl: (jobId, name) =>
    `${BACKEND_URL}/api/epaper/api/media/${encodeURIComponent(jobId)}/${encodeURIComponent(name)}`,
};
