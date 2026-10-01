const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAnalysisQueue,
  pickOldest,
  compareJobs,
  enqueueOldestPending,
} = require('./analysisFairQueue');

const untilIdle = async (queue) => {
  for (let i = 0; i < 50; i += 1) {
    const stats = queue.getStats();
    if (stats.active === 0 && stats.queued === 0) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`queue did not drain: ${JSON.stringify(queue.getStats())}`);
};

const holdProcessor = (queue) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const order = [];
  queue.setProcessor(async (job) => {
    order.push(job);
    if (order.length === 1) markStarted();
    await gate;
  });
  return { order, started, release };
};

test('single tenant processes oldest posted_at first even when enqueued in reverse', async () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 20, logPrefix: 't1' });
  const order = [];
  queue.setProcessor(async (job) => {
    order.push(job.postId);
  });
  queue.enqueue({ postId: 'c', dbName: 'A', kind: 'catalog', postedAt: '2026-10-01', fetchedAt: '2026-09-01' });
  queue.enqueue({ postId: 'a', dbName: 'A', kind: 'catalog', postedAt: '2026-09-24', fetchedAt: '2026-10-05' });
  queue.enqueue({ postId: 'b', dbName: 'A', kind: 'catalog', postedAt: '2026-09-28', fetchedAt: '2026-09-02' });
  await untilIdle(queue);
  assert.deepEqual(order, ['a', 'b', 'c']);
  assert.ok(compareJobs(
    { postId: 'a', postedAt: '2026-09-24', fetchedAt: '2026-10-05' },
    { postId: 'c', postedAt: '2026-10-01', fetchedAt: '2026-09-01' }
  ) < 0);
});

test('a newer post enqueued while older posts are still queued stays behind them', async () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 20, logPrefix: 't2' });
  const { order, started, release } = holdProcessor(queue);
  queue.enqueue({ postId: 'sep24', dbName: 'A', postedAt: '2026-09-24', fetchedAt: '2026-09-24' });
  queue.enqueue({ postId: 'sep28', dbName: 'A', postedAt: '2026-09-28', fetchedAt: '2026-09-28' });
  await started;
  const accepted = queue.enqueue({
    postId: 'oct1', dbName: 'A', postedAt: '2026-10-01', fetchedAt: '2026-10-01',
  });
  assert.equal(accepted, true);
  release();
  await untilIdle(queue);
  assert.deepEqual(order.map((job) => job.postId), ['sep24', 'sep28', 'oct1']);
});

test('tenants rotate one post at a time by posted_at', async () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 20, logPrefix: 't3' });
  const order = [];
  queue.setProcessor(async (job) => {
    order.push(`${job.dbName}:${job.postId}`);
  });
  queue.enqueue({ postId: 'a-oct', dbName: 'A', postedAt: '2026-10-01', fetchedAt: '2026-10-01' });
  queue.enqueue({ postId: 'a-sep24', dbName: 'A', postedAt: '2026-09-24', fetchedAt: '2026-10-02' });
  queue.enqueue({ postId: 'a-sep28', dbName: 'A', postedAt: '2026-09-28', fetchedAt: '2026-09-28' });
  queue.enqueue({ postId: 'b-sep30', dbName: 'B', postedAt: '2026-09-30', fetchedAt: '2026-09-30' });
  queue.enqueue({ postId: 'b-sep25', dbName: 'B', postedAt: '2026-09-25', fetchedAt: '2026-10-03' });
  await untilIdle(queue);
  assert.deepEqual(order, ['A:a-sep24', 'B:b-sep25', 'A:a-sep28', 'B:b-sep30', 'A:a-oct']);
});

