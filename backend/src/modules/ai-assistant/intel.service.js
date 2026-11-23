/**
 * Intelligence layer for the assistant.
 *
 * Questions about public order, threats, narratives and the daily brief are answered from structured
 * queries (dates, places, status, counts) over every module, scored and de-duplicated, then written
 * out deterministically. The language model is not asked to work out dates, places or numbers.
 *
 * Works for every tenant: the tenant's state, districts and time zone come from its database name.
 */

const { loadTenantGeo, placeIn, relevance, tzOffsetMs } = require('./intel.geo');

/* ───────────────────────── time ───────────────────────── */

const DAY = 86400000;

const tzParts = (date, tz) => {
  const off = tzOffsetMs(date, tz);
  const d = new Date(date.getTime() + off);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), off };
};
/** Start of the local day containing `date`, as a real instant. */
const startOfDay = (date, tz) => {
  const p = tzParts(date, tz);
  const guess = Date.UTC(p.y, p.m, p.d);
  return new Date(guess - tzOffsetMs(new Date(guess - p.off), tz));
};
const addDays = (date, n) => new Date(date.getTime() + n * DAY);
const fmtDay = (date, tz) =>
  new Date(date.getTime() + tzOffsetMs(date, tz)).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
const fmtDateTime = (date, tz) =>
  new Date(date.getTime() + tzOffsetMs(date, tz)).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  });

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A specific date named in the text ("25 November", "25/11", "Nov 25"), as a local-day start. */
const findDateMention = (text, now, tz) => {
  const t = String(text || '').toLowerCase();
  const year = tzParts(now, tz).y;
  let m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  let day; let mon;
  if (m) { day = Number(m[1]); mon = MONTHS.indexOf(m[2].slice(0, 3)); }
  if (!m) {
    m = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (m) { mon = MONTHS.indexOf(m[1].slice(0, 3)); day = Number(m[2]); }
  }
  if (!m) {
    m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
    if (m) { day = Number(m[1]); mon = Number(m[2]) - 1; }
  }
  if (day == null || mon < 0 || mon > 11 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, mon, day) - tzOffsetMs(now, tz));
};

/** What period the question is about. */
const parseWindow = (question, now, tz) => {
  const q = String(question || '').toLowerCase();
  const today = startOfDay(now, tz);
  const mk = (from, to, label, explicit = true) => ({ from, to, label, explicit });
  let m;
  if (/\btomorrow\b|\bnext day\b/.test(q)) return mk(addDays(today, 1), addDays(today, 2), `tomorrow (${fmtDay(addDays(today, 1), tz)})`);
  if (/\byesterday\b/.test(q)) return mk(addDays(today, -1), today, `yesterday (${fmtDay(addDays(today, -1), tz)})`);
  if (/\bnext week\b/.test(q)) {
    const mondayOffset = (8 - tzParts(now, tz).dow) % 7 || 7;
    const from = addDays(today, mondayOffset);
    return mk(from, addDays(from, 7), 'next week');
  }
  if (/\bthis week\b|\bthis weekend\b|\bupcoming\b|\bcoming days\b/.test(q)) return mk(today, addDays(today, 7), 'the next 7 days');
  if ((m = q.match(/\bnext\s+(\d{1,2})\s+days?\b/))) return mk(today, addDays(today, Number(m[1])), `the next ${m[1]} days`);
  if ((m = q.match(/\b(?:last|past)\s+(\d{1,2})\s+days?\b/))) return mk(addDays(today, -Number(m[1])), addDays(today, 1), `the last ${m[1]} days`);
  if (/\blast\s*24\s*h(?:ou)?rs?\b|\bpast\s*24\s*h(?:ou)?rs?\b|\blast day\b/.test(q)) return mk(new Date(now.getTime() - DAY), now, 'the last 24 hours');
  if (/\blast week\b|\bpast week\b/.test(q)) return mk(addDays(today, -7), addDays(today, 1), 'the last 7 days');
  if (/\btoday\b|\btonight\b|\bcurrently\b|\bright now\b|\bhappening now\b|\bongoing\b|\bactive\b/.test(q)) return mk(today, addDays(today, 1), `today (${fmtDay(today, tz)})`);
  const named = findDateMention(q, now, tz);
  if (named) return mk(named, addDays(named, 1), fmtDay(named, tz));
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(q));
  if (wd >= 0) {
    const ahead = (wd - tzParts(now, tz).dow + 7) % 7;
    const day = addDays(today, ahead);
    return mk(day, addDays(day, 1), fmtDay(day, tz));
  }
  return null;
};

/* ───────────────────────── language ───────────────────────── */

// English words match from a word boundary (so "bandh" is not found inside "sambandh"); short Hindi words must stand alone.
const PROTEST_EN = 'protest|demonstration|rally|rallies|dharna|bandh|strike|agitation|blockade|gherao|chakka ?jam|morcha|sit-in|sit in|rasta roko|andolan|shutdown|lathi ?charge|stir\\b|march against|hunger strike|torch ?light|candle march|road ?block|road jam';
const PROTEST_HI = 'विरोध|प्रदर्शन|धरना|हड़ताल|आंदोलन|घेराव|चक्का जाम|सड़क जाम|अनशन';
const PROTEST_HI_ALONE = 'बंद|रैली|जुलूस|कूच|मोर्चा';
const VIOLENCE_EN = 'violen|clash|riot|arson|stone ?pelting|lathi ?charge|firing\\b|curfew|mob\\b|lynch|vandalis|attack|assault|killed|murder|dead\\b|death|died\\b|fatal|casualt|injur|hostage|bomb|blast|explosion';
const VIOLENCE_HI = 'हिंसा|पथराव|आगजनी|झड़प|दंगा|हत्या|मौत|हमला|गोलीबारी|कर्फ्यू|घायल';
const THREAT_EN = 'threat|warning\\b|ultimatum|will burn|will kill|terror|extremis|naxal|maoist|ied\\b|kidnap|ransom';
const THREAT_HI = 'धमकी|आतंक|नक्सल|माओवादी|अपहरण';
const MISINFO_EN = 'fake|rumou?r|misleading|hoax|false claim|fact[- ]?check|unverified|fabricated|doctored|morphed';
const MISINFO_HI = 'अफवाह|फर्जी|झूठ|भ्रामक';

