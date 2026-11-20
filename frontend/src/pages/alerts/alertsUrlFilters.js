/**
 * Links from the dashboard into the Alerts page.
 *
 * A dashboard card counts alerts for the period and platform chosen at the top of the dashboard, so
 * its link carries those too, otherwise the list would not match the number on the card. The Alerts
 * page reads them once when it opens (see readAlertsUrlFilters) and the analyst can change them after.
 *
 *   /alerts?risk=high&raisedFrom=2026-11-13T12:39:30.263Z&raisedTo=2026-11-20T12:39:30.263Z&range=7d&platform=x
 *
 * Why an exact "raised" window and not just From/To dates: the card counts alerts by WHEN THEY WERE
 * RAISED over a rolling window (e.g. the last 7 x 24h). The Alerts page's From/To filter the day the
 * POST was published, in whole days. An alert raised this week about an older post was therefore on
 * the card but missing from the list (4 on the card, 3 in the list). The raised window asks the list
 * for exactly what the card counted.
 */

// The only risk levels an alert is ever stored with.
const RISKS = ['low', 'medium', 'high'];
const RANGES = ['24h', '7d', '30d', 'all'];

const isoOrNull = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Link into Alerts carrying what a dashboard card counted. Unknown values are left out.
 * `from` / `to` are the exact window the dashboard used (ISO date-times); `range` is only the label.
 */
export const buildAlertsLink = ({ risk, range, platform, from, to } = {}) => {
  const params = new URLSearchParams();
  if (RISKS.includes(risk)) params.set('risk', risk);
  const raisedFrom = isoOrNull(from);
  const raisedTo = isoOrNull(to);
  if (raisedFrom) params.set('raisedFrom', raisedFrom);
  if (raisedTo) params.set('raisedTo', raisedTo);
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
 * Whole-day window for a dashboard range, used only by links that carry no exact window.
 * 24h = yesterday and today, 7d = the last 7 days including today (also the Alerts page's own
 * default), 30d = the last 30 days, all = no date limit.
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

/** Words for the chip: "last 24 hours" / "last 7 days" / "last 30 days" / "selected period". */
export const describeRaisedWindow = (raisedWindow) => {
  switch (raisedWindow?.range) {
    case '24h': return 'last 24 hours';
    case '7d': return 'last 7 days';
    case '30d': return 'last 30 days';
    default: return 'selected period';
  }
};

/**
 * Filters requested by the URL:
 *   risk          'all' | 'low' | 'medium' | 'high'
 *   raisedWindow  { from, to, range } when the link carries an exact raised window, else null
 *   dateRange     whole-day post-date window, or null for "use the page default". It is empty
 *                 ({start:'',end:''}) when a raised window is set, so the two never fight.
 */
export const readAlertsUrlFilters = (searchParams, now = new Date()) => {
  const risk = String(searchParams.get('risk') || '').toLowerCase();
  const range = String(searchParams.get('range') || '').toLowerCase();
  const from = isoOrNull(searchParams.get('raisedFrom'));
  const to = isoOrNull(searchParams.get('raisedTo'));
  const raisedWindow = from || to ? { from, to, range: RANGES.includes(range) ? range : null } : null;
  return {
    risk: RISKS.includes(risk) ? risk : 'all',
    raisedWindow,
    dateRange: raisedWindow ? { start: '', end: '' } : dateRangeForRange(range, now),
  };
};
