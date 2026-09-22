const dbOf = require('../../lib/dbOf');
const { hydrateEvent, hydrateEventMedia, normalizeEventPayload, asJson, resolveEventPlatforms } = require('./event.utils');

const HISTORY_CAP = 200;

const appendJsonArray = (existing, entry, cap = HISTORY_CAP) => {
  const list = Array.isArray(existing) ? existing : asJson(existing, []);
  return [...list, entry].slice(-cap);
};

const listEvents = async ({ monitoring_status, status, db } = {}) => {
  const prisma = dbOf(db);
  const where = {};
  // Accept legacy query ?status=active|paused|all and new ?monitoring_status=
  const raw = monitoring_status || status;
  if (raw && raw !== 'all') {
    const s = String(raw).toLowerCase();
    if (s === 'started' || s === 'active') where.monitoring_status = 'started';
    else if (s === 'stopped' || s === 'paused') where.monitoring_status = 'stopped';
  }
  const rows = await prisma.social_media_events.findMany({
    where,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });
  return rows.map(hydrateEvent);
};

const getEventById = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  const row = await prisma.social_media_events.findUnique({ where: { id: numericId } });
  return hydrateEvent(row);
};

const createEvent = async (body, user, { db } = {}) => {
  const prisma = dbOf(db);
  const payload = normalizeEventPayload(body);
  if (!payload.name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) {
    const err = new Error('end_date must be after start_date');
    err.status = 400;
    throw err;
  }

  const interval = payload.polling_interval_minutes ?? 60;
  const row = await prisma.social_media_events.create({
    data: {
      name: String(payload.name).trim(),
      description: payload.description || '',
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      location: payload.location || '',
      platforms: await resolveEventPlatforms(prisma, payload.platforms),
      keywords: payload.keywords || [],
      high_risk_threshold: payload.high_risk_threshold ?? null,
      medium_risk_threshold: payload.medium_risk_threshold ?? null,
      polling_interval_minutes: interval,
      monitoring_status: 'stopped',
      monitoring_logs: [],
      last_fetched_history: [],
      origin: payload.origin || 'manual',
      occasion_calendar_id: payload.occasion_calendar_id
        ? Number(payload.occasion_calendar_id)
        : payload.origin_calendar_id
          ? Number(payload.origin_calendar_id)
          : null,
      created_by: String(user?.email || user?.id || 'system'),
    },
  });
  return hydrateEvent(row);
};

const updateEvent = async (id, body, { db } = {}) => {
  const prisma = dbOf(db);
  const existing = await prisma.social_media_events.findUnique({ where: { id: Number(id) } });
  if (!existing) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }
  const payload = normalizeEventPayload(body);
  const data = {};
  for (const key of [
    'name',
    'description',
    'start_date',
    'end_date',
    'location',
    'platforms',
    'keywords',
    'high_risk_threshold',
    'medium_risk_threshold',
    'polling_interval_minutes',
  ]) {
    if (payload[key] !== undefined) data[key] = payload[key];
  }
  if (payload.occasion_calendar_id !== undefined || payload.origin_calendar_id !== undefined) {
    data.occasion_calendar_id = payload.occasion_calendar_id
      ? Number(payload.occasion_calendar_id)
      : payload.origin_calendar_id
        ? Number(payload.origin_calendar_id)
        : null;
  }
  const row = await prisma.social_media_events.update({
    where: { id: Number(id) },
    data,
  });
  return hydrateEvent(row);
};

/**
 * Set monitoring to started|stopped and append monitoring_logs (Profiles pattern).
 */
const setMonitoringStatus = async (id, nextStatus, { db } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(id);
  const existing = await prisma.social_media_events.findUnique({ where: { id: numericId } });
  if (!existing) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  const status = nextStatus === 'started' ? 'started' : 'stopped';
  if (existing.monitoring_status === status) {
    return hydrateEvent(existing);
  }

  const now = new Date().toISOString();
  const logEntry =
    status === 'started'
      ? { at: now, action: 'start', status: 'running', message: 'Monitoring session started' }
      : { at: now, action: 'stop', status: 'stopped', message: 'Monitoring session stopped' };

  const row = await prisma.social_media_events.update({
    where: { id: numericId },
    data: {
      monitoring_status: status,
      monitoring_logs: appendJsonArray(existing.monitoring_logs, logEntry),
    },
  });
  return hydrateEvent(row);
};

