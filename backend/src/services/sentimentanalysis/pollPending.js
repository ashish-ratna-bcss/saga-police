const prisma = require('../../../prisma/client');
const { enqueue } = require('./queue');

const POLL_MS = Number(process.env.SENTIMENT_POLL_MS) || 30_000;
const BATCH = Math.max(1, Number(process.env.SENTIMENT_POLL_BATCH) || 20);

let timer = null;

/** Claim pending/failed posts from DB and push into memory queue. */
const pollPending = async () => {
  try {
    const rows = await prisma.social_media_posts.findMany({
      where: {
        analysis_status: { in: ['pending', 'failed'] },
        analysis_attempts: { lt: Math.max(1, Number(process.env.SENTIMENT_MAX_ATTEMPTS) || 5) },
      },
      select: { id: true },
      orderBy: { fetched_at: 'asc' },
      take: BATCH,
    });

    for (const row of rows) {
      enqueue({ postId: row.id });
    }
  } catch (err) {
    console.error('[sentimentanalysis] pollPending:', err.message);
  }
};

const startPoller = () => {
  if (timer) return;
  console.log('[sentimentanalysis] pending poller started');
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