// Postgres pre-filter (broad); the JavaScript tests below are the precise check.
const forPostgres = (re) => re.replace(/\\b/g, '\\y'); // Postgres writes a word boundary as \y
const PROTEST_RE = forPostgres(`(${PROTEST_EN}|${PROTEST_HI}|${PROTEST_HI_ALONE})`);
const VIOLENCE_RE = forPostgres(`(${VIOLENCE_EN}|${VIOLENCE_HI})`);
const THREAT_RE = forPostgres(`(${THREAT_EN}|${THREAT_HI})`);
const MISINFO_RE = forPostgres(`(${MISINFO_EN}|${MISINFO_HI})`);

const HI_EDGE = '[\\u0900-\\u097F]';
const compile = (en, hi, alone = '') => new RegExp(
  `\\b(?:${en})|(?:${hi})${alone ? `|(?<!${HI_EDGE})(?:${alone})(?!${HI_EDGE})` : ''}`,
  'iu'
);
const CALL_RE = /\b(?:call(?:s|ed|ing)? (?:for|to)|appeal(?:s|ed)?|urge[sd]?|join us|gather(?:s|ing)?|assemble|will (?:hold|stage|protest|march|gherao|block|sit)|to (?:protest|gherao|march|block|stage)|plans? to|announce[sd]?|ultimatum|mobili[sz]\w*|come out|everyone (?:to|must)|organi[sz]e[sd]?)\b|आह्वान|अपील|घेराव करेंगे|धरना देंगे|प्रदर्शन करेंगे|बंद का|कूच करेंगे|जुटेंगे|इकट्ठा/i;
const PRESENT_RE = /\b(?:are protesting|is protesting|protesting|staged|staging|blocked|blocking|sit-?in|dharna (?:on|at)|gathered|ongoing|continues|continued|since morning|on the road|road jam|jammed)\b|विरोध कर रहे|प्रदर्शन कर रहे|धरने पर|जाम कर/i;

// Short Hindi words (बंद = "closed", रैली, जुलूस, कूच) must stand alone; the longer ones match inside inflections.
const HI_ALONE = '(?<![\\u0900-\\u097F])(?:बंद|रैली|जुलूस|कूच|मोर्चा)(?![\\u0900-\\u097F])';
const PROTEST_TERMS = compile(PROTEST_EN, PROTEST_HI, PROTEST_HI_ALONE);
const VIOLENCE_TERMS = compile(VIOLENCE_EN, VIOLENCE_HI);
const THREAT_TERMS = compile(THREAT_EN, THREAT_HI);
const MISINFO_TERMS = compile(MISINFO_EN, MISINFO_HI);
const DEATH_TERMS = /(killed|murder|dead|death|died|fatal|fatalit|lynch|हत्या|मौत)/i;

/* ───────────────────────── intent ───────────────────────── */

const FOLLOW_UP = /^(and |also |what about|how about|which (?:one|ones|of)|only |those|them|these|any (?:in|of)|filter|narrow|show only|just |what of|then )/i;

