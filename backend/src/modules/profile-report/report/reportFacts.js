/**
 * PROFILE BEHAVIOUR REPORT: the numbers.
 *
 * Everything a behaviour report states as a number is computed here from the profile's own posts:
 * posting rhythm, content mix, tone, stance, risk, engagement and how they change over time.
 * The model never calculates; it only reads these facts and the numbered evidence posts.
 * Sentiment and risk use the same helpers as the event report, so a post counts the same everywhere.
 */
const { parseSentiment, evaluateThreatRisk } = require('../../events/eventTelemetry.service');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_TZ = 'Asia/Kolkata';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round1 = (n) => Math.round(n * 10) / 10;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Same engagement fields the event report reads, with the same score (views count a tenth). */
const engagementOf = (eng) => {
  const e = eng && typeof eng === 'object' && !Array.isArray(eng) ? eng : {};
  const likes = num(e.likes ?? e.like_count ?? e.favorite_count ?? e.reactions);
  const shares = num(e.shares ?? e.retweets ?? e.reposts ?? e.share_count ?? e.retweet_count);
  const comments = num(e.comments ?? e.replies ?? e.comment_count ?? e.reply_count);
  const views = num(e.views ?? e.view_count ?? e.impressions);
  return { likes, shares, comments, views, score: likes + shares + comments + Math.floor(views / 10) };
};

const formatters = new Map();
/** Hour, weekday and calendar day of a moment in the tenant's timezone. */
const localParts = (date, timeZone) => {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone, hourCycle: 'h23', hour: '2-digit', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      });
    } catch (e) {
      return localParts(date, DEFAULT_TZ);
    }
    formatters.set(timeZone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    hour: Number(p.hour) % 24,
    weekday: Math.max(0, WEEKDAYS.indexOf(String(p.weekday).slice(0, 3))),
    day: `${p.year}-${p.month}-${p.day}`,
  };
};

const postTime = (p) => {
  const d = p.posted_at ? new Date(p.posted_at) : p.fetched_at ? new Date(p.fetched_at) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const analysisOf = (p) => (p.analysis_result && typeof p.analysis_result === 'object' && !Array.isArray(p.analysis_result) ? p.analysis_result : {});
const isAnalysed = (a) => Boolean(a && (a.sentiment || a.label) && !a.skipped);

const stanceOf = (raw) => {
  if (raw == null || raw === '') return 'unknown';
  const s = String(raw).toLowerCase();
  if (s.includes('support') || s.includes('pro') || s.includes('favour') || s.includes('favor')) return 'support';
  if (s.includes('oppose') || s.includes('anti') || s.includes('against')) return 'oppose';
  return 'neutral';
};

/** A repost / share of someone else's content. `kind` is decided when the post is stored; the text check covers older rows. */
const isShared = (p) => p.kind === 'shared' || /^RT @/i.test(String(p.text || '').trim());
const isReply = (p) => p.kind === 'reply' || /^@\w/.test(String(p.text || '').trim());
const hasMedia = (p) => (Array.isArray(p.media_urls) && p.media_urls.length > 0) ||
  /photo|image|video|reel|album|gif/i.test(String(p.media_type || ''));

/** Text read from a post's picture (OCR), or described from its video. */
const imageTextOf = (img) => {
  if (!img || typeof img !== 'object' || img.failed) return '';
  return String(img.full_text || [img.description, img.summary].filter(Boolean).join(' ') || '').replace(/\s+/g, ' ').trim();
};

const HASHTAG_RE = /#[\p{L}\p{M}\p{N}_]{2,60}/gu;
const MENTION_RE = /(?:^|[^\w@])@([A-Za-z0-9_.]{2,30})/g;
const LINK_RE = /https?:\/\/\S+/i;

const countInto = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };
/** Counts #Tag and #tag together, shown the way the account first wrote it. */
const countFolded = (map, shown, raw) => {
  const k = raw.toLowerCase();
  map.set(k, (map.get(k) || 0) + 1);
  if (!shown.has(k)) shown.set(k, raw);
};
const topOf = (map, n, keyName = 'name') => [...map.entries()]
  .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
  .slice(0, n)
  .map(([k, v]) => ({ [keyName]: k, count: v }));

