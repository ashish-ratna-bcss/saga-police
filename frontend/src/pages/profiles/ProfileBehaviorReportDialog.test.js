/**
 * Profile Catalog → Human behaviour → report dialog.
 * Renders the real dialog against a mocked API: saved report, citation → evidence, generate + poll, and the no-posts refusal.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockApi = {
  getBehaviorReport: jest.fn(),
  startBehaviorReport: jest.fn(),
  cancelBehaviorReport: jest.fn(),
  downloadBehaviorReportPdf: jest.fn(),
};
jest.mock('../../api/socialProfiles.api', () => ({ socialProfilesApi: mockApi }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../../components/ui/dialog', () => {
  const Closed = ({ open, children }) => (open ? <div>{children}</div> : null);
  const Pass = ({ children }) => <div>{children}</div>;
  return { Dialog: Closed, DialogContent: Pass, DialogDescription: Pass, DialogHeader: Pass, DialogTitle: Pass };
});
jest.mock('../../components/ui/progress', () => ({ Progress: () => <div data-progress /> }));
jest.mock('../../components/ui/tabs', () => {
  const ReactLib = require('react');
  const Ctx = ReactLib.createContext({});
  return {
    Tabs: ({ value, onValueChange, children }) => <Ctx.Provider value={{ value, onValueChange }}><div>{children}</div></Ctx.Provider>,
    TabsList: ({ children }) => <div>{children}</div>,
    TabsTrigger: ({ value, children }) => {
      const c = ReactLib.useContext(Ctx);
      return <button type="button" data-tab={value} onClick={() => c.onValueChange(value)}>{children}</button>;
    },
    TabsContent: ({ value, children }) => {
      const c = ReactLib.useContext(Ctx);
      return c.value === value ? <div data-panel={value}>{children}</div> : null;
    },
  };
});

const PROFILE = { id: 42, display_name: 'Babulal Marandi', handle: 'yourBabulal', platform: 'x', platform_name: 'X (Twitter)' };

const REPORT = {
  ok: true,
  account_id: 42,
  report: {
    bottom_line: 'Political account that mostly criticises the state government [P1].',
    account_type: 'Political or party account',
    account_type_basis: 'Posts speak for a party.',
    attention_level: 'Medium',
    attention_reason: 'One high-risk post calling for a bandh [P2].',
    behaviour_traits: [{ trait: 'Mobilises supporters', evidence_level: 'Observed', detail: 'Calls for rallies.', posts: [2] }],
    themes: [{ theme: 'Law and order', share: 'Main', detail: 'Crime reports.', posts: [1] }],
    tone: 'Mostly negative toward the government.',
    targets: [{ target: 'State government', attitude: 'Critical', detail: 'Blames it for crime.', posts: [1] }],
    communication_style: 'Hindi posts with photos.',
    posting_pattern: 'Evenings.',
    influence: 'High engagement.',
    risk_indicators: [{ indicator: 'Bandh call', severity: 'High', detail: 'Asks supporters to shut markets.', posts: [2] }],
    changes_over_time: [],
    notable_posts: [{ post: 2, why: 'Bandh call' }],
    watch_points: ['#JharkhandBandh'],
    limitations: ['Only 2 posts read.'],
  },
  facts: {
    timezone: 'Asia/Kolkata',
    coverage: { total_posts: 2, read: 2, analysed: 2, first_post: '2026-11-01', last_post: '2026-11-02', span_days: 1 },
    cadence: { posts_per_day: 2, active_days: 2, by_hour: Array(24).fill(0), by_weekday: Array(7).fill(0), weeks: [] },
    content: { original: 2, shared: 0, replies: 0, with_media: 1, with_links: 0, avg_length: 120, languages: [{ language: 'hi', count: 2 }], hashtags: [], mentions: [] },
    engagement: { total: { likes: 10, shares: 2, comments: 1, views: 0 }, avg_score: 6, median_score: 6 },
    sentiment: { positive: 0, neutral: 0, negative: 2 },
    risk: { critical: 0, high: 1, medium: 0, low: 1, max_score: 70 },
  },
  evidence: [
    { n: 1, text: 'Crime is rising', english: '', platform: 'x', posted_at: '2026-11-01T13:00:00Z', sentiment: 'negative', risk_level: 'low', risk_score: 10, engagement: { likes: 4, shares: 1, comments: 0 } },
    { n: 2, text: 'Close every market tomorrow', english: '', platform: 'x', posted_at: '2026-11-02T13:00:00Z', sentiment: 'negative', risk_level: 'high', risk_score: 70, engagement: { likes: 6, shares: 1, comments: 1 }, url: 'https://x.com/p/2' },
  ],
  markdown: '# Behaviour report',
  summary_source: 'llm',
  generated_at: '2026-11-23T06:00:00Z',
  generated_by: { id: 1, name: 'Nandeep' },
  is_stale: false,
  new_posts_count: 0,
};

const flush = async (n = 6) => { for (let i = 0; i < n; i += 1) { await act(async () => { await Promise.resolve(); }); } };

describe('Human behaviour report dialog', () => {
  let container;
  let root;
  const onReportChange = jest.fn();
  const text = () => container.textContent;
  const buttonNamed = (name) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(name));

  const render = async () => {
    const Dialog = require('./ProfileBehaviorReportDialog').default;
    root = createRoot(container);
    await act(async () => { root.render(<Dialog open onOpenChange={() => {}} profile={PROFILE} onReportChange={onReportChange} />); });
    await flush();
  };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
  });

  test('a saved report opens straight away with its verdict, figures and sections', async () => {
    mockApi.getBehaviorReport.mockResolvedValue({ data: REPORT });
    await render();
    expect(mockApi.startBehaviorReport).not.toHaveBeenCalled();
    expect(text()).toContain('Attention: Medium');
    expect(text()).toContain('Political account that mostly criticises the state government');
    expect(text()).toContain('Political or party account');
    expect(text()).toContain('Posts read');
    expect(text()).toContain('Mobilises supporters');
    expect(onReportChange).toHaveBeenCalledWith(42, expect.objectContaining({ attention_level: 'Medium' }));
    await act(async () => { buttonNamed('Risk').click(); });
    expect(text()).toContain('Bandh call');
  });

  test('a citation opens the evidence tab on that post', async () => {
    mockApi.getBehaviorReport.mockResolvedValue({ data: REPORT });
    await render();
    const chip = container.querySelector('button[title="Show post P2"]');
    expect(chip).toBeTruthy();
    await act(async () => { chip.click(); });
    expect(container.querySelector('[data-panel="evidence"]')).toBeTruthy();
    expect(container.querySelector('#bev-P2').textContent).toContain('Close every market tomorrow');
    expect(container.querySelector('#bev-P2').textContent).toContain('Notable');
  });

  test('no saved report: it starts one, shows progress, and shows the report when ready', async () => {
    mockApi.getBehaviorReport
      .mockResolvedValueOnce({ data: { status: 'none' } })
      .mockResolvedValueOnce({ data: { status: 'running', started_at: new Date().toISOString() } })
      .mockResolvedValue({ data: REPORT });
    mockApi.startBehaviorReport.mockResolvedValue({ data: { status: 'running', started_at: new Date().toISOString() } });
    await render();
    expect(mockApi.startBehaviorReport).toHaveBeenCalledWith(42);
    expect(text()).toContain('Writing the behaviour report');
    for (let i = 0; i < 3; i += 1) { await act(async () => { jest.advanceTimersByTime(3600); }); await flush(); }
    expect(text()).toContain('Attention: Medium');
  });

  test('a profile without posts gets a plain explanation instead of a report', async () => {
    mockApi.getBehaviorReport.mockResolvedValue({ data: { status: 'none' } });
    mockApi.startBehaviorReport.mockRejectedValue({ response: { status: 422, data: { message: 'No posts have been collected for this profile yet.' } } });
    await render();
    expect(text()).toContain('The report could not be generated');
    expect(text()).toContain('No posts have been collected for this profile yet.');
  });
});
