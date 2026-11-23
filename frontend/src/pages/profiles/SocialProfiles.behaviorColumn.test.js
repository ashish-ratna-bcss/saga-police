/**
 * Profile Catalog → "Human behaviour" column. The report button is locked until monitoring has collected
 * posts for the profile; a saved report can always be opened.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockApi = { listPlatforms: jest.fn(), list: jest.fn(), getBehaviorReport: jest.fn() };

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/social-profiles', search: '', state: null }),
  useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock('../../api/socialProfiles.api', () => ({
  socialProfilesApi: new Proxy(mockApi, { get: (t, k) => (k in t ? t[k] : (t[k] = jest.fn(async () => ({ data: {} })))) }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../../components/PlatformBrandIcon', () => ({ TelegramBrandLogo: () => null }));
jest.mock('../../components/ui/button', () => ({ Button: ({ children, onClick, disabled, type }) => <button type={type || 'button'} onClick={onClick} disabled={disabled}>{children}</button> }));
jest.mock('../../components/ui/input', () => ({ Input: ({ value, onChange, placeholder, type }) => <input type={type} value={value ?? ''} onChange={onChange || (() => {})} placeholder={placeholder} /> }));
jest.mock('../../components/ui/label', () => ({ Label: ({ children }) => <label>{children}</label> }));
jest.mock('../../components/ui/textarea', () => ({ Textarea: () => <textarea /> }));
jest.mock('../../components/ui/badge', () => ({ Badge: ({ children }) => <span>{children}</span> }));
jest.mock('../../components/ui/switch', () => ({ Switch: () => <input type="checkbox" readOnly /> }));
jest.mock('../../components/ui/progress', () => ({ Progress: () => <div /> }));
jest.mock('../../components/ui/popover', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { Popover: Pass, PopoverContent: () => null, PopoverTrigger: Pass };
});
jest.mock('../../components/ui/dialog', () => {
  const Closed = ({ open, children }) => (open ? <div data-dialog>{children}</div> : null);
  const Pass = ({ children }) => <div>{children}</div>;
  return { Dialog: Closed, DialogContent: Pass, DialogDescription: Pass, DialogFooter: Pass, DialogHeader: Pass, DialogTitle: Pass };
});
jest.mock('../../components/ui/alert-dialog', () => {
  const Closed = ({ open, children }) => (open ? <div>{children}</div> : null);
  const Pass = ({ children }) => <div>{children}</div>;
  return { AlertDialog: Closed, AlertDialogAction: Pass, AlertDialogCancel: Pass, AlertDialogContent: Pass, AlertDialogDescription: Pass, AlertDialogFooter: Pass, AlertDialogHeader: Pass, AlertDialogTitle: Pass };
});
jest.mock('../../components/ui/select', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { Select: Pass, SelectContent: Pass, SelectItem: Pass, SelectTrigger: Pass, SelectValue: () => null };
});

const row = (id, name, extra) => ({
  id, handle: name.toLowerCase(), display_name: name, platform: 'x', platform_name: 'X (Twitter)', data: {},
  poll_interval_minutes: 30, monitoring_status: 'stopped', monitoring_logs: [], last_fetched_history: [], is_active: true,
  posts_stored: 0, behavior_report: null, ...extra,
});

const PROFILES = [
  row(1, 'NotMonitored'),
  row(2, 'WaitingPosts', { monitoring_status: 'started' }),
  row(3, 'HasPosts', { posts_stored: 12 }),
  row(4, 'HasReport', { posts_stored: 30, behavior_report: { generated_at: new Date().toISOString(), attention_level: 'High' } }),
];

const flush = async (n = 8) => { for (let i = 0; i < n; i += 1) { await act(async () => { await Promise.resolve(); }); } };

describe('Profile Catalog: Human behaviour column', () => {
  let container;
  let root;

  const cellOf = (name) => {
    const tr = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent.includes(name));
    return tr.querySelectorAll('td')[6];
  };
  const buttonIn = (td) => td.querySelector('button');

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockApi.listPlatforms.mockResolvedValue({ data: [{ id: 1, slug: 'x', name: 'X (Twitter)', icon: 'Twitter' }] });
    mockApi.list.mockResolvedValue({ data: { profiles: PROFILES, stats: { total: 4, active: 4, paused: 0, byPlatform: {} } } });
    mockApi.getBehaviorReport.mockResolvedValue({ data: { status: 'running', started_at: new Date().toISOString() } });
    container = document.createElement('div');
    document.body.appendChild(container);
    const SocialProfiles = require('./SocialProfiles').default;
    root = createRoot(container);
    await act(async () => { root.render(<SocialProfiles />); });
    for (let i = 0; i < 3; i += 1) { await act(async () => { jest.advanceTimersByTime(400); }); await flush(); }
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
  });

  test('the column sits right after Monitoring', () => {
    const heads = [...container.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    expect(heads.indexOf('Human behaviour')).toBe(heads.indexOf('Monitoring') + 1);
  });

  test('locked until monitoring has collected posts', () => {
    expect(buttonIn(cellOf('NotMonitored')).disabled).toBe(true);
    expect(cellOf('NotMonitored').textContent).toContain('Start monitoring first');
    expect(buttonIn(cellOf('WaitingPosts')).disabled).toBe(true);
    expect(cellOf('WaitingPosts').textContent).toContain('Waiting for first posts');
  });

  test('unlocked once posts exist; a saved report shows its attention level', () => {
    expect(buttonIn(cellOf('HasPosts')).disabled).toBe(false);
    expect(buttonIn(cellOf('HasPosts')).textContent).toContain('Generate report');
    expect(buttonIn(cellOf('HasReport')).disabled).toBe(false);
    expect(buttonIn(cellOf('HasReport')).textContent).toContain('View report');
    expect(cellOf('HasReport').textContent).toContain('High');
  });

  test('clicking Generate report opens the report for that profile', async () => {
    await act(async () => { buttonIn(cellOf('HasPosts')).click(); });
    await flush();
    expect(mockApi.getBehaviorReport).toHaveBeenCalledWith(3);
    expect(container.textContent).toContain('Human behaviour report · HasPosts');
  });

  test('while a monitored profile waits for posts, the list refreshes quietly so the button can unlock', async () => {
    const before = mockApi.list.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(30000); });
    await flush();
    expect(mockApi.list.mock.calls.length).toBeGreaterThan(before);
  });
});
