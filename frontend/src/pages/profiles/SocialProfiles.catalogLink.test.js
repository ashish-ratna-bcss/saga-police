/**
 * "View catalog" on the dashboard's Platform Ingestion Share opens /social-profiles?platform=<slug>.
 * Opens the real catalog page the way each link would and checks which tab is active, what is in the
 * search box and what was asked of the API.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

let mockSearch = '';
const mockApi = { listPlatforms: jest.fn(), list: jest.fn() };

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/social-profiles', search: mockSearch, state: null }),
  useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock('../../api/socialProfiles.api', () => ({
  socialProfilesApi: new Proxy(mockApi, { get: (t, k) => (k in t ? t[k] : (t[k] = jest.fn(async () => ({ data: {} })))) }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../components/PlatformBrandIcon', () => ({ TelegramBrandLogo: () => null }));
jest.mock('../../components/ui/button', () => ({ Button: ({ children, onClick, disabled, type }) => <button type={type || 'button'} onClick={onClick} disabled={disabled}>{children}</button> }));
jest.mock('../../components/ui/input', () => ({ Input: ({ value, onChange, placeholder, type }) => <input type={type} value={value ?? ''} onChange={onChange || (() => {})} placeholder={placeholder} /> }));
jest.mock('../../components/ui/label', () => ({ Label: ({ children }) => <label>{children}</label> }));
jest.mock('../../components/ui/textarea', () => ({ Textarea: () => <textarea /> }));
jest.mock('../../components/ui/badge', () => ({ Badge: ({ children }) => <span>{children}</span> }));
jest.mock('../../components/ui/switch', () => ({ Switch: () => <input type="checkbox" readOnly /> }));
jest.mock('../../components/ui/popover', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return { Popover: Pass, PopoverContent: () => null, PopoverTrigger: Pass };
});
jest.mock('../../components/ui/dialog', () => {
  const Closed = ({ open, children }) => (open ? <div>{children}</div> : null);
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

const PLATFORMS = [
  { id: 1, slug: 'x', name: 'X (Twitter)', icon: 'Twitter' },
  { id: 2, slug: 'youtube', name: 'YouTube', icon: 'Youtube' },
  { id: 3, slug: 'facebook', name: 'Facebook', icon: 'Facebook' },
];

const flush = async (n = 8) => { for (let i = 0; i < n; i += 1) { await act(async () => { await Promise.resolve(); }); } };

describe('Profile Catalog opened from a link', () => {
  let container;
  let root;

  const open = async (search) => {
    mockSearch = search;
    const SocialProfiles = require('./SocialProfiles').default;
    root = createRoot(container);
    await act(async () => { root.render(<SocialProfiles />); });
    // The page loads platforms, then profiles on a short timer; give it a few rounds to settle.
    for (let i = 0; i < 3; i += 1) { await act(async () => { jest.advanceTimersByTime(400); }); await flush(); }
  };
  const tab = (name) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(name));
  const isActive = (name) => tab(name).className.includes('bg-foreground');
  const askedFor = () => mockApi.list.mock.calls.map(([params]) => params || {});

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockApi.listPlatforms.mockResolvedValue({ data: PLATFORMS });
    mockApi.list.mockResolvedValue({ data: { profiles: [], stats: { total: 0, active: 0, paused: 0, byPlatform: {} } } });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
  });

  test('a plain visit shows every platform', async () => {
    await open('');
    expect(isActive('All')).toBe(true);
    expect(askedFor().length).toBeGreaterThan(0);
    askedFor().forEach((p) => expect(p.platform).toBeUndefined());
  });

  test('"View catalog" on YouTube opens on YouTube, from the very first request', async () => {
    await open('?platform=youtube');
    expect(isActive('YouTube')).toBe(true);
    expect(isActive('All')).toBe(false);
    expect(isActive('X (Twitter)')).toBe(false);
    expect(askedFor()[0].platform).toBe('youtube'); // never flashes the full catalog first
    askedFor().forEach((p) => expect(p.platform).toBe('youtube'));
  });

  test('a link that says "twitter" lands on the platform configured as "x"', async () => {
    await open('?platform=twitter');
    expect(isActive('X (Twitter)')).toBe(true);
    expect(askedFor().pop().platform).toBe('x');
  });

  test('a platform that is not configured falls back to All instead of an empty list', async () => {
    await open('?platform=reddit');
    expect(isActive('All')).toBe(true);
    expect(askedFor().pop().platform).toBeUndefined();
  });

  test('a handle search from the dashboard fills the search box and filters', async () => {
    await open('?search=some_handle');
    const box = [...container.querySelectorAll('input')].find((i) => i.value === 'some_handle');
    expect(box).toBeTruthy();
    expect(askedFor().pop().search).toBe('some_handle');
    expect(isActive('All')).toBe(true);
  });

  test('the analyst can still switch tabs afterwards', async () => {
    await open('?platform=youtube');
    await act(async () => { tab('Facebook').click(); });
    await act(async () => { jest.advanceTimersByTime(400); });
    await flush();
    expect(isActive('Facebook')).toBe(true);
    expect(isActive('YouTube')).toBe(false);
    expect(askedFor().pop().platform).toBe('facebook');
  });
});
