const { PrismaClient } = require('../src/generated/tenant-client');

function createTenantPrisma(url) {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error'],
  });
}

/**
 * Default tenant-schema client pointed at DATABASE_URL.
 * Used as dbOf() fallback and for getTenantPrisma(null|main).
 */
const defaultTenantPrisma = createTenantPrisma();

module.exports = defaultTenantPrisma;
module.exports.PrismaClient = PrismaClient;
module.exports.createTenantPrisma = createTenantPrisma;
