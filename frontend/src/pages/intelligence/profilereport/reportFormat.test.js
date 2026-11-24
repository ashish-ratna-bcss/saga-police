import {
  analysisProgress, citesIn, dayLabel, platformLabel, postBody, postingRate, progressOf, relativeTime, reportLockReason, spanText, splitCites, toneShare,
} from './reportFormat';

const account = (fetch_status, extra = {}) => ({ id: 1, platform: 'x', handle: 'a', fetch_status, posts_fetched: 10, ...extra });
const subject = (extra = {}) => ({ id: 1, posts: 100, analysed: 40, waiting: 60, skipped: 0, failed: 0, collecting: 0, accounts: [account('done')], ...extra });

describe('Profile Report helpers', () => {
  test('progress says what the profile is doing right now', () => {
    expect(progressOf(subject({ collecting: 1, accounts: [account('running')] })).phase).toBe('collecting');
    expect(progressOf(subject({ accounts: [account('pending')] })).phase).toBe('collecting');
    expect(progressOf(subject({ accounts: [account('failed')] }))).toEqual({ phase: 'failed', label: 'Collection stopped' });
    expect(progressOf(subject({ accounts: [account('done'), account('failed', { id: 2 })] })).label).toBe('Partly collected');
    expect(progressOf(subject()).phase).toBe('analysing');
    expect(progressOf(subject({ waiting: 0, analysed: 100 })).phase).toBe('ready');
    expect(progressOf(subject({ posts: 0, waiting: 0, analysed: 0 })).phase).toBe('empty');
  });

  test('the report unlocks once the first posts are analysed, and says why it is locked', () => {
    expect(reportLockReason(subject({ posts: 0, analysed: 0 }))).toMatch(/No posts have been collected yet/);
    expect(reportLockReason(subject({ analysed: 0 }))).toMatch(/still being analysed/);
    expect(reportLockReason(subject({ analysed: 1 }))).toBe('');
    expect(reportLockReason(null)).toBe('');
  });

  test('analysis progress counts skipped posts as processed', () => {
    expect(analysisProgress(subject({ posts: 5000, waiting: 3760 }))).toEqual({ total: 5000, processed: 1240, percent: 25 });
    expect(analysisProgress(subject({ posts: 0, waiting: 0 }))).toEqual({ total: 0, processed: 0, percent: 0 });
    expect(analysisProgress(subject({ posts: 10, waiting: 0 })).percent).toBe(100);
  });

  test('platform names read naturally', () => {
    expect(platformLabel('twitter')).toBe('X');
    expect(platformLabel('youtube')).toBe('YouTube');
    expect(platformLabel('mastodon')).toBe('mastodon');
  });

  test('splitCites turns [P#] into numbers and keeps the text around them', () => {
    expect(splitCites('Roads [P3] and [P12].')).toEqual(['Roads ', 3, ' and ', 12, '.']);
    expect(splitCites('')).toEqual([]);
    expect(splitCites('no cites')).toEqual(['no cites']);
  });

  test('citesIn collects every post the report points to, including platform differences', () => {
    const report = {
      bottom_line: 'Mostly civic [P1].',
      platform_differences: 'X is sharper [P10].',
      behaviour_traits: [{ trait: 'x', posts: [2, 3], detail: 'see [P4]' }],
      risk_indicators: [{ indicator: 'y', posts: [5] }],
      changes_over_time: [{ from: 'calm [P6]', to: 'angry', posts: [7] }],
      notable_posts: [{ post: 8, why: 'z' }],
      watch_points: ['#tag [P9]'],
    };
    expect([...citesIn(report)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(citesIn(null).size).toBe(0);
  });

  test('toneShare gives whole percentages that add up to 100', () => {
    const s = toneShare({ positive: 1, neutral: 1, negative: 1 });
    expect(s.positive + s.neutral + s.negative).toBe(100);
    expect(toneShare({ positive: 0, neutral: 0, negative: 0 })).toEqual({ total: 0, positive: 0, neutral: 0, negative: 0 });
    expect(toneShare({ positive: 0, neutral: 2, negative: 6 })).toEqual({ total: 8, positive: 0, neutral: 25, negative: 75 });
  });

  test('relativeTime reads naturally', () => {
    const now = Date.parse('2026-11-23T12:00:00Z');
    expect(relativeTime('2026-11-23T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-11-23T11:40:00Z', now)).toBe('20m ago');
    expect(relativeTime('2026-11-23T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-11-21T12:00:00Z', now)).toBe('2d ago');
    expect(relativeTime('not a date', now)).toBe('');
  });

  test('a post says each sentence once: a picture-only post shows its image text as the post, labelled', () => {
    const quote = 'Before you diagnose yourself with depression, make sure you are not surrounded by fools.';
    expect(postBody({ text: '', image_text: quote, english: quote })).toEqual({ main: quote, imageOnly: true, english: '', imageText: '' });
    expect(postBody({ text: '', image_text: quote, english: quote.toUpperCase() + '!' }).english).toBe('');   // same words, other case
    expect(postBody({ text: 'Happy New Year', image_text: 'Be patient. Be humble.', english: '' })).toEqual({ main: 'Happy New Year', imageOnly: false, english: '', imageText: 'Be patient. Be humble.' });
    expect(postBody({ text: 'Namaste', image_text: 'Namaste', english: 'Hello' })).toEqual({ main: 'Namaste', imageOnly: false, english: 'Hello', imageText: '' });
    expect(postBody({ text: '', image_text: '', english: '' }).main).toBe('');
    expect(postBody()).toEqual({ main: '', imageOnly: false, english: '', imageText: '' });
  });

  test('the posting rate reads in the unit that makes sense, and the period in years when long', () => {
    expect(postingRate({ cadence: { rate: { value: 0.4, unit: 'month' } } })).toEqual({ label: 'Posts a month', value: 0.4 });
    expect(postingRate({ cadence: { rate: { value: 2.5, unit: 'week' } } }).label).toBe('Posts a week');
    expect(postingRate({ cadence: { posts_per_day: 1.8 } })).toEqual({ label: 'Posts a day', value: 1.8 });   // reports saved before the unit existed
    expect(postingRate(null)).toEqual({ label: 'Posts a day', value: 0 });
    expect(spanText({ span_label: '4 years', span_days: 1455 })).toBe('4 years');
    expect(spanText({ span_days: 12 })).toBe('12 days');
  });

  test('days are written out, not shown as 2022-05-23', () => {
    expect(dayLabel('2022-05-23')).toBe('23 May 2022');
    expect(dayLabel('2026-11-02')).toBe('2 Nov 2026');
    expect(dayLabel(null)).toBe('?');
    expect(dayLabel('sometime')).toBe('sometime');
  });
});