const detectIntent = (question) => {
  const q = String(question || '').toLowerCase();
  if (/\b(intelligence brief|daily brief|\bdib\b|brief me|morning brief|today'?s brief)\b/.test(q)) return 'brief';
  if (/\bcompare\b.*\b(yesterday|last week|previous)\b|\bvs\.? yesterday\b/.test(q)) return 'compare';
  if (PROTEST_TERMS.test(q) || /\blaw[- ]and[- ]order\b|\bpublic order\b|\bmobili[sz]/.test(q)) return 'protest';
  if (/\bnarratives?\b|\brecurring issues?\b|\bemerging (?:issues?|trends?)\b|\btrending\b|\btopics?\b/.test(q)) return 'narrative';
  if (/\bmisinformation\b|\bfake news\b|\brumou?rs?\b|\bviral\b/.test(q)) return 'misinfo';
  if (/\b(high[- ]severity|top \d+|high[- ]risk|violence|threats?|critical)\b.*\b(alerts?|incidents?|posts?)\b|\bincidents? involving\b|\bincreasing engagement\b/.test(q)) return 'threat';
  return null;
};

const detectPlace = (text, profile) => placeIn(text, profile);

const detectStatusWanted = (question) => {
  const q = String(question || '').toLowerCase();
  if (/\b(planned|upcoming|expected|scheduled|tomorrow|next week|will be|going to be)\b/.test(q)) return 'planned';
  if (/\b(active|ongoing|happening|currently|right now|today)\b/.test(q)) return 'active';
  if (/\b(past|previous|earlier|history|historical|last week|yesterday)\b/.test(q)) return 'past';
  return null;
};

/**
 * Understand one question, filling gaps from the earlier questions of the same chat
 * ("which ones are planned for tomorrow?", "what about Ranchi?").
 */
const understand = (question, prior, profile, now = new Date()) => {
  const parse = (text) => ({
    intent: detectIntent(text),
    window: parseWindow(text, now, profile.tz),
    place: detectPlace(text, profile),
    status: detectStatusWanted(text),
  });
  const cur = parse(question);
  const text = String(question || '').trim();
  const bareFilter = !cur.intent && text.split(/\s+/).length <= 5 && (cur.place || cur.window || cur.status) && !/\b(how many|count|total|number of)\b/i.test(text);
  const followUp = !/\b(how many|count|total|number of)\b/i.test(text) && (FOLLOW_UP.test(text) || bareFilter);
  const out = { ...cur, followUp: false, profile };
  if (followUp) {
    const earlier = (prior || []).filter((m) => m.role === 'user').slice(-4).reverse();
    for (const m of earlier) {
      const p = parse(m.content);
      if (!out.intent && p.intent) { out.intent = p.intent; out.followUp = true; }
      if (!out.window && p.window) { out.window = p.window; out.followUp = true; }
      if (!out.place && p.place) { out.place = p.place; out.followUp = true; }
      if (!out.status && p.status) out.status = p.status;
    }
  }
  return out;
};

/* ───────────────────────── retrieval ───────────────────────── */

const num = (v) => (typeof v === 'number' ? v : Number(v) || 0);

const engagementTotal = (eng) => {
  if (!eng || typeof eng !== 'object') return 0;
  const keys = ['likes', 'like_count', 'retweets', 'retweet_count', 'shares', 'share_count', 'comments', 'comment_count', 'replies',
    'reply_count', 'views', 'view_count', 'reactions', 'reactions_count', 'quotes', 'forwards', 'reshare_count', 'comments_count'];
  let total = 0;
  for (const k of keys) total += num(eng[k]);
  return total;
};

const safeQuery = async (prisma, sql, ...params) => {
  try {
    return await prisma.$queryRawUnsafe(sql, ...params);
  } catch {
    return [];
  }
};

const fetchAlerts = (prisma, from, to, pattern, limit) => safeQuery(
  prisma,
  `SELECT id::text AS id, title, left(coalesce(description, ''), 700) AS body, platform, author_handle, risk_level, risk_score,
          coalesce(posted_at, created_at) AS at, content_url AS url, status
   FROM social_media_alerts
   WHERE coalesce(posted_at, created_at) >= $1::timestamptz AND coalesce(posted_at, created_at) < $2::timestamptz
     AND ($3::text IS NULL OR title ~* $3 OR coalesce(description, '') ~* $3 OR matched_keywords::text ~* $3)
   ORDER BY coalesce(posted_at, created_at) DESC LIMIT $4`,
  from, to, pattern, limit
);

const fetchPosts = (prisma, from, to, pattern, limit) => safeQuery(
  prisma,
  `SELECT id::text AS id, left(coalesce(text, ''), 700) AS body, platform, author_handle, author_name, engagement,
          coalesce(posted_at, fetched_at) AS at, url
   FROM social_media_posts
   WHERE coalesce(posted_at, fetched_at) >= $1::timestamptz AND coalesce(posted_at, fetched_at) < $2::timestamptz
     AND ($3::text IS NULL OR coalesce(text, '') ~* $3)
   ORDER BY coalesce(posted_at, fetched_at) DESC LIMIT $4`,
  from, to, pattern, limit
);

const fetchGrievances = (prisma, from, to, pattern, limit) => safeQuery(
  prisma,
  `SELECT id::text AS id, left(coalesce(text, ''), 700) AS body, platform, author_handle, author_name, engagement,
          coalesce(posted_at, created_at) AS at, content_url AS url, workflow_status
   FROM social_media_grievances
   WHERE coalesce(posted_at, created_at) >= $1::timestamptz AND coalesce(posted_at, created_at) < $2::timestamptz
     AND ($3::text IS NULL OR coalesce(text, '') ~* $3)
   ORDER BY coalesce(posted_at, created_at) DESC LIMIT $4`,
  from, to, pattern, limit
);

const fetchNews = (prisma, from, to, pattern, limit) => safeQuery(
  prisma,
  `SELECT article_id AS id, title, left(coalesce(summary, content, ''), 700) AS body, source, state, district, location,
          published_at AS at, source_url AS url
   FROM news_articles
   WHERE published_at >= $1::timestamptz AND published_at < $2::timestamptz
     AND ($3::text IS NULL OR title ~* $3 OR coalesce(summary, '') ~* $3 OR coalesce(content, '') ~* $3)
   ORDER BY published_at DESC LIMIT $4`,
  from, to, pattern, limit
);

/** Events whose running period overlaps the window (not just those that start in it). */
const fetchEvents = (prisma, from, to, pattern, limit) => safeQuery(
  prisma,
  `SELECT id::text AS id, name AS title, left(coalesce(description, ''), 700) AS body, location, start_date, end_date,
          coalesce(start_date, created_at) AS at, monitoring_status::text AS monitoring
   FROM social_media_events
   WHERE coalesce(end_date, start_date, created_at) >= $1::timestamptz AND coalesce(start_date, created_at) < $2::timestamptz
     AND ($3::text IS NULL OR name ~* $3 OR coalesce(description, '') ~* $3 OR keywords::text ~* $3)
   ORDER BY coalesce(start_date, created_at) DESC LIMIT $4`,
  from, to, pattern, limit
);

const KIND_LABEL = {
  event: 'Monitored event record',
  alert: 'Flagged social-media post',
  post: 'Social-media post',
  grievance: 'Citizen grievance',
  news: 'News report',
};
const TABLE_OF = {
  event: 'social_media_events', alert: 'social_media_alerts', post: 'social_media_posts',
  grievance: 'social_media_grievances', news: 'news_articles',
};

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const toItem = (kind, r) => {
  const title = clip(r.title || r.body, 140);
  return {
    kind,
    table: TABLE_OF[kind],
    id: String(r.id),
    title,
    text: `${r.title || ''}\n${r.body || ''}`.trim(),
    url: r.url || null,
    platform: r.platform || r.source || null,
    author: r.author_handle ? `@${String(r.author_handle).replace(/^@/, '')}` : r.author_name || null,
    at: r.at ? new Date(r.at) : null,
    start: r.start_date ? new Date(r.start_date) : null,
    end: r.end_date ? new Date(r.end_date) : null,
    location: r.location || r.district || null,
    riskLevel: r.risk_level ? String(r.risk_level).toLowerCase() : null,
    riskScore: r.risk_score == null ? null : Number(r.risk_score),
    engagement: engagementTotal(r.engagement),
    stateTag: r.state || null,
    grievanceStatus: r.workflow_status || null,
  };
};

/** Pull from every module for the window. `pattern` narrows to the topic (null = everything). */
const gather = async (prisma, from, to, pattern, perSource = 150) => {
  const [alerts, posts, grievances, news, events] = await Promise.all([
    fetchAlerts(prisma, from, to, pattern, perSource),
    fetchPosts(prisma, from, to, pattern, perSource),
    fetchGrievances(prisma, from, to, pattern, perSource),
    fetchNews(prisma, from, to, pattern, perSource),
    fetchEvents(prisma, from, to, pattern, 50),
  ]);
  return [
    ...events.map((r) => toItem('event', r)),
    ...alerts.map((r) => toItem('alert', r)),
    ...posts.map((r) => toItem('post', r)),
    ...grievances.map((r) => toItem('grievance', r)),
    ...news.map((r) => toItem('news', r)),
  ];
};

/* ───────────────────────── analysis ───────────────────────── */

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'was', 'were', 'are', 'will', 'been', 'their', 'they',
  'them', 'about', 'into', 'over', 'after', 'before', 'than', 'then', 'also', 'its', 'not', 'but', 'who', 'what', 'when', 'where', 'which', 'your',
  'you', 'our', 'out', 'all', 'can', 'any', 'one', 'two', 'new', 'more', 'said', 'says', 'http', 'https', 'www', 'com', 'rt',
  'risk', 'report', 'post', 'video', 'update', 'news', 'latest', 'live', 'followup', 'prabhat', 'khabar', 'etv', 'bharat', 'highlight', 'announce', 'promote']);

