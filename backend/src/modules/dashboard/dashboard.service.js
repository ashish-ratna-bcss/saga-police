/**
 * Home dashboard aggregations — Postgres / Prisma only.
 * GET /api/dashboard/overview
 */
const dbOf = require('../../lib/dbOf');
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

const buildKpis = async (prisma, { from, to, platform }) => {
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

const buildRecommendations = async (prisma, { from, platform }) => {
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

const buildTopPosts = async (prisma, { from, to, platform, limit = 8 }) => {
  const where = {
    OR: [{ posted_at: { gte: from, lte: to } }, { posted_at: null, fetched_at: { gte: from, lte: to } }],
    ...platformWhere(platform),
  };

  // Pull a capped set and rank in JS (engagement JSON shapes vary by platform).
  const rows = await prisma.social_media_posts.findMany({
    where,
    orderBy: [{ fetched_at: 'desc' }, { updated_at: 'desc' }, { id: 'desc' }],
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
        fetched_at: row.fetched_at,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.fetched_at || b.posted_at || 0) - new Date(a.fetched_at || a.posted_at || 0)
    )
    .slice(0, limit);
};

const buildTopProfiles = async (prisma, { from, to, platform, limit = 5 }) => {
  const where = {
    OR: [{ posted_at: { gte: from, lte: to } }, { posted_at: null, fetched_at: { gte: from, lte: to } }],
    ...platformWhere(platform),
  };

  const rows = await prisma.social_media_posts.findMany({
    where,
    orderBy: [{ fetched_at: 'desc' }, { updated_at: 'desc' }, { id: 'desc' }],
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

const buildAlertsPulse = async (prisma, { from, to, platform }) => {
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

const buildGrievancesPulse = async (prisma, { platform }) => {
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
    getDashboardReportStats({ db: prisma }),
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

const buildEventsPulse = async (prisma) => {
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

const buildPlatformsPulse = async (prisma) => {
  const platforms = await prisma.platforms.findMany({
    where: { is_active: true },
    select: { id: true, slug: true, name: true },
    orderBy: { id: 'asc' },
  });
  if (!platforms.length) return [];

  const rows = await prisma.social_media_accounts.groupBy({
    by: ['platform_id'],
    where: { is_active: true },
    _count: { _all: true },
  });
  const countMap = Object.fromEntries(rows.map((r) => [r.platform_id, r._count._all]));

  const monitoring = await prisma.social_media_accounts.groupBy({
    by: ['platform_id'],
    where: { is_active: true, monitoring_status: 'started' },
    _count: { _all: true },
  });
  const monMap = Object.fromEntries(monitoring.map((r) => [r.platform_id, r._count._all]));

  return platforms
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      accounts: countMap[p.id] || 0,
      monitoring: monMap[p.id] || 0,
    }))
    .sort((a, b) => b.accounts - a.accounts || a.name.localeCompare(b.name));
};

const istDateKey = (d) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const getOverview = async (query = {}) => {
  const prisma = dbOf(query.db);
  const { range, from, to } = resolveRange(query.range);
  const platform = normalizePlatform(query.platform);

  const dateClause = range === 'all' ? '' : `AND fetched_at >= '${from.toISOString()}' AND fetched_at <= '${to.toISOString()}'`;
  const platformClause = platform ? `AND platform = '${platform.replace(/'/g, '')}'` : '';
  const filterSql = `${dateClause} ${platformClause}`;

  const [
    kpis,
    recommendations,
    top_profiles,
    top_posts,
    alerts,
    grievances,
    events,
    platformsPulse,
    dailyTrendRaw,
    platformShareRaw,
    globalThreeLevel,
  ] = await Promise.all([
    buildKpis(prisma, { from, to, platform }),
    buildRecommendations(prisma, { from, platform }),
    buildTopProfiles(prisma, { from, to, platform }),
    buildTopPosts(prisma, { from, to, platform }),
    buildAlertsPulse(prisma, { from, to, platform }),
    buildGrievancesPulse(prisma, { platform }),
    buildEventsPulse(prisma),
    buildPlatformsPulse(prisma),
    prisma.$queryRawUnsafe(`
      SELECT
        TO_CHAR(fetched_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS total
      FROM (
        SELECT fetched_at FROM social_media_posts WHERE fetched_at IS NOT NULL ${filterSql}
        UNION ALL
        SELECT fetched_at FROM social_media_event_media WHERE fetched_at IS NOT NULL ${filterSql}
      ) all_telemetry
      GROUP BY date
      ORDER BY date ASC
    `).catch(() => []),
    prisma.$queryRawUnsafe(`
      SELECT
        LOWER(platform) AS slug,
        COUNT(*)::int AS posts_count
      FROM (
        SELECT platform FROM social_media_posts WHERE fetched_at IS NOT NULL ${filterSql}
        UNION ALL
        SELECT platform FROM social_media_event_media WHERE fetched_at IS NOT NULL ${filterSql}
      ) all_telemetry
      GROUP BY LOWER(platform)
      ORDER BY posts_count DESC
    `).catch(() => []),
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
    `).catch(() => [{}]),
  ]);

  // Continuous daily trend map
  const dailyCountMap = new Map();
  (dailyTrendRaw || []).forEach((r) => {
    if (r && r.date) dailyCountMap.set(r.date, Number(r.total) || 0);
  });

  const startTrendDate = range === 'all'
    ? (dailyTrendRaw && dailyTrendRaw.length > 0
        ? new Date(dailyTrendRaw[0].date)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    : new Date(from);
  const endTrendDate = new Date(to);

  const daily_ingestion = [];
  for (let d = new Date(startTrendDate); d <= endTrendDate; d.setDate(d.getDate() + 1)) {
    const key = istDateKey(d);
    daily_ingestion.push({
      date: key,
      total: dailyCountMap.get(key) || 0,
    });
  }

  // Merge platform counts
  const postsCountMap = Object.fromEntries(
    (platformShareRaw || []).map((p) => [
      String(p.slug).toLowerCase().replace(/^twitter$/, 'x'),
      Number(p.posts_count) || 0,
    ])
  );

  const allPlatformSlugs = Array.from(
    new Set([
      ...(platformsPulse || []).map((p) => String(p.slug).toLowerCase().replace(/^twitter$/, 'x')),
      ...Object.keys(postsCountMap),
    ])
  );

  const mergedPlatforms = allPlatformSlugs
    .map((slug) => {
      const existing =
        (platformsPulse || []).find(
          (p) => String(p.slug).toLowerCase().replace(/^twitter$/, 'x') === slug
        ) || {};
      return {
        slug,
        name: existing.name || (slug === 'x' ? 'X / Twitter' : slug.charAt(0).toUpperCase() + slug.slice(1)),
        accounts: existing.accounts || 0,
        monitoring: existing.monitoring || 0,
        posts_count: postsCountMap[slug] || 0,
      };
    })
    .sort((a, b) => (b.posts_count - a.posts_count) || (b.accounts - a.accounts));

  const statsRow = (globalThreeLevel && globalThreeLevel[0]) || {};

  const stance_stats = {
    favourable: Number(statsRow.stance_favourable || 0),
    unfavourable: Number(statsRow.stance_unfavourable || 0),
    neutral: Number(statsRow.stance_neutral || 0),
    total: Number(statsRow.stance_favourable || 0) + Number(statsRow.stance_unfavourable || 0) + Number(statsRow.stance_neutral || 0),
  };
  stance_stats.favourable_pct = stance_stats.total > 0 ? Number(((stance_stats.favourable / stance_stats.total) * 100).toFixed(1)) : 0;
  stance_stats.unfavourable_pct = stance_stats.total > 0 ? Number(((stance_stats.unfavourable / stance_stats.total) * 100).toFixed(1)) : 0;
  stance_stats.neutral_pct = stance_stats.total > 0 ? Number(((stance_stats.neutral / stance_stats.total) * 100).toFixed(1)) : 0;

  const sentiment_stats = {
    positive: Number(statsRow.sentiment_positive || 0),
    neutral: Number(statsRow.sentiment_neutral || 0),
    negative: Number(statsRow.sentiment_negative || 0),
    total: Number(statsRow.sentiment_positive || 0) + Number(statsRow.sentiment_neutral || 0) + Number(statsRow.sentiment_negative || 0),
  };
  sentiment_stats.positive_pct = sentiment_stats.total > 0 ? Number(((sentiment_stats.positive / sentiment_stats.total) * 100).toFixed(1)) : 0;
  sentiment_stats.neutral_pct = sentiment_stats.total > 0 ? Number(((sentiment_stats.neutral / sentiment_stats.total) * 100).toFixed(1)) : 0;
  sentiment_stats.negative_pct = sentiment_stats.total > 0 ? Number(((sentiment_stats.negative / sentiment_stats.total) * 100).toFixed(1)) : 0;
  sentiment_stats.net_score = sentiment_stats.total > 0 ? Math.round(((sentiment_stats.positive - sentiment_stats.negative) / sentiment_stats.total) * 100) : 0;

  const risk_stats = {
    high: Number(statsRow.risk_high || 0),
    medium: Number(statsRow.risk_medium || 0),
    low: Number(statsRow.risk_low || 0),
    total: Number(statsRow.risk_high || 0) + Number(statsRow.risk_medium || 0) + Number(statsRow.risk_low || 0),
  };
  risk_stats.high_pct = risk_stats.total > 0 ? Number(((risk_stats.high / risk_stats.total) * 100).toFixed(1)) : 0;
  risk_stats.medium_pct = risk_stats.total > 0 ? Number(((risk_stats.medium / risk_stats.total) * 100).toFixed(1)) : 0;
  risk_stats.low_pct = risk_stats.total > 0 ? Number(((risk_stats.low / risk_stats.total) * 100).toFixed(1)) : 0;

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
    platforms: mergedPlatforms,
    daily_ingestion,
    trend: daily_ingestion,
    stance_stats,
    sentiment_stats,
    risk_stats,
  };
};

module.exports = {
  getOverview,
  engagementScore,
  resolveRange,
  normalizePlatform,
};
