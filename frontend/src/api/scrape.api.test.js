import { scrapeApi } from './scrape.api';
import apiHandler from './apiHandler';

jest.mock('./apiHandler', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

describe('scrapeApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiHandler.get.mockResolvedValue({ data: { ok: true } });
  });

  test('getCrawlPages asks for the pages of one crawl', async () => {
    await expect(scrapeApi.getCrawlPages('c1')).resolves.toEqual({ ok: true });
    expect(apiHandler.get).toHaveBeenCalledWith('/scrape/api/v1/crawls/c1/pages');
  });

  test('getDocumentVersion reads the page text of a specific version', async () => {
    await scrapeApi.getDocumentVersion('d1', 3);
    expect(apiHandler.get).toHaveBeenCalledWith('/scrape/api/v1/documents/d1/versions/3');
  });

  test('getEntityDocuments says where an entity appears', async () => {
    await scrapeApi.getEntityDocuments('e1');
    expect(apiHandler.get).toHaveBeenCalledWith('/scrape/api/v1/entities/e1/documents');
  });

  test('getDocuments can be limited to one crawl', async () => {
    await scrapeApi.getDocuments({ crawl_id: 'c1', limit: 200 });
    expect(apiHandler.get).toHaveBeenCalledWith('/scrape/api/v1/documents', { params: { crawl_id: 'c1', limit: 200 } });
  });
});
