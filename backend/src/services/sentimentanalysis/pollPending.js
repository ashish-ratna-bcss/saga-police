const { listTenantDbNames, getTenantPrisma } = require('../../lib/tenantDatabase.service');
const { enqueue } = require('./queue');
const { enqueueOldestPending } = require('../analysisFairQueue');

const POLL_MS = Number(process.env.SENTIMENT_POLL_MS) || 30_000;
const BATCH = Math.max(1, Number(process.env.SENTIMENT_POLL_BATCH) || 20);

let timer = null;

/** Claim pending/failed catalog posts + event media in posted_at order. */
const pollPending = async () => {
  try {
    const dbNames = await listTenantDbNames();
    const maxAttempts = Math.max(1, Number(process.env.SENTIMENT_MAX_ATTEMPTS) || 5);

    for (const dbName of dbNames) {
      try {
        const prisma = getTenantPrisma(dbName);
        if (!prisma) continue;
        await enqueueOldestPending(prisma, dbName, enqueue, {
          batch: BATCH,
          maxAttempts,
        });
      } catch (err) {
        console.error(`[sentimentanalysis] pollPending tenant=${dbName}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[sentimentanalysis] pollPending:', err.message);
  }
};

const startPoller = () => {
  if (timer) return;
  timer = setInterval(pollPending, POLL_MS);
  setTimeout(pollPending, 8_000);
};

const stopPoller = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = { pollPending, startPoller, stopPoller };
