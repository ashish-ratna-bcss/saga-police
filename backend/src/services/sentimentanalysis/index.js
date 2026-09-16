const queue = require('./queue');
const { analyzePost } = require('./analyzePost');
const { analyzeEventMedia } = require('./analyzeEventMedia');
const { startPoller, stopPoller, pollPending } = require('./pollPending');
const { getTenantPrisma } = require('../../lib/tenantDatabase.service');

queue.setProcessor(async (job) => {
  const db = getTenantPrisma(job.dbName);
  if (job.kind === 'event') {
    await analyzeEventMedia(job.postId, { db, dbName: job.dbName });
    return;
  }
  await analyzePost(job.postId, { db, dbName: job.dbName });
});

/** Enqueue a catalog post for sentiment (after upsert). */
const enqueuePost = (postId, { dbName } = {}) => {
  if (postId == null) return false;
  return queue.enqueue({ postId, dbName: dbName || null, kind: 'catalog' });
};

/** Enqueue an event media row for sentiment (after event scan upsert). */
const enqueueEventMedia = (mediaId, { dbName } = {}) => {
  if (mediaId == null) return false;
  return queue.enqueue({ postId: mediaId, dbName: dbName || null, kind: 'event' });
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
  analyzePost,
  analyzeEventMedia,
  pollPending,
  getQueueStats: queue.getStats,
};
