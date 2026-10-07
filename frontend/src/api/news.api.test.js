import { newsApi } from './news.api';
import apiHandler from './apiHandler';

jest.mock('./apiHandler', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('newsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiHandler.get.mockResolvedValue({ data: { ok: true } });
    apiHandler.post.mockResolvedValue({ data: { ok: true } });
  });

  test('health hits /news/health', async () => {
    await expect(newsApi.health()).resolves.toEqual({ ok: true });
    expect(apiHandler.get).toHaveBeenCalledWith('/news/health');
  });

  test('getSources forwards filters as params', async () => {
    await newsApi.getSources({ country: 'India', language: 'Telugu' });
    expect(apiHandler.get).toHaveBeenCalledWith('/news/sources', {
      params: { country: 'India', language: 'Telugu' },
    });
  });

  test('getArticles reads saved articles with every filter', async () => {
    const params = { keyword: 'textbook errors, NYCS', min_match: 2, state: 'Odisha', from: '2026-10-01', limit: 20, offset: 40 };
    await newsApi.getArticles(params);
    expect(apiHandler.get).toHaveBeenCalledWith('/news/articles', { params });
  });

  test('collect posts the search filters', async () => {
    await newsApi.collect({ keyword: 'NYCS', state: 'Odisha', search_id: '7' });
    expect(apiHandler.post).toHaveBeenCalledWith('/news/collect', { keyword: 'NYCS', state: 'Odisha', search_id: '7' });
  });

  test('getArticle encodes the id into the path', async () => {
    await newsApi.getArticle('a/b c');
    expect(apiHandler.get).toHaveBeenCalledWith('/news/articles/a%2Fb%20c');
  });

  test('searches: list and delete', async () => {
    await newsApi.getSearches({ limit: 30 });
    expect(apiHandler.get).toHaveBeenCalledWith('/news/searches', { params: { limit: 30 } });
    await newsApi.deleteSearch('42');
    expect(apiHandler.delete).toHaveBeenCalledWith('/news/searches/42');
  });
});
