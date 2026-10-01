/**
 * Per-tenant sentiment work lists.
 * Within a tenant: posted_at ASC, NULL posted_at last, then fetched_at ASC, then id ASC.
 * Across tenants: one job per turn, in the order tenants were first seen.
 * The Sentiment API is not involved here — it still receives only tenant_key.
 */

const timeValue = (value) => {
  if (value == null || value === '') return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const idValue = (job) => {
  try {
    return BigInt(job.postId);
  } catch {
    return 0n;
  }
};

/**
 * @param {{ postId: string|bigint|number, postedAt?: Date|string|null, fetchedAt?: Date|string|null, kind?: string }} a
 * @param {{ postId: string|bigint|number, postedAt?: Date|string|null, fetchedAt?: Date|string|null, kind?: string }} b
 */
const compareJobs = (a, b) => {
  const aPosted = timeValue(a.postedAt);
  const bPosted = timeValue(b.postedAt);
  if (aPosted == null && bPosted != null) return 1;
  if (aPosted != null && bPosted == null) return -1;
  if (aPosted != null && bPosted != null && aPosted !== bPosted) return aPosted - bPosted;

  const aFetched = timeValue(a.fetchedAt);
  const bFetched = timeValue(b.fetchedAt);
  if (aFetched == null && bFetched != null) return 1;
  if (aFetched != null && bFetched == null) return -1;
  if (aFetched != null && bFetched != null && aFetched !== bFetched) return aFetched - bFetched;

  const aId = idValue(a);
  const bId = idValue(b);
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return String(a.kind || 'catalog').localeCompare(String(b.kind || 'catalog'));
};

/**
 * Oldest eligible rows across catalog posts and event media.
 * Each input list must already be the oldest `batch` of its own table.
 * The global oldest `batch` is inside that union.
 */
const pickOldest = (posts, media, batch) => {
  const rows = [
    ...(Array.isArray(posts) ? posts : []).map((row) => ({
      postId: row.id,
      kind: 'catalog',
      postedAt: row.posted_at ?? null,
      fetchedAt: row.fetched_at ?? null,
    })),
    ...(Array.isArray(media) ? media : []).map((row) => ({
      postId: row.id,
      kind: 'event',
      postedAt: row.posted_at ?? null,
      fetchedAt: row.fetched_at ?? null,
    })),
  ];
  rows.sort(compareJobs);
  const limit = Math.max(0, Number(batch) || 0);
  return rows.slice(0, limit);
};

const ELIGIBLE_ORDER = [
  { posted_at: { sort: 'asc', nulls: 'last' } },
  { fetched_at: 'asc' },
  { id: 'asc' },
];

/**
 * Load the oldest eligible catalog + event rows for one tenant and enqueue them.
 * Does not change analysis_status, attempts, or posted_at.
 */
const enqueueOldestPending = async (prisma, dbName, enqueue, { batch, maxAttempts }) => {
  if (!prisma || typeof enqueue !== 'function') return 0;
  const where = {
    analysis_status: { in: ['pending', 'failed'] },
    analysis_attempts: { lt: maxAttempts },
  };
  const select = { id: true, posted_at: true, fetched_at: true };
  const posts = await prisma.social_media_posts.findMany({
    where,
    select,
    orderBy: ELIGIBLE_ORDER,
    take: batch,
  });

  let media = [];
  if (prisma.social_media_event_media?.findMany) {
    try {
      media = await prisma.social_media_event_media.findMany({
        where,
        select,
        orderBy: ELIGIBLE_ORDER,
        take: batch,
      });
    } catch (mediaErr) {
      if (!/analysis_status|does not exist/i.test(mediaErr.message || '')) throw mediaErr;
    }
  }

  const chosen = pickOldest(posts, media, batch);
  for (const row of chosen) {
    enqueue({
      postId: row.postId,
      dbName,
      kind: row.kind,
      postedAt: row.postedAt,
      fetchedAt: row.fetchedAt,
    });
  }
  return chosen.length;
};

const createAnalysisQueue = ({ concurrency, maxQueue, logPrefix }) => {
  const limit = Math.max(1, Number(concurrency) || 1);
  const cap = Math.max(1, Number(maxQueue) || 1);
  const prefix = logPrefix || 'analysis-queue';

  /** @type {Map<string, object[]>} */
  const byTenant = new Map();
  /** @type {string[]} */
  const rotation = [];
  const inFlight = new Set();
  let cursor = 0;
  let active = 0;
  let processor = null;
  let pumpScheduled = false;

  const stats = {
    enqueued: 0,
    completed: 0,
    failed: 0,
    dropped: 0,
  };

  const tenantKeyOf = (dbName) => (dbName == null || dbName === '' ? '' : String(dbName));

  const jobKey = (job) =>
    `${job.kind || 'catalog'}:${tenantKeyOf(job.dbName)}:${String(job.postId)}`;

  const queuedCount = () => {
    let count = 0;
    for (const jobs of byTenant.values()) count += jobs.length;
    return count;
  };

  const ensureTenant = (key) => {
    if (!byTenant.has(key)) byTenant.set(key, []);
    if (!rotation.includes(key)) rotation.push(key);
    return byTenant.get(key);
  };

  const insertSorted = (jobs, job) => {
    let index = 0;
    while (index < jobs.length && compareJobs(jobs[index], job) <= 0) index += 1;
    jobs.splice(index, 0, job);
  };

  const findNewest = () => {
    let newest = null;
    for (const jobs of byTenant.values()) {
      for (const job of jobs) {
        if (!newest || compareJobs(newest, job) < 0) newest = job;
      }
    }
    return newest;
  };

  const removeJob = (job) => {
    const jobs = byTenant.get(tenantKeyOf(job.dbName));
    if (!jobs) return false;
    const index = jobs.findIndex((item) => jobKey(item) === jobKey(job));
    if (index < 0) return false;
    jobs.splice(index, 1);
    return true;
  };

  const takeNext = () => {
    const size = rotation.length;
    if (!size) return null;
    for (let step = 0; step < size; step += 1) {
      const index = (cursor + step) % size;
      const key = rotation[index];
      const jobs = byTenant.get(key);
      if (jobs && jobs.length) {
        cursor = (index + 1) % size;
        return jobs.shift();
      }
    }
    return null;
  };

  const pump = () => {
    if (!processor) return;
    while (active < limit) {
      const job = takeNext();
      if (!job) return;
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
          console.error(`[${prefix}] job ${key}:`, err.message);
        })
        .finally(() => {
          inFlight.delete(key);
          active -= 1;
          schedulePump();
        });
    }
  };

  const schedulePump = () => {
    if (pumpScheduled) return;
    pumpScheduled = true;
    queueMicrotask(() => {
      pumpScheduled = false;
      pump();
    });
  };

  const enqueue = (job) => {
    const postId = String(job.postId);
    if (!postId || postId === 'undefined' || postId === 'null') return false;
    const dbName = job.dbName || null;
    const kind = job.kind === 'event' ? 'event' : 'catalog';
    const next = {
      postId,
      dbName,
      kind,
      postedAt: job.postedAt ?? null,
      fetchedAt: job.fetchedAt ?? null,
    };
    const key = jobKey(next);
    if (inFlight.has(key)) return false;
    const tenantKey = tenantKeyOf(dbName);
    const existing = byTenant.get(tenantKey);
    if (existing && existing.some((item) => jobKey(item) === key)) return false;

    if (queuedCount() >= cap) {
      const newest = findNewest();
      if (!newest || compareJobs(next, newest) >= 0) {
        stats.dropped += 1;
        return false;
      }
      removeJob(newest);
      stats.dropped += 1;
    }

    insertSorted(ensureTenant(tenantKey), next);
    stats.enqueued += 1;
    schedulePump();
    return true;
  };

  const setProcessor = (fn) => {
    processor = fn;
    schedulePump();
  };

  const getStats = () => ({
    ...stats,
    queued: queuedCount(),
    active,
    concurrency: limit,
  });

  const snapshot = () => {
    const out = {};
    for (const [tenant, jobs] of byTenant) {
      out[tenant === '' ? '(none)' : tenant] = jobs.map((job) => ({
        postId: job.postId,
        kind: job.kind,
        postedAt: job.postedAt,
        fetchedAt: job.fetchedAt,
        dbName: job.dbName,
      }));
    }
    return out;
  };

  return { enqueue, setProcessor, getStats, snapshot };
};

module.exports = {
  compareJobs,
  pickOldest,
  enqueueOldestPending,
  createAnalysisQueue,
};