const toggleMonitoring = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  const existing = await prisma.social_media_events.findUnique({ where: { id: Number(id) } });
  if (!existing) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }
  const next = existing.monitoring_status === 'started' ? 'stopped' : 'started';
  return setMonitoringStatus(id, next, { db });
};

const deleteEvent = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  try {
    await prisma.social_media_events.delete({ where: { id: Number(id) } });
    return true;
  } catch {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }
};

const getDashboard = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  const event = await prisma.social_media_events.findUnique({ where: { id: Number(id) } });
  if (!event) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  const byPlatformRows = await prisma.social_media_event_media.groupBy({
    by: ['platform'],
    where: { event_id: Number(id), NOT: { platform: 'instagram' } },
    _count: { _all: true },
  });
  const content_by_platform = {};
  let content_total = 0;
  for (const row of byPlatformRows) {
    content_by_platform[row.platform] = row._count._all;
    content_total += row._count._all;
  }

  const hydrated = hydrateEvent(event);
  return {
    event: hydrated,
    stats: {
      content_total,
      alerts_total: 0,
      alerts_active: 0,
      alerts_priority: 0,
      content_by_platform,
      // Platforms selected on the event (tabs always list all; this is the configured set)
      platforms_configured: Array.isArray(hydrated.platforms) ? hydrated.platforms.filter(Boolean).length : 0,
      // Platforms that actually have ingested media for this event
      platforms_active: Object.keys(content_by_platform).length,
    },
    recent_content: [],
    recent_alerts: [],
  };
};

const listEventContent = async (id, { page = 1, limit = 50, platform = 'all', db } = {}) => {
  const prisma = dbOf(db);
  const event = await prisma.social_media_events.findUnique({ where: { id: Number(id) } });
  if (!event) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  const where = { event_id: Number(id), NOT: { platform: 'instagram' } };
  if (platform && platform !== 'all') {
    where.platform = String(platform).toLowerCase();
    delete where.NOT;
  }

  const skip = (Math.max(1, page) - 1) * Math.min(200, Math.max(1, limit));
  const take = Math.min(200, Math.max(1, limit));

  const [rows, total] = await Promise.all([
    prisma.social_media_event_media.findMany({
      where,
      orderBy: [{ fetched_at: 'desc' }, { updated_at: 'desc' }, { id: 'desc' }],
      skip,
      take,
    }),
    prisma.social_media_event_media.count({ where }),
  ]);

  const hasMore = skip + rows.length < total;
  return {
    content: rows.map(hydrateEventMedia),
    has_more: hasMore,
    pagination: {
      total,
      page: Math.max(1, page),
      limit: take,
      hasMore,
    },
  };
};

const getEventsReport = async ({ db } = {}) => {
  const prisma = dbOf(db);
  const events = await prisma.social_media_events.findMany({
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });
  const counts = await prisma.social_media_event_media.groupBy({
    by: ['event_id'],
    _count: { _all: true },
  });
  const countMap = Object.fromEntries(
    counts.map((c) => [String(c.event_id), c._count._all])
  );
  return {
    events: events.map((e) => ({
      ...hydrateEvent(e),
      discovered_hashtags: [],
      content_count: countMap[String(e.id)] || 0,
    })),
  };
};

/**
 * Update last_fetched_at and optionally append a last_fetched_history entry.
 */
const recordFetch = async (id, historyEntry = null, { db } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(id);
  const existing = await prisma.social_media_events.findUnique({
    where: { id: numericId },
    select: { last_fetched_history: true },
  });
  if (!existing) return;

  const data = { last_fetched_at: new Date() };
  if (historyEntry) {
    data.last_fetched_history = appendJsonArray(existing.last_fetched_history, {
      at: new Date().toISOString(),
      ...historyEntry,
    });
  }
  await prisma.social_media_events.update({
    where: { id: numericId },
    data,
  });
};

