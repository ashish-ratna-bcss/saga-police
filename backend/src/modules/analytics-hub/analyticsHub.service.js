/**
 * Analytics Hub aggregations — Executive overview plus complete per-module analytics
 * for Events, Alerts, Grievances, and Profiles.
 * Standardizes 3-level Stance (Favourable, Neutral, Unfavourable), 3-level Risk (High, Medium, Low),
 * and 3-level Sentiment (Positive, Neutral, Negative) across all scopes.
 */
const dbOf = require('../../lib/dbOf');
const { getOverview: getDashboardOverview } = require('../dashboard/dashboard.service');
const { getCatalogWorkflowKpi } = require('../alerts/alert.service');
const { getDashboardReportStats } = require('../grievances/grievance.report.service');
const { attachProfileRelevanceToAccounts } = require('../social-profiles/profileRelevance.service');

const RANGE_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

const resolveRange = (rangeKey = '30d') => {
  const to = new Date();
  if (rangeKey === 'all' || rangeKey === 'all-time') {
    const from = new Date(0);
    return { range: 'all', from, to };
  }
  const key = RANGE_MS[rangeKey] ? rangeKey : '30d';
  const from = new Date(to.getTime() - RANGE_MS[key]);
  return { range: key, from, to };
};

const normalizePlatform = (raw) => {
  const p = String(raw || 'all')
    .trim()
    .toLowerCase()
    .replace(/^twitter$/, 'x');
  if (!p || p === 'all') return null;
  return p;
};

/**
 * Normalizes stance values:
 * support -> 'favourable'
 * oppose -> 'unfavourable'
 * neutral / unclear / other -> 'neutral'
 */
const normalizeStance = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'support' || s === 'favourable' || s === 'favorable' || s === 'positive') return 'favourable';
  if (s === 'oppose' || s === 'unfavourable' || s === 'unfavorable' || s === 'negative') return 'unfavourable';
  return 'neutral';
};

/**
 * Standard 3-level Stance summary:
 * - favourable: count of support
 * - unfavourable: count of oppose
 * - neutral: count of neutral / unclear
 */
const computeStanceStats = (breakdown = {}) => {
  let favourable = 0;
  let unfavourable = 0;
  let neutral = 0;

  for (const [key, val] of Object.entries(breakdown || {})) {
    const count = Number(val) || 0;
    const norm = normalizeStance(key);
    if (norm === 'favourable') favourable += count;
    else if (norm === 'unfavourable') unfavourable += count;
    else neutral += count;
  }

  const total = favourable + unfavourable + neutral;
  const polarizedTotal = favourable + unfavourable;

  return {
    favourable,
    unfavourable,
    neutral,
    total,
    favourable_pct: total > 0 ? Number(((favourable / total) * 100).toFixed(1)) : 0,
    unfavourable_pct: total > 0 ? Number(((unfavourable / total) * 100).toFixed(1)) : 0,
    neutral_pct: total > 0 ? Number(((neutral / total) * 100).toFixed(1)) : 0,
    polarized_favourable_pct: polarizedTotal > 0 ? Number(((favourable / polarizedTotal) * 100).toFixed(1)) : 50,
    polarized_unfavourable_pct: polarizedTotal > 0 ? Number(((unfavourable / polarizedTotal) * 100).toFixed(1)) : 50,
  };
};

/**
 * Normalizes sentiment values:
 * positive -> 'positive'
 * negative -> 'negative'
 * neutral / other -> 'neutral'
 */
const normalizeSentiment = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'positive') return 'positive';
  if (s === 'negative') return 'negative';
  return 'neutral';
};

const computeSentimentStats = (breakdown = {}) => {
  let positive = 0;
  let negative = 0;
  let neutral = 0;

  for (const [key, val] of Object.entries(breakdown || {})) {
    const count = Number(val) || 0;
    const norm = normalizeSentiment(key);
    if (norm === 'positive') positive += count;
    else if (norm === 'negative') negative += count;
    else neutral += count;
  }

  const total = positive + negative + neutral;
  const netScore = total > 0 ? Math.round(((positive - negative) / total) * 100) : 0;

  return {
    positive,
    negative,
    neutral,
    total,
    positive_pct: total > 0 ? Number(((positive / total) * 100).toFixed(1)) : 0,
    negative_pct: total > 0 ? Number(((negative / total) * 100).toFixed(1)) : 0,
    neutral_pct: total > 0 ? Number(((neutral / total) * 100).toFixed(1)) : 0,
    net_sentiment_score: netScore, // -100 to +100
  };
};

/**
 * Normalizes risk values into 3 levels:
 * critical / high -> 'high'
 * medium -> 'medium'
 * low -> 'low'
 */
const normalizeRisk = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'high' || s === 'critical') return 'high';
  if (s === 'medium') return 'medium';
  return 'low';
};

const computeRiskStats = (breakdown = {}) => {
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const [key, val] of Object.entries(breakdown || {})) {
    const count = Number(val) || 0;
    const norm = normalizeRisk(key);
    if (norm === 'high') high += count;
    else if (norm === 'medium') medium += count;
    else low += count;
  }

  const total = high + medium + low;

  return {
    high,
    medium,
    low,
    total,
    high_pct: total > 0 ? Number(((high / total) * 100).toFixed(1)) : 0,
    medium_pct: total > 0 ? Number(((medium / total) * 100).toFixed(1)) : 0,
    low_pct: total > 0 ? Number(((low / total) * 100).toFixed(1)) : 0,
  };
};

