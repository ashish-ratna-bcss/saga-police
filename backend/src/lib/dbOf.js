/** Resolve the application Prisma client passed in by the caller. */
module.exports = (db) => {
  if (!db) {
    const err = new Error('Application database is not available');
    err.code = 'NO_TENANT_DB';
    err.status = 400;
    throw err;
  }
  return db;
};
