/**
 * Secrets / security configuration helpers.
 * Rollbacks:
 * - ALLOW_INSECURE_JWT_FALLBACK=true (non-production only) restores legacy JWT default
 * - ALLOW_DEFAULT_ADMIN=true allows bootstrap admin in production
 */
const INSECURE_JWT_FALLBACK = 'blura-hub-secret-key-change-in-production';

const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const allowInsecureJwtFallback = () =>
  !isProduction() && String(process.env.ALLOW_INSECURE_JWT_FALLBACK || '').toLowerCase() === 'true';

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (allowInsecureJwtFallback()) return INSECURE_JWT_FALLBACK;
  throw new Error(
    'JWT_SECRET is required. Set JWT_SECRET in the environment ' +
      '(or ALLOW_INSECURE_JWT_FALLBACK=true for non-production local boot only).'
  );
};

const getRefreshTokenSecret = () => {
  if (process.env.REFRESH_TOKEN_SECRET) return process.env.REFRESH_TOKEN_SECRET;
  return getJwtSecret();
};

const assertJwtConfigured = () => {
  getJwtSecret();
};

const shouldSeedDefaultAdmin = () => {
  if (!isProduction()) return true;
  return String(process.env.ALLOW_DEFAULT_ADMIN || '').toLowerCase() === 'true';
};

module.exports = {
  getJwtSecret,
  getRefreshTokenSecret,
  assertJwtConfigured,
  shouldSeedDefaultAdmin,
  isProduction,
};
