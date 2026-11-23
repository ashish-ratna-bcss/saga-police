/**
 * Tools → Profile Report → Add profile.
 * Fetch resolves the account AND starts collecting its posts; progress is live; Save keeps it; Cancel throws it away.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockApi = { fetchAccount: jest.fn(), get: jest.fn(), save: jest.fn(), discard: jest.fn(), removeDraftAccount: jest.fn() };
jest.mock('../../../api/profileReport.api', () => ({ profileReportApi: mockApi }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../../../components/ui/dialog', () => {
  const Closed = ({ open, children }) => (open ? <div>{children}</div> : null);
  const Pass = ({ children }) => <div>{children}</div>;
  return { Dialog: Closed, DialogContent: Pass, DialogDescription: Pass, DialogFooter: Pass, DialogHeader: Pass, DialogTitle: Pass };
});
jest.mock('../../../components/ui/button', () => ({ Button: ({ children, onClick, disabled, type, title }) => <button type={type || 'button'} onClick={onClick} disabled={disabled} title={title}>{children}</button> }));
jest.mock('../../../components/ui/input', () => ({ Input: ({ value, onChange, placeholder, type, disabled }) => <input type={type} value={value ?? ''} onChange={onChange || (() => {})} placeholder={placeholder} disabled={disabled} /> }));
jest.mock('../../../components/ui/label', () => ({ Label: ({ children }) => <label>{children}</label> }));
jest.mock('../../../components/ui/textarea', () => ({ Textarea: ({ value, onChange, placeholder }) => <textarea value={value ?? ''} onChange={onChange} placeholder={placeholder} /> }));
jest.mock('../../../components/ui/badge', () => ({ Badge: ({ children }) => <span>{children}</span> }));
jest.mock('../../../components/ui/select', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { Select: Pass, SelectContent: Pass, SelectItem: Pass, SelectTrigger: Pass, SelectValue: () => null };
});

const PLATFORMS = [
  { slug: 'x', name: 'X (Twitter)', fields: [{ key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'X username' }] },
  { slug: 'facebook', name: 'Facebook', fields: [{ key: 'url', label: 'Page link', type: 'url', required: true, placeholder: 'Facebook page link' }] },
];

const flush = async (n = 6) => { for (let i = 0; i < n; i += 1) { await act(async () => { await Promise.resolve(); }); } };
const typeInto = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('Add profile (Profile Report)', () => {
  let container;
  let root;
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  const text = () => container.textContent;
  const button = (name) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === name);

  const open = async (props = {}) => {
    const AddProfileDialog = require('./AddProfileDialog').default;
    root = createRoot(container);
    await act(async () => { root.render(<AddProfileDialog open onOpenChange={onOpenChange} platforms={PLATFORMS} subject={null} onSaved={onSaved} {...props} />); });
    await flush();
  };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockApi.discard.mockResolvedValue({ data: { ok: true } });
    mockApi.removeDraftAccount.mockResolvedValue({ data: { ok: true } });
    mockApi.fetchAccount.mockResolvedValue({
      data: {
        subject_id: 11, account_id: 7, fetch_status: 'pending',
        preview: { name: 'Babulal Marandi', followers: 120000 },
        preview_data: { fetched_at: '2026-11-23T10:00:00Z', summary: { name: 'Babulal Marandi' } },
        data_patch: { username: 'yourBabulal', user_id: '99' },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
  });

  test('it is the same form as Profiles → Add profile, without a poll interval', async () => {
    await open();
    expect(text()).toContain('Add profile');
    expect(text()).toContain('Platforms');
    expect(text()).toContain('Add platform');
    expect(text()).toContain('Needs fetch');
    expect(text()).not.toMatch(/\bPoll\b/);
    expect(button('Save').disabled).toBe(true);
    expect(text()).toContain('Fetch all platforms to enable Save');
  });

  test('Fetch resolves the account, starts collecting its posts and fills in the name', async () => {
    await open();
    await typeInto(container.querySelector('input[placeholder="X username"]'), 'yourBabulal');
    await act(async () => { button('Fetch').click(); });
    await flush();
    expect(mockApi.fetchAccount).toHaveBeenCalledWith({ subject_id: undefined, platform: 'x', data: { username: 'yourBabulal' } });
    expect(text()).toContain('Verified');
    expect(text()).toContain('Collecting every post');
    expect(container.querySelector('input[placeholder="e.g. Babulal Marandi"]').value).toBe('Babulal Marandi');
    expect(button('Save').disabled).toBe(false);
  });

  test('progress is live: posts so far, then done', async () => {
    await open();
    await typeInto(container.querySelector('input[placeholder="X username"]'), 'yourBabulal');
    await act(async () => { button('Fetch').click(); });
    await flush();

    mockApi.get.mockResolvedValueOnce({ data: { accounts: [{ id: 7, fetch_status: 'running', posts_fetched: 1240, fetch_pages: 31, fetch_error: null }] } });
    await act(async () => { jest.advanceTimersByTime(3100); });
    await flush();
    expect(mockApi.get).toHaveBeenCalledWith(11);
    expect(text()).toContain('1,240');
    expect(text()).toContain('so far');

    mockApi.get.mockResolvedValue({ data: { accounts: [{ id: 7, fetch_status: 'done', posts_fetched: 5210, fetch_pages: 131, fetch_error: null }] } });
    await act(async () => { jest.advanceTimersByTime(3100); });
    await flush();
    expect(text()).toContain('5,210');
    expect(text()).toContain('posts collected');
    const callsWhenDone = mockApi.get.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(mockApi.get.mock.calls.length).toBe(callsWhenDone);   // nothing left to follow: polling stops
  });

  test('a collection that stopped says so in plain words and Fetch continues it', async () => {
    await open();
    await typeInto(container.querySelector('input[placeholder="X username"]'), 'yourBabulal');
    await act(async () => { button('Fetch').click(); });
    await flush();
    mockApi.get.mockResolvedValue({ data: { accounts: [{ id: 7, fetch_status: 'failed', posts_fetched: 300, fetch_pages: 8, fetch_error: 'The platform stopped returning posts. 300 posts were saved; Retry continues from there.' }] } });
    await act(async () => { jest.advanceTimersByTime(3100); });
    await flush();
    expect(text()).toContain('The platform stopped returning posts');
    expect(text()).toContain('Press Fetch to continue');
  });

  test('Save names the profile, keeps the fetched accounts and does not discard them afterwards', async () => {
    mockApi.save.mockResolvedValue({ data: { id: 11, display_name: 'Babulal' } });
    await open();
    await typeInto(container.querySelector('input[placeholder="X username"]'), 'yourBabulal');
    await act(async () => { button('Fetch').click(); });
    await flush();
    await typeInto(container.querySelector('input[placeholder="e.g. Babulal Marandi"]'), 'Babulal');
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(mockApi.save).toHaveBeenCalledWith(11, { display_name: 'Babulal', notes: '', account_ids: [7] });
    expect(onSaved).toHaveBeenCalledWith({ id: 11, display_name: 'Babulal' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockApi.discard).not.toHaveBeenCalled();
  });

  test('Cancel after a Fetch throws away what was fetched', async () => {
    await open();
    await typeInto(container.querySelector('input[placeholder="X username"]'), 'yourBabulal');
    await act(async () => { button('Fetch').click(); });
    await flush();
    await act(async () => { button('Cancel').click(); });
    expect(mockApi.discard).toHaveBeenCalledWith(11);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('Cancel before any Fetch has nothing to discard', async () => {
    await open();
    await act(async () => { button('Cancel').click(); });
    expect(mockApi.discard).not.toHaveBeenCalled();
  });

  test('a second platform is fetched into the same draft profile', async () => {
    await open();
    await typeInto(container.querySelector('input[placeholder="X username"]'), 'yourBabulal');
    await act(async () => { button('Fetch').click(); });
    await flush();
    await act(async () => { button('Add platform').click(); });
    await typeInto(container.querySelector('input[placeholder="Facebook page link"]'), 'https://facebook.com/babulal');
    mockApi.fetchAccount.mockResolvedValueOnce({ data: { subject_id: 11, account_id: 8, fetch_status: 'pending', preview: { name: 'Babulal page' }, preview_data: { fetched_at: 'now' }, data_patch: { page_id: '5' } } });
    const fetches = [...container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Fetch');
    await act(async () => { fetches[fetches.length - 1].click(); });
    await flush();
    expect(mockApi.fetchAccount).toHaveBeenLastCalledWith({ subject_id: 11, platform: 'facebook', data: { url: 'https://facebook.com/babulal' } });
  });

  test('editing a saved profile shows its accounts verified and read-only', async () => {
    const subject = {
      id: 5, display_name: 'Saved Person', notes: 'n',
      accounts: [{ id: 3, platform: 'x', handle: 'saved', is_draft: false, fetch_status: 'done', posts_fetched: 900, fetch_pages: 23, data: { username: 'saved' }, preview: { name: 'Saved Person' } }],
    };
    await open({ subject });
    expect(text()).toContain('Edit profile');
    expect(text()).toContain('Verified');
    expect(text()).toContain('900');
    expect(text()).toContain('posts collected');
    expect(container.querySelector('input[placeholder="X username"]').disabled).toBe(true);
    expect(button('Fetch').disabled).toBe(true);
    expect(button('Save').disabled).toBe(false);
  });
});
