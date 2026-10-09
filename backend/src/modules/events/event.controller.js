const eventService = require('./event.service');
const { scanEventOnce } = require('./event.scan.service');
const { normalizeEventPlatformSlug } = require('./event.utils');
const dbOf = require('../../lib/dbOf');
const eventHashtagClient = require('../../services/eventHashtag/eventHashtag.client');

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
            await scanEventOnce(scanRow, {
              source: 'kickoff',
              db: tenantDb,
              dbName: req.tenantDbName,
            });
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
            await scanEventOnce(scanRow, {
              source: 'kickoff',
              db: tenantDb,
              dbName: req.tenantDbName,
            });
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
      dbName: req.tenantDbName,
    });
    return res.status(200).json({ message: 'Event scan completed', ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const getEventKeywordAnalytics = async (req, res) => {
  try {
    const data = await eventService.getKeywordAnalytics(req.params.id, {
      db: req.tenantPrisma,
    });
    return res.status(200).json(data);
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

const { getCachedEventSummary, saveEventSummaryPdf, getSummaryJob, startSummaryJob } = require('../../services/SummaryLLM');

const summaryCaller = (req) => {
  const timeframe = req.body?.timeframe || req.query?.timeframe || 'full';
  const fromDate = req.body?.from_date || req.body?.fromDate || req.query?.from_date || req.query?.fromDate || null;
  const toDate = req.body?.to_date || req.body?.toDate || req.query?.to_date || req.query?.toDate || null;
  return {
    eventId: req.params.id,
    db: req.tenantPrisma,
    dbName: req.tenantDbName,
    tenantName: resolveTenantLabel(req.query.tenant || req.body?.tenant, req.user),
    generatedBy: req.user ? { id: req.user.id, name: req.user.name || req.user.username } : null,
    timeframe,
    fromDate,
    toDate,
  };
};

const runningSummaryResponse = (res, job, eventId) =>
  res.status(202).json({
    status: 'running',
    started_at: job.started_at,
    event_id: String(eventId),
  });
const { generateEventIntelligencePdf } = require('./eventIntelligenceReport');

/** GET: cached report, or the background job already writing one. Starts the job if needed. */
const getEventSummaryLLM = async (req, res) => {
  try {
    const caller = summaryCaller(req);
    const existing = getSummaryJob(req.tenantDbName, req.params.id, caller.timeframe);
    if (existing?.status === 'running') {
      return runningSummaryResponse(res, existing, req.params.id);
    }
    const cached = await getCachedEventSummary(req.params.id, { db: req.tenantPrisma });
    // If client requested specific timeframe, check if cached matches or regenerate
    if (cached && (!caller.timeframe || caller.timeframe === 'full' || cached.stats?.timeframe === caller.timeframe)) {
      return res.status(200).json(
        existing?.status === 'failed' ? { ...cached, regenerate_error: existing.error } : cached
      );
    }
    if (existing?.status === 'failed') {
      return res.status(200).json({ status: 'failed', message: existing.error, started_at: existing.started_at });
    }
    const job = startSummaryJob(caller);
    return runningSummaryResponse(res, job, req.params.id);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** POST: start a fresh report in the background. Joins the job if one is already running. */
const regenerateEventSummaryLLM = async (req, res) => {
  try {
    const caller = summaryCaller(req);
    const existing = getSummaryJob(req.tenantDbName, req.params.id, caller.timeframe);
    if (existing?.status === 'running') {
      return runningSummaryResponse(res, existing, req.params.id);
    }
    const job = startSummaryJob(caller);
    return runningSummaryResponse(res, job, req.params.id);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const saveEventSummaryPdfHandler = async (req, res) => {
  try {
    const data = await saveEventSummaryPdf(req.params.id, req.body?.pdf_base64, {
      db: req.tenantPrisma,
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const resolveTenantLabel = (queryTenant, user) => {
  const fromQuery = String(queryTenant || '').replace(/[^\p{L}\p{N} &._-]/gu, '').trim().slice(0, 80);
  if (fromQuery) return fromQuery;
  const candidates = [
    user?.blurasagatitle,
    user?.theme_name,
    user?.organization_name,
    user?.organization,
    user?.tenant_name,
    user?.tenantName,
    user?.agency_name,
    user?.department,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 80);
  }
  return undefined;
};

/** GET: render the Event Intelligence & Social Analytics PDF (server-side, Puppeteer). */
const getEventIntelligenceReportPdf = async (req, res) => {
  try {
    const tenantName = resolveTenantLabel(req.query.tenant, req.user);
    const timeframe = req.query?.timeframe || 'full';
    const fromDate = req.query?.from_date || req.query?.fromDate || null;
    const toDate = req.query?.to_date || req.query?.toDate || null;
    // scope=region: the executive brief with only the event region's own content (no evidence annex, nothing from elsewhere).
    const regionOnly = req.query?.scope === 'region';
    const includeEvidence = !regionOnly &&
      req.query?.include_evidence !== 'false' &&
      req.query?.with_evidence !== 'false' &&
      req.query?.evidence !== 'false';
    const { pdf, eventName } = await generateEventIntelligencePdf(req.params.id, {
      db: req.tenantPrisma,
      dbName: req.tenantDbName,
      tenantName,
      user: req.user,
      timeframe,
      fromDate,
      toDate,
      includeEvidence,
      regionOnly,
    });
    // Keep the "PDF saved" flag on the cached summary in sync; failure here must not block the download.
    if (includeEvidence) {
      saveEventSummaryPdf(req.params.id, pdf.toString('base64'), { db: req.tenantPrisma }).catch(() => {});
    }
    const evTag = includeEvidence ? 'With_Evidence' : regionOnly ? 'Region_Executive_Summary' : 'Without_Evidence';
    const safe = `${tenantName || 'Report'}_${eventName}`.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}_Summary_Report_${evTag}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    return res.status(200).send(pdf);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};


const generateEventTerms = async (req, res) => {
  try {
    const data = await eventHashtagClient.generateEventTerms(req.body || {}, { db: req.tenantPrisma });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Event terms fetch failed' });
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
  getEventKeywordAnalytics,
  getEventSummaryLLM,
  regenerateEventSummaryLLM,
  saveEventSummaryPdfHandler,
  getEventIntelligenceReportPdf,
  runEventScan,
  getEventsReport,
  generateEventTerms,
};

