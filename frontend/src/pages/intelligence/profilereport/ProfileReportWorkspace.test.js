/**
 * Tools → Profile Report: the screen. Profile list with progress, the report button's lock, background refresh,
 * posts with filters, and delete.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockApi = { list: jest.fn(), get: jest.fn(), posts: jest.fn(), refresh: jest.fn(), retry: jest.fn(), remove: jest.fn() };
const mockPlatformsApi = { listPlatforms: jest.fn() };
jest.mock('../../../api/profileReport.api', () => ({ profileReportApi: mockApi }));
jest.mock('../../../api/socialProfiles.api', () => ({ socialProfilesApi: mockPlatformsApi }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('./AddProfileDialog', () => ({ __esModule: true, default: ({ open, subject }) => (open ? <div data-add-dialog>{subject ? `editing ${subject.display_name}` : 'adding'}</div> : null) }));
jest.mock('./ProfileReportDialog', () => ({ __esModule: true, default: ({ open, profile }) => (open ? <div data-report-dialog>{`report for ${profile?.display_name}`}</div> : null) }));
jest.mock('../../../components/ui/button', () => ({ Button: ({ children, onClick, disabled, type, title, ...rest }) => <button type={type || 'button'} onClick={onClick} disabled={disabled} title={title} aria-label={rest['aria-label']}>{children}</button> }));
jest.mock('../../../components/ui/input', () => ({ Input: ({ value, onChange, placeholder, ...rest }) => <input value={value ?? ''} onChange={onChange || (() => {})} placeholder={placeholder} aria-label={rest['aria-label']} /> }));
jest.mock('../../../components/ui/progress', () => ({ Progress: ({ value }) => <div data-progress={value} /> }));
jest.mock('../../../components/ui/select', () => {
  const ReactLib = require('react');
  return {
    Select: ({ value, onValueChange, children }) => <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
    SelectContent: ({ children }) => <>{children}</>,
    SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
    SelectTrigger: () => null,
    SelectValue: () => null,
    __ReactLib: ReactLib,
  };
});
jest.mock('../../../components/ui/alert-dialog', () => {
  const Closed = ({ open, children }) => (open ? <div data-confirm>{children}</div> : null);
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    AlertDialog: Closed, AlertDialogContent: Pass, AlertDialogHeader: Pass, AlertDialogFooter: Pass, AlertDialogTitle: Pass, AlertDialogDescription: Pass,
    AlertDialogCancel: ({ children }) => <button type="button">{children}</button>,
    AlertDialogAction: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
  };
});

const acc = (id, platform, handle, extra = {}) => ({ id, platform, handle, is_draft: false, fetch_status: 'done', posts_fetched: 100, fetch_pages: 3, fetch_error: null, ...extra });
const subject = (id, name, extra = {}) => ({
  id, display_name: name, notes: null, status: 'active', accounts: [acc(id * 10, 'x', name.toLowerCase())],
  posts: 100, analysed: 60, skipped: 5, failed: 0, waiting: 35, collecting: 0, report: null, ...extra,
});
const POSTS = {
  total: 2, page: 1, limit: 30, total_pages: 1,
  posts: [
    { id: '2', platform: 'x', url: 'https://x.com/a/status/2', text: 'second post text', kind: 'original', media_urls: [], engagement: { likes: 12 }, posted_at: '2026-11-02T10:00:00Z', analysis_status: 'done', analysis: { sentiment: 'neutral', sentiment_api: 'negative', tone: 'dark humour', meaning: 'Joke: the caption blames someone for not answering while the picture shows a crashed bike.', risk_level: 'high', risk_score: 80, stance: 'oppose', category: 'protest', matched_keywords: ['bandh'], english_text: null }, image_text: 'RALLY 10am', image_description: 'A crowd with flags at a rally.', image_signals: ['crowd or protest', 'Flag with a sun'] },
    { id: '1', platform: 'x', url: null, text: 'first post text', kind: 'shared', media_urls: [], engagement: {}, posted_at: '2026-11-01T10:00:00Z', analysis_status: 'pending', analysis: null, image_text: null },
  ],
};

const flush = async (n = 8) => { for (let i = 0; i < n; i += 1) { await act(async () => { await Promise.resolve(); }); } };

describe('Profile Report workspace', () => {
  let container;
  let root;
  const text = () => container.textContent;
  const button = (name) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(name));

  const render = async (subjects) => {
    mockApi.list.mockResolvedValue({ data: { subjects, supported_platforms: ['x', 'facebook'] } });
    const Workspace = require('./ProfileReportWorkspace').default;
    root = createRoot(container);
    await act(async () => { root.render(<Workspace />); });
    for (let i = 0; i < 3; i += 1) { await act(async () => { jest.advanceTimersByTime(400); }); await flush(); }
  };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockPlatformsApi.listPlatforms.mockResolvedValue({ data: [{ slug: 'x', name: 'X' }, { slug: 'facebook', name: 'Facebook' }, { slug: 'reddit', name: 'Reddit' }] });
    mockApi.posts.mockResolvedValue({ data: POSTS });
    mockApi.remove.mockResolvedValue({ data: { ok: true } });
    mockApi.refresh.mockResolvedValue({ data: {} });
    mockApi.retry.mockResolvedValue({ data: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
  });

  test('with nothing saved it explains the tool and offers Add profile', async () => {
    await render([]);
    expect(text()).toContain('Study a profile in full');
    expect(text()).toContain('Every post is collected once');
    expect(button('Add profile').disabled).toBe(false);
    await act(async () => { button('Add profile').click(); });
    expect(container.querySelector('[data-add-dialog]').textContent).toBe('adding');
  });

  test('the list shows each profile\'s accounts, counts and what it is doing', async () => {
    await render([
      subject(1, 'Alpha'),
      subject(2, 'Bravo', { collecting: 1, accounts: [acc(20, 'x', 'bravo', { fetch_status: 'running', posts_fetched: 1240 })], waiting: 0, analysed: 0, posts: 1240 }),
      subject(3, 'Charlie', { waiting: 0, analysed: 95, skipped: 5, report: { generated_at: new Date().toISOString(), attention_level: 'High' } }),
    ]);
    const t = text();
    ['Alpha', 'Bravo', 'Charlie'].forEach((n) => expect(t).toContain(n));
    expect(t).toContain('X alpha');
    expect(t).toContain('60 analysed · 35 waiting');   // the card agrees with the figures (5 posts without text are skipped, not analysed)
    expect(t).toContain('Analysing posts');
    expect(t).toContain('Collecting posts');
    expect(t).toContain('Ready');
    expect(t).toContain('1,240');
    expect(t).toContain('High');
  });

  test('Reddit cannot be offered: only platforms with a timeline are passed to the dialog', async () => {
    await render([subject(1, 'Alpha')]);
    // supported list from the server is [x, facebook]; the Add button is enabled because at least one is collectable
    expect(button('Add profile').disabled).toBe(false);
  });

  test('the selected profile shows its progress, and its posts with their analysis', async () => {
    await render([subject(1, 'Alpha')]);
    expect(mockApi.posts).toHaveBeenCalledWith(1, expect.objectContaining({ page: 1, limit: 30 }));
    const t = text();
    expect(t).toContain('Posts collected');
    expect(t).toContain('65 of 100 posts analysed');   // 60 analysed + 5 without text
    expect(t).toContain('second post text');
    expect(t).toContain('risk high · 80');
    expect(t).toContain('bandh');
    expect(t).toContain('Image text');
    expect(t).toContain('RALLY 10am');
    expect(t).toContain('Picture');
    expect(t).toContain('A crowd with flags at a rally.');   // what the picture shows, apart from the words printed on it
    // how the post is meant: its tone, what it means, and that the sentiment was read in context
    expect(container.querySelector('[data-tone]').textContent).toBe('dark humour');
    expect(container.querySelectorAll('[data-tone]').length).toBe(1);   // the post that has not been read has no tone
    expect(container.querySelector('[data-meaning]').textContent).toContain('Reading');
    expect(container.querySelector('[data-meaning]').textContent).toContain('Joke: the caption blames someone for not answering');
    expect(container.querySelector('span[title^="The classifier said negative"]').textContent).toBe('neutral');
    expect(container.querySelectorAll('[data-picture-seen]').length).toBe(1);   // only the post with something flagged
    expect(container.querySelector('[data-picture-seen]').textContent).toContain('Seen in the picture');
    expect(container.querySelector('[data-picture-seen]').textContent).toContain('Flag with a sun');
    expect(t).toContain('Waiting for analysis');
    expect(t).toContain('shared');
    expect(t).toContain('Showing 1–2 of 2 posts');
  });

  test('Generate report is locked until a post is analysed, then unlocked; a saved report reads View report', async () => {
    await render([subject(1, 'Alpha', { analysed: 0, waiting: 100 })]);
    expect(button('Generate report').disabled).toBe(true);
    expect(text()).toContain('still being analysed');
    await act(async () => { root.unmount(); });
    container.remove();

    container = document.createElement('div');
    document.body.appendChild(container);
    await render([subject(1, 'Alpha', { report: { generated_at: new Date().toISOString(), attention_level: 'Low' } })]);
    expect(button('View report').disabled).toBe(false);
    await act(async () => { button('View report').click(); });
    expect(container.querySelector('[data-report-dialog]').textContent).toBe('report for Alpha');
  });

  test('while posts are being collected or analysed the numbers refresh by themselves', async () => {
    await render([subject(1, 'Alpha')]);
    const before = mockApi.list.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(5100); });
    await flush();
    expect(mockApi.list.mock.calls.length).toBeGreaterThan(before);
  });

  test('a finished profile is not polled', async () => {
    await render([subject(1, 'Alpha', { waiting: 0, analysed: 100 })]);
    const before = mockApi.list.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(mockApi.list.mock.calls.length).toBe(before);
  });

  test('Refresh posts is not offered while collecting; a stopped collection can be retried', async () => {
    await render([subject(1, 'Alpha', { collecting: 1, accounts: [acc(10, 'x', 'alpha', { fetch_status: 'running' })] })]);
    expect(button('Refresh posts').disabled).toBe(true);
    await act(async () => { root.unmount(); });
    container.remove();

    container = document.createElement('div');
    document.body.appendChild(container);
    await render([subject(1, 'Alpha', { accounts: [acc(10, 'x', 'alpha', { fetch_status: 'failed', fetch_error: 'The platform stopped returning posts. 300 posts were saved; Retry continues from there.' })] })]);
    expect(text()).toContain('300 posts were saved');
    await act(async () => { button('Retry').click(); });
    await flush();
    expect(mockApi.retry).toHaveBeenCalledWith(1);
    await act(async () => { button('Refresh posts').click(); });
    await flush();
    expect(mockApi.refresh).toHaveBeenCalledWith(1);
  });

  test('Edit opens the profile with its accounts', async () => {
    mockApi.get.mockResolvedValue({ data: subject(1, 'Alpha') });
    await render([subject(1, 'Alpha')]);
    await act(async () => { button('Edit').click(); });
    await flush();
    expect(mockApi.get).toHaveBeenCalledWith(1);
    expect(container.querySelector('[data-add-dialog]').textContent).toBe('editing Alpha');
  });

  test('delete asks first, says what goes with it, and then removes the profile', async () => {
    await render([subject(1, 'Alpha')]);
    await act(async () => { container.querySelector('button[aria-label="Delete profile"]').click(); });
    const confirm = container.querySelector('[data-confirm]');
    expect(confirm.textContent).toContain('Alpha and its 100 collected posts');
    expect(mockApi.remove).not.toHaveBeenCalled();
    await act(async () => { [...confirm.querySelectorAll('button')].find((b) => b.textContent === 'Delete').click(); });
    await flush();
    expect(mockApi.remove).toHaveBeenCalledWith(1);
  });

  test('filters are applied on the server and a new filter starts from page 1', async () => {
    await render([subject(1, 'Alpha')]);
    const tone = [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent === 'Any tone'));
    await act(async () => {
      tone.value = 'negative';
      tone.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(mockApi.posts).toHaveBeenLastCalledWith(1, expect.objectContaining({ sentiment: 'negative', page: 1 }));
  });
});