test('a tenant with a long backlog does not take every turn', async () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 200, logPrefix: 't4' });
  const order = [];
  queue.setProcessor(async (job) => {
    order.push(job.dbName);
  });
  for (let i = 0; i < 100; i += 1) {
    queue.enqueue({
      postId: `a${i}`,
      dbName: 'A',
      postedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      fetchedAt: '2026-10-01',
    });
  }
  queue.enqueue({ postId: 'b0', dbName: 'B', postedAt: '2026-09-01', fetchedAt: '2026-09-01' });
  queue.enqueue({ postId: 'b1', dbName: 'B', postedAt: '2026-09-02', fetchedAt: '2026-09-02' });
  await untilIdle(queue);
  assert.equal(order.length, 102);
  assert.deepEqual(order.slice(0, 4), ['A', 'B', 'A', 'B']);
  assert.ok(order.filter((tenant) => tenant === 'B').length === 2);
});

test('a tenant first seen mid-run joins the rotation', async () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 20, logPrefix: 't5' });
  const { order, started, release } = holdProcessor(queue);
  queue.enqueue({ postId: 'a1', dbName: 'A', postedAt: '2026-09-24', fetchedAt: '2026-09-24' });
  queue.enqueue({ postId: 'a2', dbName: 'A', postedAt: '2026-09-28', fetchedAt: '2026-09-28' });
  queue.enqueue({ postId: 'b1', dbName: 'B', postedAt: '2026-09-25', fetchedAt: '2026-09-25' });
  await started;
  queue.enqueue({ postId: 'c1', dbName: 'C', postedAt: '2026-09-26', fetchedAt: '2026-09-26' });
  release();
  await untilIdle(queue);
  assert.deepEqual(order.map((job) => `${job.dbName}:${job.postId}`), [
    'A:a1', 'B:b1', 'C:c1', 'A:a2',
  ]);
});

test('null posted_at sorts after dated posts, then by fetched_at and id', async () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 20, logPrefix: 't6' });
  const order = [];
  queue.setProcessor(async (job) => {
    order.push(job.postId);
  });
  queue.enqueue({ postId: '3', dbName: 'A', postedAt: null, fetchedAt: '2026-09-02' });
  queue.enqueue({ postId: '2', dbName: 'A', postedAt: null, fetchedAt: '2026-09-02' });
  queue.enqueue({ postId: '4', dbName: 'A', postedAt: null, fetchedAt: '2026-09-03' });
  queue.enqueue({ postId: 'oct', dbName: 'A', postedAt: '2026-10-01', fetchedAt: '2026-09-01' });
  queue.enqueue({ postId: 'sep24', dbName: 'A', postedAt: '2026-09-24', fetchedAt: '2026-10-01' });
  queue.enqueue({ postId: 'sep28', dbName: 'A', postedAt: '2026-09-28', fetchedAt: '2026-08-01' });
  await untilIdle(queue);
  assert.deepEqual(order, ['sep24', 'sep28', 'oct', '2', '3', '4']);
});

test('a retry keeps its original posted_at position', async () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 20, logPrefix: 't7' });
  const { order, started, release } = holdProcessor(queue);
  queue.enqueue({ postId: 'old', dbName: 'A', postedAt: '2026-09-24', fetchedAt: '2026-09-24' });
  queue.enqueue({ postId: 'newer', dbName: 'A', postedAt: '2026-10-01', fetchedAt: '2026-10-01' });
  await started;
  assert.equal(queue.enqueue({
    postId: 'old', dbName: 'A', postedAt: '2026-10-01', fetchedAt: '2026-10-02',
  }), false);
  release();
  await untilIdle(queue);
  assert.deepEqual(order.map((job) => job.postId), ['old', 'newer']);

  const again = [];
  queue.setProcessor(async (job) => {
    again.push(job.postId);
    assert.equal(job.postedAt, job.postId === 'old' ? '2026-09-24' : '2026-09-28');
  });
  queue.enqueue({ postId: 'fresh', dbName: 'A', postedAt: '2026-09-28', fetchedAt: '2026-10-01' });
  queue.enqueue({ postId: 'old', dbName: 'A', postedAt: '2026-09-24', fetchedAt: '2026-10-02' });
  await untilIdle(queue);
  assert.deepEqual(again, ['old', 'fresh']);
});

