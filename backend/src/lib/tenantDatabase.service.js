const mainPrisma = require('../../prisma/client');

/** Single deployment database. Loops that used to walk every force run once. */
const APP_DB_NAME = 'bengaluru';
const APP_NAME = 'Bengaluru Police Saga';

/**
 * Operational client. Always the main DATABASE_URL client.
 * dbName is ignored; there is one database.
 */
function getTenantPrisma(_dbName) {
  return mainPrisma;
}

/**
 * Distinct database names. One application database.
 */
async function listTenantDbNames() {
  return [APP_DB_NAME];
}

/**
 * Display name sent with sentiment analysis.
 */
async function resolveTenantName(_dbName) {
  return APP_NAME;
}

/**
 * Run fn(prisma, dbName) once against the application database.
 */
async function forEachTenant(fn) {
  await fn(mainPrisma, APP_DB_NAME);
}

module.exports = {
  APP_DB_NAME,
  APP_NAME,
  getTenantPrisma,
  listTenantDbNames,
  forEachTenant,
  resolveTenantName,
};