const tokens = (text) => String(text || '')
  .replace(/\b(low|medium|high) risk\s*:?/gi, ' ')
  .toLowerCase()
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/[@#]\w+/g, ' ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .split(/\s+/)
  .filter((t) => t.length > 2 && !STOP.has(t));

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter += 1; });
  return inter / (a.size + b.size - inter);
};

const relevanceOf = (item, profile, place) => {
  if (place) return { score: 100, why: `mentions ${place}` };
  const r = relevance(`${item.text || ''} ${item.location || ''}`, item.stateTag, profile);
  // Events and grievances belong to the tenant's own workspace even when they name no place.
  if (r.score === 50 && (item.kind === 'event' || item.kind === 'grievance')) return { score: 70, why: null };
  return r;
};

const viralityOf = (item) => Math.max(0, Math.min(100, Math.round(20 * Math.log10(1 + (item.engagement || 0)))));

/** Evidence that something is really being organised, as opposed to people being angry online. */
const mobilizationEvidence = (item, now, tz, profile) => {
  const text = item.text || '';
  const call = CALL_RE.test(text);
  const dated = findDateMention(text, now, tz);
  const relative = /\b(tomorrow|tonight|today|this (?:morning|evening)|kal|aaj|कल|आज)\b/i.test(text);
  const present = PRESENT_RE.test(text);
  const place = detectPlace(`${text} ${item.location || ''}`, profile);
  return { call, dated, relative, present, place, any: call || Boolean(dated) || relative || present };
};

/** Active / planned / past / discussion. Events use their dates; posts need real evidence. */
const classify = (item, now, tz, profile) => {
  if (item.kind === 'event') {
    const start = item.start || item.at;
    const end = item.end || (start ? addDays(start, 1) : null);
    if (start && start > now) return { status: 'planned', planned: start, evidence: {} };
    if (end && end < now) return { status: 'past', planned: null, evidence: {} };
    return { status: 'active', planned: null, evidence: {} };
  }
  const ev = mobilizationEvidence(item, now, tz, profile);
  const ageH = item.at ? (now - item.at) / 3600000 : 999;
  const futureDate = ev.dated && ev.dated >= startOfDay(now, tz);
  const futureWords = /\b(tomorrow|will|plans? to|announce|ultimatum|next|upcoming|scheduled|कल|करेंगे)\b/i.test(item.text || '');
  if (futureDate && (ev.dated > now || futureWords) && ev.any) return { status: 'planned', planned: ev.dated, evidence: ev };
  if (ev.relative && /\btomorrow\b|कल/i.test(item.text || '') && futureWords) {
    return { status: 'planned', planned: addDays(startOfDay(item.at || now, tz), 1), evidence: ev };
  }
  if (ev.present && ageH <= 36 && (ev.place || ev.call || ev.relative)) return { status: 'active', planned: null, evidence: ev };
  if (ev.dated && ev.dated < startOfDay(now, tz)) return { status: 'past', planned: null, evidence: ev };
  if (ageH > 72) return { status: 'past', planned: null, evidence: ev };
  return { status: 'discussion', planned: null, evidence: ev };
};

const scoreItem = (item, now, tz, profile, place) => {
  const text = item.text || '';
  let severity = item.riskScore != null && Number.isFinite(item.riskScore) ? item.riskScore
    : item.riskLevel === 'high' ? 75 : item.riskLevel === 'medium' ? 50 : item.riskLevel === 'low' ? 25 : item.kind === 'event' ? 40 : 20;
  const why = [];
  if (DEATH_TERMS.test(text)) { severity += 20; why.push('reports deaths or serious harm'); }
  if (VIOLENCE_TERMS.test(text)) { severity += 12; why.push('mentions violence or clashes'); }
  if (THREAT_TERMS.test(text)) { severity += 10; why.push('contains threat language'); }
  severity = Math.min(100, Math.round(severity));

  const virality = viralityOf(item);
  const rel = relevanceOf(item, profile, place);
  const ev = mobilizationEvidence(item, now, tz, profile);
  let risk = 15;
  if (PROTEST_TERMS.test(text)) risk += 10;
  if (ev.call) { risk += 20; why.push('contains a call to action'); }
  if (ev.dated || ev.relative) { risk += 10; why.push('names a date'); }
  if (ev.place) { risk += 10; why.push(`names a location (${ev.place})`); }
  if (VIOLENCE_TERMS.test(text)) risk += 20;
  if (THREAT_TERMS.test(text)) risk += 10;
  risk += Math.round(virality * 0.2);
  // The platform's own assessment is evidence too: a LOW-risk alert is not "very likely to escalate".
  if (item.riskLevel === 'low') risk = Math.min(risk, DEATH_TERMS.test(text) ? 60 : 45);
  else if (item.riskLevel === 'medium') risk = Math.min(risk, DEATH_TERMS.test(text) ? 80 : 65);
  risk = Math.min(100, risk);
  if (virality >= 60) why.push('spreading quickly');
  if (rel.why) why.push(rel.why);
  return { severity, risk, virality, relevance: rel.score, why };
};

