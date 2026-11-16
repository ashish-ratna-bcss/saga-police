/**
 * Serialize tenant DDL (ensureOpsSchema / ensureEmbeddingsSchema) so concurrent
 * API workers and EventScheduler ticks do not hit:
 *   ERROR: tuple concurrently updated
 *   ERROR: trigger "..." already exists
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

async function withTenantSchemaLock(prisma, fn) {
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${SCHEMA_LOCK_KEY})`);
  try {
    return await fn();
  } finally {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${SCHEMA_LOCK_KEY})`);
  }
}

/** Retry whole ensure pass when another session raced catalog updates. */
async function withTenantSchemaLockRetry(prisma, fn, { attempts = 5 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await withTenantSchemaLock(prisma, fn);
    } catch (err) {
      lastErr = err;
      if (!isConcurrentCatalogError(err) || i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 50 * i * i));
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
