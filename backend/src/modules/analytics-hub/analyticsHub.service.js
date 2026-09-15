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

const normalizePlatform = (raw) => {
  const p = String(raw || 'all')
    .trim()
    .toLowerCase()
    .replace(/^twitter$/, 'x');
  if (!p || p === 'all') return null;
  return p;
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

  const [postPlatformRaw, trendRows, postsInRange, postsTotal, alertsInRange] = await Promise.all([
    accountIds.length
      ? prisma.social_media_posts.groupBy({
          by: ['platform'],
          where: { ...postBaseWhere, fetched_at: { gte: from, lte: to } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.social_media_posts.findMany({
          where: { ...postBaseWhere, fetched_at: { gte: from, lte: to } },
          select: { fetched_at: true },
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.social_media_posts.groupBy({
          by: ['account_id'],
          where: { ...postBaseWhere, fetched_at: { gte: from, lte: to } },
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
            created_at: { gte: from, lte: to },
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

  // Roll accounts up to catalog profiles (one row per profile_id).
  const byProfile = new Map();
  for (const account of accounts) {
    const profileId = account.profile_id || account.profile?.id;
    if (!profileId) continue;
    const row =
      byProfile.get(profileId) ||
      {
        profile_id: profileId,
        // Detail route uses social_media_accounts.id (not catalog profile id).
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
      };

    if (!row.account_id) row.account_id = account.id;
    // Prefer a live account for drill-down; otherwise keep the first.
    if (account.monitoring_status === 'started') row.account_id = account.id;
    row.accounts_count += 1;
    if (account.profile?.display_name) row.display_name = account.profile.display_name;
    row.is_active = row.is_active || Boolean(account.profile?.is_active) || account.is_active;
    const slug = account.platforms?.slug;
    if (slug && !row.platforms.includes(slug)) row.platforms.push(slug);
    if (account.handle && !row.handles.includes(account.handle)) row.handles.push(account.handle);

    row.posts_fetched += postsFetchedByAccount.get(account.id) || 0;
    row.posts_total += postsTotalByAccount.get(account.id) || 0;

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

  const profiles = [...byProfile.values()]
    .map((row) => {
      const monitoring =
        row.monitoring_started > 0
          ? 'started'
          : row.monitoring_stopped > 0
            ? 'stopped'
            : 'stopped';
      const relevance_bucket = bucketForScore(row.relevance_score);
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
        alerts_count: row.alerts_count,
        alerts_open: row.alerts_open,
        alerts_high: row.alerts_high,
        last_fetched_at: row.last_fetched_at
          ? new Date(row.last_fetched_at).toISOString()
          : null,
        monitoring,
        relevance_score: Math.round(row.relevance_score),
        relevance_bucket,
      };
    })
    .sort(
      (a, b) =>
        b.posts_fetched - a.posts_fetched ||
        b.alerts_count - a.alerts_count ||
        String(a.display_name || '').localeCompare(String(b.display_name || ''))
    );

  const trend = bucketRowsByDay(trendRows, { from, to, dateField: 'fetched_at' });

  return {
    range,
    platform: platform || 'all',
    from: from.toISOString(),
    to: to.toISOString(),
    total,
    active,
    paused,
    byPlatform,
    content_by_platform,
    risk_distribution,
    trend,
    profiles,
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
