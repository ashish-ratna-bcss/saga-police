const queue = require('./queue');
const { analyzePost } = require('./analyzePost');
const { startPoller, stopPoller, pollPending } = require('./pollPending');
const { getTenantPrisma } = require('../../lib/tenantDatabase.service');

queue.setProcessor(async (job) => {
  await analyzePost(job.postId, { db: getTenantPrisma(job.dbName) });
});

/** Enqueue a catalog post for sentiment (after upsert). */
const enqueuePost = (postId, { dbName } = {}) => {
  if (postId == null) return false;
  return queue.enqueue({ postId, dbName: dbName || null });
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
  analyzePost,
  pollPending,
  getQueueStats: queue.getStats,
};
