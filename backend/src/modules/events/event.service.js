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
  getEventsReport,
  recordFetch,
  markPolled,
  asJson,
};