const priorityOf = (s) => {
  if (s.relevance < 30) return { code: 'P4', label: 'Informational' };
  if (s.severity >= 90 || (s.severity >= 80 && s.risk >= 80)) return { code: 'P0', label: 'Critical' };
  if (s.severity >= 70 || s.risk >= 70) return { code: 'P1', label: 'High' };
  if (s.severity >= 45 || s.risk >= 45) return { code: 'P2', label: 'Moderate' };
  if (s.severity >= 25 || s.risk >= 25) return { code: 'P3', label: 'Low' };
  return { code: 'P4', label: 'Informational' };
};

/** Collapse reposts and group stories about the same thing. */
const cluster = (items) => {
  const sets = items.map((it) => new Set(tokens(`${it.title} ${it.text}`).slice(0, 60)));
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const sim = jaccard(sets[i], sets[j]);
      const sameKind = items[i].kind === items[j].kind;
      if (sim >= 0.7 || (sim >= 0.45 && !sameKind) || (sim >= 0.5 && sets[i].size >= 6)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  items.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  });
  return [...groups.values()];
};

const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

/** One analysed record per cluster: best representative, counts, confidence, evidence. */
const analyse = (items, ctx) => {
  const { now, profile, place } = ctx;
  const tz = profile.tz;
  const groups = cluster(items);
  const out = groups.map((members) => {
    const scored = members.map((m) => ({ m, s: scoreItem(m, now, tz, profile, place), c: classify(m, now, tz, profile) }));
    scored.sort((a, b) => (priorityOf(a.s).code === priorityOf(b.s).code
      ? (b.m.engagement - a.m.engagement) : PRIORITY_RANK[priorityOf(a.s).code] - PRIORITY_RANK[priorityOf(b.s).code]));
    const best = scored[0];
    const kinds = new Set(members.map((m) => m.kind));
    const authors = new Set(members.map((m) => `${m.platform}|${m.author}`));
    const maxScore = (k) => Math.max(...scored.map((x) => x.s[k]));
    const sev = maxScore('severity');
    const rsk = maxScore('risk');
    const vir = Math.min(100, Math.max(...scored.map((x) => x.s.virality)) + Math.min(15, (members.length - 1) * 3));
    const rel = best.s.relevance;
    const scores = { severity: sev, risk: rsk, virality: vir, relevance: rel };
    const statusOrder = ['active', 'planned', 'past', 'discussion'];
    const status = statusOrder.find((st) => scored.some((x) => x.c.status === st)) || 'discussion';
    const planned = scored.map((x) => x.c.planned).find(Boolean) || null;
    let confidence = 'Low';
    if (kinds.has('event') || (kinds.size >= 2 && authors.size >= 2) || authors.size >= 3) confidence = 'High';
    else if (kinds.has('news') || kinds.has('alert') || authors.size >= 2) confidence = 'Medium';
    const place2 = detectPlace(`${best.m.text} ${best.m.location || ''}`, profile) || place || null;
    return {
      lead: best.m,
      members,
      status,
      planned,
      place: place2,
      scores,
      priority: priorityOf(scores),
      why: [...new Set(scored.flatMap((x) => x.s.why))].slice(0, 4),
      confidence,
      kinds: [...kinds],
      platforms: [...new Set(members.map((m) => m.platform).filter(Boolean))],
      duplicates: members.length - 1,
      newest: new Date(Math.max(...members.map((m) => (m.at ? m.at.getTime() : 0)))),
      oldest: new Date(Math.min(...members.map((m) => (m.at ? m.at.getTime() : Date.now())))),
      mobilization: scored.some((x) => x.c.evidence && x.c.evidence.any) || kinds.has('event'),
    };
  });
  return out;
};

/* ───────────────────────── writing ───────────────────────── */

const SOURCE_NOTE = {
  event: 'Monitored event record',
  alert: 'Social-media claim (flagged)',
  post: 'Social-media claim',
  grievance: 'Citizen grievance',
  news: 'News report',
};

/** Registers a record as a citable source and returns its [n]. */
const makeSourceBook = () => {
  const list = [];
  const index = new Map();
  return {
    cite(rec) {
      const key = `${rec.lead.table}:${rec.lead.id}`;
      if (!index.has(key)) {
        list.push(rec);
        index.set(key, list.length);
      }
      return index.get(key);
    },
    list,
  };
};

const scoreLine = (r) => `Severity ${r.scores.severity} · Risk ${r.scores.risk} · Virality ${r.scores.virality} · Relevance ${r.scores.relevance}`;

const recordBlock = (r, book, tz, { showStatus = false } = {}) => {
  const n = book.cite(r);
  const when = r.status === 'planned' && r.planned
    ? `expected ${fmtDay(r.planned, tz)}`
    : r.lead.start && r.lead.kind === 'event'
      ? `${fmtDay(r.lead.start, tz)}${r.lead.end ? ` – ${fmtDay(r.lead.end, tz)}` : ''}`
      : r.newest && r.newest.getTime() ? `reported ${fmtDateTime(r.newest, tz)}` : '';
  const head = [
    `**${clip(r.lead.title, 110)}**`,
    `${r.priority.code} ${r.priority.label}`,
    r.place ? `📍 ${r.place}` : null,
    showStatus ? `Status: ${r.status}` : null,
    when || null,
  ].filter(Boolean).join(' · ');
  const lines = [
    `- ${head} [${n}]`,
    `  - ${scoreLine(r)}`,
    `  - Source: ${r.kinds.map((k) => SOURCE_NOTE[k]).join(', ')}${r.platforms.length ? ` (${r.platforms.slice(0, 3).join(', ')})` : ''} · Confidence: **${r.confidence}**${r.duplicates ? ` · ${r.duplicates} similar post${r.duplicates === 1 ? '' : 's'} merged` : ''}`,
  ];
  if (r.why.length) lines.push(`  - Why: ${r.why.join('; ')}`);
  return lines.join('\n');
};

const VERIFY_NOTE = 'Social-media content is a claim, not confirmed fact. Verify with local police intelligence before acting.';

