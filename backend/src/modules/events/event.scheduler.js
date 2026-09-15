const { listTenantDbNames, getTenantPrisma } = require('../../lib/tenantDatabase.service');
const { ensureOpsSchema } = require('../../../prisma/ensureOpsSchema');
const { scanEventOnce } = require('./event.scan.service');
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

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const dbNames = await listTenantDbNames();
    for (const dbName of dbNames) {
      const tenantPrisma = getTenantPrisma(dbName);
      try {
        await ensureOpsSchema(tenantPrisma);
        const active = await tenantPrisma.social_media_events.findMany({
          where: { monitoring_status: 'started' },
          orderBy: { id: 'asc' },
        });
        for (const event of active) {
          if (!dueForPoll(event)) continue;
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
