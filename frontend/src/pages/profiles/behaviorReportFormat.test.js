import { behaviorLockReason, citesIn, relativeTime, splitCites, toneShare } from './behaviorReportFormat';

describe('behaviour report helpers', () => {
  test('the report button unlocks only once monitoring has collected posts', () => {
    expect(behaviorLockReason({ posts_stored: 0, monitoring_status: 'stopped' })).toMatch(/Start monitoring first/);
    expect(behaviorLockReason({ posts_stored: 0, monitoring_status: 'started' })).toMatch(/first posts/);
    expect(behaviorLockReason({ posts_stored: 3, monitoring_status: 'stopped' })).toBe('');
    expect(behaviorLockReason({ posts_stored: 0, behavior_report: { generated_at: 'x' } })).toBe('');
  });

  test('splitCites turns [P#] into numbers and keeps the text around them', () => {
    expect(splitCites('Roads [P3] and [P12].')).toEqual(['Roads ', 3, ' and ', 12, '.']);
    expect(splitCites('')).toEqual([]);
    expect(splitCites('no cites')).toEqual(['no cites']);
  });

  test('citesIn collects every post the report points to', () => {
    const report = {
      bottom_line: 'Mostly civic [P1].',
      behaviour_traits: [{ trait: 'x', posts: [2, 3], detail: 'see [P4]' }],
      risk_indicators: [{ indicator: 'y', posts: [5] }],
      changes_over_time: [{ from: 'calm [P6]', to: 'angry', posts: [7] }],
      notable_posts: [{ post: 8, why: 'z' }],
      watch_points: ['#tag [P9]'],
    };
    expect([...citesIn(report)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(citesIn(null).size).toBe(0);
  });

  test('toneShare gives whole percentages that add up to 100', () => {
    const s = toneShare({ positive: 1, neutral: 1, negative: 1 });
    expect(s.positive + s.neutral + s.negative).toBe(100);
    expect(s.total).toBe(3);
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
});
