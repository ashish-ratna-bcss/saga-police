/**
 * Background follower for E-Paper fetches.
 *
 * Reading a newspaper takes minutes, so a fetch is a job: this poller (like the other schedulers in
 * the API process) follows each running job on the E-Paper service and, once the service has
 * finished, saves its posts. Several API processes run it side by side; each job is claimed in the
 * database so only one of them works on it at a time.
 */
const { listTenantDbNames, getTenantPrisma } = require('../../lib/tenantDatabase.service');
const { processFetchJobs } = require('./epaper.posts.service');

const POLL_MS = Number(process.env.EPAPER_POLL_MS) || 20_000;
let timer = null;
let busy = false;

const tick = async () => {
  if (busy) return;
  busy = true;
  try {
    const dbNames = await listTenantDbNames();
    for (const dbName of dbNames) {
      try {
        const prisma = getTenantPrisma(dbName);
        if (prisma) await processFetchJobs(prisma);
      } catch (err) {
        console.error(`[epaper] poll tenant=${dbName}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[epaper] poll:', err.message);
  } finally {
    busy = false;
  }
};

const startScheduler = () => {
  if (timer || !process.env.EPAPER_URL) return;
  timer = setInterval(tick, POLL_MS);
  setTimeout(tick, 10_000);
};

const stopScheduler = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = { startScheduler, stopScheduler, tick };
