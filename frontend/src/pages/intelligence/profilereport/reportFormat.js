/** Small pure helpers for Tools → Profile Report (list, detail, report dialog). */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ATTENTION_STYLES = {
  High: { pill: 'border-rose-300 bg-rose-50 text-rose-700', border: 'border-l-rose-500', dot: 'bg-rose-500' },
  Medium: { pill: 'border-amber-300 bg-amber-50 text-amber-800', border: 'border-l-amber-500', dot: 'bg-amber-500' },
  Low: { pill: 'border-emerald-300 bg-emerald-50 text-emerald-700', border: 'border-l-emerald-500', dot: 'bg-emerald-500' },
};

const PLATFORMS = { x: 'X', twitter: 'X', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', telegram: 'Telegram', reddit: 'Reddit' };
export const platformLabel = (p) => PLATFORMS[String(p || '').toLowerCase()] || p || '';

/** Lower-case words only, so "Hello, World!" and "hello world" compare equal. */
export const foldText = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

/**
 * What a post says, each sentence once. A post with only a picture shows the text read from it as its main text
 * (flagged imageOnly); an English line that repeats the post or its image text is left out.
 */
export const postBody = ({ text, image_text: imageText, english, scene } = {}) => {
  const t = String(text || '').trim();
  const i = String(imageText || '').trim();
  const e = String(english || '').trim();
  const s = String(scene || '').trim();
  const showEnglish = Boolean(e) && foldText(e) !== foldText(t) && foldText(e) !== foldText(i);
  // what the picture shows, unless it only repeats the caption or the words printed on it
  const picture = s && foldText(s) !== foldText(t) && foldText(s) !== foldText(i) ? s : '';
  if (!t && i) return { main: i, imageOnly: true, english: showEnglish ? e : '', imageText: '', picture };
  if (!t && picture) return { main: '', imageOnly: true, noWords: true, english: showEnglish ? e : '', imageText: '', picture };
  return { main: t, imageOnly: false, english: showEnglish ? e : '', imageText: i && foldText(i) !== foldText(t) ? i : '', picture };
};

/** Platforms that do not publish a share / repost count: a 0 there means "not shown", not "nobody shared it". */
const NO_SHARE_COUNT = ['instagram', 'youtube'];
export const sharesShown = (platform) => !NO_SHARE_COUNT.includes(String(platform || '').toLowerCase());

/** "12 likes · 3 comments · 4 shares" for one post, leaving shares out where the platform has none. Reports saved earlier carry no flag, so the platform decides. */
export const responseText = (post = {}) => {
  const g = post.engagement || {};
  const shares = post.shares_reported === undefined ? sharesShown(post.platform) : post.shares_reported;
  const num = (v) => Number(v || 0).toLocaleString('en-IN');
  return `${num(g.likes)} likes · ${num(g.comments)} comments${shares ? ` · ${num(g.shares)} shares` : ''}`;
};

/** What the numbers do not cover (posts without text, still waiting, no share counts) after what the model said it cannot show. */
export const limitationsOf = (report = {}, facts = {}) =>
  [...(report.limitations || []), ...(facts.coverage?.notes || [])].filter((x, i, all) => x && all.indexOf(x) === i);

/**
 * The few dates written under the activity timeline: the first and last period, and each new year in between
 * (left out where it would sit on top of the first or last one). `at` is the column's centre, in percent.
 */
export const timelineTicks = (tl) => {
  const buckets = tl?.buckets || [];
  if (buckets.length < 2) return [];
  const total = buckets.length;
  const at = (i) => ((i + 0.5) / total) * 100;
  const startsYear = (b) => (tl.unit === 'month' ? b.key.endsWith('-01') : tl.unit === 'quarter' ? b.key.endsWith('Q1') : true);
  const ticks = [{ i: 0, text: buckets[0].label }, { i: total - 1, text: buckets[total - 1].label }];
  buckets.forEach((b, i) => {
    if (i > 0 && i < total - 1 && startsYear(b) && at(i) - at(0) > 11 && at(total - 1) - at(i) > 11) ticks.push({ i, text: b.key.slice(0, 4) });
  });
  return ticks.map((t) => ({ ...t, at: Math.min(94, Math.max(6, at(t.i))) })).sort((a, b) => a.i - b.i);
};

/** The posting rate in the unit that reads naturally: "1.8 a day", "0.4 a month". Older saved reports only have a per-day figure. */
export const postingRate = (facts) => {
  const c = facts?.cadence || {};
  return c.rate ? { label: `Posts a ${c.rate.unit}`, value: c.rate.value } : { label: 'Posts a day', value: c.posts_per_day ?? 0 };
};

/** "4 years", "7 months", "12 days". */
export const spanText = (cov = {}) => cov.span_label || `${cov.span_days ?? 0} days`;

/** "2022-05-23" (a calendar day) as "23 May 2022"; anything else is shown as it came. */
export const dayLabel = (day) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m) return day ? String(day) : '?';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
};

/** Platforms whose whole timeline can be collected. The server sends its own list; this is the fallback. */
export const DEFAULT_SUPPORTED_PLATFORMS = ['x', 'facebook', 'instagram', 'youtube', 'telegram'];

/* ----------------------------------------------------------------------------- progress --------------------- */

/**
 * Where a profile is: collecting posts, analysing them, or ready.
 * @returns {{ phase: 'collecting'|'failed'|'analysing'|'ready'|'empty', label: string }}
 */
export const progressOf = (subject) => {
  const accounts = subject?.accounts || [];
  const failed = accounts.filter((a) => a.fetch_status === 'failed');
  if ((subject?.collecting || 0) > 0 || accounts.some((a) => a.fetch_status === 'pending' || a.fetch_status === 'running')) {
    return { phase: 'collecting', label: 'Collecting posts' };
  }
  if (failed.length) return { phase: 'failed', label: failed.length === accounts.length ? 'Collection stopped' : 'Partly collected' };
  if ((subject?.waiting || 0) > 0) return { phase: 'analysing', label: 'Analysing posts' };
  if (!subject?.posts) return { phase: 'empty', label: 'No posts found' };
  return { phase: 'ready', label: 'Ready' };
};

/** Why the report button is locked, or '' when it can be used: it needs at least one analysed post. */
export const reportLockReason = (subject) => {
  if (!subject) return '';
  if (!subject.posts) return 'No posts have been collected yet. They are being fetched; the report unlocks once the first posts are analysed.';
  if (!subject.analysed) return 'Posts are still being analysed. The report unlocks once the first posts are analysed.';
  return '';
};

/** "1,240 of 5,000" style progress of the analysis. Posts without text are skipped and count as processed. */
export const analysisProgress = (subject) => {
  const total = Number(subject?.posts) || 0;
  const processed = total - (Number(subject?.waiting) || 0);
  return { total, processed, percent: total ? Math.min(100, Math.round((processed / total) * 100)) : 0 };
};

export const formatCount = (n) => Number(n || 0).toLocaleString('en-IN');

/* --------------------------------------------------------------------------- the report --------------------- */

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

const TEXT_FIELDS = ['bottom_line', 'attention_reason', 'account_type_basis', 'tone', 'communication_style', 'posting_pattern', 'platform_differences', 'influence'];
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
