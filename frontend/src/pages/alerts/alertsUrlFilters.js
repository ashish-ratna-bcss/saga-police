/**
 * Links from the dashboard into the Alerts page.
 *
 * A dashboard card counts alerts for the period and platform chosen at the top of the dashboard, so
 * its link carries those too, otherwise the list would not match the number on the card. The Alerts
 * page reads them once when it opens (see readAlertsUrlFilters) and the analyst can change them after.
 *
 *   /alerts?risk=high&range=7d&platform=x
 */

// The only risk levels an alert is ever stored with.
const RISKS = ['low', 'medium', 'high'];
const RANGES = ['24h', '7d', '30d', 'all'];

/** Link into Alerts carrying what a dashboard card counted. Unknown values are left out. */
export const buildAlertsLink = ({ risk, range, platform } = {}) => {
  const params = new URLSearchParams();
  if (RISKS.includes(risk)) params.set('risk', risk);
  if (RANGES.includes(range)) params.set('range', range);
  if (platform && platform !== 'all') params.set('platform', String(platform));
  const query = params.toString();
  return query ? `/alerts?${query}` : '/alerts';
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysBefore = (now, n) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
};

/**
 * The Alerts page filters by calendar day, the dashboard by a rolling window. This is the nearest
 * whole-day window: 24h = yesterday and today, 7d = the last 7 days including today (also the
 * Alerts page's own default), 30d = the last 30 days, all = no date limit.
 */
export const dateRangeForRange = (range, now = new Date()) => {
  switch (range) {
    case '24h': return { start: ymd(daysBefore(now, 1)), end: ymd(now) };
    case '7d': return { start: ymd(daysBefore(now, 6)), end: ymd(now) };
    case '30d': return { start: ymd(daysBefore(now, 29)), end: ymd(now) };
    case 'all': return { start: '', end: '' };
    default: return null;
  }
};

/** Filters requested by the URL: { risk: 'all'|'low'|'medium'|'high', dateRange: {start,end}|null }. */
export const readAlertsUrlFilters = (searchParams, now = new Date()) => {
  const risk = String(searchParams.get('risk') || '').toLowerCase();
  const range = String(searchParams.get('range') || '').toLowerCase();
  return {
    risk: RISKS.includes(risk) ? risk : 'all',
    dateRange: dateRangeForRange(range, now),
  };
};
