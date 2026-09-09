/**
 * Home dashboard aggregations — Postgres / Prisma only.
 * GET /api/dashboard/overview
 */
const prisma = require('../../../prisma/client');
const { getDashboardReportStats } = require('../grievances/grievance.report.service');
const logger = require('../../lib/logger');

const RANGE_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const normalizePlatform = (raw) => {
  const p = String(raw || 'all')
    .trim()
    .toLowerCase()
    .replace(/^twitter$/, 'x');
  if (!p || p === 'all') return null;
  return p;
};

const resolveRange = (rangeKey = '7d') => {
  const key = RANGE_MS[rangeKey] ? rangeKey : '7d';
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_MS[key]);
  return { range: key, from, to };
};

const asEngagement = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** score = views + 2*likes + 3*comments + 4*(shares|retweets|forwards) */
const engagementScore = (engagement) => {
  const e = asEngagement(engagement);
  const views = num(e.views ?? e.view ?? e.viewCount);
  const likes = num(e.likes ?? e.like ?? e.reactions ?? e.favorites);
  const comments = num(e.comments ?? e.comment ?? e.replies);
  const shares = num(e.shares ?? e.share ?? e.retweets ?? e.retweet ?? e.forwards ?? e.reshare);
  return views + likes * 2 + comments * 3 + shares * 4;
};

const platformWhere = (platform) => (platform ? { platform } : {});

const accountPlatformFilter = (platform) =>
  platform
    ? {
        platforms: { slug: platform },
      }
    : {};

const buildKpis = async ({ from, to, platform }) => {
  const postWhere = {
    OR: [{ posted_at: { gte: from, lte: to } }, { posted_at: null, fetched_at: { gte: from, lte: to } }],
    ...platformWhere(platform),
  };
  const alertWhere = {
    created_at: { gte: from, lte: to },
    ...platformWhere(platform),
  };
  const grievanceWhere = {
    is_active: true,
    ...(platform ? { platform } : {}),
  };

  const [
    accountsTotal,
    accountsMonitoring,
    accountsActive,
    highRiskOpen,
    unreadAlerts,
    openGrievances,
    eventsStarted,
    postsInRange,
  ] = await Promise.all([
    prisma.social_media_accounts.count({
      where: { is_active: true, ...accountPlatformFilter(platform) },
    }),
    prisma.social_media_accounts.count({
      where: {
        is_active: true,
        monitoring_status: 'started',
        ...accountPlatformFilter(platform),
      },
    }),
    prisma.social_media_accounts.count({
      where: { is_active: true, ...accountPlatformFilter(platform) },
    }),
    prisma.social_media_alerts.count({
      where: {
        ...alertWhere,
        risk_level: { in: ['high', 'critical'] },
        status: { in: ['active', 'pending', 'acknowledged'] },
      },
    }),
    prisma.social_media_alerts.count({
      where: { is_read: false, ...platformWhere(platform) },
    }),
    prisma.social_media_grievances.count({
      where: {
        ...grievanceWhere,
        workflow_status: { notIn: ['closed', 'resolved', 'dismissed'] },
      },
    }),
    prisma.social_media_events.count({
      where: { monitoring_status: 'started' },
    }),
    prisma.social_media_posts.count({ where: postWhere }),
  ]);

  return {
    accounts_total: accountsTotal,
    accounts_active: accountsActive,
    accounts_monitoring: accountsMonitoring,
    high_risk_open: highRiskOpen,
    unread_alerts: unreadAlerts,
    open_grievances: openGrievances,
    events_started: eventsStarted,
    posts_in_range: postsInRange,
  };
};

