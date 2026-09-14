const { PrismaClient } = require('../src/generated/tenant-client');

// Same cap as prisma/client.js — every tenant PrismaClient (one per active tenant,
// cached per process) must stay small, or N tenants * N processes * default pool
// size exceeds Postgres's max_connections. See that file for the full rationale.
const TENANT_DB_CONNECTION_LIMIT = process.env.TENANT_DB_CONNECTION_LIMIT || '5';

const capConnectionLimit = (url, limit) => {
  if (!url) return url;
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('connection_limit', String(limit));
    return urlObj.toString();
  } catch {
    return url;
  }
};

function createTenantPrisma(url) {
  const finalUrl = capConnectionLimit(url || process.env.DATABASE_URL, TENANT_DB_CONNECTION_LIMIT);
  return new PrismaClient({
    datasources: finalUrl ? { db: { url: finalUrl } } : undefined,
    log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error'],
  });
}

// No default/eager client here — dbOf() throws on a missing db rather than
// silently falling back, and getTenantPrisma(null|main) returns null directly
// (tenantDatabase.service.js), so an always-open "default" pool was pure
// unused overhead: one extra PrismaClient (and connection pool) per process
// that nothing ever queried. Only create a tenant client when one is actually
// requested, via createTenantPrisma(url).
module.exports = { createTenantPrisma, PrismaClient };