/**
 * {label,count} rows (from raw query) -> {[label]: count}.
 */
const rowsToBreakdown = (rows) =>
  (rows || []).reduce((acc, r) => (r.label ? { ...acc, [r.label]: Number(r.count) } : acc), {});

const istDateKey = (d) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/**
 * Generic day-bucketed count trend, IST calendar days.
 */
const bucketRowsByDay = (rows, { from, to, dateField }) => {
  const dailyMap = new Map();
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = istDateKey(d);
    if (dailyMap.has(key)) continue;
    dailyMap.set(key, { date: key, total: 0 });
  }

  for (const r of rows) {
    const raw = r[dateField];
    if (!raw) continue;
    const key = istDateKey(new Date(raw));
    const row = dailyMap.get(key);
    if (!row) continue;
    row.total += 1;
  }

  return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
};

/* ── 1. All (Executive Overview) ── */
const getOverview = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const platform = normalizePlatform(query.platform);

  const dateClause = range === 'all' ? '' : `AND fetched_at >= '${from.toISOString()}' AND fetched_at <= '${to.toISOString()}'`;
  const platformClause = platform ? `AND platform = '${platform.replace(/'/g, '')}'` : '';
  const filterSql = `${dateClause} ${platformClause}`;

  const [overview, globalThreeLevel] = await Promise.all([
    getDashboardOverview(query),
    prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (WHERE analysis_result->>'stance' = 'support')::int AS stance_favourable,
        COUNT(*) FILTER (WHERE analysis_result->>'stance' = 'oppose')::int AS stance_unfavourable,
        COUNT(*) FILTER (WHERE analysis_result->>'stance' IN ('neutral', 'unclear'))::int AS stance_neutral,
        COUNT(*) FILTER (WHERE analysis_result->>'sentiment' = 'positive')::int AS sentiment_positive,
        COUNT(*) FILTER (WHERE analysis_result->>'sentiment' = 'neutral')::int AS sentiment_neutral,
        COUNT(*) FILTER (WHERE analysis_result->>'sentiment' = 'negative')::int AS sentiment_negative,
        COUNT(*) FILTER (WHERE analysis_result->>'risk_level' IN ('high', 'critical'))::int AS risk_high,
        COUNT(*) FILTER (WHERE analysis_result->>'risk_level' = 'medium')::int AS risk_medium,
        COUNT(*) FILTER (WHERE analysis_result->>'risk_level' = 'low')::int AS risk_low
      FROM (
        SELECT analysis_result FROM social_media_event_media WHERE analysis_result IS NOT NULL ${filterSql}
        UNION ALL
        SELECT analysis_result FROM social_media_posts WHERE analysis_result IS NOT NULL ${filterSql}
      ) combined
    `).catch(() => ([{}]))
  ]);

  const statsRow = (globalThreeLevel && globalThreeLevel[0]) || {};

  const stance_stats = computeStanceStats({
    support: statsRow.stance_favourable || 0,
    oppose: statsRow.stance_unfavourable || 0,
    neutral: statsRow.stance_neutral || 0,
  });

  const sentiment_stats = computeSentimentStats({
    positive: statsRow.sentiment_positive || 0,
    neutral: statsRow.sentiment_neutral || 0,
    negative: statsRow.sentiment_negative || 0,
  });

  const risk_stats = computeRiskStats({
    high: statsRow.risk_high || 0,
    medium: statsRow.risk_medium || 0,
    low: statsRow.risk_low || 0,
  });

  return {
    ...overview,
    stance_stats,
    sentiment_stats,
    risk_stats,
  };
};

/* ── 2. Events & Probes ── */
const getEventsAnalytics = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const eventId = query.event_id && query.event_id !== 'all' ? parseInt(query.event_id, 10) : null;
  const platform = normalizePlatform(query.platform);

  const filterClauses = [];
  if (eventId) filterClauses.push(`event_id = ${Number(eventId)}`);
  if (platform) filterClauses.push(`platform = '${platform.replace(/'/g, '')}'`);
  if (range !== 'all') {
    filterClauses.push(`fetched_at >= '${from.toISOString()}'`);
    filterClauses.push(`fetched_at <= '${to.toISOString()}'`);
  }
  const whereExtra = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

  const mediaScopeWhere = {
    ...(eventId ? { event_id: eventId } : {}),
    ...(platform ? { platform } : {}),
    ...(range !== 'all' ? { fetched_at: { gte: from, lte: to } } : {}),
  };

  // Grouped summary query per event respects date range and platform filter
  const mediaFilterSql = [
    range !== 'all' ? `fetched_at >= '${from.toISOString()}' AND fetched_at <= '${to.toISOString()}'` : null,
    platform ? `platform = '${platform.replace(/'/g, '')}'` : null,
  ].filter(Boolean).join(' AND ');
  const mediaFilterClause = mediaFilterSql ? `WHERE ${mediaFilterSql}` : '';

  const [
    allEvents,
    byStatusRaw,
    byOriginRaw,
    contentByPlatformRaw,
    trendRows,
    sentimentRaw,
    stanceRaw,
    riskRaw,
    eventMediaSummaryRaw,
  ] = await Promise.all([
    prisma.social_media_events.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        origin: true,
        platforms: true,
        monitoring_status: true,
        created_at: true,
        last_fetched_at: true,
      },
    }),
    prisma.social_media_events.groupBy({ by: ['monitoring_status'], _count: { _all: true } }),
    prisma.social_media_events.groupBy({ by: ['origin'], _count: { _all: true } }),
    prisma.social_media_event_media.groupBy({
      by: ['platform'],
      where: mediaScopeWhere,
      _count: { _all: true },
    }),
    prisma.social_media_event_media.findMany({
      where: mediaScopeWhere,
      select: { fetched_at: true },
    }),
    prisma.$queryRawUnsafe(`
      SELECT analysis_result->>'sentiment' AS label, COUNT(*)::int AS count
      FROM social_media_event_media
      WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' IS NOT NULL AND analysis_result->>'sentiment' != '' ${whereExtra}
      GROUP BY label
    `).catch(() => []),
    prisma.$queryRawUnsafe(`
      SELECT analysis_result->>'stance' AS label, COUNT(*)::int AS count
      FROM social_media_event_media
      WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' IS NOT NULL AND analysis_result->>'stance' != '' ${whereExtra}
      GROUP BY label
    `).catch(() => []),
    prisma.$queryRawUnsafe(`
      SELECT analysis_result->>'risk_level' AS label, COUNT(*)::int AS count
      FROM social_media_event_media
      WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' IS NOT NULL AND analysis_result->>'risk_level' != '' ${whereExtra}
      GROUP BY label
    `).catch(() => []),
    prisma.$queryRawUnsafe(`
      SELECT
        event_id,
        COUNT(*)::int AS total_media,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' = 'support')::int AS stance_support,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' = 'oppose')::int AS stance_oppose,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' IN ('neutral', 'unclear'))::int AS stance_neutral,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'positive')::int AS sentiment_positive,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'neutral')::int AS sentiment_neutral,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'negative')::int AS sentiment_negative,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' IN ('high', 'critical'))::int AS risk_high,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' = 'medium')::int AS risk_medium,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' = 'low')::int AS risk_low
      FROM social_media_event_media
      ${mediaFilterClause}
      GROUP BY event_id
    `).catch(() => []),
  ]);

  const by_status = byStatusRaw.reduce((acc, r) => ({ ...acc, [r.monitoring_status]: r._count._all }), {});
  const by_origin = byOriginRaw.reduce((acc, r) => ({ ...acc, [r.origin || 'manual']: r._count._all }), {});
  const content_by_platform = contentByPlatformRaw.reduce(
    (acc, r) => ({ ...acc, [r.platform]: r._count._all }),
    {}
  );
  const trend = bucketRowsByDay(trendRows, { from, to, dateField: 'fetched_at' });
  const by_sentiment = rowsToBreakdown(sentimentRaw);
  const by_stance = rowsToBreakdown(stanceRaw);
  const by_risk = rowsToBreakdown(riskRaw);

  const stance_stats = computeStanceStats(by_stance);
  const sentiment_stats = computeSentimentStats(by_sentiment);
  const risk_stats = computeRiskStats(by_risk);

  const mediaSummaryMap = new Map();
  for (const row of eventMediaSummaryRaw) {
    mediaSummaryMap.set(row.event_id, row);
  }

  const totalMediaAcrossAll = eventMediaSummaryRaw.reduce((sum, r) => sum + (r.total_media || 0), 0);

  const events_list = allEvents.map((ev) => {
    const summary = mediaSummaryMap.get(ev.id) || {};
    const mediaCount = summary.total_media || 0;
    const mediaPct = totalMediaAcrossAll > 0 ? Number(((mediaCount / totalMediaAcrossAll) * 100).toFixed(1)) : 0;

    const evStance = computeStanceStats({
      support: summary.stance_support || 0,
      oppose: summary.stance_oppose || 0,
      neutral: summary.stance_neutral || 0,
    });

    const evSentiment = computeSentimentStats({
      positive: summary.sentiment_positive || 0,
      neutral: summary.sentiment_neutral || 0,
      negative: summary.sentiment_negative || 0,
    });

    const evRisk = computeRiskStats({
      high: summary.risk_high || 0,
      medium: summary.risk_medium || 0,
      low: summary.risk_low || 0,
    });

    return {
      id: ev.id,
      name: ev.name,
      description: ev.description,
      location: ev.location,
      origin: ev.origin,
      platforms: ev.platforms || [],
      monitoring_status: ev.monitoring_status,
      created_at: ev.created_at,
      last_fetched_at: ev.last_fetched_at,
      media_count: mediaCount,
      media_percentage: mediaPct,
      stance_stats: evStance,
      sentiment_stats: evSentiment,
      risk_stats: evRisk,
    };
  }).sort((a, b) => b.media_count - a.media_count);

  const selectedEvent = eventId ? allEvents.find((e) => e.id === eventId) : null;
  const selectedMediaCount = selectedEvent
    ? (mediaSummaryMap.get(selectedEvent.id)?.total_media || 0)
    : totalMediaAcrossAll;

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    total: allEvents.length,
    selected_event_id: eventId || 'all',
    total_discovered_media: selectedMediaCount,
    by_status,
    by_origin,
    content_by_platform,
    trend,
    by_sentiment,
    by_stance,
    by_risk,
    stance_stats,
    sentiment_stats,
    risk_stats,
    events_list,
  };
};

