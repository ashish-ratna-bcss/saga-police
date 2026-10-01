const queue = require('./queue');
const { analyzeMediaPost } = require('./analyzeMediaPost');
const { analyzeEventMedia } = require('./analyzeEventMedia');
const { startPoller, stopPoller, pollPending, nudgeTenant } = require('./pollPending');
const { getTenantPrisma } = require('../../lib/tenantDatabase.service');

queue.setProcessor(async (job) => {
  const db = getTenantPrisma(job.dbName);
  if (job.kind === 'event') {
    await analyzeEventMedia(job.postId, { db, dbName: job.dbName });
    return;
  }
  await analyzeMediaPost(job.postId, { db, dbName: job.dbName });
});

/** Enqueue a catalog post for media analysis (OCR + Sentiment). */
const enqueuePost = (postId, { dbName, postedAt, fetchedAt } = {}) => {
  if (postId == null) return false;
  return queue.enqueue({
    postId,
    dbName: dbName || null,
    kind: 'catalog',
    postedAt: postedAt ?? null,
    fetchedAt: fetchedAt ?? null,
  });
};

/** Enqueue an event media row for media analysis (OCR + Sentiment). */
const enqueueEventMedia = (mediaId, { dbName, postedAt, fetchedAt } = {}) => {
  if (mediaId == null) return false;
  return queue.enqueue({
    postId: mediaId,
    dbName: dbName || null,
    kind: 'event',
    postedAt: postedAt ?? null,
    fetchedAt: fetchedAt ?? null,
  });
};

const startScheduler = () => {
  startPoller();
};

const stopScheduler = () => {
  stopPoller();
};

module.exports = {
  startScheduler,
  stopScheduler,
  enqueuePost,
  enqueueEventMedia,
  nudgeTenant,
  analyzeMediaPost,
  analyzeEventMedia,
  pollPending,
  getQueueStats: queue.getStats,
};