const labelOf = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') return String(v.keyword || v.name || v.label || v.signal || v.term || v.section || '').trim();
  return String(v).trim();
};

/** Monday of the week a calendar day falls in, as YYYY-MM-DD. */
const weekStart = (day) => {
  const d = new Date(`${day}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * DAY_MS).toISOString().slice(0, 10);
};

/**
 * One normalised record per post: what every later step (facts, evidence, prompt, PDF) reads.
 * Posts come in any order; the result is oldest first.
 */
const normalisePosts = (posts = [], { timezone = DEFAULT_TZ } = {}) => posts
  .map((p) => {
    const when = postTime(p);
    const a = analysisOf(p);
    const analysed = isAnalysed(a);
    const risk = analysed ? evaluateThreatRisk(a) : { riskLevel: null, riskScore: 0, hasThreatVector: false };
    const text = String(p.text || '').trim();
    return {
      id: p.id != null ? String(p.id) : null,
      url: p.url || null,
      platform: String(p.platform || '').toLowerCase() === 'twitter' ? 'x' : String(p.platform || '').toLowerCase(),
      at: when,
      local: when ? localParts(when, timezone) : null,
      text,
      imageText: imageTextOf(p.image_analysis),
      accountHandle: p.account_handle || '',
      english: analysed && a.english_text && String(a.english_text).trim() !== text ? String(a.english_text).trim() : '',
      language: analysed && a.language ? String(a.language).toLowerCase() : null,
      analysed,
      sentiment: analysed ? parseSentiment(a.sentiment || a.label) : null,
      stance: analysed ? stanceOf(a.stance) : 'unknown',
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      category: analysed ? labelOf(a.category) : '',
      summary: analysed ? String(a.summary || a.reasoning || '').trim() : '',
      signals: analysed && Array.isArray(a.signals) ? a.signals.map(labelOf).filter(Boolean) : [],
      keywords: analysed && Array.isArray(a.matched_keywords) ? a.matched_keywords.map(labelOf).filter(Boolean) : [],
      legal: analysed && Array.isArray(a.legal_sections) ? a.legal_sections.map(labelOf).filter(Boolean) : [],
      engagement: engagementOf(p.engagement),
      shared: isShared(p),
      reply: isReply(p),
      media: hasMedia(p),
      link: LINK_RE.test(text),
      hashtags: text.match(HASHTAG_RE) || [],
      mentions: [...text.matchAll(MENTION_RE)].map((m) => `@${m[1]}`),
    };
  })
  .sort((x, y) => (x.at ? x.at.getTime() : 0) - (y.at ? y.at.getTime() : 0));

const sentimentCounts = (rows) => rows.reduce((acc, r) => {
  if (r.sentiment) acc[r.sentiment] += 1;
  return acc;
}, { positive: 0, neutral: 0, negative: 0 });

/** Negative share and serious-risk count for one stretch of posts. */
const stretch = (rows) => {
  const analysed = rows.filter((r) => r.analysed);
  const neg = analysed.filter((r) => r.sentiment === 'negative').length;
  const first = rows.find((r) => r.at);
  const last = [...rows].reverse().find((r) => r.at);
  return {
    posts: rows.length,
    from: first ? first.local.day : null,
    to: last ? last.local.day : null,
    negative_share: pct(neg, analysed.length),
    high_risk: rows.filter((r) => r.riskLevel === 'critical' || r.riskLevel === 'high').length,
  };
};

const directionOf = (before, after, step) => {
  if (after - before >= step) return 'rising';
  if (before - after >= step) return 'falling';
  return 'steady';
};

/**
 * The attention level is decided here, from risk counts, so the same posts always give the same level.
 * The model is told the level and only explains it.
 */
const attentionLevel = (risk) => {
  if (risk.critical >= 1 || risk.high >= 2) return 'High';
  if (risk.high === 1 || risk.medium >= 2) return 'Medium';
  return 'Low';
};

/**
 * All the numbers for one profile.
 * @param {object} args
 * @param {object} args.account   { id, display_name } of the profile (a single-account profile may also carry handle / platform)
 * @param {Array}  args.accounts  the profile's platform accounts: { platform, platform_name, handle }
 * @param {Array}  args.rows      normalisePosts() output (oldest first): every collected post, no cap
 */
const buildBehaviorFacts = ({ account = {}, accounts = [], rows = [], totalPosts = rows.length, timezone = DEFAULT_TZ, now = new Date() } = {}) => {
  const dated = rows.filter((r) => r.at);
  const analysed = rows.filter((r) => r.analysed);
  const first = dated[0] || null;
  const last = dated[dated.length - 1] || null;
  const spanDays = first && last ? Math.max(1, Math.ceil((last.at - first.at) / DAY_MS) || 1) : 1;

  // ---- rhythm
  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const days = new Set();
  let longestGap = 0;
  dated.forEach((r, i) => {
    byHour[r.local.hour] += 1;
    byWeekday[r.local.weekday] += 1;
    days.add(r.local.day);
    if (i > 0) longestGap = Math.max(longestGap, (r.at - dated[i - 1].at) / DAY_MS);
  });
  const bands = Array.from({ length: 8 }, (_, b) => ({ from: b * 3, count: byHour.slice(b * 3, b * 3 + 3).reduce((s, n) => s + n, 0) }));
  const topBand = [...bands].sort((a, b) => b.count - a.count)[0];
  const topDay = byWeekday.indexOf(Math.max(...byWeekday));
  const night = byHour.slice(0, 5).reduce((s, n) => s + n, 0);

  // ---- weekly buckets, newest 12
  const weeks = new Map();
  dated.forEach((r) => {
    const k = weekStart(r.local.day);
    const w = weeks.get(k) || { week: k, posts: 0, negative: 0, high_risk: 0 };
    w.posts += 1;
    if (r.sentiment === 'negative') w.negative += 1;
    if (r.riskLevel === 'critical' || r.riskLevel === 'high') w.high_risk += 1;
    weeks.set(k, w);
  });

  // ---- content
  const hashtags = new Map();
  const mentions = new Map();
  const shown = new Map();
  const languages = new Map();
  const categories = new Map();
  const signals = new Map();
  const keywords = new Map();
  rows.forEach((r) => {
    r.hashtags.forEach((h) => countFolded(hashtags, shown, h));
    r.mentions.forEach((m) => countFolded(mentions, shown, m));
    if (r.language) countInto(languages, r.language);
    if (r.category) countInto(categories, r.category);
    new Set(r.signals).forEach((s) => countInto(signals, s));
    new Set(r.keywords).forEach((k) => countInto(keywords, k));
  });
  const withText = rows.filter((r) => r.text.length > 0);

  // ---- engagement
  const total = rows.reduce((acc, r) => {
    acc.likes += r.engagement.likes;
    acc.shares += r.engagement.shares;
    acc.comments += r.engagement.comments;
    acc.views += r.engagement.views;
    return acc;
  }, { likes: 0, shares: 0, comments: 0, views: 0 });
  const scores = rows.map((r) => r.engagement.score).sort((a, b) => a - b);
  const median = scores.length ? scores[Math.floor((scores.length - 1) / 2)] : 0;

  // ---- tone, stance, risk
  const sentiment = sentimentCounts(rows);
  const stance = rows.reduce((acc, r) => { acc[r.stance] += 1; return acc; }, { support: 0, oppose: 0, neutral: 0, unknown: 0 });
  const risk = analysed.reduce((acc, r) => { acc[r.riskLevel] = (acc[r.riskLevel] || 0) + 1; return acc; }, { critical: 0, high: 0, medium: 0, low: 0 });
  const riskScores = analysed.map((r) => r.riskScore);
  const maxRisk = riskScores.reduce((m, n) => (n > m ? n : m), 0);

  // ---- per platform (a profile can combine several accounts)
  const platformMap = new Map();
  rows.forEach((r) => {
    const e = platformMap.get(r.platform) || { platform: r.platform, posts: 0, analysed: 0, negative: 0, high_risk: 0, engagement: 0, first: null, last: null };
    e.posts += 1;
    if (r.analysed) e.analysed += 1;
    if (r.sentiment === 'negative') e.negative += 1;
    if (r.riskLevel === 'critical' || r.riskLevel === 'high') e.high_risk += 1;
    e.engagement += r.engagement.score;
    if (r.local) {
      if (!e.first || r.local.day < e.first) e.first = r.local.day;
      if (!e.last || r.local.day > e.last) e.last = r.local.day;
    }
    platformMap.set(r.platform, e);
  });
  const byPlatform = [...platformMap.values()]
    .sort((a, b) => b.posts - a.posts)
    .map((e) => ({
      platform: e.platform,
      posts: e.posts,
      analysed: e.analysed,
      negative_share: pct(e.negative, e.analysed),
      high_risk: e.high_risk,
      avg_engagement: e.posts ? Math.round(e.engagement / e.posts) : 0,
      first_post: e.first,
      last_post: e.last,
    }));
  const accountList = accounts.map((a) => ({
    platform: a.platform,
    platform_name: a.platform_name || a.platform,
    handle: a.handle,
    posts: rows.filter((r) => r.platform === a.platform && String(r.accountHandle).toLowerCase() === String(a.handle).toLowerCase()).length,
  }));

  // ---- trend: older half against newer half (needs enough posts to mean anything)
  let trend = null;
  if (dated.length >= 8) {
    const mid = Math.floor(dated.length / 2);
    const before = stretch(dated.slice(0, mid));
    const after = stretch(dated.slice(mid));
    trend = {
      earlier: before,
      later: after,
      negativity: directionOf(before.negative_share, after.negative_share, 15),
      risk: directionOf(before.high_risk, after.high_risk, 2),
    };
  }

  return {
    profile: {
      id: account.id ?? null,
      name: account.display_name || account.handle || accountList[0]?.handle || '',
      handle: account.handle || accountList.map((a) => a.handle).join(', '),
      platform: account.platform || (accountList.length > 1 ? 'multiple' : accountList[0]?.platform || ''),
      platform_name: account.platform_name || accountList.map((a) => a.platform_name).join(', '),
      accounts: accountList,
    },
    timezone,
    today: localParts(now, timezone).day,
    coverage: {
      total_posts: totalPosts,
      read: rows.length,
      analysed: analysed.length,
      not_analysed: rows.length - analysed.length,
      first_post: first ? first.local.day : null,
      last_post: last ? last.local.day : null,
      span_days: spanDays,
    },
    cadence: {
      posts_per_day: round1(dated.length / spanDays),
      active_days: days.size,
      busiest_hours: topBand && topBand.count > 0 ? { from: topBand.from, to: topBand.from + 3, posts: topBand.count } : null,
      busiest_day: byWeekday[topDay] > 0 ? { day: WEEKDAYS[topDay], posts: byWeekday[topDay] } : null,
      night_posts: night,
      longest_gap_days: round1(longestGap),
      by_hour: byHour,
      by_weekday: byWeekday,
      weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-12),
    },
    content: {
      original: rows.filter((r) => !r.shared && !r.reply).length,
      shared: rows.filter((r) => r.shared).length,
      replies: rows.filter((r) => r.reply && !r.shared).length,
      with_media: rows.filter((r) => r.media).length,
      with_image_text: rows.filter((r) => r.imageText.length > 0).length,
      with_links: rows.filter((r) => r.link).length,
      avg_length: withText.length ? Math.round(withText.reduce((s, r) => s + Array.from(r.text).length, 0) / withText.length) : 0,
      languages: topOf(languages, 6, 'language'),
      hashtags: topOf(hashtags, 10, 'tag').map((x) => ({ ...x, tag: shown.get(x.tag) || x.tag })),
      mentions: topOf(mentions, 10, 'handle').map((x) => ({ ...x, handle: shown.get(x.handle) || x.handle })),
    },
    engagement: {
      total,
      avg_score: rows.length ? Math.round(scores.reduce((s, n) => s + n, 0) / rows.length) : 0,
      median_score: median,
    },
    sentiment,
    stance,
    risk: {
      ...risk,
      avg_score: riskScores.length ? Math.round(riskScores.reduce((s, n) => s + n, 0) / riskScores.length) : 0,
      max_score: maxRisk,
    },
    by_platform: byPlatform,
    attention_level: attentionLevel(risk),
    categories: topOf(categories, 8),
    signals: topOf(signals, 8),
    keywords: topOf(keywords, 10, 'term'),
    legal_flag_posts: rows.filter((r) => r.legal.length > 0).length,
    trend,
  };
};

/**
 * The posts the model reads, numbered P1..Pn oldest first. Chosen so a long history still shows
 * what matters: every serious-risk post first, then the most engaged, the negative, the newest,
 * and an even spread across the whole period for the rest.
 */
const selectEvidence = (rows = [], { max = 40 } = {}) => {
  const usable = rows.filter((r) => r.text.length >= 3 || r.english.length >= 3 || r.imageText.length >= 3);
  const picked = new Map();
  const take = (list, n, reason) => {
    for (const r of list) {
      if (picked.size >= max || n <= 0) break;
      const key = r.id || `${r.at?.getTime()}-${r.text.slice(0, 20)}-${r.imageText.slice(0, 20)}`;
      const had = picked.get(key);
      if (had) { if (!had.reasons.includes(reason)) had.reasons.push(reason); continue; }
      picked.set(key, { row: r, reasons: [reason] });
      n -= 1;
    }
  };
  const byRisk = [...usable].sort((a, b) => b.riskScore - a.riskScore);
  take(byRisk.filter((r) => r.riskLevel === 'critical' || r.riskLevel === 'high'), 12, 'high_risk');
  take(byRisk.filter((r) => r.riskLevel === 'medium'), 6, 'medium_risk');
  take([...usable].sort((a, b) => b.engagement.score - a.engagement.score).filter((r) => r.engagement.score > 0), 8, 'top_engagement');
  take([...usable].reverse().filter((r) => r.sentiment === 'negative'), 6, 'negative');
  take([...usable].reverse(), 6, 'recent');
  const room = max - picked.size;
  if (room > 0 && usable.length) {
    // Evenly spaced candidates across the whole period, more than needed: some land on posts already picked.
    const count = Math.min(usable.length, room * 4);
    take(Array.from({ length: count }, (_, i) => usable[Math.min(usable.length - 1, Math.floor((i * usable.length) / count))]), room, 'spread');
  }
  return [...picked.values()]
    .sort((a, b) => (a.row.at ? a.row.at.getTime() : 0) - (b.row.at ? b.row.at.getTime() : 0))
    .map(({ row, reasons }, i) => ({
      n: i + 1,
      id: row.id,
      url: row.url,
      platform: row.platform,
      posted_at: row.at ? row.at.toISOString() : null,
      day: row.local ? row.local.day : null,
      hour: row.local ? row.local.hour : null,
      account_handle: row.accountHandle,
      text: row.text,
      image_text: row.imageText,
      english: row.english,
      sentiment: row.sentiment,
      stance: row.stance,
      risk_level: row.riskLevel,
      risk_score: row.riskScore,
      category: row.category,
      summary: row.summary,
      shared: row.shared,
      reply: row.reply,
      engagement: row.engagement,
      reasons,
    }));
};

module.exports = {
  DEFAULT_TZ,
  WEEKDAYS,
  engagementOf,
  normalisePosts,
  buildBehaviorFacts,
  selectEvidence,
  attentionLevel,
  localParts,
};
