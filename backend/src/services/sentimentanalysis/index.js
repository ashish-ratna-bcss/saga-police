const queue = require('./queue');
const { analyzePost } = require('./analyzePost');
const { startPoller, stopPoller, pollPending } = require('./pollPending');

queue.setProcessor(async (job) => {
  await analyzePost(job.postId);
});

/** Enqueue a catalog post for sentiment (after upsert). */
const enqueuePost = (postId) => {
  if (postId == null) return false;
  return queue.enqueue({ postId });
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
