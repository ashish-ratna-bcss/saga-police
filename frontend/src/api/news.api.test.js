import { newsApi } from './news.api';
import apiHandler from './apiHandler';

jest.mock('./apiHandler', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('newsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiHandler.get.mockResolvedValue({ data: { ok: true } });
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

  test('getArticles forwards filters and paging', async () => {
    await newsApi.getArticles({ state: 'Telangana', limit: 20, offset: 40 });
    expect(apiHandler.get).toHaveBeenCalledWith('/news/articles', {
      params: { state: 'Telangana', limit: 20, offset: 40 },
    });
  });

  test('getArticle encodes the id into the path', async () => {
    await newsApi.getArticle('a/b c');
    expect(apiHandler.get).toHaveBeenCalledWith('/news/articles/a%2Fb%20c');
  });

  test('getSaved forwards filters and date range', async () => {
    await newsApi.getSaved({ language: 'Telugu', from: '2026-10-01', limit: 20, offset: 0 });
    expect(apiHandler.get).toHaveBeenCalledWith('/news/saved', {
      params: { language: 'Telugu', from: '2026-10-01', limit: 20, offset: 0 },
    });
  });

  test('searches: list, open and delete', async () => {
    await newsApi.getSearches({ limit: 30 });
    expect(apiHandler.get).toHaveBeenCalledWith('/news/searches', { params: { limit: 30 } });
    await newsApi.getSearchArticles('42', { limit: 20, offset: 20 });
    expect(apiHandler.get).toHaveBeenCalledWith('/news/searches/42/articles', { params: { limit: 20, offset: 20 } });
    await newsApi.deleteSearch('42');
    expect(apiHandler.delete).toHaveBeenCalledWith('/news/searches/42');
  });
});
