/**
 * In-memory job queue for Media Post Analysis (OCR + Sentiment).
 * One ordered list per tenant. Jobs: { postId, dbName, kind, postedAt, fetchedAt }.
 */
const { createAnalysisQueue } = require('../analysisFairQueue');

const queue = createAnalysisQueue({
  concurrency: Math.max(1, Number(process.env.MEDIA_ANALYSIS_CONCURRENCY) || 2),
  maxQueue: Math.max(1, Number(process.env.MEDIA_ANALYSIS_MAX_QUEUE) || 1000),
  logPrefix: 'media_post_analysis/queue',
});

module.exports = queue;
