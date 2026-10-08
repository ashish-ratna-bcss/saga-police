const { listTenantDbNames, getTenantPrisma } = require('../../lib/tenantDatabase.service');
const { ensureOpsSchema } = require('../../../prisma/ensureOpsSchema');
const { scanEventOnce } = require('./event.scan.service');
const { eventPublicationWindow } = require('./event.utils');
const logger = require('../../lib/logger');

const TICK_MS = Math.max(60_000, Number(process.env.EVENT_SCHEDULER_TICK_MS || 60_000));

let timer = null;
let running = false;

const dueForPoll = (event) => {
  const minutes = Number(event.polling_interval_minutes) || 60;
  if (!event.last_fetched_at) return true;
  const last = new Date(event.last_fetched_at).getTime();
  return Date.now() - last >= minutes * 60_000;
};

/** True once the event's publication window (end_date) is over. */
const hasEnded = (event) => {
  const { end } = eventPublicationWindow(event);
  return Boolean(end && end.getTime() < Date.now());
};

/**
 * Atomically claim this poll slot. Several API processes share one database
 * and each runs this scheduler; only the one whose conditional update matches
 * a row gets to scan. Works through pgbouncer (no session locks needed).
 */
const claimPoll = async (prisma, event) => {
  const res = await prisma.social_media_events.updateMany({
    where: {
      id: event.id,
      monitoring_status: 'started',
      // <= (+1ms) tolerates microsecond vs millisecond rounding; a taken slot has a newer value
      last_fetched_at: event.last_fetched_at
        ? { lte: new Date(new Date(event.last_fetched_at).getTime() + 1) }
        : null,
    },
    data: { last_fetched_at: new Date() },
  });
  return res.count === 1;
};

/** Mark an ended event as stopped so it stops costing API calls. */
const stopEnded = async (prisma, event) => {
  const logs = Array.isArray(event.monitoring_logs) ? event.monitoring_logs : [];
  const res = await prisma.social_media_events.updateMany({
    where: { id: event.id, monitoring_status: 'started' },
    data: {
      monitoring_status: 'stopped',
      monitoring_logs: [
        ...logs,
        { at: new Date().toISOString(), action: 'stop', status: 'stopped', message: 'Auto-stopped: event end date passed' },
      ].slice(-200),
    },
  });
  return res.count === 1;
};

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const dbNames = await listTenantDbNames();

    // Pass 1 (cheap): stop ended events everywhere before any slow scan starts.
    for (const dbName of dbNames) {
      try {
        const tenantPrisma = getTenantPrisma(dbName);
        const live = await tenantPrisma.social_media_events.findMany({
          where: { monitoring_status: 'started', end_date: { not: null } },
        });
        for (const event of live) {
          if (hasEnded(event) && (await stopEnded(tenantPrisma, event))) {
            logger.info(`[EventScheduler] tenant=${dbName} event=${event.id} auto-stopped (end date passed)`);
          }
        }
      } catch (err) {
        logger.warn(`[EventScheduler] tenant=${dbName} end-date pass failed: ${err.message}`);
      }
    }

    // Pass 2: scan due events.
    for (const dbName of dbNames) {
      const tenantPrisma = getTenantPrisma(dbName);
      try {
        await ensureOpsSchema(tenantPrisma);
        const active = await tenantPrisma.social_media_events.findMany({
          where: { monitoring_status: 'started' },
          orderBy: { id: 'asc' },
        });
        for (const event of active) {
          if (hasEnded(event)) {
            if (await stopEnded(tenantPrisma, event)) {
              logger.info(`[EventScheduler] tenant=${dbName} event=${event.id} auto-stopped (end date passed)`);
            }
            continue;
          }
          if (!dueForPoll(event)) continue;
          if (!(await claimPoll(tenantPrisma, event))) continue; // another process took it
          try {
            const result = await scanEventOnce(event, {
              source: 'scheduler',
              db: tenantPrisma,
              dbName,
            });
            logger.info(
              `[EventScheduler] tenant=${dbName} event=${event.id} scanned=${result.scanned} ingested=${result.ingested}`
            );
          } catch (err) {
            logger.warn(
              `[EventScheduler] tenant=${dbName} event=${event.id} failed: ${err.message}`
            );
          }
        }
      } catch (err) {
        logger.warn(`[EventScheduler] tenant=${dbName} tick failed: ${err.message}`);
      }
    }
  } catch (err) {
    logger.warn(`[EventScheduler] tick failed: ${err.message}`);
  } finally {
    running = false;
  }
};

const startScheduler = () => {
  if (timer) return;
  logger.info(`[EventScheduler] starting (tick=${Math.round(TICK_MS / 1000)}s)`);
  setTimeout(tick, 15_000);
  timer = setInterval(tick, TICK_MS);
};

const stopScheduler = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = {
  startScheduler,
  stopScheduler,
  tick,
};