const buildRecommendations = async ({ from, platform }) => {
  const recs = [];

  const [highRisk, escalatedReports, staleEvents, stoppedMonitored] = await Promise.all([
    prisma.social_media_alerts.findMany({
      where: {
        risk_level: { in: ['high', 'critical'] },
        status: { in: ['active', 'pending'] },
        is_read: false,
        created_at: { gte: from },
        ...platformWhere(platform),
      },
      orderBy: [{ risk_score: 'desc' }, { created_at: 'desc' }],
      take: 5,
      select: {
        id: true,
        title: true,
        platform: true,
        risk_level: true,
        risk_score: true,
        author_handle: true,
        created_at: true,
      },
    }),
    prisma.social_media_grievance_reports.findMany({
      where: {
        status: 'ESCALATED',
        ...(platform ? { platform } : {}),
      },
      orderBy: { updated_at: 'desc' },
      take: 5,
      select: {
        id: true,
        unique_code: true,
        platform: true,
        report_type: true,
        status: true,
        updated_at: true,
      },
    }),
    prisma.social_media_events.findMany({
      where: { monitoring_status: 'started' },
      orderBy: { updated_at: 'asc' },
      take: 8,
      select: {
        id: true,
        name: true,
        polling_interval_minutes: true,
        last_fetched_at: true,
        last_fetched_history: true,
        updated_at: true,
      },
    }),
    prisma.social_media_accounts.findMany({
      where: {
        is_active: true,
        monitoring_status: 'stopped',
        ...accountPlatformFilter(platform),
      },
      orderBy: { updated_at: 'desc' },
      take: 5,
      select: {
        id: true,
        handle: true,
        platforms: { select: { slug: true, name: true } },
        profile: { select: { display_name: true } },
      },
    }),
  ]);

  for (const a of highRisk) {
    recs.push({
      id: `alert-${a.id}`,
      type: 'alert_high_risk',
      priority: a.risk_level === 'critical' ? 100 : 80,
      title: a.title || 'High-risk alert',
      subtitle: `${a.platform} · ${a.author_handle || 'unknown'} · score ${a.risk_score}`,
      href: `/alerts?store=catalog&risk=${a.risk_level}`,
      meta: { alert_id: String(a.id), platform: a.platform },
    });
  }

  for (const r of escalatedReports) {
    recs.push({
      id: `report-${r.id}`,
      type: 'grievance_escalated',
      priority: 70,
      title: `Escalated ${r.report_type || 'report'} ${r.unique_code || ''}`.trim(),
      subtitle: `${r.platform || '—'} · awaiting intermediary reply`,
      href: '/grievances',
      meta: { report_id: String(r.id) },
    });
  }

  const now = Date.now();
  for (const ev of staleEvents) {
    const hist = Array.isArray(ev.last_fetched_history) ? ev.last_fetched_history : [];
    const lastHist = hist.length ? hist[hist.length - 1] : null;
    const lastAt = ev.last_fetched_at
      ? new Date(ev.last_fetched_at).getTime()
      : lastHist?.at
        ? new Date(lastHist.at).getTime()
        : null;
    const intervalMs = Math.max(1, Number(ev.polling_interval_minutes) || 60) * 60 * 1000;
    const stale = !lastAt || now - lastAt > intervalMs * 1.5;
    if (!stale) continue;
    recs.push({
      id: `event-${ev.id}`,
      type: 'event_stale',
      priority: 60,
      title: `Event needs fetch: ${ev.name}`,
      subtitle: lastAt
        ? `Last fetch ${new Date(lastAt).toLocaleString('en-IN')}`
        : 'No fetch yet while monitoring is started',
      href: `/events?id=${ev.id}`,
      meta: { event_id: String(ev.id) },
    });
  }

  for (const acc of stoppedMonitored) {
    recs.push({
      id: `account-${acc.id}`,
      type: 'account_stopped',
      priority: 40,
      title: `Start monitoring: ${acc.profile?.display_name || acc.handle}`,
      subtitle: `${acc.platforms?.slug || '—'} · @${acc.handle}`,
      href: '/social-profiles',
      meta: { account_id: acc.id },
    });
  }

  return recs.sort((a, b) => b.priority - a.priority).slice(0, 12);
};

