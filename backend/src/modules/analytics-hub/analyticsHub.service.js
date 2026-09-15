/**
 * Analytics Hub aggregations — one "All" overview (reuses the existing dashboard
 * aggregator verbatim) plus complete per-module analytics for Events, Alerts,
 * Grievances, and Profiles. Reuses existing scoring/report logic wherever it
 * already exists (profile relevance, alert workflow trend, grievance report
 * stats) instead of duplicating formulas.
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
  const key = RANGE_MS[rangeKey] ? rangeKey : '30d';
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_MS[key]);
  return { range: key, from, to };
};

const istDateKey = (d) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/**
 * Generic day-bucketed count trend, IST calendar days, [from, to] inclusive.
 * `rows` must be pre-fetched `{ [dateField]: Date }[]` (already scoped by the
 * caller's own where clause). Shared by Events/Grievances/Profiles below
 * instead of writing this loop three times.
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

/* ── All (overview) ── */
const getOverview = async (query = {}) => getDashboardOverview(query);

/* ── Events ── */
const getEventsAnalytics = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);

  const [total, byStatusRaw, byOriginRaw, contentByPlatformRaw, trendRows] = await Promise.all([
    prisma.social_media_events.count(),
    prisma.social_media_events.groupBy({ by: ['monitoring_status'], _count: { _all: true } }),
    prisma.social_media_events.groupBy({ by: ['origin'], _count: { _all: true } }),
    prisma.social_media_event_media.groupBy({ by: ['platform'], _count: { _all: true } }),
    prisma.social_media_event_media.findMany({
      where: { fetched_at: { gte: from, lte: to } },
      select: { fetched_at: true },
    }),
  ]);

  const by_status = byStatusRaw.reduce((acc, r) => ({ ...acc, [r.monitoring_status]: r._count._all }), {});
  const by_origin = byOriginRaw.reduce((acc, r) => ({ ...acc, [r.origin || 'manual']: r._count._all }), {});
  const content_by_platform = contentByPlatformRaw.reduce(
    (acc, r) => ({ ...acc, [r.platform]: r._count._all }),
    {}
  );
  const trend = bucketRowsByDay(trendRows, { from, to, dateField: 'fetched_at' });

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    by_status,
    by_origin,
    content_by_platform,
    trend,
  };
};

/* ── Alerts ── */
const getAlertsAnalytics = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const createdInRange = { created_at: { gte: from, lte: to } };

  const [total, byRiskRaw, byPlatformRaw, byStatusRaw, workflowTrend] = await Promise.all([
    prisma.social_media_alerts.count({ where: createdInRange }),
    prisma.social_media_alerts.groupBy({ by: ['risk_level'], where: createdInRange, _count: { _all: true } }),
    prisma.social_media_alerts.groupBy({ by: ['platform'], where: createdInRange, _count: { _all: true } }),
    prisma.social_media_alerts.groupBy({ by: ['status'], where: createdInRange, _count: { _all: true } }),
    getCatalogWorkflowKpi({ start: from, end: to, db: prisma }),
  ]);

  const by_risk = byRiskRaw.reduce((acc, r) => ({ ...acc, [r.risk_level]: r._count._all }), {});
  const by_platform = byPlatformRaw.reduce((acc, r) => ({ ...acc, [r.platform]: r._count._all }), {});
  const by_status = byStatusRaw.reduce((acc, r) => ({ ...acc, [r.status]: r._count._all }), {});

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    by_risk,
    by_platform,
    by_status,
    trend: workflowTrend.daily,
  };
};

/* ── Grievances ── */
const getGrievancesAnalytics = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const detectedInRange = { detected_at: { gte: from, lte: to } };

  const [total, byWorkflowRaw, byPlatformRaw, byClassificationRaw, reportStats, trendRows] = await Promise.all([
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

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    by_workflow,
    by_platform,
    by_classification,
    reports: reportStats.all,
    trend,
  };
};

/* ── Profiles ── */
const RELEVANCE_BUCKETS = ['low', 'medium', 'high'];
const bucketForScore = (score) => {
  if (score >= 65) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

const getProfilesAnalytics = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);

  const [allPlatforms, accounts, accountCountsRaw, postPlatformRaw, trendRows] = await Promise.all([
    prisma.platforms.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),
    prisma.social_media_accounts.findMany({
      where: { type: 'profile' },
      select: { id: true, profile_id: true, is_active: true },
    }),
    prisma.social_media_accounts.groupBy({
      by: ['platform_id'],
      where: { type: 'profile' },
      _count: { _all: true },
    }),
    prisma.social_media_posts.groupBy({
      by: ['platform'],
      where: { fetched_at: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.social_media_posts.findMany({
      where: { fetched_at: { gte: from, lte: to } },
      select: { fetched_at: true },
    }),
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

  // Reuses the existing per-account relevance scoring (profileRelevance.service.js)
  // instead of a new risk formula — just buckets the already-computed score.
  const scored = await attachProfileRelevanceToAccounts(accounts, { db: prisma });
  const risk_distribution = RELEVANCE_BUCKETS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {});
  for (const a of scored) {
    const bucket = bucketForScore(a.profile_relevance?.profile_relevance_score || 0);
    risk_distribution[bucket] += 1;
  }

  const trend = bucketRowsByDay(trendRows, { from, to, dateField: 'fetched_at' });

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    active,
    paused,
    byPlatform,
    content_by_platform,
    risk_distribution,
    trend,
  };
};

module.exports = {
  resolveRange,
  getOverview,
  getEventsAnalytics,
  getAlertsAnalytics,
  getGrievancesAnalytics,
  getProfilesAnalytics,
};
