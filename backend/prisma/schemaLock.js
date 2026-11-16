/**
 * Serialize tenant DDL (ensureOpsSchema / ensureEmbeddingsSchema) so concurrent
 * API workers and EventScheduler ticks do not hit:
 *   ERROR: tuple concurrently updated
 *   ERROR: trigger "..." already exists
 *
 * Must use a transaction + pg_advisory_xact_lock: Prisma connection pooling
 * means session-level pg_advisory_lock/unlock can run on different connections.
 */

const SCHEMA_LOCK_KEY = 87201401;

const isConcurrentCatalogError = (err) => {
  const msg = String(err?.message || err || '');
  return (
    msg.includes('tuple concurrently updated') ||
    msg.includes('already exists') ||
    err?.code === 'XX000' ||
    err?.code === '42710' ||
    err?.meta?.code === 'XX000' ||
    err?.meta?.code === '42710'
  );
};

/**
 * Hold an advisory lock for the duration of fn on a single connection.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {(tx: any) => Promise<any>} fn
 */
async function withTenantSchemaLock(prisma, fn) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`);
      return fn(tx);
    },
    // Keep short: callers memoize success so this should only run once per process.
    { maxWait: 20_000, timeout: 90_000 }
  );
}

/** Retry whole ensure pass when another session raced catalog updates. */
async function withTenantSchemaLockRetry(prisma, fn, { attempts = 8 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await withTenantSchemaLock(prisma, fn);
    } catch (err) {
      lastErr = err;
      if (!isConcurrentCatalogError(err) || i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 75 * i * i));
    }
  }
  throw lastErr;
}

module.exports = {
  SCHEMA_LOCK_KEY,
  isConcurrentCatalogError,
  withTenantSchemaLock,
  withTenantSchemaLockRetry,
};
