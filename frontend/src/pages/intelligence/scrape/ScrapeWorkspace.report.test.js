/**
 * Renders the real Scrape page with a finished crawl and API responses shaped like the live API,
 * then checks what the analyst actually sees: the numbers, the collected pages, their text and the
 * entities found on them.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CRAWL_ID, DOC_A, DOC_B, crawl, pages, documents, entities, entityDocuments, versions,
} from './scrapeFixtures';

jest.mock('../../../api', () => ({
  scrapeApi: {
    createCrawl: jest.fn(), preflight: jest.fn(), instantSearch: jest.fn(), getCrawls: jest.fn(),
    getCrawlStatus: jest.fn(), getCrawlPages: jest.fn(), getDocuments: jest.fn(), getDocumentVersion: jest.fn(),
    getEntities: jest.fn(), getEntityDocuments: jest.fn(), getSources: jest.fn(),
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../../components/ui/button', () => ({ Button: ({ children, onClick, disabled, type }) => <button type={type} onClick={onClick} disabled={disabled}>{children}</button> }));
jest.mock('../../../components/ui/input', () => ({ Input: ({ value, onChange, placeholder }) => <input value={value} onChange={onChange} placeholder={placeholder} /> }));
jest.mock('../../../components/ui/badge', () => ({ Badge: ({ children }) => <span>{children}</span> }));
jest.mock('../../../components/ui/checkbox', () => ({ Checkbox: () => <input type="checkbox" readOnly /> }));
jest.mock('../../../components/ui/sheet', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { Sheet: Pass, SheetContent: Pass, SheetHeader: Pass, SheetTitle: Pass, SheetDescription: Pass };
});
jest.mock('../../../components/ui/table', () => {
  const mk = (T) => ({ children }) => <T>{children}</T>;
  return { Table: mk('table'), TableHeader: mk('thead'), TableBody: mk('tbody'), TableRow: mk('tr'), TableHead: mk('th'), TableCell: mk('td') };
});

const { scrapeApi } = require('../../../api');

const flush = async (n = 12) => { for (let i = 0; i < n; i += 1) { await act(async () => { await Promise.resolve(); }); } };

describe('Scrape page: a finished crawl', () => {
  let container;
  let root;

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    localStorage.setItem('scrape_runs_v1', JSON.stringify([{
      id: CRAWL_ID, kind: 'crawl', status: 'completed', target: 'example.com', ts: Date.now(),
      options: { max_pages: 10, max_depth: 2, same_domain_only: true }, result: null,
    }]));
    jest.clearAllMocks();
    scrapeApi.getCrawlStatus.mockResolvedValue(crawl);
    scrapeApi.getCrawlPages.mockResolvedValue(pages);
    scrapeApi.getDocuments.mockResolvedValue(documents);
    scrapeApi.getEntities.mockResolvedValue(entities);
    scrapeApi.getEntityDocuments.mockImplementation(async (id) => entityDocuments[id]);
    scrapeApi.getDocumentVersion.mockImplementation(async (id, v) => versions[`${id}:${v}`]);

    const ScrapeWorkspace = require('./ScrapeWorkspace').default;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<ScrapeWorkspace />); });
    await flush();
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  const text = () => container.textContent;

  test('asks the API for this crawl\'s pages and documents', () => {
    expect(scrapeApi.getCrawlStatus).toHaveBeenCalledWith(CRAWL_ID);
    expect(scrapeApi.getCrawlPages).toHaveBeenCalledWith(CRAWL_ID);
    expect(scrapeApi.getDocuments).toHaveBeenCalledWith({ crawl_id: CRAWL_ID, limit: 200 });
  });

  test('shows the real numbers instead of zeros', () => {
    expect(text()).toMatch(/Pages fetched\s*10/);
    expect(text()).toMatch(/Pages extracted\s*6/);
    expect(text()).toMatch(/Failed\s*1/);
    expect(text()).toMatch(/Links found\s*606/);
    expect(text()).toContain('1.4 MB');
    expect(text()).toContain('1m 07s');
  });

  test('lists what was collected, with page type', () => {
    expect(text()).toContain('What was collected');
    expect(text()).toContain('Our Directors | Example Corp');
    expect(text()).toContain('About Us | Example Corp');
    expect(text()).toContain('news article');
  });

  test('shows the people/organisations found, only those on this crawl\'s pages', () => {
    expect(text()).toContain('Found on these pages');
    expect(text()).toContain('Example Corp');
    expect(text()).toContain('(0651)221196');
    expect(text()).not.toContain('Seen On Another Site Ltd');
    // Each page lists its own entities.
    const cards = [...container.querySelectorAll('details')];
    expect(cards).toHaveLength(2);
    expect(cards[1].textContent).toContain('(0651)221196'); // About Us page has the phone number
    expect(cards[0].textContent).not.toContain('(0651)221196');
  });

  test('opening a page loads and shows its text, once', async () => {
    const card = container.querySelectorAll('details')[0];
    await act(async () => { card.open = true; card.dispatchEvent(new Event('toggle')); });
    await flush();
    expect(scrapeApi.getDocumentVersion).toHaveBeenCalledWith(DOC_A, 2);
    expect(card.textContent).toContain('Our directors are visionary leaders');

    await act(async () => { card.dispatchEvent(new Event('toggle')); });
    await flush();
    expect(scrapeApi.getDocumentVersion).toHaveBeenCalledTimes(1);
  });

  test('a page with no extracted text says so', async () => {
    const card = container.querySelectorAll('details')[1];
    await act(async () => { card.open = true; card.dispatchEvent(new Event('toggle')); });
    await flush();
    expect(scrapeApi.getDocumentVersion).toHaveBeenCalledWith(DOC_B, 1);
    expect(card.textContent).toContain('No text was extracted from this page.');
  });

  test('Pages visited lists every URL, the failure reason, and never links a non-http URL', async () => {
    const tab = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Pages visited');
    await act(async () => { tab.click(); });
    await flush();
    expect(text()).toContain('/our-team/');
    expect(text()).toContain('Not found');
    expect(text()).toContain('blocked scheme');
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://example.com/our-team/');
    expect(hrefs.some((h) => /^javascript:/i.test(h))).toBe(false);
  });

  test('a crawl that collected nothing explains where to look', async () => {
    jest.clearAllMocks();
    scrapeApi.getCrawlStatus.mockResolvedValue({ ...crawl, statistics: { ...crawl.statistics, pages_fetched: 0, pages_extracted: 0 } });
    scrapeApi.getCrawlPages.mockResolvedValue([]);
    scrapeApi.getDocuments.mockResolvedValue([]);
    await act(async () => { root.unmount(); });
    const ScrapeWorkspace = require('./ScrapeWorkspace').default;
    root = createRoot(container);
    await act(async () => { root.render(<ScrapeWorkspace />); });
    await flush();
    expect(text()).toContain('finished without collecting any page');
  });
});
