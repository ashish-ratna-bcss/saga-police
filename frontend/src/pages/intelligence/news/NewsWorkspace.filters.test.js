/**
 * Changing a filter re-reads the saved articles for the current search at once, so the
 * list never shows results for other filters than the ones selected.
 * Run: CI=true npx react-scripts test --watchAll=false src/pages/intelligence/news
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import NewsWorkspace from './NewsWorkspace';
import { newsApi } from '../../../api';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../../../api', () => ({
  newsApi: {
    health: jest.fn(),
    getSources: jest.fn(),
    getArticles: jest.fn(),
    collect: jest.fn(),
    getSearches: jest.fn(),
    getArticle: jest.fn(),
    deleteSearch: jest.fn(),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_PAGE = { count: 0, limit: 20, offset: 0, articles: [], query_terms: [], query_phrases: [] };
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const type = async (el, value) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const lastArticlesCall = () => newsApi.getArticles.mock.calls.at(-1)[0];

let container;
let root;

beforeEach(async () => {
  jest.clearAllMocks();
  newsApi.health.mockResolvedValue({ status: 'ok' });
  newsApi.getSources.mockResolvedValue([]);
  newsApi.getSearches.mockResolvedValue({ items: [], count: 0 });
  newsApi.getArticles.mockResolvedValue(EMPTY_PAGE);
  newsApi.collect.mockResolvedValue({ new: 0, fetched: 0, pending_sources: 0, search_id: '7', collected_at: new Date().toISOString() });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<NewsWorkspace />); });
  await settle();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

const field = (selector) => container.querySelector(selector);
const buttonByText = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

test('a location typed after a search filters that search, from the database only', async () => {
  await type(field('textarea[aria-label="Keyword or keyword list"]'), 'student protest, teacher protest');
  await act(async () => { buttonByText('Search news').click(); });
  await settle(50);
  expect(lastArticlesCall()).toMatchObject({ keyword: 'student protest, teacher protest', limit: 20, offset: 0 });
  expect(newsApi.collect).toHaveBeenCalledTimes(1);

  const before = newsApi.getArticles.mock.calls.length;
  await type(field('input[placeholder="Location"]'), 'Bhubaneswar');
  expect(newsApi.getArticles).toHaveBeenCalledTimes(before); // not yet: waits for a pause in typing
  await settle(700);

  expect(lastArticlesCall()).toMatchObject({ keyword: 'student protest, teacher protest', location: 'Bhubaneswar', offset: 0 });
  expect(newsApi.collect).toHaveBeenCalledTimes(1); // the filter did not fetch from the news sites
});

test('a date filter applies at once and keeps the other filters', async () => {
  await type(field('input[placeholder="Location"]'), 'Odisha');
  await settle(700);
  const [from, to] = container.querySelectorAll('input[type="date"]');

  await type(from, '2026-10-01');
  expect(lastArticlesCall()).toMatchObject({ location: 'Odisha', from: '2026-10-01' });
  await type(to, '2026-10-08');
  expect(lastArticlesCall()).toMatchObject({ location: 'Odisha', from: '2026-10-01', to: '2026-10-08' });
  expect(newsApi.collect).not.toHaveBeenCalled();
});

test('Clear shows every saved article again', async () => {
  await type(field('input[placeholder="Location"]'), 'Odisha');
  await settle(700);
  expect(lastArticlesCall().location).toBe('Odisha');

  await act(async () => { buttonByText('Clear').click(); });
  await settle();
  expect(lastArticlesCall()).toEqual({ limit: 20, offset: 0 });
  expect(field('input[placeholder="Location"]').value).toBe('');
});

test('pressing Search news before the typing pause does not query a second time', async () => {
  await type(field('input[placeholder="Location"]'), 'Odisha');
  await act(async () => { buttonByText('Search news').click(); });
  await settle(50);
  const afterSearch = newsApi.getArticles.mock.calls.length;
  await settle(700); // the typing pause ends: nothing left to apply
  expect(newsApi.getArticles).toHaveBeenCalledTimes(afterSearch);
  expect(newsApi.collect).toHaveBeenCalledTimes(1);
});
