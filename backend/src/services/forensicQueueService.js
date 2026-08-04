/**
 * Shared single-worker queue for deepfake ML calls.
 * High-priority jobs (user-triggered deepfake page) are processed before
 * normal-priority jobs (background alert-batch forensics).
 */
const highPriorityQueue = [];
const normalPriorityQueue = [];
let isProcessing = false;

const dequeueNext = () => {
  if (highPriorityQueue.length > 0) return highPriorityQueue.shift();
  if (normalPriorityQueue.length > 0) return normalPriorityQueue.shift();
  return null;
};

const processQueue = async () => {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (true) {
      const job = dequeueNext();
      if (!job) break;

      try {
        (() => {})(`[ForensicQueue] Starting ${job.priority} job: ${job.label}`);
        const result = await job.task();
        (() => {})(`[ForensicQueue] Completed ${job.priority} job: ${job.label}`);
        job.resolve(result);
      } catch (error) {
        (() => {})(`[ForensicQueue] Failed ${job.priority} job: ${job.label} (${error.message})`);
        job.reject(error);
      }
    }
  } finally {
    isProcessing = false;
  }
};

const enqueueForensicTask = (task, { priority = 'normal', label = 'forensic-job' } = {}) => {
  if (typeof task !== 'function') {
    return Promise.reject(new Error('enqueueForensicTask requires a task function'));
  }

  return new Promise((resolve, reject) => {
    const job = { task, priority: priority === 'high' ? 'high' : 'normal', label, resolve, reject };

    if (job.priority === 'high') {
      highPriorityQueue.push(job);
    } else {
      normalPriorityQueue.push(job);
    }

    processQueue().catch((err) => {
      (() => {})('[ForensicQueue] Processing loop error:', err.message);
    });
  });
};

module.exports = {
  enqueueForensicTask
};
