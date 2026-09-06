/**
 * Intelligence dashboard aggregations — Postgres / Prisma (catalog).
 * Keeps the JSON contract expected by IntelligenceDashboard.jsx.
 */
const prisma = require('../../../prisma/client');

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};
const toISODate = (date) => startOfDay(date).toISOString().slice(0, 10);

const parseDateParam = (value, { end = false } = {}) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return end ? endOfDay(d) : startOfDay(d);
};

const safePct = (cur, prev) => {
  if (!prev) return cur ? 100 : 0;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
};

const resolveRange = (query = {}) => {
  const now = new Date();
  const from = parseDateParam(query.from) || addDays(startOfDay(now), -29);
  const to = parseDateParam(query.to, { end: true }) || endOfDay(now);
  return { now, from, to };
};

const asJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const countMapFromGroup = (rows, keyFn, countKey = '_count') => {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) || 'unknown';
    const n = typeof row[countKey] === 'object' ? row[countKey]._all : Number(row[countKey]) || 0;
    out[key] = (out[key] || 0) + n;
  }
  return out;
};

void countMapFromGroup; // reserved for future charts

/* ═══════════════════════════════════════════════════════════════════
   ALERTS
   ═══════════════════════════════════════════════════════════════════ */
const getAlertsIntelligence = async (query = {}) => {
  const { now, from, to } = resolveRange(query);
  const alertWhere = { created_at: { gte: from, lte: to } };
  const periodLength = Math.max(1, Math.ceil((to - from) / DAY_MS));
  const prevFrom = addDays(from, -periodLength);
  const prevTo = endOfDay(addDays(from, -1));

  const [
    totalAccounts,
    activeAccounts,
    accountsInRange,
    accountsByPlatformRows,
    riskRows,
    riskByPlatformRows,
    alertTypeRows,
    alertsByPlatformRows,
    alertStatusRows,
    escalatedByPlatformRows,
    currentAlerts,
    prevAlerts,
    keywordTotal,
    topAlertAuthors,
    alertsForKeywords,
    accountsTrendRows,
    alertsTrendRows,
  ] = await Promise.all([
    prisma.social_media_accounts.count(),
    prisma.social_media_accounts.count({ where: { is_active: true } }),
    prisma.social_media_accounts.count({ where: { created_at: { gte: from, lte: to } } }),
    prisma.social_media_accounts.groupBy({
      by: ['platform_id'],
      where: { created_at: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.social_media_alerts.groupBy({
      by: ['risk_level'],
      where: alertWhere,
      _count: { _all: true },
    }),
    prisma.social_media_alerts.groupBy({
      by: ['platform', 'risk_level'],
      where: alertWhere,
      _count: { _all: true },
    }),
    prisma.social_media_alerts.groupBy({
      by: ['alert_type'],
      where: alertWhere,
      _count: { _all: true },
    }),
    prisma.social_media_alerts.groupBy({
      by: ['platform'],
      where: alertWhere,
      _count: { _all: true },
    }),
    prisma.social_media_alerts.groupBy({
      by: ['status'],
      where: alertWhere,
      _count: { _all: true },
    }),
    prisma.social_media_alerts.groupBy({
      by: ['platform', 'status'],
      where: { ...alertWhere, status: 'escalated' },
      _count: { _all: true },
    }),
    prisma.social_media_alerts.count({ where: alertWhere }),
    prisma.social_media_alerts.count({
      where: { created_at: { gte: prevFrom, lte: prevTo } },
    }),
    prisma.keywords.count(),
    prisma.social_media_alerts.groupBy({
      by: ['author', 'author_handle', 'platform'],
      where: alertWhere,
      _count: { _all: true },
      _max: { created_at: true },
    }),
    prisma.social_media_alerts.findMany({
      where: alertWhere,
      select: { matched_keywords: true, risk_level: true, created_at: true },
      take: 5000,
      orderBy: { created_at: 'desc' },
    }),
    prisma.$queryRaw`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM social_media_accounts
      WHERE created_at >= ${from} AND created_at <= ${to}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             lower(coalesce(risk_level, 'unknown')) AS risk_level,
             COUNT(*)::int AS count
      FROM social_media_alerts
      WHERE created_at >= ${from} AND created_at <= ${to}
      GROUP BY 1, 2 ORDER BY 1
    `,
  ]);

  const platforms = await prisma.platforms.findMany({ select: { id: true, slug: true, name: true } });
  const platformById = Object.fromEntries(platforms.map((p) => [p.id, p.slug || p.name || String(p.id)]));

  const sourcesByPlatform = {};
  for (const row of accountsByPlatformRows) {
    const slug = platformById[row.platform_id] || 'unknown';
    sourcesByPlatform[slug] = (sourcesByPlatform[slug] || 0) + row._count._all;
  }

  // Top matched keywords (from Json)
  const keywordHits = {};
  for (const alert of alertsForKeywords) {
    for (const kw of asJsonArray(alert.matched_keywords)) {
      const key = String(typeof kw === 'string' ? kw : kw?.keyword || '').trim().toLowerCase();
      if (!key) continue;
      keywordHits[key] = (keywordHits[key] || 0) + 1;
    }
  }
  const topMatched = Object.entries(keywordHits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([keyword, count]) => ({ keyword, count }));

  const topActiveAccounts = (Array.isArray(topAlertAuthors) ? topAlertAuthors : [])
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 15)
    .map((r) => ({
      author: r.author || 'Unknown',
      handle: r.author_handle || '',
      platform: r.platform,
      alertCount: r._count._all,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0,
      latestAlert: r._max?.created_at || null,
    }));

  // Fill risk breakdown for top accounts (small set)
  if (topActiveAccounts.length) {
    const handles = topActiveAccounts.map((a) => a.handle).filter(Boolean);
    const riskDetail = await prisma.social_media_alerts.groupBy({
      by: ['author_handle', 'risk_level'],
      where: { ...alertWhere, author_handle: { in: handles } },
      _count: { _all: true },
    });
    const byHandle = {};
    for (const row of riskDetail) {
      const h = row.author_handle || '';
      if (!byHandle[h]) byHandle[h] = { high: 0, medium: 0, low: 0 };
      const lvl = String(row.risk_level || '').toLowerCase();
      if (lvl === 'high') byHandle[h].high += row._count._all;
      else if (lvl === 'medium') byHandle[h].medium += row._count._all;
      else byHandle[h].low += row._count._all;
    }
    for (const a of topActiveAccounts) {
      const r = byHandle[a.handle] || {};
      a.highRisk = r.high || 0;
      a.mediumRisk = r.medium || 0;
      a.lowRisk = r.low || 0;
    }
  }

  const daysMap = {};
  const totalDays = Math.min(Math.ceil((to - from) / DAY_MS) + 1, 366);
  for (let i = 0; i < totalDays; i++) {
    const dk = toISODate(addDays(from, i));
    daysMap[dk] = { date: dk, high: 0, medium: 0, low: 0, total: 0 };
  }
  for (const row of alertsTrendRows || []) {
    const day = row.day;
    if (!daysMap[day]) continue;
    const lvl = String(row.risk_level || 'low');
    const n = Number(row.count) || 0;
    if (lvl === 'high' || lvl === 'medium' || lvl === 'low') daysMap[day][lvl] += n;
    else daysMap[day].low += n;
    daysMap[day].total += n;
  }

  const escalatedTotal = (alertStatusRows || [])
    .filter((r) => String(r.status).toLowerCase() === 'escalated')
    .reduce((s, r) => s + r._count._all, 0);

  return {
    generatedAt: now.toISOString(),
    dateRange: { from: from.toISOString(), to: to.toISOString() },
    accounts: {
      total: totalAccounts,
      active: activeAccounts,
      addedInRange: accountsInRange,
      byPlatform: sourcesByPlatform,
      byCategory: {},
      trend: (accountsTrendRows || []).map((r) => ({ date: r.day, count: Number(r.count) || 0 })),
    },
    riskAnalysis: {
      distribution: riskRows.map((r) => ({ level: r.risk_level, count: r._count._all })),
      byPlatform: riskByPlatformRows.map((r) => ({
        platform: r.platform,
        riskLevel: r.risk_level,
        count: r._count._all,
      })),
      byCategory: [],
    },
    alertTypes: alertTypeRows.map((r) => ({ type: r.alert_type || 'unknown', count: r._count._all })),
    platformDistribution: alertsByPlatformRows.map((r) => ({
      platform: r.platform,
      count: r._count._all,
    })),
    escalations: {
      statusDistribution: alertStatusRows
        .filter((r) => String(r.status).toLowerCase() === 'escalated')
        .map((r) => ({ status: r.status, count: r._count._all })),
      byPlatform: escalatedByPlatformRows.map((r) => ({
        platform: r.platform,
        status: r.status,
        count: r._count._all,
      })),
      total: escalatedTotal,
    },
    actions: {
      byPlatform: [],
      allTimeByPlatform: [],
      timeline: [],
      total: 0,
      previousTotal: 0,
      changePct: 0,
    },
    topActiveAccounts,
    keywords: {
      byCategory: [{ category: 'catalog', total: keywordTotal, active: keywordTotal, avgWeight: 1 }],
      byLanguage: [],
      topMatched,
    },
    reportsFormatShare: {
      statusDistribution: [],
      byMonth: [],
    },
    alertsTrend: Object.values(daysMap),
    alertStatusSummary: alertStatusRows.map((r) => ({ status: r.status, count: r._count._all })),
    comparison: {
      alerts: {
        current: currentAlerts,
        previous: prevAlerts,
        changePct: safePct(currentAlerts, prevAlerts),
      },
      reports: { current: 0, previous: 0, changePct: 0 },
    },
  };
};

/* ═══════════════════════════════════════════════════════════════════
   GRIEVANCES
   ═══════════════════════════════════════════════════════════════════ */
const getGrievancesIntelligence = async (query = {}) => {
  const { now, from, to } = resolveRange(query);
  const dateWhere = { is_active: true, posted_at: { gte: from, lte: to } };
  const periodLength = Math.max(1, Math.ceil((to - from) / DAY_MS));
  const prevFrom = addDays(from, -periodLength);
  const prevTo = endOfDay(addDays(from, -1));

  const [
    totalGrievances,
    grievancesInRange,
    byPlatform,
    workflowStatusDist,
    classificationDist,
    dailyTrendRows,
    platformWorkflowCross,
    taggedAccountDist,
    currentCount,
    prevCount,
    reportByTypeStatus,
    reportByTypeCategory,
    reportShared,
  ] = await Promise.all([
    prisma.social_media_grievances.count({ where: { is_active: true } }),
    prisma.social_media_grievances.count({ where: dateWhere }),
    prisma.social_media_grievances.groupBy({
      by: ['platform'],
      where: dateWhere,
      _count: { _all: true },
    }),
    prisma.social_media_grievances.groupBy({
      by: ['workflow_status'],
      where: dateWhere,
      _count: { _all: true },
    }),
    prisma.social_media_grievances.groupBy({
      by: ['classification'],
      where: dateWhere,
      _count: { _all: true },
    }),
    prisma.$queryRaw`
      SELECT to_char(coalesce(posted_at, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM social_media_grievances
      WHERE is_active = true
        AND coalesce(posted_at, created_at) >= ${from}
        AND coalesce(posted_at, created_at) <= ${to}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.social_media_grievances.groupBy({
      by: ['platform', 'workflow_status'],
      where: dateWhere,
      _count: { _all: true },
    }),
    prisma.social_media_grievances.groupBy({
      by: ['tagged_account'],
      where: dateWhere,
      _count: { _all: true },
    }),
    prisma.social_media_grievances.count({ where: dateWhere }),
    prisma.social_media_grievances.count({
      where: { is_active: true, posted_at: { gte: prevFrom, lte: prevTo } },
    }),
    prisma.social_media_grievance_reports.groupBy({
      by: ['report_type', 'status'],
      _count: { _all: true },
    }),
    prisma.social_media_grievance_reports.groupBy({
      by: ['report_type', 'category'],
      _count: { _all: true },
    }),
    prisma.social_media_grievance_reports.groupBy({
      by: ['report_type'],
      where: { shared_at: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const taggedSorted = [...taggedAccountDist].sort((a, b) => b._count._all - a._count._all).slice(0, 15);

  const summarizeReports = (type) => {
    const statusRows = reportByTypeStatus.filter((r) => r.report_type === type);
    const catRows = reportByTypeCategory.filter((r) => r.report_type === type);
    const total = statusRows.reduce((s, r) => s + r._count._all, 0);
    const shared = reportShared.find((r) => r.report_type === type)?._count._all || 0;
    const pending = statusRows.find((r) => r.status === 'PENDING')?._count._all || 0;
    const escalated = statusRows.find((r) => r.status === 'ESCALATED')?._count._all || 0;
    const closed = statusRows.find((r) => r.status === 'CLOSED')?._count._all || 0;
    return {
      statusDistribution: statusRows.map((r) => ({ status: r.status, count: r._count._all })),
      categoryDistribution: catRows.map((r) => ({
        category: r.category || 'Uncategorized',
        count: r._count._all,
      })),
      total,
      shared,
      pending,
      escalated,
      closed,
    };
  };

  const gwr = summarizeReports('G');
  const sugg = summarizeReports('S');
  const crit = summarizeReports('C');

  return {
    generatedAt: now.toISOString(),
    dateRange: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      total: totalGrievances,
      inRange: grievancesInRange,
      changePct: safePct(currentCount, prevCount),
    },
    byPlatform: byPlatform.map((r) => ({ platform: r.platform, count: r._count._all })),
    workflowStatus: workflowStatusDist.map((r) => ({
      status: r.workflow_status,
      count: r._count._all,
    })),
    classification: classificationDist.map((r) => ({
      type: r.classification,
      count: r._count._all,
    })),
    priority: [],
    grievanceReports: gwr,
    suggestions: {
      total: sugg.total,
      shared: sugg.shared,
      categoryDistribution: sugg.categoryDistribution,
    },
    criticism: {
      total: crit.total,
      shared: crit.shared,
      categoryDistribution: crit.categoryDistribution,
    },
    dailyTrend: (dailyTrendRows || []).map((r) => ({ date: r.day, count: Number(r.count) || 0 })),
    platformWorkflowCross: platformWorkflowCross.map((r) => ({
      platform: r.platform,
      status: r.workflow_status,
      count: r._count._all,
    })),
    escalationDistribution: [],
    topTaggedAccounts: taggedSorted.map((r) => ({
      account: r.tagged_account,
      count: r._count._all,
    })),
    engagement: {},
    sentiment: [],
    urgency: [],
    comparison: {
      current: currentCount,
      previous: prevCount,
      changePct: safePct(currentCount, prevCount),
    },
  };
};

/* ═══════════════════════════════════════════════════════════════════
   PROFILES (catalog social_media_profiles + accounts)
   ═══════════════════════════════════════════════════════════════════ */
const getProfilesIntelligence = async (query = {}) => {
  const { now, from, to } = resolveRange(query);

  const [
    totalProfiles,
    activeAccounts,
    pausedAccounts,
    accountsInRange,
    platformDist,
    profilesTrendRows,
    monitoringStarted,
  ] = await Promise.all([
    prisma.social_media_profiles.count(),
    prisma.social_media_accounts.count({ where: { is_active: true } }),
    prisma.social_media_accounts.count({ where: { is_active: false } }),
    prisma.social_media_accounts.count({ where: { created_at: { gte: from, lte: to } } }),
    prisma.social_media_accounts.groupBy({
      by: ['platform_id'],
      where: { is_active: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM social_media_profiles
      WHERE created_at >= ${from} AND created_at <= ${to}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.social_media_accounts.count({ where: { monitoring_status: 'started' } }),
  ]);

  const platforms = await prisma.platforms.findMany({ select: { id: true, slug: true, name: true } });
  const platformById = Object.fromEntries(
    platforms.map((p) => [p.id, { slug: p.slug || 'unknown', name: p.name || p.slug }])
  );

  const platformDistribution = platformDist.map((r) => ({
    platform: platformById[r.platform_id]?.slug || 'unknown',
    count: r._count._all,
  }));

  // Platform × category matrix — category not first-class; use "catalog"
  const platformCategoryMatrix = platformDistribution.map((r) => ({
    platform: r.platform,
    category: 'others',
    count: r.count,
  }));

  const periodLength = Math.max(1, Math.ceil((to - from) / DAY_MS));
  const prevFrom = addDays(from, -periodLength);
  const prevTo = endOfDay(addDays(from, -1));
  const [currentAdded, prevAdded] = await Promise.all([
    prisma.social_media_profiles.count({ where: { created_at: { gte: from, lte: to } } }),
    prisma.social_media_profiles.count({
      where: { created_at: { gte: prevFrom, lte: prevTo } },
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    dateRange: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      total: totalProfiles,
      active: activeAccounts,
      archived: pausedAccounts,
      inRange: accountsInRange,
      withFIR: 0,
      withReports: 0,
      monitoring: monitoringStarted,
      changePct: safePct(currentAdded, prevAdded),
    },
    platformDistribution,
    platformCategoryMatrix,
    districtDistribution: [],
    socialCoverage: [],
    profilesWithDeleted: 0,
    byCreator: [],
    trend: (profilesTrendRows || []).map((r) => ({ date: r.day, count: Number(r.count) || 0 })),
    comparison: {
      current: currentAdded,
      previous: prevAdded,
      changePct: safePct(currentAdded, prevAdded),
    },
    // Compat aliases some UI bits may read
    totalProfiles,
    activeProfiles: activeAccounts,
    archivedProfiles: pausedAccounts,
    profilesInRange: accountsInRange,
    profilesTrend: (profilesTrendRows || []).map((r) => ({ date: r.day, count: Number(r.count) || 0 })),
    platformDist: platformDistribution,
  };
};

module.exports = {
  getAlertsIntelligence,
  getGrievancesIntelligence,
  getProfilesIntelligence,
};