const buildTopPosts = async ({ from, to, platform, limit = 8 }) => {
  const where = {
    OR: [{ posted_at: { gte: from, lte: to } }, { posted_at: null, fetched_at: { gte: from, lte: to } }],
    ...platformWhere(platform),
  };

  // Pull a capped set and rank in JS (engagement JSON shapes vary by platform).
  const rows = await prisma.social_media_posts.findMany({
    where,
    orderBy: [{ posted_at: 'desc' }, { fetched_at: 'desc' }],
    take: 400,
    select: {
      id: true,
      platform: true,
      external_id: true,
      url: true,
      text: true,
      author_name: true,
      author_handle: true,
      engagement: true,
      posted_at: true,
      fetched_at: true,
      account_id: true,
      account: {
        select: {
          handle: true,
          profile: { select: { id: true, display_name: true } },
          platforms: { select: { slug: true } },
        },
      },
    },
  });

  return rows
    .map((row) => {
      const score = engagementScore(row.engagement);
      return {
        id: String(row.id),
        platform: row.platform,
        external_id: row.external_id,
        url: row.url,
        text: (row.text || '').slice(0, 220),
        author_name: row.author_name || row.account?.profile?.display_name || null,
        author_handle: row.author_handle || row.account?.handle || null,
        profile_name: row.account?.profile?.display_name || null,
        engagement: asEngagement(row.engagement),
        score,
        posted_at: row.posted_at || row.fetched_at,
      };
    })
    .sort((a, b) => b.score - a.score || new Date(b.posted_at) - new Date(a.posted_at))
    .slice(0, limit);
};

const buildTopProfiles = async ({ from, to, platform, limit = 5 }) => {
  const where = {
    OR: [{ posted_at: { gte: from, lte: to } }, { posted_at: null, fetched_at: { gte: from, lte: to } }],
    ...platformWhere(platform),
  };

  const rows = await prisma.social_media_posts.findMany({
    where,
    orderBy: [{ posted_at: 'desc' }],
    take: 800,
    select: {
      account_id: true,
      engagement: true,
      platform: true,
      account: {
        select: {
          id: true,
          handle: true,
          monitoring_status: true,
          profile: { select: { id: true, display_name: true } },
          platforms: { select: { slug: true, name: true } },
        },
      },
    },
  });

  const map = new Map();
  for (const row of rows) {
    if (!row.account_id || !row.account) continue;
    const key = row.account_id;
    const cur = map.get(key) || {
      account_id: row.account.id,
      profile_id: row.account.profile?.id || null,
      display_name: row.account.profile?.display_name || row.account.handle,
      handle: row.account.handle,
      platform: row.account.platforms?.slug || row.platform,
      monitoring_status: row.account.monitoring_status,
      posts: 0,
      score: 0,
    };
    cur.posts += 1;
    cur.score += engagementScore(row.engagement);
    map.set(key, cur);
  }

  return [...map.values()]
    .sort((a, b) => b.score - a.score || b.posts - a.posts)
    .slice(0, limit);
};

const buildAlertsPulse = async ({ from, to, platform }) => {
  const where = { created_at: { gte: from, lte: to }, ...platformWhere(platform) };
  const [byRisk, byPlatform, byStatus, total] = await Promise.all([
    prisma.social_media_alerts.groupBy({
      by: ['risk_level'],
      where,
      _count: { _all: true },
    }),
    prisma.social_media_alerts.groupBy({
      by: ['platform'],
      where,
      _count: { _all: true },
    }),
    prisma.social_media_alerts.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.social_media_alerts.count({ where }),
  ]);

  const toMap = (rows, key) =>
    Object.fromEntries(rows.map((r) => [r[key] || 'unknown', r._count._all]));

  return {
    total,
    by_risk: toMap(byRisk, 'risk_level'),
    by_platform: toMap(byPlatform, 'platform'),
    by_status: toMap(byStatus, 'status'),
  };
};

