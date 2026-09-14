const { PrismaClient } = require('@prisma/client');

// Cap this client's own pool so N tenant processes * (main + tenant clients each)
// can never exceed Postgres's max_connections — see tenant.database.service.js's
// buildTenantConnectionString for the matching per-tenant cap. Without this,
// Prisma's auto-sized default pool (~num_cpus*2+1 per client) multiplies across
// every process and has caused "sorry, too many clients already" in production.
const MAIN_DB_CONNECTION_LIMIT = process.env.MAIN_DB_CONNECTION_LIMIT || '5';

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

// Always create a fresh client after prisma generate (avoid stale global cache in nodemon).
const prisma = new PrismaClient({
  datasources: {
    db: { url: capConnectionLimit(process.env.DATABASE_URL, MAIN_DB_CONNECTION_LIMIT) },
  },
  log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error'],
});

module.exports = prisma;