/** @deprecated use recordFetch */
const markPolled = async (id, historyEntry = null, { db } = {}) => recordFetch(id, historyEntry, { db });

const squeezeWhitespace = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const normalizeForKeywordMatch = (text) => squeezeWhitespace(String(text || '').toLowerCase());
const collapseForFuzzyMatch = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[\s_\-.,!?'"():;/\\#@]+/g, '');

const keywordMatchesText = (keyword, text) => {
  const k = normalizeForKeywordMatch(keyword);
  if (!k || !text) return false;
  const t = String(text).toLowerCase();
  if (t.includes(k)) return true;
  if (k.startsWith('#') || k.startsWith('@')) {
    const bare = k.slice(1);
    if (bare && t.includes(bare)) return true;
  }
  const kFuzzy = collapseForFuzzyMatch(k);
  if (kFuzzy && kFuzzy.length >= 3) {
    const tFuzzy = collapseForFuzzyMatch(text);
    if (tFuzzy.includes(kFuzzy)) return true;
  }
  return false;
};

const getKeywordAnalytics = async (id, { db } = {}) => {
  const prisma = dbOf(db);
  const event = await prisma.social_media_events.findUnique({
    where: { id: Number(id) },
  });
  if (!event) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  // 1. Extract keywords
  const rawKeywords = asJson(event.keywords, []) || [];
  let keywordsList = (Array.isArray(rawKeywords) ? rawKeywords : [])
    .map((k) => (typeof k === 'string' ? { keyword: k.trim(), language: 'all' } : { keyword: String(k?.keyword || '').trim(), language: k?.language || 'all' }))
    .filter((k) => k.keyword);

  // If no keywords defined, fallback to event name
  if (!keywordsList.length && event.name) {
    keywordsList = [{ keyword: event.name.trim(), language: 'all' }];
  }

  // Deduplicate keywords by lower-cased keyword text
  const seenKw = new Set();
  const dedupedKeywords = [];
  for (const k of keywordsList) {
    const lower = k.keyword.toLowerCase();
    if (!seenKw.has(lower)) {
      seenKw.add(lower);
      dedupedKeywords.push(k);
    }
  }

  // 2. Fetch event media
  const rows = await prisma.social_media_event_media.findMany({
    where: { event_id: Number(id), NOT: { platform: 'instagram' } },
    orderBy: [{ posted_at: 'desc' }, { fetched_at: 'desc' }, { id: 'desc' }],
    take: 3000,
  });

  const parsedItems = rows.map((row) => {
    const ar = asJson(row.analysis_result, {}) || {};
    const engagement = asJson(row.engagement, {}) || {};
    const likes = Number(engagement.like_count ?? engagement.likes ?? 0) || 0;
    const shares = Number(engagement.retweet_count ?? engagement.shares ?? 0) || 0;
    const comments = Number(engagement.reply_count ?? engagement.comments ?? 0) || 0;
    const views = Number(engagement.impression_count ?? engagement.views ?? 0) || 0;
    const totalEngagement = likes + shares + comments;

    let sentiment = String(ar.sentiment || '').toLowerCase();
    if (!['positive', 'neutral', 'negative'].includes(sentiment)) {
      sentiment = 'neutral';
    }

    let riskLevel = String(ar.risk_level || '').toLowerCase();
    if (riskLevel === 'safe') riskLevel = 'low';
    if (!['low', 'medium', 'high', 'critical'].includes(riskLevel)) {
      riskLevel = 'low';
    }

    const postedDate = row.posted_at ? new Date(row.posted_at) : (row.fetched_at ? new Date(row.fetched_at) : new Date());
    const dateKey = !isNaN(postedDate.getTime()) ? postedDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

    const matchedKws = Array.isArray(ar.matched_keywords) ? ar.matched_keywords.map((k) => String(k).toLowerCase().trim()) : [];

    return {
      id: String(row.id),
      platform: String(row.platform || 'x').toLowerCase(),
      text: row.text || '',
      author: row.author_name || row.author_handle || 'Anonymous',
      author_handle: row.author_handle || '',
      posted_at: row.posted_at || row.fetched_at,
      dateKey,
      url: row.url || null,
      engagement: { likes, shares, comments, views, total: totalEngagement },
      sentiment,
      risk_level: riskLevel,
      risk_score: Number(ar.risk_score) || 0,
      matched_keywords: matchedKws,
      raw_analysis: ar,
    };
  });

  const matchesKeyword = (item, kwObj) => {
    const kwText = kwObj.keyword;
    const kwLower = kwText.toLowerCase().trim();
    if (item.matched_keywords.includes(kwLower)) return true;
    if (keywordMatchesText(kwText, item.text)) return true;
    return false;
  };

  const overallTimelineMap = new Map();
  const matchedItemIds = new Set();

  const keywordAnalytics = dedupedKeywords.map((kwObj) => {
    const matched = parsedItems.filter((item) => matchesKeyword(item, kwObj));
    const totalPosts = matched.length;

    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    const riskCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    const platformCounts = {};
    let totalLikes = 0;
    let totalShares = 0;
    let totalComments = 0;
    let totalViews = 0;
    let totalEngage = 0;

    const timelineMap = new Map();
    const authorMap = new Map();

    for (const item of matched) {
      matchedItemIds.add(item.id);

      sentimentCounts[item.sentiment] = (sentimentCounts[item.sentiment] || 0) + 1;
      riskCounts[item.risk_level] = (riskCounts[item.risk_level] || 0) + 1;
      platformCounts[item.platform] = (platformCounts[item.platform] || 0) + 1;

      totalLikes += item.engagement.likes;
      totalShares += item.engagement.shares;
      totalComments += item.engagement.comments;
      totalViews += item.engagement.views;
      totalEngage += item.engagement.total;

      const authorKey = `${item.author}::${item.platform}`;
      if (!authorMap.has(authorKey)) {
        authorMap.set(authorKey, {
          name: item.author,
          handle: item.author_handle,
          platform: item.platform,
          count: 0,
          engagement: 0,
        });
      }
      const a = authorMap.get(authorKey);
      a.count += 1;
      a.engagement += item.engagement.total;

      if (!timelineMap.has(item.dateKey)) {
        timelineMap.set(item.dateKey, {
          date: item.dateKey,
          count: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
          engagement: 0,
        });
      }
      const t = timelineMap.get(item.dateKey);
      t.count += 1;
      t[item.sentiment] += 1;
      t.engagement += item.engagement.total;
    }

    const timeline = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const topAuthors = Array.from(authorMap.values())
      .sort((a, b) => b.count - a.count || b.engagement - a.engagement)
      .slice(0, 10);

    const samplePosts = [...matched]
      .sort((a, b) => b.engagement.total - a.engagement.total || new Date(b.posted_at || 0) - new Date(a.posted_at || 0))
      .slice(0, 30)
      .map((p) => ({
        id: p.id,
        platform: p.platform,
        text: p.text,
        author: p.author,
        author_handle: p.author_handle,
        posted_at: p.posted_at,
        url: p.url,
        sentiment: p.sentiment,
        risk_level: p.risk_level,
        risk_score: p.risk_score,
        engagement: p.engagement,
      }));

    const positivePct = totalPosts > 0 ? Math.round((sentimentCounts.positive / totalPosts) * 100) : 0;
    const neutralPct = totalPosts > 0 ? Math.round((sentimentCounts.neutral / totalPosts) * 100) : 0;
    const negativePct = totalPosts > 0 ? Math.round((sentimentCounts.negative / totalPosts) * 100) : 0;

    let dominantPlatform = 'x';
    let maxPlatformCount = -1;
    for (const [plt, count] of Object.entries(platformCounts)) {
      if (count > maxPlatformCount) {
        maxPlatformCount = count;
        dominantPlatform = plt;
      }
    }

    return {
      keyword: kwObj.keyword,
      language: kwObj.language,
      total_posts: totalPosts,
      sentiment: {
        ...sentimentCounts,
        positive_pct: positivePct,
        neutral_pct: neutralPct,
        negative_pct: negativePct,
        net_score: sentimentCounts.positive - sentimentCounts.negative,
      },
      risk_levels: riskCounts,
      high_risk_total: riskCounts.high + riskCounts.critical,
      platforms: platformCounts,
      dominant_platform: dominantPlatform,
      engagement: {
        total: totalEngage,
        likes: totalLikes,
        shares: totalShares,
        comments: totalComments,
        views: totalViews,
        avg_per_post: totalPosts > 0 ? Math.round(totalEngage / totalPosts) : 0,
      },
      timeline,
      top_authors: topAuthors,
      sample_posts: samplePosts,
    };
  });

  keywordAnalytics.sort((a, b) => b.total_posts - a.total_posts);

  for (const item of parsedItems) {
    if (!overallTimelineMap.has(item.dateKey)) {
      overallTimelineMap.set(item.dateKey, {
        date: item.dateKey,
        count: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        engagement: 0,
      });
    }
    const o = overallTimelineMap.get(item.dateKey);
    o.count += 1;
    o[item.sentiment] += 1;
    o.engagement += item.engagement.total;
  }
  const overallTimeline = Array.from(overallTimelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  let overallPos = 0, overallNeu = 0, overallNeg = 0;
  let overallCrit = 0, overallHigh = 0, overallMed = 0, overallLow = 0;
  let overallLikes = 0, overallShares = 0, overallComments = 0, overallViews = 0;
  const overallPlatforms = {};

  for (const item of parsedItems) {
    if (item.sentiment === 'positive') overallPos++;
    else if (item.sentiment === 'negative') overallNeg++;
    else overallNeu++;

    if (item.risk_level === 'critical') overallCrit++;
    else if (item.risk_level === 'high') overallHigh++;
    else if (item.risk_level === 'medium') overallMed++;
    else overallLow++;

    overallPlatforms[item.platform] = (overallPlatforms[item.platform] || 0) + 1;
    overallLikes += item.engagement.likes;
    overallShares += item.engagement.shares;
    overallComments += item.engagement.comments;
    overallViews += item.engagement.views;
  }

  const totalContent = parsedItems.length;
  const overallSentiment = {
    positive: overallPos,
    neutral: overallNeu,
    negative: overallNeg,
    positive_pct: totalContent > 0 ? Math.round((overallPos / totalContent) * 100) : 0,
    neutral_pct: totalContent > 0 ? Math.round((overallNeu / totalContent) * 100) : 0,
    negative_pct: totalContent > 0 ? Math.round((overallNeg / totalContent) * 100) : 0,
  };

  const comparisons = keywordAnalytics.map((k) => ({
    keyword: k.keyword,
    posts: k.total_posts,
    positive: k.sentiment.positive,
    neutral: k.sentiment.neutral,
    negative: k.sentiment.negative,
    engagement: k.engagement.total,
    high_risk: k.high_risk_total,
    dominant_platform: k.dominant_platform,
    platforms: k.platforms,
  }));

  return {
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      location: event.location,
      start_date: event.start_date,
      end_date: event.end_date,
      platforms: event.platforms,
      total_keywords: dedupedKeywords.length,
    },
    summary: {
      total_keywords: dedupedKeywords.length,
      total_posts: totalContent,
      total_matched_posts: matchedItemIds.size,
      top_keyword: keywordAnalytics[0]?.keyword || null,
      top_keyword_posts: keywordAnalytics[0]?.total_posts || 0,
      sentiment: overallSentiment,
      risk: {
        critical: overallCrit,
        high: overallHigh,
        medium: overallMed,
        low: overallLow,
      },
      platforms: overallPlatforms,
      engagement: {
        total: overallLikes + overallShares + overallComments,
        likes: overallLikes,
        shares: overallShares,
        comments: overallComments,
        views: overallViews,
      },
    },
    comparisons,
    timeline_overall: overallTimeline,
    keywords: keywordAnalytics,
  };
};

module.exports = {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  setMonitoringStatus,
  toggleMonitoring,
  deleteEvent,
  getDashboard,
  listEventContent,
  getKeywordAnalytics,
  getEventsReport,
  recordFetch,
  markPolled,
  asJson,
};
