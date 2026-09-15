const { listTenantDbNames, getTenantPrisma } = require('../../lib/tenantDatabase.service');
const { enqueue } = require('./queue');

const POLL_MS = Number(process.env.SENTIMENT_POLL_MS) || 30_000;
const BATCH = Math.max(1, Number(process.env.SENTIMENT_POLL_BATCH) || 20);

let timer = null;

/** Claim pending/failed catalog posts + event media and push into memory queue. */
const pollPending = async () => {
  try {
    const dbNames = await listTenantDbNames();
    const maxAttempts = Math.max(1, Number(process.env.SENTIMENT_MAX_ATTEMPTS) || 5);

    for (const dbName of dbNames) {
      try {
        const prisma = getTenantPrisma(dbName);

        const posts = await prisma.social_media_posts.findMany({
          where: {
            analysis_status: { in: ['pending', 'failed'] },
            analysis_attempts: { lt: maxAttempts },
          },
          select: { id: true },
          orderBy: { fetched_at: 'asc' },
          take: BATCH,
        });
        for (const row of posts) {
          enqueue({ postId: row.id, dbName, kind: 'catalog' });
        }

        // Event discoveries (may lack columns until ensureOpsSchema runs)
        if (prisma.social_media_event_media?.findMany) {
          try {
            const media = await prisma.social_media_event_media.findMany({
              where: {
                analysis_status: { in: ['pending', 'failed'] },
                analysis_attempts: { lt: maxAttempts },
              },
              select: { id: true },
              orderBy: { fetched_at: 'asc' },
              take: BATCH,
            });
            for (const row of media) {
              enqueue({ postId: row.id, dbName, kind: 'event' });
            }
          } catch (mediaErr) {
            if (!/analysis_status|does not exist/i.test(mediaErr.message || '')) {
              throw mediaErr;
            }
          }
        }
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
