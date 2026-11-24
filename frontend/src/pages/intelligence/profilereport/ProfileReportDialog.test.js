/**
 * Tools → Profile Report → report dialog.
 * Renders the real dialog against a mocked API: saved report, citation → evidence, per-platform table, image text,
 * analysis progress, generate + poll, and the plain refusal when nothing can be written yet.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockApi = {
  getReport: jest.fn(),
  startReport: jest.fn(),
  cancelReport: jest.fn(),
  downloadReportPdf: jest.fn(),
};
jest.mock('../../../api/profileReport.api', () => ({ profileReportApi: mockApi }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../../../components/ui/dialog', () => {
  const Closed = ({ open, children }) => (open ? <div>{children}</div> : null);
  const Pass = ({ children }) => <div>{children}</div>;
  return { Dialog: Closed, DialogContent: Pass, DialogDescription: Pass, DialogHeader: Pass, DialogTitle: Pass };
});
jest.mock('../../../components/ui/progress', () => ({ Progress: () => <div data-progress /> }));
jest.mock('../../../components/ui/tabs', () => {
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

const PROFILE = {
  id: 42,
  display_name: 'Babulal Marandi',
  accounts: [{ id: 1, platform: 'x', handle: 'yourBabulal' }, { id: 2, platform: 'facebook', handle: 'babulal.page' }],
};

const REPORT = {
  ok: true,
  subject_id: 42,
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
    platform_differences: 'X is sharper than Facebook.',
    influence: 'High engagement.',
    risk_indicators: [{ indicator: 'Bandh call', severity: 'High', detail: 'Asks supporters to shut markets.', posts: [2] }],
    changes_over_time: [],
    notable_posts: [{ post: 2, why: 'Bandh call' }],
    watch_points: ['#JharkhandBandh'],
    limitations: ['Only 2 posts read.'],
    regional_link: 'No link to Odisha found in the posts read.',
  },
  facts: {
    timezone: 'Asia/Kolkata',
    coverage: {
      total_posts: 1200, read: 1200, analysed: 1100, first_post: '2025-01-01', last_post: '2026-11-02', span_days: 670, span_label: '22 months',
      no_text: 1, waiting: 0, usable: 3,
      notes: ['1 of 1200 posts has no caption and nothing readable in the picture, so it was not analysed.', 'Instagram does not publish share counts, so no share figures are shown for it.'],
    },
    cadence: {
      posts_per_day: 1.8, rate: { value: 0.4, unit: 'month' }, active_days: 400, by_hour: Array(24).fill(0), by_weekday: Array(7).fill(0), weeks: [],
      longest_gap: { days: 592, from: '2020-12-03', to: '2022-07-18' },
      timeline: {
        unit: 'month', active: 2, peak: { label: 'Apr 2025', posts: 5 },
        buckets: [{ key: '2025-01', label: 'Jan 2025', posts: 3 }, { key: '2025-02', label: 'Feb 2025', posts: 0 }, { key: '2025-03', label: 'Mar 2025', posts: 0 }, { key: '2025-04', label: 'Apr 2025', posts: 5 }],
      },
    },
    content: {
      original: 1000, shared: 100, replies: 100, with_media: 300, with_image_text: 120, with_links: 20, avg_length: 120, languages: [{ language: 'hi', count: 900 }], hashtags: [], mentions: [],
      pictures: { with_pictures: 300, described: 280, terms: [{ term: 'flag', count: 40 }, { term: 'crowd', count: 25 }], signals: [{ term: 'crowd or protest', count: 12 }, { term: 'weapon', count: 2 }] },
      tones: [{ term: 'motivational', count: 90 }, { term: 'dark humour', count: 7 }], read_in_context: 1100,
    },
    engagement: { total: { likes: 10, shares: 2, comments: 1, views: 0 }, avg_score: 6, median_score: 6 },
    sentiment: { positive: 100, neutral: 300, negative: 700 },
    risk: { critical: 0, high: 1, medium: 0, low: 1099, max_score: 70 },
    by_platform: [
      { platform: 'x', posts: 800, analysed: 750, negative_share: 70, high_risk: 1, avg_engagement: 9, first_post: '2025-01-01', last_post: '2026-11-02' },
      { platform: 'facebook', posts: 400, analysed: 350, negative_share: 40, high_risk: 0, avg_engagement: 31, first_post: '2025-03-01', last_post: '2026-10-30' },
    ],
  },
  evidence: [
    { n: 1, text: 'Crime is rising', english: '', image_text: '', platform: 'x', posted_at: '2026-11-01T13:00:00Z', sentiment: 'negative', risk_level: 'low', risk_score: 10, engagement: { likes: 4, shares: 1, comments: 0 } },
    { n: 2, text: '', english: '', image_text: 'Close every market tomorrow 10am', platform: 'facebook', posted_at: '2026-11-02T13:00:00Z', sentiment: 'negative', risk_level: 'high', risk_score: 70, engagement: { likes: 6, shares: 1, comments: 1 }, url: 'https://x.com/p/2', picture_signals: ['crowd or protest', 'Flag with a sun'], tone: 'call to action', meaning: 'A call to shut the markets tomorrow.' },
    { n: 3, text: '', english: '', image_text: '', scene: 'A beach at sunset with two people.', platform: 'instagram', posted_at: '2026-11-03T13:00:00Z', sentiment: 'neutral', risk_level: 'low', risk_score: 5, summary: 'A calm sunset photo with no message.', engagement: { likes: 3, shares: 0, comments: 1 }, shares_reported: false },
  ],
  markdown: '# Behaviour report',
  summary_source: 'llm',
  generated_at: '2026-11-23T06:00:00Z',
  generated_by: { id: 1, name: 'Nandeep' },
  is_stale: false,
  new_posts_count: 0,
  analysis: { posts: 1200, analysed: 1100, waiting: 0 },
};

const flush = async (n = 6) => { for (let i = 0; i < n; i += 1) { await act(async () => { await Promise.resolve(); }); } };

describe('Profile Report dialog', () => {
  let container;
  let root;
  const onReportChange = jest.fn();
  const text = () => container.textContent;
  const buttonNamed = (name) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(name));

  const render = async () => {
    const Dialog = require('./ProfileReportDialog').default;
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

  test('a saved report opens straight away with its verdict, figures and the accounts it covers', async () => {
    mockApi.getReport.mockResolvedValue({ data: REPORT });
    await render();
    expect(mockApi.startReport).not.toHaveBeenCalled();
    expect(mockApi.getReport).toHaveBeenCalledWith(42);
    expect(text()).toContain('Behaviour report · Babulal Marandi');
    expect(text()).toContain('X yourBabulal · Facebook babulal.page');
    expect(text()).toContain('Attention: Medium');
    expect(text()).toContain('Political account that mostly criticises the state government');
    expect(text()).toContain('Posts collected');
    expect(text()).toContain('1,200');
    expect(text()).toContain('Mobilises supporters');
    expect(text()).toContain('Text read from images');
    expect(text()).toContain('Posts a month');   // not "Posts a day: 0" for an account that posts rarely
    expect(text()).toContain('22 months');
    expect(text()).toContain('1 Jan 2025 → 2 Nov 2026');   // dates written out, not 2025-01-01
    expect(onReportChange).toHaveBeenCalledWith(42, expect.objectContaining({ attention_level: 'Medium' }));
    await act(async () => { buttonNamed('Risk').click(); });
    expect(text()).toContain('Bandh call');
  });

  test('a profile on several platforms gets a per-platform table under Activity pattern', async () => {
    mockApi.getReport.mockResolvedValue({ data: REPORT });
    await render();
    await act(async () => { buttonNamed('Activity pattern').click(); });
    expect(text()).toContain('By platform');
    expect(text()).toContain('X is sharper than Facebook.');
    expect(text()).toContain('Facebook');
    expect(text()).toContain('70%');
  });

  test('a citation opens the evidence tab on that post, with the text read from its image', async () => {
    mockApi.getReport.mockResolvedValue({ data: REPORT });
    await render();
    const chip = container.querySelector('button[title="Show post P2"]');
    expect(chip).toBeTruthy();
    await act(async () => { chip.click(); });
    expect(container.querySelector('[data-panel="evidence"]')).toBeTruthy();
    const card = container.querySelector('#bev-P2');
    expect(card.textContent).toContain('Close every market tomorrow 10am');
    expect(card.textContent).toContain('Image post');          // a picture-only post is labelled as such
    expect(card.textContent).not.toContain('(no text)');
    expect(card.textContent.split('Close every market tomorrow 10am').length - 1).toBe(1);   // said once, not three times
    expect(card.textContent).toContain('Notable');
  });

  test('the picture, the reason for each label, the regional link, the timeline and honest engagement all show', async () => {
    mockApi.getReport.mockResolvedValue({ data: REPORT });
    await render();
    expect(text()).toContain('Regional link:');
    expect(text()).toContain('No link to Odisha found in the posts read.');
    expect(text()).toContain('1,100 analysed · 1 no text');
    await act(async () => { buttonNamed('Activity pattern').click(); });
    expect(container.querySelector('[data-timeline]')).toBeTruthy();
    expect(text()).toContain('Posts per month');
    expect(text()).toContain('busiest Apr 2025 (5 posts)');
    expect(text()).toContain('Longest silence 592 days (3 Dec 2020 → 18 Jul 2022)');
    expect(container.querySelector('[data-picture-terms]').textContent).toContain('flag');
    expect(text()).toContain('280 of 300 pictures described');
    expect(container.querySelector('[data-tones]').textContent).toContain('motivational 90');
    expect(container.querySelector('[data-tones]').textContent).toContain('dark humour 7');
    expect(container.querySelector('[data-tones]').textContent).toContain('1100 of 1200 read in context');
    expect(container.querySelector('[data-picture-signals]').textContent).toContain('crowd or protest 12');
    expect(container.querySelector('[data-picture-signals]').textContent).toContain('weapon 2');
    await act(async () => { buttonNamed('Risk').click(); });
    expect(text()).toContain('1 of 1200 posts has no caption and nothing readable in the picture');
    expect(text()).toContain('Only 2 posts read.');
    await act(async () => { buttonNamed('Evidence').click(); });
    const photo = container.querySelector('#bev-P3');
    expect(photo.textContent).toContain('Image post');
    expect(photo.textContent).toContain('no caption, no text on the picture');
    expect(photo.textContent).toContain('A beach at sunset with two people.');
    expect(photo.textContent).toContain('Reading: A calm sunset photo with no message.');
    expect(photo.textContent).toContain('3 likes · 1 comments');
    expect(photo.textContent).not.toContain('shares');                         // Instagram does not publish them
    expect(container.querySelector('#bev-P1').textContent).toContain('4 likes · 0 comments · 1 shares');   // X does
    expect(container.querySelector('#bev-P2 [data-picture-seen]').textContent).toContain('Seen in the picture');
    expect(container.querySelector('#bev-P2 [data-picture-seen]').textContent).toContain('crowd or protest');
    expect(container.querySelector('#bev-P2 [data-picture-seen]').textContent).toContain('Flag with a sun');
    expect(container.querySelector('#bev-P1 [data-picture-seen]')).toBeNull();   // nothing flagged, nothing shown
    // how the post is meant: its tone beside the labels, and what it means as its reading
    expect(container.querySelector('#bev-P2 [data-tone]').textContent).toBe('call to action');
    expect(container.querySelector('#bev-P2 [data-meaning]').textContent).toContain('Reading: A call to shut the markets tomorrow.');
    expect(container.querySelector('#bev-P1 [data-tone]')).toBeNull();
    expect(container.querySelector('#bev-P1 [data-meaning]')).toBeNull();   // no reading and no classifier note for this one
    expect(text()).toContain('Not listed: 1 post with no caption');
  });

  test('Reach has no Shares tile when the platform publishes none', async () => {
    mockApi.getReport.mockResolvedValue({ data: { ...REPORT, facts: { ...REPORT.facts, engagement: { ...REPORT.facts.engagement, shares_reported: false } } } });
    await render();
    await act(async () => { buttonNamed('Activity pattern').click(); });
    expect(text()).toContain('Likes');
    expect(text()).toContain('Comments');
    expect(text()).not.toMatch(/\bShares\b/);
  });

  test('a report saved before these additions still opens, without the parts it does not have', async () => {
    const older = JSON.parse(JSON.stringify(REPORT));
    delete older.report.regional_link;
    delete older.facts.cadence.timeline; delete older.facts.cadence.longest_gap;
    delete older.facts.content.pictures;
    older.evidence = older.evidence.map(({ picture_signals: ps, tone, meaning, ...rest }) => rest);
    delete older.facts.content.tones; delete older.facts.content.read_in_context;
    delete older.facts.coverage.notes; delete older.facts.coverage.no_text; delete older.facts.coverage.waiting;
    older.evidence = older.evidence.map(({ scene, shares_reported: s, ...rest }) => rest);
    mockApi.getReport.mockResolvedValue({ data: older });
    await render();
    expect(text()).toContain('Attention: Medium');
    expect(text()).not.toContain('Regional link');
    await act(async () => { buttonNamed('Activity pattern').click(); });
    expect(container.querySelector('[data-timeline]')).toBeNull();
    expect(text()).toContain('Longest silence 0 days');                         // the older per-day figure
    expect(container.querySelector('[data-picture-terms]')).toBeNull();
    expect(container.querySelector('[data-picture-signals]')).toBeNull();
    expect(container.querySelector('[data-tones]')).toBeNull();
    await act(async () => { buttonNamed('Evidence').click(); });
    expect(container.querySelector('#bev-P3').textContent).not.toContain('shares');   // an Instagram post saved earlier also hides shares
    expect(container.querySelector('[data-picture-seen]')).toBeNull();
    expect(text()).not.toMatch(/undefined|NaN/);
  });

  test('while posts are still being analysed the report says so and offers to regenerate later', async () => {
    mockApi.getReport.mockResolvedValue({ data: { ...REPORT, analysis: { posts: 5000, analysed: 1240, waiting: 3760 }, is_stale: true, new_analysed_count: 140 } });
    await render();
    expect(text()).toContain('Still analysing posts: 1,240 of 5,000 done');
    expect(text()).toContain('140 more posts have been analysed since this report');
  });

  test('no saved report: it starts one, shows progress, and shows the report when ready', async () => {
    mockApi.getReport
      .mockResolvedValueOnce({ data: { status: 'none' } })
      .mockResolvedValueOnce({ data: { status: 'running', started_at: new Date().toISOString() } })
      .mockResolvedValue({ data: REPORT });
    mockApi.startReport.mockResolvedValue({ data: { status: 'running', started_at: new Date().toISOString() } });
    await render();
    expect(mockApi.startReport).toHaveBeenCalledWith(42);
    expect(text()).toContain('Writing the behaviour report');
    for (let i = 0; i < 3; i += 1) { await act(async () => { jest.advanceTimersByTime(3600); }); await flush(); }
    expect(text()).toContain('Attention: Medium');
  });

  test('a profile that cannot have a report yet gets the plain reason instead of a report', async () => {
    mockApi.getReport.mockResolvedValue({ data: { status: 'none' } });
    mockApi.startReport.mockRejectedValue({ response: { status: 422, data: { message: 'Posts are still being analysed. The report unlocks once the first posts are analysed.' } } });
    await render();
    expect(text()).toContain('The report could not be generated');
    expect(text()).toContain('Posts are still being analysed');
  });
});