/* ── 2b. Event Media & Author Details (For Modal Popup) ── */
const getEventDetails = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const rawEventId = query.eventId || query.event_id;
  const isAll = !rawEventId || rawEventId === 'all';
  const eventId = isAll ? null : Number(rawEventId);
  const platform = normalizePlatform(query.platform);

  const dateClause = range === 'all' ? '' : `AND fetched_at >= '${from.toISOString()}' AND fetched_at <= '${to.toISOString()}'`;
  const platformClause = platform ? `AND platform = '${platform.replace(/'/g, '')}'` : '';
  const eventClause = eventId ? `AND event_id = ${eventId}` : '';
  const whereExtra = `${eventClause} ${dateClause} ${platformClause}`;

  const mediaWhere = {
    ...(eventId ? { event_id: eventId } : {}),
    ...(range !== 'all' ? { fetched_at: { gte: from, lte: to } } : {}),
    ...(platform ? { platform } : {}),
  };

  const [event, analyzedMediaRows, recentMediaRows, authorProfilesRaw, eventMetricsRaw] = await Promise.all([
    isAll
      ? prisma.$queryRawUnsafe(`
          SELECT DISTINCT platform FROM social_media_event_media 
          WHERE platform IS NOT NULL AND platform != ''
        `)
          .then((rows) => ({
            id: 'all',
            name: 'All Monitored Events',
            description: 'Cross-event public intelligence & persona telemetry',
            platforms: (rows || []).map((r) => r.platform).filter(Boolean),
          }))
          .catch(() => ({
            id: 'all',
            name: 'All Monitored Events',
            description: 'Cross-event public intelligence & persona telemetry',
            platforms: [],
          }))
      : prisma.social_media_events.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            name: true,
            description: true,
            location: true,
            origin: true,
            platforms: true,
            monitoring_status: true,
            created_at: true,
          },
        }),
    // Prioritize analyzed items first
    prisma.social_media_event_media.findMany({
      where: { ...mediaWhere, analysis_result: { not: null } },
      orderBy: [
        { posted_at: 'desc' },
        { fetched_at: 'desc' },
      ],
      take: 150,
      select: {
        id: true,
        platform: true,
        author_name: true,
        author_handle: true,
        text: true,
        url: true,
        posted_at: true,
        fetched_at: true,
        analysis_result: true,
        analysis_status: true,
      },
    }),
    // Recent posts stream
    prisma.social_media_event_media.findMany({
      where: mediaWhere,
      orderBy: [
        { posted_at: 'desc' },
        { fetched_at: 'desc' },
      ],
      take: 150,
      select: {
        id: true,
        platform: true,
        author_name: true,
        author_handle: true,
        text: true,
        url: true,
        posted_at: true,
        fetched_at: true,
        analysis_result: true,
        analysis_status: true,
      },
    }),
    prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(NULLIF(author_handle, ''), NULLIF(author_name, ''), 'Unknown') AS author_identifier,
        author_name,
        author_handle,
        platform,
        COUNT(*)::int AS posts_count,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'positive')::int AS positive_count,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'negative')::int AS negative_count,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'neutral')::int AS neutral_count,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' = 'support')::int AS stance_support,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' = 'oppose')::int AS stance_oppose,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' IN ('neutral', 'unclear'))::int AS stance_neutral,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' IN ('high', 'critical'))::int AS risk_high,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' = 'medium')::int AS risk_medium,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' = 'low')::int AS risk_low
      FROM social_media_event_media
      WHERE 1=1 ${whereExtra}
      GROUP BY author_identifier, author_name, author_handle, platform
      ORDER BY 
        (COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' IS NOT NULL)) DESC,
        posts_count DESC
      LIMIT 100
    `).catch(() => []),
    prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS total_media,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'positive')::int AS sentiment_positive,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'neutral')::int AS sentiment_neutral,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'negative')::int AS sentiment_negative,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' = 'support')::int AS stance_support,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' = 'oppose')::int AS stance_oppose,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' IN ('neutral', 'unclear'))::int AS stance_neutral,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' IN ('high', 'critical'))::int AS risk_high,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' = 'medium')::int AS risk_medium,
        COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' = 'low')::int AS risk_low
      FROM social_media_event_media
      WHERE 1=1 ${whereExtra}
    `).catch(() => ([{}])),
  ]);

  if (!event) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  // Merge analyzed and recent posts uniquely
  const seenIds = new Set();
  const mediaRows = [];
  for (const m of [...analyzedMediaRows, ...recentMediaRows]) {
    const sid = String(m.id);
    if (!seenIds.has(sid)) {
      seenIds.add(sid);
      mediaRows.push(m);
    }
  }

  const distinctPlatforms = Array.from(
    new Set([
      ...(Array.isArray(event?.platforms) ? event.platforms : []),
      ...mediaRows.map((m) => m.platform),
    ].filter(Boolean))
  );
  if (event) {
    event.platforms = distinctPlatforms;
  }

  const posts = mediaRows.map((m) => {
    const res = typeof m.analysis_result === 'object' && m.analysis_result ? m.analysis_result : {};
    const rawSentiment = res.sentiment ? String(res.sentiment).toLowerCase() : null;
    return {
      id: String(m.id),
      platform: m.platform,
      author_name: m.author_name || m.author_handle || 'Unknown',
      author_handle: m.author_handle,
      text: m.text,
      english_text: res.english_text || null,
      summary: res.summary || null,
      sentiment: rawSentiment || 'pending',
      stance: res.stance || null,
      risk_level: res.risk_level || (rawSentiment ? 'low' : 'unclassified'),
      risk_score: res.risk_score ?? 0,
      url: m.url,
      posted_at: m.posted_at ? m.posted_at.toISOString() : null,
      fetched_at: m.fetched_at ? m.fetched_at.toISOString() : null,
      is_analyzed: Boolean(rawSentiment),
    };
  });

  const profiles = authorProfilesRaw.map((r) => {
    const count = Number(r.posts_count) || 1;
    const pos = Number(r.positive_count) || 0;
    const neg = Number(r.negative_count) || 0;
    const neu = Number(r.neutral_count) || 0;
    const sup = Number(r.stance_support) || 0;
    const opp = Number(r.stance_oppose) || 0;
    const rHigh = Number(r.risk_high) || 0;
    const rMed = Number(r.risk_medium) || 0;
    const rLow = Number(r.risk_low) || 0;
    const analyzedCount = pos + neg + neu;

    return {
      author_identifier: r.author_identifier,
      author_name: r.author_name || r.author_handle || 'Unknown',
      author_handle: r.author_handle,
      platform: r.platform,
      posts_count: count,
      analyzed_count: analyzedCount,
      positive_count: pos,
      negative_count: neg,
      neutral_count: neu,
      favourable_count: sup,
      unfavourable_count: opp,
      risk_high_count: rHigh,
      risk_medium_count: rMed,
      risk_low_count: rLow,
      positive_pct: analyzedCount > 0 ? Number(((pos / analyzedCount) * 100).toFixed(1)) : 0,
      negative_pct: analyzedCount > 0 ? Number(((neg / analyzedCount) * 100).toFixed(1)) : 0,
      neutral_pct: analyzedCount > 0 ? Number(((neu / analyzedCount) * 100).toFixed(1)) : 0,
      favourable_pct: analyzedCount > 0 ? Number(((sup / analyzedCount) * 100).toFixed(1)) : 0,
      unfavourable_pct: analyzedCount > 0 ? Number(((opp / analyzedCount) * 100).toFixed(1)) : 0,
      risk_high_pct: analyzedCount > 0 ? Number(((rHigh / analyzedCount) * 100).toFixed(1)) : 0,
      risk_medium_pct: analyzedCount > 0 ? Number(((rMed / analyzedCount) * 100).toFixed(1)) : 0,
      risk_low_pct: analyzedCount > 0 ? Number(((rLow / analyzedCount) * 100).toFixed(1)) : 0,
    };
  });

  const evRow = (eventMetricsRaw && eventMetricsRaw[0]) || {};
  const sentiment_stats = computeSentimentStats({
    positive: evRow.sentiment_positive || 0,
    neutral: evRow.sentiment_neutral || 0,
    negative: evRow.sentiment_negative || 0,
  });

  const stance_stats = computeStanceStats({
    support: evRow.stance_support || 0,
    oppose: evRow.stance_oppose || 0,
    neutral: evRow.stance_neutral || 0,
  });

  const risk_stats = computeRiskStats({
    high: evRow.risk_high || 0,
    medium: evRow.risk_medium || 0,
    low: evRow.risk_low || 0,
  });

  return {
    event,
    range,
    total_posts: evRow.total_media || posts.length,
    posts_sample_count: posts.length,
    posts,
    profiles,
    sentiment_stats,
    stance_stats,
    risk_stats,
  };
};