const sourcesFromBook = (book, profile) => book.list.map((r, i) => ({
  chunk_id: null,
  source_table: r.lead.table,
  source_id: r.lead.id,
  similarity_score: 0,
  excerpt: clip(r.lead.text, 400),
  metadata: {
    title: r.lead.title,
    platform: r.lead.platform,
    published_at: r.lead.at || r.lead.start || null,
    url: r.lead.url,
    risk_level: r.priority.label.toLowerCase(),
    priority: r.priority.code,
    status: r.status,
    cite: i + 1,
  },
}));

const sortRecords = (list) => [...list].sort((a, b) => {
  const pa = PRIORITY_RANK[a.priority.code];
  const pb = PRIORITY_RANK[b.priority.code];
  if (pa !== pb) return pa - pb;
  if (b.scores.risk !== a.scores.risk) return b.scores.risk - a.scores.risk;
  return b.scores.virality - a.scores.virality;
});

const sectionOf = (title, recs, book, tz, limit = 8, opts) => {
  if (!recs.length) return '';
  const shown = recs.slice(0, limit);
  const more = recs.length > shown.length ? `\n_…and ${recs.length - shown.length} more of lower priority._` : '';
  return `\n### ${title} (${recs.length})\n${shown.map((r) => recordBlock(r, book, tz, opts)).join('\n')}${more}\n`;
};

const placeName = (profile) => profile.label || profile.state || 'your area';

/* ───────────────────────── intents ───────────────────────── */

const PROTEST_PATTERN = `${PROTEST_RE}|${VIOLENCE_RE}`;

const answerProtest = async (prisma, u, now) => {
  const { profile } = u;
  const tz = profile.tz;
  const today = startOfDay(now, tz);
  let win = u.window;
  const wanted = u.status;
  if (!win) {
    // No period named: what is on now and what is coming — never old history.
    win = wanted === 'past'
      ? { from: addDays(today, -7), to: addDays(today, 1), label: 'the last 7 days', explicit: false }
      : { from: addDays(today, -1), to: addDays(today, 8), label: 'today and the next 7 days', explicit: false };
  }
  // Fetch a little either side so an ongoing protest that started yesterday still shows as active.
  const from = new Date(Math.min(win.from.getTime(), addDays(today, -2).getTime()));
  const raw = await gather(prisma, from, win.to, PROTEST_PATTERN);
  const items = raw.filter((it) => PROTEST_TERMS.test(it.text) || it.kind === 'event');
  const relevantItems = items.filter((it) => relevanceOf(it, profile, u.place).score >= 30 || u.place);
  const placeFiltered = u.place
    ? relevantItems.filter((it) => new RegExp(u.place, 'i').test(`${it.text} ${it.location || ''}`))
    : relevantItems;
  const recs = analyse(placeFiltered, { now, profile, place: u.place });

  const inWindow = (r) => {
    if (r.status === 'planned') return r.planned ? r.planned >= win.from && r.planned < win.to : win.to > now;
    if (r.status === 'active') return win.to > today && win.from <= addDays(today, 1);
    return false;
  };
  const active = sortRecords(recs.filter((r) => r.status === 'active' && r.mobilization && inWindow(r)));
  const planned = sortRecords(recs.filter((r) => r.status === 'planned' && r.mobilization && inWindow(r)));
  const discussion = sortRecords(recs.filter((r) => r.status === 'discussion' || (!r.mobilization && r.status !== 'past')));
  const past = sortRecords(recs.filter((r) => r.status === 'past'));

  const book = makeSourceBook();
  const districts = new Set([...active, ...planned].map((r) => r.place).filter(Boolean));
  const head = `## ${placeName(profile)} protest and public-order intelligence${u.place ? ` — ${u.place}` : ''}\n`
    + `**Period:** ${win.label}  \n`
    + `**Active:** ${active.length} · **Planned:** ${planned.length} · **Mobilization discussions:** ${discussion.length} · **Places named:** ${districts.size}\n`;
  let body = '';
  const showActive = !wanted || wanted === 'active';
  const showPlanned = !wanted || wanted === 'planned' || win.from > now;
  if (showActive) body += sectionOf('Active now (events under monitoring and reports)', active, book, tz);
  if (showPlanned) body += sectionOf('Planned', planned, book, tz);
  if (!wanted) body += sectionOf('Mobilization discussions (no confirmed date or call to action)', discussion, book, tz, 4);
  if (wanted === 'past') body += sectionOf('Past (for context)', past, book, tz, 8);

  const what = wanted === 'planned' ? 'planned' : wanted === 'active' ? 'active' : 'active or planned';
  const missing = wanted === 'planned' ? !planned.length : wanted === 'active' ? !active.length : (!active.length && !planned.length);
  let none = '';
  if (missing && wanted !== 'past') {
    none = `\nNo ${what} protests or demonstrations are recorded for ${win.label}${u.place ? ` in ${u.place}` : ''}.`
      + `${discussion.length ? ` ${discussion.length} related post${discussion.length === 1 ? ' is' : 's are'} general discussion with no date or call to action, so ${discussion.length === 1 ? 'it is' : 'they are'} not counted as a planned protest.` : ''}`
      + `${past.length ? ` ${past.length} earlier item${past.length === 1 ? '' : 's'} from before this period exist; ask for "past protests" to see them.` : ''}\n`;
  }
  const rule = '\n_A protest is counted only when there is a date, a place or a call to action. General anger or demands for justice are listed separately as discussions._\n';
  const answer = `${head}${none}${body}${rule}\n> ${VERIFY_NOTE}`;
  return { answer, book, profile, counts: { active: active.length, planned: planned.length, discussion: discussion.length } };
};

const THREAT_PATTERN = `${VIOLENCE_RE}|${THREAT_RE}`;

