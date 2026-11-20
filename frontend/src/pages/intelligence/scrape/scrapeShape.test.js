import {
  crawlStats, crawlProgress, formatBytes, formatDuration, prettyLabel, pathOf,
  normalizePages, normalizeDocuments, entitiesForCrawl, groupByType, entitiesByDocument,
} from './scrapeShape';
import {
  crawl, pages, documents, entities, entityDocuments, DOC_A, DOC_B, ENT_ORG, ENT_PHONE, ENT_ELSEWHERE,
} from './scrapeFixtures';

describe('crawlStats', () => {
  test('reads the counters the API really sends (this was showing 0 pages)', () => {
    expect(crawlStats(crawl)).toMatchObject({
      pagesFetched: 10, pagesExtracted: 6, pagesFailed: 1, linksFound: 606, pagesAttempted: 11,
      bytes: 1442125, newDocuments: 0, updatedDocuments: 6,
    });
    expect(crawlStats(crawl).durationMs).toBeGreaterThan(67000);
  });

  test('older field names still work, and missing data is zero not NaN', () => {
    expect(crawlStats({ pages_crawled: 4, error_count: 2 })).toMatchObject({ pagesFetched: 4, pagesFailed: 2 });
    expect(crawlStats(null)).toMatchObject({ pagesFetched: 0, pagesFailed: 0, linksFound: 0, bytes: 0 });
    expect(crawlStats({ statistics: { pages_fetched: 'abc' } }).pagesFetched).toBe(0);
  });

  test('progress is capped below 100 while running and uses the larger of fetched/attempted', () => {
    expect(crawlProgress({ statistics: { pages_fetched: 3, pages_attempted: 5 } }, 10)).toBe(50);
    expect(crawlProgress({ statistics: { pages_fetched: 50 } }, 10)).toBe(99);
    expect(crawlProgress(null, undefined)).toBe(0);
  });
});

describe('formatting', () => {
  test('bytes and duration are readable', () => {
    expect(formatBytes(1442125)).toBe('1.4 MB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(12)).toBe('12 B');
    expect(formatDuration(67338)).toBe('1m 07s');
    expect(formatDuration(4200)).toBe('4s');
    expect(formatDuration(300)).toBe('<1s');
  });

  test('labels and paths', () => {
    expect(prettyLabel('NEWS_ARTICLE')).toBe('news article');
    expect(pathOf('https://example.com/our-team/?x=1')).toBe('/our-team/?x=1');
    expect(pathOf('not a url')).toBe('not a url');
  });
});

describe('normalizing records', () => {
  test('pages keep the failure reason', () => {
    const rows = normalizePages(pages);
    expect(rows[0]).toMatchObject({ url: 'https://example.com/our-team/', status: 'fetched', method: 'browser', http: 200, error: null });
    expect(rows[2]).toMatchObject({ status: 'failed', http: 404, error: 'Not found' });
    expect(normalizePages(null)).toEqual([]);
  });

  test('documents get a readable title, type and version to load text from', () => {
    const [a, b] = normalizeDocuments(documents);
    expect(a).toMatchObject({ id: DOC_A, title: 'Our Directors | Example Corp', pageType: 'news article', version: 2, confidence: 0.66 });
    expect(b).toMatchObject({ id: DOC_B, pageType: 'generic', author: null, version: 1 });
    expect(normalizeDocuments([{ document_id: 'z', url: 'https://example.com/x' }])[0].title).toBe('https://example.com/x');
  });
});

describe('entities for a crawl', () => {
  const docs = normalizeDocuments(documents);
  const links = new Map(Object.values(entityDocuments).map((e) => [e.entity_id, e.document_ids]));

  test('keeps only entities that appear on this crawl\'s pages', () => {
    const list = entitiesForCrawl(entities, links, docs);
    expect(list.map((e) => e.name).sort()).toEqual(['(0651)221196', 'Example Corp']);
    expect(list.find((e) => e.id === ENT_ELSEWHERE)).toBeUndefined();
    expect(list.find((e) => e.id === ENT_ORG).documentIds.sort()).toEqual([DOC_A, DOC_B].sort());
  });

  test('a document\'s own entity_ids are honoured too', () => {
    const withOwn = normalizeDocuments([{ ...documents[0], entity_ids: [ENT_PHONE] }]);
    const list = entitiesForCrawl(entities, new Map(), withOwn);
    expect(list.map((e) => e.id)).toEqual([ENT_PHONE]);
  });

  test('groups by kind, biggest group first, and maps back to each page', () => {
    const list = entitiesForCrawl(entities, links, docs);
    const groups = groupByType(list);
    expect(groups.map((g) => g.type)).toEqual(['organization', 'phone']);
    const byDoc = entitiesByDocument(list);
    expect(byDoc.get(DOC_A).map((e) => e.name)).toEqual(['Example Corp']);
    expect(byDoc.get(DOC_B).map((e) => e.name).sort()).toEqual(['(0651)221196', 'Example Corp']);
  });

  test('empty input is fine', () => {
    expect(entitiesForCrawl(null, new Map(), [])).toEqual([]);
    expect(groupByType([])).toEqual([]);
  });
});