/* ── 3. Threat Alerts & Risk ── */
const getAlertsAnalytics = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const platform = normalizePlatform(query.platform);

  const createdInRange = {
    ...(range !== 'all' ? { created_at: { gte: from, lte: to } } : {}),
    ...(platform ? { platform } : {}),
  };

  const [total, byRiskRaw, byPlatformRaw, byStatusRaw, sentimentRaw, workflowTrend, recentThreats] =
    await Promise.all([
      prisma.social_media_alerts.count({ where: createdInRange }),
      prisma.social_media_alerts.groupBy({ by: ['risk_level'], where: createdInRange, _count: { _all: true } }),
      prisma.social_media_alerts.groupBy({ by: ['platform'], where: createdInRange, _count: { _all: true } }),
      prisma.social_media_alerts.groupBy({ by: ['status'], where: createdInRange, _count: { _all: true } }),
      prisma.social_media_alerts.groupBy({
        by: ['sentiment'],
        where: { ...createdInRange, sentiment: { not: null } },
        _count: { _all: true },
      }),
      getCatalogWorkflowKpi({ start: from, end: to, db: prisma }),
      prisma.social_media_alerts.findMany({
        where: { ...createdInRange, risk_level: { in: ['high', 'critical', 'HIGH', 'CRITICAL'] } },
        orderBy: { created_at: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          platform: true,
          risk_level: true,
          risk_score: true,
          sentiment: true,
          status: true,
          author: true,
          author_handle: true,
          content_url: true,
          created_at: true,
        },
      }),
    ]);

  const by_risk = byRiskRaw.reduce((acc, r) => ({ ...acc, [r.risk_level]: r._count._all }), {});
  const by_platform = byPlatformRaw.reduce((acc, r) => ({ ...acc, [r.platform]: r._count._all }), {});
  const by_status = byStatusRaw.reduce((acc, r) => ({ ...acc, [r.status]: r._count._all }), {});
  const by_sentiment = sentimentRaw.reduce((acc, r) => ({ ...acc, [r.sentiment]: r._count._all }), {});

  const risk_stats = computeRiskStats(by_risk);
  const sentiment_stats = computeSentimentStats(by_sentiment);

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    by_risk,
    risk_stats,
    by_platform,
    by_status,
    by_sentiment,
    sentiment_stats,
    trend: workflowTrend.daily,
    recent_threats: recentThreats.map((t) => ({ ...t, id: String(t.id) })),
  };
};

