const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MAX_RETRY_DELAY_MS = 30000;

// Retries with backoff instead of killing the process on a transient connection
// failure (e.g. a flaky SSH tunnel to a remote Mongo host). Previously this
// called process.exit(1) on the first failed attempt, and since app.listen()
// only runs after this resolves, nodemon would crash and sit dead waiting for
// a file change — nothing listens on PORT until someone notices and restarts.
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blura_hub';
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

module.exports = connectDB;
