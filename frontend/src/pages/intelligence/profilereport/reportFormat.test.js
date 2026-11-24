import {
  analysisProgress, citesIn, dayLabel, limitationsOf, platformLabel, postBody, postingRate, progressOf, relativeTime, reportLockReason, responseText, sharesShown, spanText, splitCites,
  timelineTicks, toneShare,
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
    expect(postBody({ text: '', image_text: quote, english: quote })).toEqual({ main: quote, imageOnly: true, english: '', imageText: '', picture: '' });
    expect(postBody({ text: '', image_text: quote, english: quote.toUpperCase() + '!' }).english).toBe('');   // same words, other case
    expect(postBody({ text: 'Happy New Year', image_text: 'Be patient. Be humble.', english: '' })).toEqual({ main: 'Happy New Year', imageOnly: false, english: '', imageText: 'Be patient. Be humble.', picture: '' });
    expect(postBody({ text: 'Namaste', image_text: 'Namaste', english: 'Hello' })).toEqual({ main: 'Namaste', imageOnly: false, english: 'Hello', imageText: '', picture: '' });
    expect(postBody({ text: '', image_text: '', english: '' }).main).toBe('');
    expect(postBody()).toEqual({ main: '', imageOnly: false, english: '', imageText: '', picture: '' });
  });

  test('what the picture shows is a line of its own, and a photo with no words at all is said to be so', () => {
    expect(postBody({ text: 'Rally today', image_text: '', scene: 'A crowd holding flags.' })).toEqual({ main: 'Rally today', imageOnly: false, english: '', imageText: '', picture: 'A crowd holding flags.' });
    expect(postBody({ text: '', image_text: '', scene: 'A beach at sunset.' })).toEqual({ main: '', imageOnly: true, noWords: true, english: '', imageText: '', picture: 'A beach at sunset.' });
    expect(postBody({ text: '', image_text: 'GOOD MORNING', scene: 'Good morning' }).picture).toBe('');   // a description that only repeats the printed words
    expect(postBody({ text: 'Good morning', scene: 'good morning!' }).picture).toBe('');
  });

  test('response figures leave out shares where the platform has none, for new and older saved reports alike', () => {
    const eng = { likes: 1234, comments: 5, shares: 0 };
    expect(responseText({ platform: 'instagram', engagement: eng })).toBe('1,234 likes · 5 comments');
    expect(responseText({ platform: 'x', engagement: { ...eng, shares: 7 } })).toBe('1,234 likes · 5 comments · 7 shares');
    expect(responseText({ platform: 'instagram', shares_reported: true, engagement: eng })).toContain('shares');   // the saved flag wins
    expect(responseText({ platform: 'x', shares_reported: false, engagement: eng })).not.toContain('shares');
    expect(responseText({})).toBe('0 likes · 0 comments · 0 shares');
    expect(sharesShown('YouTube')).toBe(false);
    expect(sharesShown('facebook')).toBe(true);
  });

  test('limitations: what the model cannot show, then what the numbers do not cover, each once', () => {
    expect(limitationsOf({ limitations: ['Only public posts.'] }, { coverage: { notes: ['1 of 18 posts has no caption.', 'Only public posts.'] } })).toEqual(['Only public posts.', '1 of 18 posts has no caption.']);
    expect(limitationsOf({}, {})).toEqual([]);
    expect(limitationsOf(undefined, undefined)).toEqual([]);
  });

  test('timeline ticks: first and last period, a year mark between, never two labels on top of each other', () => {
    const months = (from, count) => Array.from({ length: count }, (_, i) => {
      const idx = from.month - 1 + i;
      const y = from.year + Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      return { key: `${y}-${String(m).padStart(2, '0')}`, label: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`, posts: i % 5 === 0 ? 1 : 0 };
    });
    const ticks = timelineTicks({ unit: 'month', buckets: months({ year: 2019, month: 5 }, 49) });
    expect(ticks.map((t) => t.text)).toEqual(['May 2019', '2020', '2021', '2022', 'May 2023']);
    expect(ticks.every((t, i) => i === 0 || t.at - ticks[i - 1].at > 9)).toBe(true);
    expect(ticks[0].at).toBeGreaterThanOrEqual(6);
    expect(timelineTicks({ unit: 'month', buckets: [] })).toEqual([]);
    expect(timelineTicks(null)).toEqual([]);
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