/* ── 4. Grievances ── */
const getGrievancesAnalytics = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const platform = normalizePlatform(query.platform);

  const detectedInRange = {
    ...(range !== 'all' ? { detected_at: { gte: from, lte: to } } : {}),
    ...(platform ? { platform } : {}),
  };

  const [total, byWorkflowRaw, byPlatformRaw, byClassificationRaw, reportStats, trendRows] =
    await Promise.all([
      prisma.social_media_grievances.count({ where: detectedInRange }),
      prisma.social_media_grievances.groupBy({
        by: ['workflow_status'],
        where: detectedInRange,
        _count: { _all: true },
      }),
      prisma.social_media_grievances.groupBy({ by: ['platform'], where: detectedInRange, _count: { _all: true } }),
      prisma.social_media_grievances.groupBy({
        by: ['classification'],
        where: detectedInRange,
        _count: { _all: true },
      }),
      getDashboardReportStats({ db: prisma }),
      prisma.social_media_grievances.findMany({ where: detectedInRange, select: { detected_at: true } }),
    ]);

  const by_workflow = byWorkflowRaw.reduce((acc, r) => ({ ...acc, [r.workflow_status]: r._count._all }), {});
  const by_platform = byPlatformRaw.reduce((acc, r) => ({ ...acc, [r.platform]: r._count._all }), {});
  const by_classification = byClassificationRaw.reduce(
    (acc, r) => ({ ...acc, [r.classification]: r._count._all }),
    {}
  );
  const trend = bucketRowsByDay(trendRows, { from, to, dateField: 'detected_at' });

  const resolvedCount = (by_workflow['resolved'] || 0) + (by_workflow['closed'] || 0);
  const resolutionRate = total > 0 ? Number(((resolvedCount / total) * 100).toFixed(1)) : 0;

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    resolved_count: resolvedCount,
    resolution_rate: resolutionRate,
    by_workflow,
    by_platform,
    by_classification,
    reports: reportStats.all,
    trend,
  };
};

