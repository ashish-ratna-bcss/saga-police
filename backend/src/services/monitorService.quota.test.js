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
  classifyScanError,
  scanResult,
  markPlatformQuotaLimited,
  clearPlatformQuotaLimit,
  getPlatformQuotaPause,
  formatCooldown
} = require('./monitorScanLogic');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
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

  // ── Cooldown is reported in units a human can act on ────────────────────
  assert.strictEqual(formatCooldown(6 * 3600000), '6.0h');
  assert.strictEqual(formatCooldown(45 * 60000), '45 min', 'sub-hour cooldowns report in minutes');
  assert.strictEqual(formatCooldown(3000), '3s', 'a short cooldown must never print as "0.0h"');

  // ── Breaker: arms and isolates per platform ─────────────────────────────
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

  // ── 12. Concurrent sibling failures must not inflate the breaker ────────
  const armedAt = paused.retry_at.getTime();
  markPlatformQuotaLimited('youtube', SCAN_OUTCOME.QUOTA_EXCEEDED, 'source B failed too');
  markPlatformQuotaLimited('youtube', SCAN_OUTCOME.QUOTA_EXCEEDED, 'source C failed too');
  const afterSiblings = getPlatformQuotaPause('youtube');
  assert.strictEqual(afterSiblings.checks, 1, 'parallel failures in one batch are ONE outage, not three checks');
  assert.strictEqual(afterSiblings.retry_at.getTime(), armedAt, 'siblings must not push the cooldown out');

  // ── 11. A healthy sibling must NOT clear an active platform pause ───────
  clearPlatformQuotaLimit('youtube');
  assert.ok(
    getPlatformQuotaPause('youtube'),
    'a source that happened to succeed cannot cancel a platform-wide pause'
  );

  // ── 13/14. Isolation holds while paused; other platforms keep working ───
  markPlatformQuotaLimited('facebook', SCAN_OUTCOME.RATE_LIMIT, 'all keys cooling');
  assert.ok(getPlatformQuotaPause('facebook'), 'facebook paused');
  assert.strictEqual(getPlatformQuotaPause('instagram'), null, 'facebook must not affect instagram');
  assert.strictEqual(getPlatformQuotaPause('x'), null, 'facebook must not affect x');
  clearPlatformQuotaLimit('instagram'); // no-op, must not throw
  assert.ok(getPlatformQuotaPause('youtube'), 'youtube still paused independently');

  // ── 14a. Cooldown expires, the re-check FAILS -> stay paused, count it ──
  await sleep(3200);
  assert.strictEqual(getPlatformQuotaPause('youtube'), null, 'after the cooldown, requests are allowed through to re-check');

  markPlatformQuotaLimited('youtube', SCAN_OUTCOME.QUOTA_EXCEEDED, 'still exhausted');
  const rearmed = getPlatformQuotaPause('youtube');
  assert.ok(rearmed, 'a failed re-check re-arms the breaker');
  assert.strictEqual(rearmed.checks, 2, 'a genuine post-cooldown re-check counts as attempt #2');
  assert.strictEqual(
    rearmed.since.getTime(), paused.since.getTime(),
    'since must keep tracking the ORIGINAL outage start'
  );

  // ── 14b. Cooldown expires, the re-check SUCCEEDS -> breaker clears ──────
  await sleep(3200);
  clearPlatformQuotaLimit('youtube');
  assert.strictEqual(getPlatformQuotaPause('youtube'), null, 'a successful re-check clears the pause');

  // Facebook's own cooldown also lapsed by now; clear it and confirm the
  // registry ends empty (no cross-platform residue).
  clearPlatformQuotaLimit('facebook');
  assert.deepStrictEqual(getPlatformQuotaStatus(), {}, 'status is empty once every platform is healthy');

  console.log('monitorService quota/outcome self-check: ALL PASSED');
};

run().then(() => process.exit(0)).catch((err) => {
  console.error('SELF-CHECK FAILED:', err.message);
  process.exit(1);
});
