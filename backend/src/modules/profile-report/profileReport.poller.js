/**
 * Tools → Profile Report background worker, started with the API like the other schedulers.
 * Every few seconds, for every tenant: start collecting queued accounts, queue the next posts for analysis,
 * and (hourly) clear out profiles that were started in the dialog and never saved.
 * Several API processes run this side by side; the work is claimed in the database, so none is done twice.
 */
const logger = require('../../lib/logger');
const { listTenantDbNames, getTenantPrisma } = require('../../lib/tenantDatabase.service');
const { ensureTables } = require('./profileReport.schema');
const store = require('./profileReport.store');
const { pollCollections } = require('./profileReport.collect');
const { enqueuePending } = require('./profileReport.analyze');
const vision = require('./profileReport.vision');

const POLL_MS = Math.max(3000, Number(process.env.PROFILE_REPORT_POLL_MS) || 15000);
const SWEEP_MS = 60 * 60 * 1000;
const NUDGE_MS = 100;

let timer = null;
let busy = false;
let lastSweep = 0;
const nudges = new Map();
/** When each tenant's posts were last checked for ones that need analysing again (garbled text, no picture description). */
const repairedAt = new Map();
const REPAIR_EVERY_MS = 30 * 60 * 1000;

/**
 * One tenant's turn. Only tenants that already use the module are touched: the tables are created by the first
 * Fetch (never at server start), so a tenant that never opens Profile Report costs one cheap lookup per tick.
 */
const tenantTurn = async (dbName, { sweep = false } = {}) => {
  const prisma = getTenantPrisma(dbName);
  if (!prisma) return;
  const [{ t } = {}] = await prisma.$queryRawUnsafe(`SELECT to_regclass('public.profile_report_accounts')::text AS t`);
  if (!t) return;
  await ensureTables(prisma);
  if (Date.now() - (repairedAt.get(dbName) || 0) > REPAIR_EVERY_MS) {
    repairedAt.set(dbName, Date.now());
    // Posts analysed on the text "[object Object]" (a picture description that arrived as structured data) are analysed again.
    const garbled = Number(await store.requeueGarbledAnalysis(prisma)) || 0;
    if (garbled > 0) logger.warn(`[ProfileReport] tenant=${dbName}: ${garbled} posts were analysed on a garbled picture description and are being analysed again`);
    // Posts with a picture that has not been described yet (older posts, or ones judged on the reader's timing statistics) get a description.
    const pictures = vision.enabled() ? Number(await store.requeueForPictures(prisma)) || 0 : 0;
    if (pictures > 0) logger.warn(`[ProfileReport] tenant=${dbName}: ${pictures} posts with pictures are being analysed again so the pictures can be described`);
  }
  await pollCollections(prisma, dbName);
  await enqueuePending(prisma, dbName);
  if (sweep) await store.sweepStaleDrafts(prisma);
};

const tick = async () => {
  if (busy) return;
  busy = true;
  try {
    const sweep = Date.now() - lastSweep > SWEEP_MS;
    if (sweep) lastSweep = Date.now();
    for (const dbName of await listTenantDbNames()) {
      try {
        await tenantTurn(dbName, { sweep });
      } catch (err) {
        logger.error(`[ProfileReport] poll tenant=${dbName}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`[ProfileReport] poll: ${err.message}`);
  } finally {
    busy = false;
  }
};

/** Ask for one tenant's turn right away (a Fetch or a Save just queued work), instead of waiting for the next tick. */
const nudgeTenant = (dbName) => {
  if (!dbName || nudges.has(dbName)) return;
  nudges.set(dbName, setTimeout(() => {
    nudges.delete(dbName);
    tenantTurn(dbName).catch((err) => logger.error(`[ProfileReport] nudge tenant=${dbName}: ${err.message}`));
  }, NUDGE_MS));
};

const startScheduler = () => {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
  setTimeout(tick, 12000);
};

const stopScheduler = () => {
  if (timer) { clearInterval(timer); timer = null; }
  for (const t of nudges.values()) clearTimeout(t);
  nudges.clear();
};

module.exports = { startScheduler, stopScheduler, nudgeTenant, tick };