/* ── 5. Target Profiles ── */
const RELEVANCE_BUCKETS = ['low', 'medium', 'high'];
const bucketForScore = (score) => {
  if (score >= 65) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

const OPEN_ALERT_STATUSES = new Set(['active', 'new', 'open', 'acknowledged', 'escalated']);
const HIGH_RISK_LEVELS = new Set(['high', 'critical']);

const getProfilesAnalytics = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const platform = normalizePlatform(query.platform);

  const accountWhere = {
    type: 'profile',
    ...(platform ? { platforms: { slug: platform } } : {}),
  };

  const [allPlatforms, accounts, accountCountsRaw] = await Promise.all([
    prisma.platforms.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),
    prisma.social_media_accounts.findMany({
      where: accountWhere,
      select: {
        id: true,
        profile_id: true,
        handle: true,
        is_active: true,
        monitoring_status: true,
        last_fetched_at: true,
        platforms: { select: { slug: true, name: true } },
        profile: { select: { id: true, display_name: true, is_active: true } },
      },
    }),
    prisma.social_media_accounts.groupBy({
      by: ['platform_id'],
      where: { type: 'profile' },
      _count: { _all: true },
    }),
  ]);

  const accountIds = accounts.map((a) => a.id);
  const postBaseWhere = {
    account_id: { in: accountIds.length ? accountIds : [-1] },
    ...(platform ? { platform } : {}),
  };

  const [postPlatformRaw, trendRows, postsInRange, postsTotal, alertsInRange, postsSummaryRaw] = await Promise.all([
    accountIds.length
      ? prisma.social_media_posts.groupBy({
          by: ['platform'],
          where: { ...postBaseWhere, ...(range !== 'all' ? { fetched_at: { gte: from, lte: to } } : {}) },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.social_media_posts.findMany({
          where: { ...postBaseWhere, ...(range !== 'all' ? { fetched_at: { gte: from, lte: to } } : {}) },
          select: { fetched_at: true },
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.social_media_posts.groupBy({
          by: ['account_id'],
          where: { ...postBaseWhere, ...(range !== 'all' ? { fetched_at: { gte: from, lte: to } } : {}) },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.social_media_posts.groupBy({
          by: ['account_id'],
          where: postBaseWhere,
          _count: { _all: true },
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.social_media_alerts.findMany({
          where: {
            ...(range !== 'all' ? { created_at: { gte: from, lte: to } } : {}),
            ...(platform ? { platform } : {}),
            OR: [
              { account_id: { in: accountIds } },
              { post: { account_id: { in: accountIds } } },
            ],
          },
          select: {
            account_id: true,
            status: true,
            risk_level: true,
            post: { select: { account_id: true } },
          },
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.$queryRawUnsafe(`
          SELECT
            account_id,
            COUNT(*)::int AS total_posts,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' = 'support')::int AS stance_support,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' = 'oppose')::int AS stance_oppose,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'stance' IN ('neutral', 'unclear'))::int AS stance_neutral,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'positive')::int AS sentiment_positive,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'neutral')::int AS sentiment_neutral,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'sentiment' = 'negative')::int AS sentiment_negative,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' IN ('high', 'critical'))::int AS risk_high,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' = 'medium')::int AS risk_medium,
            COUNT(*) FILTER (WHERE analysis_result IS NOT NULL AND analysis_result->>'risk_level' = 'low')::int AS risk_low
          FROM social_media_posts
          WHERE account_id IN (${accountIds.join(',')})
          GROUP BY account_id
        `).catch(() => [])
      : Promise.resolve([]),
  ]);

  const accountsByPlatformId = accountCountsRaw.reduce(
    (acc, c) => ({ ...acc, [c.platform_id]: c._count._all }),
    {}
  );
  const byPlatform = allPlatforms.reduce(
    (acc, p) => ({ ...acc, [p.slug]: accountsByPlatformId[p.id] || 0 }),
    {}
  );
  const content_by_platform = postPlatformRaw.reduce((acc, r) => ({ ...acc, [r.platform]: r._count._all }), {});

  const total = accounts.length;
  const active = accounts.filter((a) => a.is_active).length;
  const paused = total - active;

  const scored = await attachProfileRelevanceToAccounts(accounts, { db: prisma });
  const scoreByAccountId = new Map(
    scored.map((a) => [a.id, a.profile_relevance?.profile_relevance_score || 0])
  );
  const risk_distribution = RELEVANCE_BUCKETS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {});
  for (const a of scored) {
    const bucket = bucketForScore(a.profile_relevance?.profile_relevance_score || 0);
    risk_distribution[bucket] += 1;
  }

  const postsFetchedByAccount = new Map(postsInRange.map((r) => [r.account_id, r._count._all]));
  const postsTotalByAccount = new Map(postsTotal.map((r) => [r.account_id, r._count._all]));
  const totalPostsFetchedInScope = [...postsFetchedByAccount.values()].reduce((sum, v) => sum + v, 0);

  const postsSummaryMap = new Map();
  for (const row of postsSummaryRaw) {
    postsSummaryMap.set(row.account_id, row);
  }

  const alertsByAccount = new Map();
  for (const alert of alertsInRange) {
    const aid = alert.account_id || alert.post?.account_id;
    if (!aid) continue;
    const cur = alertsByAccount.get(aid) || { total: 0, open: 0, high: 0 };
    cur.total += 1;
    if (OPEN_ALERT_STATUSES.has(String(alert.status || '').toLowerCase())) cur.open += 1;
    if (HIGH_RISK_LEVELS.has(String(alert.risk_level || '').toLowerCase())) cur.high += 1;
    alertsByAccount.set(aid, cur);
  }

  // Roll accounts up to catalog profiles
  const byProfile = new Map();
  for (const account of accounts) {
    const profileId = account.profile_id || account.profile?.id;
    if (!profileId) continue;
    const row =
      byProfile.get(profileId) ||
      {
        profile_id: profileId,
        account_id: account.id,
        display_name: account.profile?.display_name || account.handle,
        is_active: Boolean(account.profile?.is_active),
        accounts_count: 0,
        platforms: [],
        handles: [],
        posts_fetched: 0,
        posts_total: 0,
        alerts_count: 0,
        alerts_open: 0,
        alerts_high: 0,
        last_fetched_at: null,
        monitoring: 'stopped',
        monitoring_started: 0,
        monitoring_stopped: 0,
        relevance_score: 0,
        relevance_bucket: 'low',
        // Stance, Sentiment & Risk rollups
        stance_support: 0,
        stance_oppose: 0,
        stance_neutral: 0,
        sentiment_positive: 0,
        sentiment_neutral: 0,
        sentiment_negative: 0,
        risk_high: 0,
        risk_medium: 0,
        risk_low: 0,
      };

    if (!row.account_id) row.account_id = account.id;
    if (account.monitoring_status === 'started') row.account_id = account.id;
    row.accounts_count += 1;
    if (account.profile?.display_name) row.display_name = account.profile.display_name;
    row.is_active = row.is_active || Boolean(account.profile?.is_active) || account.is_active;
    const slug = account.platforms?.slug;
    if (slug && !row.platforms.includes(slug)) row.platforms.push(slug);
    if (account.handle && !row.handles.includes(account.handle)) row.handles.push(account.handle);

    row.posts_fetched += postsFetchedByAccount.get(account.id) || 0;
    row.posts_total += postsTotalByAccount.get(account.id) || 0;

    const postStats = postsSummaryMap.get(account.id);
    if (postStats) {
      row.stance_support += postStats.stance_support || 0;
      row.stance_oppose += postStats.stance_oppose || 0;
      row.stance_neutral += postStats.stance_neutral || 0;
      row.sentiment_positive += postStats.sentiment_positive || 0;
      row.sentiment_neutral += postStats.sentiment_neutral || 0;
      row.sentiment_negative += postStats.sentiment_negative || 0;
      row.risk_high += postStats.risk_high || 0;
      row.risk_medium += postStats.risk_medium || 0;
      row.risk_low += postStats.risk_low || 0;
    }

    const alertStats = alertsByAccount.get(account.id);
    if (alertStats) {
      row.alerts_count += alertStats.total;
      row.alerts_open += alertStats.open;
      row.alerts_high += alertStats.high;
    }

    if (account.last_fetched_at) {
      const ts = new Date(account.last_fetched_at).getTime();
      if (!row.last_fetched_at || ts > new Date(row.last_fetched_at).getTime()) {
        row.last_fetched_at = account.last_fetched_at;
      }
    }

    if (account.monitoring_status === 'started') row.monitoring_started += 1;
    else row.monitoring_stopped += 1;

    const score = scoreByAccountId.get(account.id) || 0;
    if (score > row.relevance_score) row.relevance_score = score;

    byProfile.set(profileId, row);
  }

  // Global profile stance / sentiment / risk totals
  let globalStanceSupport = 0;
  let globalStanceOppose = 0;
  let globalStanceNeutral = 0;
  let globalSentimentPositive = 0;
  let globalSentimentNeutral = 0;
  let globalSentimentNegative = 0;

  const profiles = [...byProfile.values()]
    .map((row) => {
      const monitoring =
        row.monitoring_started > 0
          ? 'started'
          : row.monitoring_stopped > 0
            ? 'stopped'
            : 'stopped';
      const relevance_bucket = bucketForScore(row.relevance_score);

      // Percentage of total fetched posts across all tracked target profiles
      const post_percentage =
        totalPostsFetchedInScope > 0
          ? Number(((row.posts_fetched / totalPostsFetchedInScope) * 100).toFixed(1))
          : 0;

      const profileStance = computeStanceStats({
        support: row.stance_support,
        oppose: row.stance_oppose,
        neutral: row.stance_neutral,
      });

      const profileSentiment = computeSentimentStats({
        positive: row.sentiment_positive,
        neutral: row.sentiment_neutral,
        negative: row.sentiment_negative,
      });

      const profileRisk = computeRiskStats({
        high: row.risk_high,
        medium: row.risk_medium,
        low: row.risk_low,
      });

      globalStanceSupport += row.stance_support;
      globalStanceOppose += row.stance_oppose;
      globalStanceNeutral += row.stance_neutral;
      globalSentimentPositive += row.sentiment_positive;
      globalSentimentNeutral += row.sentiment_neutral;
      globalSentimentNegative += row.sentiment_negative;

      return {
        profile_id: row.profile_id,
        account_id: row.account_id,
        display_name: row.display_name,
        is_active: row.is_active,
        accounts_count: row.accounts_count,
        platforms: row.platforms,
        handles: row.handles,
        posts_fetched: row.posts_fetched,
        posts_total: row.posts_total,
        post_percentage,
        alerts_count: row.alerts_count,
        alerts_open: row.alerts_open,
        alerts_high: row.alerts_high,
        last_fetched_at: row.last_fetched_at
          ? new Date(row.last_fetched_at).toISOString()
          : null,
        monitoring,
        relevance_score: Math.round(row.relevance_score),
        relevance_bucket,
        stance_stats: profileStance,
        sentiment_stats: profileSentiment,
        risk_stats: profileRisk,
      };
    })
    .sort(
      (a, b) =>
        b.posts_fetched - a.posts_fetched ||
        b.alerts_count - a.alerts_count ||
        String(a.display_name || '').localeCompare(String(b.display_name || ''))
    );

  const trend = bucketRowsByDay(trendRows, { from, to, dateField: 'fetched_at' });

  const stance_stats = computeStanceStats({
    support: globalStanceSupport,
    oppose: globalStanceOppose,
    neutral: globalStanceNeutral,
  });

  const sentiment_stats = computeSentimentStats({
    positive: globalSentimentPositive,
    neutral: globalSentimentNeutral,
    negative: globalSentimentNegative,
  });

  return {
    range,
    platform: platform || 'all',
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    active,
    paused,
    total_posts_fetched: totalPostsFetchedInScope,
    byPlatform,
    content_by_platform,
    risk_distribution,
    trend,
    stance_stats,
    sentiment_stats,
    profiles,
  };
};

module.exports = {
  resolveRange,
  computeStanceStats,
  computeSentimentStats,
  computeRiskStats,
  getOverview,
  getEventsAnalytics,
  getEventDetails,
  getAlertsAnalytics,
  getGrievancesAnalytics,
  getProfilesAnalytics,
};
