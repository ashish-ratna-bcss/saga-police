/**
 * MongoDB connection (legacy app data). Postgres/Prisma lives under /prisma.
 */
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { getMongoUri } = require('./config/env');

const MAX_RETRY_DELAY_MS = 30000;

const connectMongo = async () => {
  const uri = getMongoUri();
  let attempt = 0;

  for (;;) {
    attempt += 1;
    try {
      await mongoose.connect(uri);
      logger.info(`[DB] Connected to MongoDB '${mongoose.connection.name}' on attempt ${attempt}`);
      break;
    } catch (error) {
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
      logger.error(`[DB] Connection attempt ${attempt} failed: ${error.message}. Retrying in ${delayMs}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  mongoose.connection.on('error', (err) => logger.error('[DB] Connection error:', err.message));
  mongoose.connection.on('disconnected', () => logger.warn('[DB] Disconnected from MongoDB'));
  mongoose.connection.on('reconnected', () => logger.info('[DB] Reconnected to MongoDB'));
};

module.exports = connectMongo;
