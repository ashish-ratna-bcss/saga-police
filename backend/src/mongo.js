/**
 * MongoDB connection (legacy app data). Postgres/Prisma lives under /prisma.
 *
 * Default: OFF. Catalog/auth use Postgres. Set MONGO_ENABLED=true to connect.
 */
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { getMongoUri } = require('./config/env');

const MAX_RETRY_DELAY_MS = 30000;

const isMongoEnabled = () => {
  const raw = String(process.env.MONGO_ENABLED || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  // Explicit skip flags
  const skip = String(process.env.SKIP_MONGO || '').trim().toLowerCase();
  if (skip === '1' || skip === 'true' || skip === 'yes') return false;
  // Default: Postgres-only — do not connect Mongo
  return false;
};

const connectMongo = async () => {
  if (!isMongoEnabled()) {
    logger.info('[DB] MongoDB skipped (Postgres-only mode). Set MONGO_ENABLED=true to connect.');
    return { enabled: false };
  }

  const uri = getMongoUri();
  let attempt = 0;

  for (;;) {
    attempt += 1;
    try {
      await mongoose.connect(uri);
      logger.info(`[DB] Connected to MongoDB '${mongoose.connection.name}' on attempt ${attempt}`);
      return { enabled: true };
    } catch (error) {
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
      logger.error(`[DB] Connection attempt ${attempt} failed: ${error.message}. Retrying in ${delayMs}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

module.exports = connectMongo;
module.exports.isMongoEnabled = isMongoEnabled;
