const eventService = require('./event.service');
const { scanEventOnce } = require('./event.scan.service');
const { normalizeEventPlatformSlug } = require('./event.utils');
const dbOf = require('../../lib/dbOf');

/**
 * Manually-triggered scans (Start's kickoff, Fetch Now) should only touch
 * platforms the clicking user can actually access — otherwise a restricted
 * user's click still fetches platforms hidden from them everywhere else in
 * the UI. Scheduled/background monitoring is unaffected (not user-triggered).
 * Returns a shallow copy of `event` with `platforms` intersected against
 * `user.allowed_platforms`; unrestricted users (empty/missing list) pass through.
 */
const restrictEventToUserPlatforms = (event, user) => {
  const allowedRaw = Array.isArray(user?.allowed_platforms) ? user.allowed_platforms : [];
  if (!allowedRaw.length) return event;
  const allowed = new Set(allowedRaw.map(normalizeEventPlatformSlug));
  const platforms = (Array.isArray(event.platforms) ? event.platforms : [])
    .filter((p) => allowed.has(normalizeEventPlatformSlug(p)));
  return { ...event, platforms };
};

const listEvents = async (req, res) => {
  try {
    const events = await eventService.listEvents({
      monitoring_status: req.query.monitoring_status,
      status: req.query.status,
      db: req.tenantPrisma,
    });
    return res.status(200).json(events);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEvent = async (req, res) => {
  try {
    const event = await eventService.getEventById(req.params.id, {
      db: req.tenantPrisma,
    });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const event = await eventService.createEvent(req.body, req.user, {
      db: req.tenantPrisma,
    });
    return res.status(201).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const event = await eventService.updateEvent(req.params.id, req.body, {
      db: req.tenantPrisma,
    });
    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** Profiles-style toggle: started ↔ stopped + monitoring_logs.
 *  Kickoff scan runs in the background so Start/Stop stays fast.
 *  Only fires on a real stopped→started transition (not if already live).
 */
const toggleMonitoring = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    const before = await prisma.social_media_events.findUnique({
      where: { id: Number(req.params.id) },
      select: { monitoring_status: true },
    });
    if (!before) return res.status(404).json({ message: 'Event not found' });

    const wasStopped = before.monitoring_status !== 'started';
    const event = await eventService.toggleMonitoring(req.params.id, {
      db: req.tenantPrisma,
    });

    if (wasStopped && event.monitoring_status === 'started') {
      const tenantDb = req.tenantPrisma;
      setImmediate(async () => {
        try {
          const row = await dbOf(tenantDb).social_media_events.findUnique({
            where: { id: Number(event.id) },
          });
          if (row) {
            const scanRow = restrictEventToUserPlatforms(row, req.user);
            await scanEventOnce(scanRow, { source: 'kickoff', db: tenantDb });
          }
        } catch (_) {
          /* kickoff errors are recorded in last_fetched_history when possible */
        }
      });
    }

    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const pauseEvent = async (req, res) => {
  try {
    const event = await eventService.setMonitoringStatus(req.params.id, 'stopped', {
      db: req.tenantPrisma,
    });
    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const resumeEvent = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    const before = await prisma.social_media_events.findUnique({
      where: { id: Number(req.params.id) },
      select: { monitoring_status: true },
    });
    if (!before) return res.status(404).json({ message: 'Event not found' });

    const wasStopped = before.monitoring_status !== 'started';
    const event = await eventService.setMonitoringStatus(req.params.id, 'started', {
      db: req.tenantPrisma,
    });
    if (wasStopped && event.monitoring_status === 'started') {
      const tenantDb = req.tenantPrisma;
      setImmediate(async () => {
        try {
          const row = await dbOf(tenantDb).social_media_events.findUnique({
            where: { id: Number(event.id) },
          });
          if (row) {
            const scanRow = restrictEventToUserPlatforms(row, req.user);
            await scanEventOnce(scanRow, { source: 'kickoff', db: tenantDb });
          }
        } catch (_) {
          /* ignore */
        }
      });
    }
    return res.status(200).json(event);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    await eventService.deleteEvent(req.params.id, { db: req.tenantPrisma });
    return res.status(200).json({ message: 'Event deleted' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEventDashboard = async (req, res) => {
  try {
    const data = await eventService.getDashboard(req.params.id, {
      db: req.tenantPrisma,
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEventContent = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const platform = req.query.platform || 'all';
    const data = await eventService.listEventContent(req.params.id, {
      page,
      limit,
      platform,
      db: req.tenantPrisma,
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const runEventScan = async (req, res) => {
  try {
    const prisma = dbOf(req.tenantPrisma);
    const row = await prisma.social_media_events.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!row) return res.status(404).json({ message: 'Event not found' });
    const scanRow = restrictEventToUserPlatforms(row, req.user);
    const result = await scanEventOnce(scanRow, {
      source: 'manual',
      db: req.tenantPrisma,
    });
    return res.status(200).json({ message: 'Event scan completed', ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEventsReport = async (req, res) => {
  try {
    const data = await eventService.getEventsReport({ db: req.tenantPrisma });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  toggleMonitoring,
  pauseEvent,
  resumeEvent,
  deleteEvent,
  getEventDashboard,
  getEventContent,
  runEventScan,
  getEventsReport,
};