const answerThreat = async (prisma, u, now, mode) => {
  const { profile } = u;
  const tz = profile.tz;
  const today = startOfDay(now, tz);
  const win = u.window || { from: addDays(today, -1), to: addDays(today, 1), label: 'the last 24 hours and today', explicit: false };
  const pattern = mode === 'misinfo' ? MISINFO_RE : mode === 'threat' ? null : THREAT_PATTERN;
  const raw = await gather(prisma, win.from, win.to, pattern);
  let items = raw.filter((it) => it.kind !== 'event' || mode === 'threat');
  if (mode === 'misinfo') items = items.filter((it) => MISINFO_TERMS.test(it.text));
  items = items.filter((it) => relevanceOf(it, profile, u.place).score >= 30);
  if (u.place) items = items.filter((it) => new RegExp(u.place, 'i').test(`${it.text} ${it.location || ''}`));
  let recs = analyse(items, { now, profile, place: u.place });
  if (mode === 'threat') recs = recs.filter((r) => r.kinds.includes('alert') || r.scores.severity >= 45);
  if (mode === 'misinfo') recs = recs.filter((r) => r.scores.virality >= 20 || r.members.length > 1);
  recs = sortRecords(recs);
  const book = makeSourceBook();
  const title = mode === 'misinfo' ? 'Possible misinformation (unverified)' : mode === 'threat' ? 'Top high-priority items' : 'Violence and threat reports';
  const top = recs.slice(0, 10);
  let answer = `## ${placeName(profile)} — ${title}\n**Period:** ${win.label} · **Found:** ${recs.length}\n`;
  if (!top.length) answer += `\nNothing matching was recorded for ${win.label}.\n`;
  else answer += `\n${top.map((r) => recordBlock(r, book, tz)).join('\n')}\n`;
  answer += `\n> ${mode === 'misinfo' ? 'Items here are flagged by wording and spread only. Whether a claim is false needs checking against reliable sources.' : VERIFY_NOTE}`;
  return { answer, book, profile };
};

const answerNarratives = async (prisma, u, now) => {
  const { profile } = u;
  const tz = profile.tz;
  const today = startOfDay(now, tz);
  const win = u.window || { from: addDays(today, -3), to: addDays(today, 1), label: 'the last 3 days', explicit: false };
  const raw = await gather(prisma, win.from, win.to, null, 250);
  const items = raw.filter((it) => it.kind !== 'event' && relevanceOf(it, profile, u.place).score >= 30);
  const recs = analyse(items, { now, profile, place: u.place })
    .filter((r) => r.members.length >= 3)
    .sort((a, b) => b.members.length - a.members.length || b.scores.virality - a.scores.virality);
  const book = makeSourceBook();
  let answer = `## ${placeName(profile)} — emerging narratives\n**Period:** ${win.label} · **Threads with 3+ related items:** ${recs.length}\n`;
  if (!recs.length) answer += '\nNo topic had enough related items in this period to count as a narrative.\n';
  recs.slice(0, 8).forEach((r, i) => {
    const n = book.cite(r);
    const places = [...new Set(r.members.map((m) => detectPlace(`${m.text} ${m.location || ''}`, profile)).filter(Boolean))].slice(0, 4);
    answer += `\n${i + 1}. **${clip(r.lead.title, 100)}** [${n}]\n`
      + `   - ${r.members.length} related items across ${r.platforms.length || 1} platform${r.platforms.length === 1 ? '' : 's'} (${r.kinds.map((k) => SOURCE_NOTE[k]).join(', ')})\n`
      + `   - First seen ${fmtDateTime(r.oldest, tz)} · latest ${fmtDateTime(r.newest, tz)}${places.length ? ` · places: ${places.join(', ')}` : ''}\n`
      + `   - ${r.priority.code} ${r.priority.label} · ${scoreLine(r)} · Confidence: ${r.confidence}\n`;
  });
  answer += `\n> Narratives are grouped by similar wording. Review the linked items before treating a thread as established.`;
  return { answer, book, profile };
};

const countsIn = async (prisma, from, to) => {
  const one = async (sql) => {
    const r = await safeQuery(prisma, sql, from, to);
    return r[0] ? Number(r[0].n) : 0;
  };
  return {
    alerts: await one('SELECT count(*)::int n FROM social_media_alerts WHERE coalesce(posted_at, created_at) >= $1::timestamptz AND coalesce(posted_at, created_at) < $2::timestamptz'),
    high: await one("SELECT count(*)::int n FROM social_media_alerts WHERE lower(risk_level) = 'high' AND coalesce(posted_at, created_at) >= $1::timestamptz AND coalesce(posted_at, created_at) < $2::timestamptz"),
    posts: await one('SELECT count(*)::int n FROM social_media_posts WHERE coalesce(posted_at, fetched_at) >= $1::timestamptz AND coalesce(posted_at, fetched_at) < $2::timestamptz'),
    grievances: await one('SELECT count(*)::int n FROM social_media_grievances WHERE coalesce(posted_at, created_at) >= $1::timestamptz AND coalesce(posted_at, created_at) < $2::timestamptz'),
    news: await one('SELECT count(*)::int n FROM news_articles WHERE published_at >= $1::timestamptz AND published_at < $2::timestamptz'),
  };
};

const delta = (a, b) => {
  const d = a - b;
  const pct = b ? ` (${d >= 0 ? '+' : ''}${Math.round((d / b) * 100)}%)` : '';
  return `${d >= 0 ? '+' : ''}${d}${pct}`;
};

const answerCompare = async (prisma, u, now) => {
  const { profile } = u;
  const tz = profile.tz;
  const today = startOfDay(now, tz);
  const a = await countsIn(prisma, today, addDays(today, 1));
  const b = await countsIn(prisma, addDays(today, -1), today);
  const row = (label, k) => `- **${label}:** ${a[k]} today, ${b[k]} yesterday (${delta(a[k], b[k])})`;
  const answer = `## ${placeName(profile)} — today compared with yesterday\n`
    + `Today is ${fmtDay(today, tz)}; the day so far is not a full day, so read the change with care.\n\n`
    + `${row('Alerts', 'alerts')}\n${row('High-risk alerts', 'high')}\n${row('Posts', 'posts')}\n${row('Grievances', 'grievances')}\n${row('News articles', 'news')}\n`;
  return { answer, book: makeSourceBook(), profile };
};