test('jobs stay on the tenant they were enqueued for', async () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 20, logPrefix: 't8' });
  const seen = [];
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  queue.setProcessor(async (job) => {
    seen.push(job);
    if (seen.length === 1) markStarted();
    await gate;
  });
  queue.enqueue({ postId: '1', dbName: 'tenant-a', postedAt: '2026-09-24', fetchedAt: '2026-09-24' });
  queue.enqueue({ postId: '2', dbName: 'tenant-a', postedAt: '2026-09-28', fetchedAt: '2026-09-28' });
  queue.enqueue({ postId: '9', dbName: 'tenant-b', postedAt: '2026-09-25', fetchedAt: '2026-09-25' });
  await started;
  const queued = queue.snapshot();
  assert.deepEqual(queued['tenant-a'].map((job) => job.dbName), ['tenant-a']);
  assert.deepEqual(queued['tenant-b'].map((job) => job.dbName), ['tenant-b']);
  release();
  await untilIdle(queue);
  assert.deepEqual(seen.map((job) => job.dbName), ['tenant-a', 'tenant-b', 'tenant-a']);
});

test('catalog and event rows are ordered together by posted_at', () => {
  const chosen = pickOldest(
    [
      { id: 2, posted_at: '2026-09-28', fetched_at: '2026-10-01' },
      { id: 4, posted_at: '2026-10-02', fetched_at: '2026-09-01' },
    ],
    [
      { id: 1, posted_at: '2026-09-24', fetched_at: '2026-10-03' },
      { id: 3, posted_at: '2026-09-30', fetched_at: '2026-09-01' },
    ],
    4
  );
  assert.deepEqual(chosen.map((row) => `${row.kind}:${row.postId}`), [
    'event:1', 'catalog:2', 'event:3', 'catalog:4',
  ]);
});

test('enqueueOldestPending asks the database for posted_at order and keeps the tenant on the job', async () => {
  const orderBys = [];
  const prisma = {
    social_media_posts: {
      findMany: async (args) => {
        orderBys.push(args.orderBy);
        return [{ id: 10, posted_at: '2026-09-24', fetched_at: '2026-10-01' }];
      },
    },
    social_media_event_media: {
      findMany: async (args) => {
        orderBys.push(args.orderBy);
        return [{ id: 11, posted_at: '2026-09-25', fetched_at: '2026-09-01' }];
      },
    },
  };
  const queued = [];
  const count = await enqueueOldestPending(prisma, 'tenant-a', (job) => queued.push(job), {
    batch: 5,
    maxAttempts: 5,
  });
  assert.equal(count, 2);
  assert.deepEqual(queued.map((job) => `${job.dbName}:${job.kind}:${job.postId}`), [
    'tenant-a:catalog:10',
    'tenant-a:event:11',
  ]);
  assert.deepEqual(orderBys[0][0], { posted_at: { sort: 'asc', nulls: 'last' } });
  assert.deepEqual(orderBys[0][1], { fetched_at: 'asc' });
  assert.deepEqual(orderBys[0][2], { id: 'asc' });
  assert.equal(queued[0].postedAt, '2026-09-24');
});

test('when the queue is full, a newer post is dropped and an older post is kept', () => {
  const queue = createAnalysisQueue({ concurrency: 1, maxQueue: 2, logPrefix: 'cap' });
  assert.equal(queue.enqueue({
    postId: 'oct', dbName: 'A', postedAt: '2026-10-01', fetchedAt: '2026-10-01',
  }), true);
  assert.equal(queue.enqueue({
    postId: 'sep28', dbName: 'A', postedAt: '2026-09-28', fetchedAt: '2026-09-28',
  }), true);
  assert.equal(queue.enqueue({
    postId: 'sep24', dbName: 'A', postedAt: '2026-09-24', fetchedAt: '2026-09-24',
  }), true);
  assert.equal(queue.enqueue({
    postId: 'oct2', dbName: 'A', postedAt: '2026-10-02', fetchedAt: '2026-10-02',
  }), false);
  const ids = queue.snapshot().A.map((job) => job.postId);
  assert.deepEqual(ids, ['sep24', 'sep28']);
});
