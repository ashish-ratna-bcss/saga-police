import { buildAlertsLink, dateRangeForRange, readAlertsUrlFilters } from './alertsUrlFilters';

const NOW = new Date(2026, 10, 20, 15, 30); // 20 Nov 2026, local time

describe('buildAlertsLink', () => {
  test('the Threat Vector Radar card opens Alerts on high risk for the same period', () => {
    expect(buildAlertsLink({ risk: 'high', range: '7d', platform: 'all' })).toBe('/alerts?risk=high&range=7d');
  });

  test('a platform chosen on the dashboard is carried over; "all" is not', () => {
    expect(buildAlertsLink({ risk: 'high', range: '30d', platform: 'x' })).toBe('/alerts?risk=high&range=30d&platform=x');
    expect(buildAlertsLink({ risk: 'high', range: '24h', platform: 'all' })).not.toContain('platform');
  });

  test('values the Alerts page does not know are left out rather than breaking the list', () => {
    expect(buildAlertsLink({ risk: 'critical', range: '90d' })).toBe('/alerts');
    expect(buildAlertsLink()).toBe('/alerts');
    expect(buildAlertsLink({ risk: 'medium' })).toBe('/alerts?risk=medium');
  });

  test('a platform name with odd characters is encoded', () => {
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

describe('readAlertsUrlFilters', () => {
  const read = (qs) => readAlertsUrlFilters(new URLSearchParams(qs), NOW);

  test('reads risk and range from the dashboard link', () => {
    expect(read('risk=high&range=7d')).toEqual({ risk: 'high', dateRange: { start: '2026-11-14', end: '2026-11-20' } });
  });

  test('risk is case-insensitive and unknown risks are ignored', () => {
    expect(read('risk=HIGH').risk).toBe('high');
    expect(read('risk=critical').risk).toBe('all');
    expect(read('risk=').risk).toBe('all');
  });

  test('a plain /alerts visit changes nothing', () => {
    expect(read('')).toEqual({ risk: 'all', dateRange: null });
    expect(read('status=active&platform=x')).toEqual({ risk: 'all', dateRange: null });
  });

  test('a link built by the dashboard is read back as the same filters', () => {
    const link = buildAlertsLink({ risk: 'high', range: '30d', platform: 'x' });
    const params = new URL(link, 'http://localhost').searchParams;
    expect(readAlertsUrlFilters(params, NOW)).toEqual({ risk: 'high', dateRange: { start: '2026-10-22', end: '2026-11-20' } });
    expect(params.get('platform')).toBe('x');
  });
});
