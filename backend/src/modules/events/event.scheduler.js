const prisma = require('../../../prisma/client');
const { scanEventOnce } = require('./event.scan.service');
const logger = require('../../utils/logger');

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
    const active = await prisma.social_media_events.findMany({
      where: { monitoring_status: 'started' },
      orderBy: { id: 'asc' },
    });
    for (const event of active) {
      if (!dueForPoll(event)) continue;
      try {
        const result = await scanEventOnce(event, { source: 'scheduler' });
        logger.info(
          `[EventScheduler] event=${event.id} scanned=${result.scanned} ingested=${result.ingested}`
        );
      } catch (err) {
        logger.warn(`[EventScheduler] event=${event.id} failed: ${err.message}`);
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
