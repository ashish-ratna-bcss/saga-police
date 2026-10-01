const { listTenantDbNames, getTenantPrisma } = require('../../lib/tenantDatabase.service');
const { enqueue } = require('./queue');
const { enqueueOldestPending } = require('../analysisFairQueue');

const POLL_MS = Number(process.env.MEDIA_ANALYSIS_POLL_MS) || 30_000;
const BATCH = Math.max(1, Number(process.env.MEDIA_ANALYSIS_POLL_BATCH) || 20);
const NUDGE_MS = 50;

let timer = null;
const nudgeTimers = new Map();

const maxAttempts = () => Math.max(1, Number(process.env.SENTIMENT_MAX_ATTEMPTS) || 5);

/**
 * Load this tenant's oldest eligible catalog posts and event media
 * (posted_at, nulls last) and enqueue at most BATCH of them together.
 */
const pollTenant = async (dbName) => {
  const prisma = getTenantPrisma(dbName);
  if (!prisma) return;
  await enqueueOldestPending(prisma, dbName, enqueue, {
    batch: BATCH,
    maxAttempts: maxAttempts(),
  });
};

/** Claim pending/failed catalog posts + event media and push into the per-tenant queues. */
const pollPending = async () => {
  try {
    const dbNames = await listTenantDbNames();
    for (const dbName of dbNames) {
      try {
        await pollTenant(dbName);
      } catch (err) {
        console.error(`[media_post_analysis] pollPending tenant=${dbName}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[media_post_analysis] pollPending:', err.message);
  }
};

/**
 * Ask the poller to refill one tenant soon.
 * Ingest uses this instead of enqueueing the new row directly, so a post that
 * was just fetched cannot run ahead of an older pending post still in the DB.
 * Rows already stored are not modified.
 */
const nudgeTenant = (dbName) => {
  if (!dbName || nudgeTimers.has(dbName)) return;
  nudgeTimers.set(
    dbName,
    setTimeout(() => {
      nudgeTimers.delete(dbName);
      pollTenant(dbName).catch((err) => {
        console.error(`[media_post_analysis] nudge tenant=${dbName}:`, err.message);
      });
    }, NUDGE_MS)
  );
};

const startPoller = () => {
  if (timer) return;
  timer = setInterval(pollPending, POLL_MS);
  setTimeout(pollPending, 5_000);
};

const stopPoller = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  for (const timeout of nudgeTimers.values()) clearTimeout(timeout);
  nudgeTimers.clear();
};

module.exports = { pollPending, pollTenant, nudgeTenant, startPoller, stopPoller };
