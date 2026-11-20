import {
  buildAlertsLink, dateRangeForRange, describeRaisedWindow, readAlertsUrlFilters,
} from './alertsUrlFilters';

const NOW = new Date(2026, 10, 20, 15, 30); // 20 Nov 2026, local time
const FROM = '2026-11-13T12:39:30.263Z';
const TO = '2026-11-20T12:39:30.263Z';

describe('buildAlertsLink', () => {
  test('the Threat Vector Radar card carries the exact window it counted', () => {
    const link = buildAlertsLink({ risk: 'high', range: '7d', platform: 'all', from: FROM, to: TO });
    const p = new URL(link, 'http://x').searchParams;
    expect(p.get('risk')).toBe('high');
    expect(p.get('raisedFrom')).toBe(FROM);
    expect(p.get('raisedTo')).toBe(TO);
    expect(p.get('range')).toBe('7d');
    expect(p.has('platform')).toBe(false);
  });

  test('before the dashboard has loaded (no window yet) it still links, by period only', () => {
    expect(buildAlertsLink({ risk: 'high', range: '7d', platform: 'all' })).toBe('/alerts?risk=high&range=7d');
  });

  test('a platform chosen on the dashboard is carried over; "all" is not', () => {
    expect(buildAlertsLink({ risk: 'high', range: '30d', platform: 'x' })).toBe('/alerts?risk=high&range=30d&platform=x');
  });

  test('values the Alerts page does not know are left out rather than breaking the list', () => {
    expect(buildAlertsLink({ risk: 'critical', range: '90d', from: 'junk', to: '' })).toBe('/alerts');
    expect(buildAlertsLink()).toBe('/alerts');
    expect(buildAlertsLink({ risk: 'medium' })).toBe('/alerts?risk=medium');
  });

  test('timestamps are normalised to ISO and a platform with odd characters is encoded', () => {
    expect(new URL(buildAlertsLink({ from: '2026-11-13T18:09:30+05:30' }), 'http://x').searchParams.get('raisedFrom')).toBe('2026-11-13T12:39:30.000Z');
    expect(buildAlertsLink({ risk: 'high', platform: 'a&b=c' })).toBe('/alerts?risk=high&platform=a%26b%3Dc');
  });
});

describe('dateRangeForRange', () => {
  test('7d is the last 7 calendar days including today (the Alerts page default)', () => {
    expect(dateRangeForRange('7d', NOW)).toEqual({ start: '2026-11-14', end: '2026-11-20' });
  });

  test('24h, 30d and all', () => {
    expect(dateRangeForRange('24h', NOW)).toEqual({ start: '2026-11-19', end: '2026-11-20' });
    expect(dateRangeForRange('30d', NOW)).toEqual({ start: '2026-10-22', end: '2026-11-20' });
    expect(dateRangeForRange('all', NOW)).toEqual({ start: '', end: '' });
  });

  test('crosses a month and a year boundary correctly', () => {
    expect(dateRangeForRange('7d', new Date(2026, 2, 2))).toEqual({ start: '2026-02-24', end: '2026-03-02' });
    expect(dateRangeForRange('30d', new Date(2027, 0, 5))).toEqual({ start: '2026-12-07', end: '2027-01-05' });
  });

  test('anything else means "use the page default"', () => {
    expect(dateRangeForRange('90d', NOW)).toBeNull();
    expect(dateRangeForRange(undefined, NOW)).toBeNull();
  });
});

describe('describeRaisedWindow', () => {
  test('words for the chip', () => {
    expect(describeRaisedWindow({ range: '24h' })).toBe('last 24 hours');
    expect(describeRaisedWindow({ range: '7d' })).toBe('last 7 days');
    expect(describeRaisedWindow({ range: '30d' })).toBe('last 30 days');
    expect(describeRaisedWindow({ range: null })).toBe('selected period');
    expect(describeRaisedWindow(null)).toBe('selected period');
  });
});

describe('readAlertsUrlFilters', () => {
  const read = (qs) => readAlertsUrlFilters(new URLSearchParams(qs), NOW);

  test('an exact raised window wins, and leaves the post-date filter empty so the two never fight', () => {
    expect(read(`risk=high&raisedFrom=${FROM}&raisedTo=${TO}&range=7d`)).toEqual({
      risk: 'high',
      raisedWindow: { from: FROM, to: TO, range: '7d' },
      dateRange: { start: '', end: '' },
    });
  });

  test('an older-style link with only a period still works by whole days', () => {
    expect(read('risk=high&range=7d')).toEqual({ risk: 'high', raisedWindow: null, dateRange: { start: '2026-11-14', end: '2026-11-20' } });
  });

  test('risk is case-insensitive and unknown risks are ignored', () => {
    expect(read('risk=HIGH').risk).toBe('high');
    expect(read('risk=critical').risk).toBe('all');
    expect(read('risk=').risk).toBe('all');
  });

  test('a bad window is ignored', () => {
    expect(read('raisedFrom=garbage&raisedTo=').raisedWindow).toBeNull();
    expect(read(`raisedFrom=garbage&raisedTo=${TO}`).raisedWindow).toEqual({ from: null, to: TO, range: null });
  });

  test('a plain /alerts visit changes nothing', () => {
    expect(read('')).toEqual({ risk: 'all', raisedWindow: null, dateRange: null });
    expect(read('status=active&platform=x')).toEqual({ risk: 'all', raisedWindow: null, dateRange: null });
  });

  test('a link built by the dashboard is read back as the same filters', () => {
    const link = buildAlertsLink({ risk: 'high', range: '30d', platform: 'x', from: FROM, to: TO });
    const params = new URL(link, 'http://localhost').searchParams;
    expect(readAlertsUrlFilters(params, NOW)).toEqual({
      risk: 'high', raisedWindow: { from: FROM, to: TO, range: '30d' }, dateRange: { start: '', end: '' },
    });
    expect(params.get('platform')).toBe('x');
  });
});
