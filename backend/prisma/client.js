const { PrismaClient } = require('@prisma/client');

// Always create a fresh client after prisma generate (avoid stale global cache in nodemon).
const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error'],
});

module.exports = prisma;
