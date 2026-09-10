/**
 * In-memory job queue for catalog post sentiment analysis.
 * Concurrency + optional max queue size; overflow stays as DB `pending`
 * and is picked up by the pending poller.
 * Jobs carry { postId, dbName } for multi-tenant routing.
 */
const CONCURRENCY = Math.max(1, Number(process.env.SENTIMENT_QUEUE_CONCURRENCY) || 1);
const MAX_QUEUE = Math.max(1, Number(process.env.SENTIMENT_QUEUE_MAX) || 500);

const queue = [];
const inFlight = new Set(); // `${dbName}:${postId}`
let active = 0;
let processor = null;

const stats = {
  enqueued: 0,
  completed: 0,
  failed: 0,
  dropped: 0,
};

const jobKey = (job) => `${job.dbName || ''}:${String(job.postId)}`;

const setProcessor = (fn) => {
  processor = fn;
};

const pump = () => {
  if (!processor) return;
  while (active < CONCURRENCY && queue.length > 0) {
    const job = queue.shift();
    active += 1;
    const key = jobKey(job);
    inFlight.add(key);
    Promise.resolve()
      .then(() => processor(job))
      .then(() => {
        stats.completed += 1;
      })
      .catch((err) => {
        stats.failed += 1;
        console.error(`[sentimentanalysis/queue] job ${key}:`, err.message);
      })
      .finally(() => {
        inFlight.delete(key);
        active -= 1;
        pump();
      });
  }
};

/**
 * @param {{ postId: string|bigint|number, dbName?: string|null }} job
 * @returns {boolean} true if accepted into memory queue
 */
const enqueue = (job) => {
  const postId = String(job.postId);
  if (!postId || postId === 'undefined' || postId === 'null') return false;
  const dbName = job.dbName || null;
  const key = jobKey({ postId, dbName });
  if (inFlight.has(key)) return false;
  if (queue.some((j) => jobKey(j) === key)) return false;

  if (queue.length >= MAX_QUEUE) {
    stats.dropped += 1;
    return false;
  }

  queue.push({ postId, dbName });
  stats.enqueued += 1;
  pump();
  return true;
};

const getStats = () => ({
  ...stats,
  queued: queue.length,
  active,
  concurrency: CONCURRENCY,
});

module.exports = {
  enqueue,
  setProcessor,
  getStats,
  pump,
};
