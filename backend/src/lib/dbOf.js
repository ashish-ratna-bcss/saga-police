/** Resolve ops Prisma client. Never fall back to the main auth DB. */
module.exports = (db) => {
  if (!db) {
    const err = new Error('No tenant database for this account');
    err.code = 'NO_TENANT_DB';
    err.status = 400;
    throw err;
  }
  return db;
};
