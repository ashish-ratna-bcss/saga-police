/**
 * In-memory job queue for sentiment analysis.
 * One ordered list per tenant. Jobs: { postId, dbName, kind, postedAt, fetchedAt }.
 * kind=event → social_media_event_media; default catalog → social_media_posts.
 * Not started from index.js; media_post_analysis is the live scheduler.
 */
const { createAnalysisQueue } = require('../analysisFairQueue');

const queue = createAnalysisQueue({
  concurrency: Math.max(1, Number(process.env.SENTIMENT_QUEUE_CONCURRENCY) || 1),
  maxQueue: Math.max(1, Number(process.env.SENTIMENT_QUEUE_MAX) || 500),
  logPrefix: 'sentimentanalysis/queue',
});

module.exports = queue;
