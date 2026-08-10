/**
 * Self-check for the monitoring failure taxonomy and the per-platform
 * quota/rate-limit breaker. Run directly:  node src/services/monitorService.quota.test.js
 *
 * Deliberately assert-based and dependency-free — it exercises pure logic only
 * and never touches the database, the network, or any platform API.
 */
process.env.PLATFORM_QUOTA_COOLDOWN_MS = '3000'; // 3s stands in for the 6h cooldown

const assert = require('assert');
const {
  SCAN_OUTCOME,
  getPlatformQuotaStatus,
  __private: {
    classifyScanError,
    scanResult,
    markPlatformQuotaLimited,
    clearPlatformQuotaLimit,
    getPlatformQuotaPause
  }
} = require('./monitorService');

const run = () => {
  // ── Error classification ────────────────────────────────────────────────
  assert.strictEqual(
    classifyScanError({ errors: [{ reason: 'quotaExceeded' }] }),
    SCAN_OUTCOME.QUOTA_EXCEEDED,
    'Google quotaExceeded must classify as QUOTA_EXCEEDED'
  );
  assert.strictEqual(
    classifyScanError(new Error("Quota exceeded for quota metric 'Search Queries'")),
    SCAN_OUTCOME.QUOTA_EXCEEDED,
    'quota message must classify as QUOTA_EXCEEDED'
  );
  assert.strictEqual(
    classifyScanError({ isRateLimit: true }),
    SCAN_OUTCOME.RATE_LIMIT,
    'isRateLimit must classify as RATE_LIMIT'
  );
  assert.strictEqual(
    classifyScanError({ response: { status: 429 } }),
    SCAN_OUTCOME.RATE_LIMIT,
    'HTTP 429 must classify as RATE_LIMIT'
  );
  assert.strictEqual(
    classifyScanError({ code: 'FB_RAPIDAPI_COOLDOWN' }),
    SCAN_OUTCOME.RATE_LIMIT,
    'Facebook cooldown must classify as RATE_LIMIT'
  );
  assert.strictEqual(
    classifyScanError({ code: 'ETIMEDOUT', message: 'socket hang up' }),
    SCAN_OUTCOME.TIMEOUT_NETWORK,
    'socket timeouts must classify as TIMEOUT_NETWORK'
  );
  assert.strictEqual(
    classifyScanError(new Error('unexpected payload')),
    SCAN_OUTCOME.API_ERROR,
    'anything else must fall back to API_ERROR'
  );

  // ── A successful-but-empty scan is NOT a failure ────────────────────────
  const empty = scanResult([], SCAN_OUTCOME.OK, 'API returned zero posts');
  assert.strictEqual(empty.outcome, SCAN_OUTCOME.OK, 'zero posts must stay OK');
  assert.strictEqual(empty.items.length, 0);

  // ── Breaker: arms, isolates per platform, and re-checks after cooldown ──
  assert.strictEqual(getPlatformQuotaPause('youtube'), null, 'starts unpaused');

  markPlatformQuotaLimited('youtube', SCAN_OUTCOME.QUOTA_EXCEEDED, 'daily quota gone');
  const paused = getPlatformQuotaPause('youtube');
  assert.ok(paused, 'youtube must be paused after a quota failure');
  assert.strictEqual(paused.outcome, SCAN_OUTCOME.QUOTA_EXCEEDED);
  assert.strictEqual(paused.checks, 1, 'first pause is attempt #1');
  assert.ok(paused.since instanceof Date && paused.retry_at instanceof Date, 'status carries timestamps');

  // The pause must not leak to any other platform.
  for (const other of ['x', 'instagram', 'facebook']) {
    assert.strictEqual(getPlatformQuotaPause(other), null, `${other} must stay unaffected`);
  }

  // Re-arming keeps the original `since` but pushes retry_at out and counts the check.
  const firstSince = paused.since.getTime();
  markPlatformQuotaLimited('youtube', SCAN_OUTCOME.QUOTA_EXCEEDED, 'still exhausted');
  const rearmed = getPlatformQuotaPause('youtube');
  assert.strictEqual(rearmed.checks, 2, 'a repeat failure counts as the next 6h check');
  assert.strictEqual(rearmed.since.getTime(), firstSince, 'since must track the ORIGINAL outage start');

  // Recovery clears it.
  clearPlatformQuotaLimit('youtube');
  assert.strictEqual(getPlatformQuotaPause('youtube'), null, 'a successful scan must clear the pause');
  assert.deepStrictEqual(getPlatformQuotaStatus(), {}, 'status is empty once healthy');

  // ── Cooldown actually expires so the platform is retried ────────────────
  markPlatformQuotaLimited('facebook', SCAN_OUTCOME.RATE_LIMIT, 'all keys cooling');
  assert.ok(getPlatformQuotaPause('facebook'), 'facebook paused');
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(
        getPlatformQuotaPause('facebook'),
        null,
        'after the cooldown the platform is probed again instead of staying dark'
      );
      console.log('monitorService quota/outcome self-check: ALL PASSED');
      resolve();
    }, 3200);
  });
};

run().then(() => process.exit(0)).catch((err) => {
  console.error('SELF-CHECK FAILED:', err.message);
  process.exit(1);
});