/** The Daily Intelligence Brief: last 24 hours across every module. */
const answerBrief = async (prisma, u, now) => {
  const { profile } = u;
  const tz = profile.tz;
  const today = startOfDay(now, tz);
  const from = new Date(now.getTime() - DAY);
  const raw = await gather(prisma, from, addDays(today, 8), null, 300);
  const recent = raw.filter((it) => it.kind === 'event' || (it.at && it.at <= now));
  const items = recent.filter((it) => relevanceOf(it, profile, u.place).score >= 30);
  const placeItems = u.place ? items.filter((it) => new RegExp(u.place, 'i').test(`${it.text} ${it.location || ''}`)) : items;
  const recs = analyse(placeItems, { now, profile, place: u.place });
  const book = makeSourceBook();
  const day24 = (r) => r.newest >= from || r.lead.kind === 'event';

  const top = sortRecords(recs.filter((r) => day24(r) && r.lead.kind !== 'event' && r.priority.code !== 'P4')).slice(0, 10);
  const protests = recs.filter((r) => (PROTEST_TERMS.test(r.lead.text) || r.lead.kind === 'event') && r.mobilization);
  const active = sortRecords(protests.filter((r) => r.status === 'active'));
  const planned = sortRecords(protests.filter((r) => r.status === 'planned'));
  const lawOrder = sortRecords(recs.filter((r) => day24(r) && VIOLENCE_TERMS.test(r.lead.text) && r.lead.kind !== 'event'));
  const viral = sortRecords(recs.filter((r) => day24(r) && r.scores.virality >= 50 && r.lead.kind !== 'event'));
  const misinfo = recs.filter((r) => day24(r) && MISINFO_TERMS.test(r.lead.text));
  const grievances = sortRecords(recs.filter((r) => day24(r) && r.lead.kind === 'grievance'));

  const counts = await countsIn(prisma, from, now);
  const byPlace = new Map();
  recs.filter(day24).forEach((r) => {
    if (!r.place) return;
    const cur = byPlace.get(r.place) || { items: 0, top: 'P4' };
    cur.items += 1;
    if (PRIORITY_RANK[r.priority.code] < PRIORITY_RANK[cur.top]) cur.top = r.priority.code;
    byPlace.set(r.place, cur);
  });

  let answer = `## ${placeName(profile)} Daily Intelligence Brief — ${fmtDay(today, tz)}\n`
    + `Covers the last 24 hours (to ${fmtDateTime(now, tz)}). Alerts: **${counts.alerts}** (high-risk **${counts.high}**) · Posts: **${counts.posts}** · Grievances: **${counts.grievances}** · News: **${counts.news}**\n`;
  answer += sectionOf('1. Top priority alerts', top, book, tz, 10);
  answer += sectionOf('2a. Protests active now', active, book, tz, 5);
  answer += sectionOf('2b. Protests planned', planned, book, tz, 5);
  answer += sectionOf('3. Law-and-order concerns', lawOrder.filter((r) => !top.includes(r)), book, tz, 5);
  answer += sectionOf('4. Fast-spreading content', viral.filter((r) => !top.includes(r)), book, tz, 5);
  answer += sectionOf('4b. Possibly misleading claims (unverified)', misinfo, book, tz, 4);
  answer += sectionOf('5. Grievances needing attention', grievances, book, tz, 5);
  if (byPlace.size) {
    const rows = [...byPlace.entries()].sort((a, b) => PRIORITY_RANK[a[1].top] - PRIORITY_RANK[b[1].top] || b[1].items - a[1].items).slice(0, 10);
    answer += `\n### 6. District-wise summary\n${rows.map(([p, v]) => `- **${p}** — ${v.items} item${v.items === 1 ? '' : 's'}, highest priority ${v.top}`).join('\n')}\n`;
  }
  if (!book.list.length) answer += '\nNo priority items were recorded in the last 24 hours.\n';
  answer += '\n### Recommended follow-up\n'
    + `- Verify the ${active.length + planned.length ? 'protest items above' : 'top priority items'} with local police intelligence before acting.\n`
    + '- Treat social-media content as claims until confirmed; confirmed facts come from event records and verified reports.\n'
    + '- Ask for any district by name (for example "What about Ranchi?") to narrow this brief.\n';
  answer += '\n> This brief supports human review. It does not treat online discussion as proof of a threat.';
  return { answer, book, profile };
};

/* ───────────────────────── entry point ───────────────────────── */

const INTENT_TITLE = {
  protest: 'Protest and public-order intelligence',
  threat: 'Priority items',
  misinfo: 'Possible misinformation',
  narrative: 'Emerging narratives',
  compare: 'Today vs yesterday',
  brief: 'Daily Intelligence Brief',
};

/** Returns null when the question is not an intelligence question (the normal assistant handles it). */
const runIntel = async (prisma, question, prior, tenant, now = new Date()) => {
  const profile = await loadTenantGeo(tenant);
  const u = understand(question, prior, profile, now);
  if (!u.intent) return null;
  let result;
  if (u.intent === 'protest') result = await answerProtest(prisma, u, now);
  else if (u.intent === 'threat') result = await answerThreat(prisma, u, now, 'threat');
  else if (u.intent === 'misinfo') result = await answerThreat(prisma, u, now, 'misinfo');
  else if (u.intent === 'narrative') result = await answerNarratives(prisma, u, now);
  else if (u.intent === 'compare') result = await answerCompare(prisma, u, now);
  else if (u.intent === 'brief') result = await answerBrief(prisma, u, now);
  else return null;
  const sources = sourcesFromBook(result.book, u.profile);
  return {
    answer: result.answer,
    sources,
    intent: u.intent,
    title: `${placeName(u.profile)} — ${INTENT_TITLE[u.intent]}`,
    understood: { intent: u.intent, window: u.window?.label || null, place: u.place, status: u.status, followUp: u.followUp },
  };
};

module.exports = {
  runIntel,
  understand,
  parseWindow,
  loadTenantGeo,
  classify,
  scoreItem,
  priorityOf,
  cluster,
  analyse,
  findDateMention,
  detectIntent,
  startOfDay,
};
