/** Small pure helpers for the Human behaviour report (dialog + catalog column). */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ATTENTION_STYLES = {
  High: { pill: 'border-rose-300 bg-rose-50 text-rose-700', border: 'border-l-rose-500', dot: 'bg-rose-500' },
  Medium: { pill: 'border-amber-300 bg-amber-50 text-amber-800', border: 'border-l-amber-500', dot: 'bg-amber-500' },
  Low: { pill: 'border-emerald-300 bg-emerald-50 text-emerald-700', border: 'border-l-emerald-500', dot: 'bg-emerald-500' },
};

/**
 * Why the report button is locked for a catalog row, or '' when it can be used.
 * It unlocks once monitoring has collected at least one post; a saved report can always be opened.
 */
export const behaviorLockReason = (row) => {
  if (!row || row.behavior_report) return '';
  if (Number(row.posts_stored) > 0) return '';
  return row.monitoring_status === 'started'
    ? 'Unlocks when monitoring collects the first posts for this profile.'
    : 'Start monitoring first. The report unlocks once posts are collected.';
};

/** "Roads [P3] and [P12]." -> ['Roads ', 3, ' and ', 12, '.'] */
export const splitCites = (text) => {
  const out = [];
  const s = String(text || '');
  const re = /\[P(\d+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(Number(m[1]));
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
};

const TEXT_FIELDS = ['bottom_line', 'attention_reason', 'account_type_basis', 'tone', 'communication_style', 'posting_pattern', 'influence'];
const LIST_FIELDS = ['behaviour_traits', 'themes', 'targets', 'risk_indicators', 'changes_over_time'];

/** Every post number the report points to: posts arrays, notable posts and inline [P#] citations. */
export const citesIn = (report) => {
  const set = new Set();
  if (!report) return set;
  const addText = (t) => splitCites(t).forEach((p) => { if (typeof p === 'number') set.add(p); });
  TEXT_FIELDS.forEach((k) => addText(report[k]));
  LIST_FIELDS.forEach((k) => (report[k] || []).forEach((x) => {
    (x.posts || []).forEach((n) => set.add(n));
    ['detail', 'from', 'to'].forEach((f) => addText(x[f]));
  }));
  (report.notable_posts || []).forEach((x) => set.add(x.post));
  [...(report.watch_points || []), ...(report.limitations || [])].forEach(addText);
  return set;
};

/** Whole-number shares that add up to 100 (largest remainder), plus the total. */
export const toneShare = (s = {}) => {
  const keys = ['positive', 'neutral', 'negative'];
  const total = keys.reduce((sum, k) => sum + (Number(s[k]) || 0), 0);
  const out = { total, positive: 0, neutral: 0, negative: 0 };
  if (!total) return out;
  const raw = keys.map((k) => ({ k, v: ((Number(s[k]) || 0) / total) * 100 }));
  raw.forEach((r) => { out[r.k] = Math.floor(r.v); });
  let left = 100 - keys.reduce((sum, k) => sum + out[k], 0);
  [...raw].sort((a, b) => (b.v % 1) - (a.v % 1)).forEach((r) => { if (left > 0 && Number(s[r.k])) { out[r.k] += 1; left -= 1; } });
  return out;
};

export const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

const PLATFORMS = { x: 'X', twitter: 'X', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', telegram: 'Telegram', reddit: 'Reddit' };
export const platformLabel = (p) => PLATFORMS[String(p || '').toLowerCase()] || p || '';

export const formatWhen = (iso, timeZone) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      ...(timeZone ? { timeZone } : {}), day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch (e) {
    return d.toLocaleString();
  }
};

/** "just now", "5m ago", "3h ago", "2d ago", or a date. */
export const relativeTime = (iso, now = Date.now()) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
