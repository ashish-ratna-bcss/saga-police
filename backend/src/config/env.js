/**
 * Environment / secrets — no insecure fallbacks.
 * Load dotenv before requiring this module (index.js does).
 */

const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const requireEnv = (key) => {
  const value = String(process.env[key] || '').trim();
  if (!value) {
    throw new Error(`${key} is required. Set ${key} in the environment.`);
  }
  return value;
};

const getJwtSecret = () => requireEnv('JWT_SECRET');

/** e.g. 24h, 60m, 3600s */
const getJwtExpiresIn = () => requireEnv('JWT_EXPIRES_IN');

const jwtExpiresInToMs = (value = getJwtExpiresIn()) => {
  const match = String(value).trim().match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!match) {
    throw new Error(`Invalid JWT_EXPIRES_IN "${value}". Use e.g. 24h, 60m, 3600s.`);
  }
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
};

const assertJwtConfigured = () => {
  getJwtSecret();
  getJwtExpiresIn();
  jwtExpiresInToMs();
};

const shouldSeedDefaultAdmin = () =>
  !isProduction() || String(process.env.ALLOW_DEFAULT_ADMIN || '').toLowerCase() === 'true';

const MEDIA_ANALYZER_URL = (process.env.MEDIA_ANALYZER_URL || 'http://172.16.212.229:8000').replace(/\/+$/, '');

const getMongoUri = () =>
  process.env.MONGODB_URI || 'mongodb://localhost:27017/blura_hub';

module.exports = {
  isProduction,
  requireEnv,
  getJwtSecret,
  getJwtExpiresIn,
  jwtExpiresInToMs,
  assertJwtConfigured,
  shouldSeedDefaultAdmin,
  MEDIA_ANALYZER_URL,
  getMongoUri,
};