const buildGrievancesPulse = async ({ platform }) => {
  const where = { is_active: true, ...(platform ? { platform } : {}) };
  const [byWorkflow, byPlatform, total, reportStats] = await Promise.all([
    prisma.social_media_grievances.groupBy({
      by: ['workflow_status'],
      where,
      _count: { _all: true },
    }),
    prisma.social_media_grievances.groupBy({
      by: ['platform'],
      where,
      _count: { _all: true },
    }),
    prisma.social_media_grievances.count({ where }),
    getDashboardReportStats(),
  ]);

  const toMap = (rows, key) =>
    Object.fromEntries(rows.map((r) => [r[key] || 'unknown', r._count._all]));

  const reportKey = platform === 'x' ? 'x' : platform || 'all';
  const reports =
    reportStats[reportKey] ||
    reportStats[platform === 'x' ? 'twitter' : platform] ||
    reportStats.all ||
    null;

  return {
    total,
    by_workflow: toMap(byWorkflow, 'workflow_status'),
    by_platform: toMap(byPlatform, 'platform'),
    reports,
  };
};

const buildEventsPulse = async () => {
  const events = await prisma.social_media_events.findMany({
    where: { monitoring_status: 'started' },
    orderBy: { updated_at: 'desc' },
    take: 12,
    select: {
      id: true,
      name: true,
      location: true,
      platforms: true,
      monitoring_status: true,
      polling_interval_minutes: true,
      start_date: true,
      end_date: true,
      updated_at: true,
      _count: { select: { media: true } },
    },
  });

  const started = await prisma.social_media_events.count({
    where: { monitoring_status: 'started' },
  });
  const total = await prisma.social_media_events.count();

  return {
    total,
    started,
    items: events.map((e) => ({
      id: String(e.id),
      name: e.name,
      location: e.location,
      platforms: e.platforms || [],
      monitoring_status: e.monitoring_status,
      polling_interval_minutes: e.polling_interval_minutes,
      start_date: e.start_date,
      end_date: e.end_date,
      media_count: e._count?.media || 0,
      updated_at: e.updated_at,
    })),
  };
};

const buildPlatformsPulse = async () => {
  const rows = await prisma.social_media_accounts.groupBy({
    by: ['platform_id'],
    where: { is_active: true },
    _count: { _all: true },
  });
  const platforms = await prisma.platforms.findMany({
    where: { is_active: true },
    select: { id: true, slug: true, name: true },
  });
  const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
  const monitoring = await prisma.social_media_accounts.groupBy({
    by: ['platform_id'],
    where: { is_active: true, monitoring_status: 'started' },
    _count: { _all: true },
  });
  const monMap = Object.fromEntries(monitoring.map((r) => [r.platform_id, r._count._all]));

  return rows
    .map((r) => {
      const p = byId[r.platform_id];
      return {
        slug: p?.slug || 'unknown',
        name: p?.name || 'Unknown',
        accounts: r._count._all,
        monitoring: monMap[r.platform_id] || 0,
      };
    })
    .sort((a, b) => b.accounts - a.accounts);
};

const getOverview = async (query = {}) => {
  const { range, from, to } = resolveRange(query.range);
  const platform = normalizePlatform(query.platform);

  const [kpis, recommendations, top_profiles, top_posts, alerts, grievances, events, platforms] =
    await Promise.all([
      buildKpis({ from, to, platform }),
      buildRecommendations({ from, platform }),
      buildTopProfiles({ from, to, platform }),
      buildTopPosts({ from, to, platform }),
      buildAlertsPulse({ from, to, platform }),
      buildGrievancesPulse({ platform }),
      buildEventsPulse(),
      buildPlatformsPulse(),
    ]);

  return {
    range,
    platform: platform || 'all',
    from: from.toISOString(),
    to: to.toISOString(),
    kpis,
    recommendations,
    top_profiles,
    top_posts,
    alerts,
    grievances,
    events,
    platforms,
  };
};

module.exports = {
  getOverview,
  engagementScore,
  resolveRange,
  normalizePlatform,
};
