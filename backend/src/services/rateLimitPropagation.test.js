/**
 * P1 regression: a rate limit must stay a rate limit on every platform path.
 * Run directly:  node src/services/rateLimitPropagation.test.js
 *
 * Static/classification checks plus a source-level read of the three service
 * files, so a future edit that re-introduces the "swallow into null" pattern
 * fails here instead of silently in production.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { SCAN_OUTCOME, classifyScanError } = require('./monitorScanLogic');

// Paths are relative to src/ — this file lives in src/services/.
// Some sources are CRLF; normalise so the assertions are line-ending agnostic.
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const run = () => {
  // ── 6 / 9 / 10. Every rate-limit shape classifies as RATE_LIMIT ─────────
  assert.strictEqual(
    classifyScanError(Object.assign(new Error('Rate limit exhausted (429)'), { isRateLimit: true })),
    SCAN_OUTCOME.RATE_LIMIT,
    'X: an exhausted 429 must classify as RATE_LIMIT'
  );
  assert.strictEqual(
    classifyScanError(Object.assign(new Error('[Instagram] Rate limit exhausted on POST /posts'), { isRateLimit: true })),
    SCAN_OUTCOME.RATE_LIMIT,
    'Instagram: an exhausted 429 must classify as RATE_LIMIT'
  );
  assert.strictEqual(
    classifyScanError(Object.assign(new Error('Facebook RapidAPI in cooldown (429)'), { code: 'FB_RAPIDAPI_COOLDOWN' })),
    SCAN_OUTCOME.RATE_LIMIT,
    'Facebook: key exhaustion must classify as RATE_LIMIT'
  );
  assert.strictEqual(
    classifyScanError({ response: { status: 429 } }),
    SCAN_OUTCOME.RATE_LIMIT,
    'a raw HTTP 429 must classify as RATE_LIMIT'
  );

  // A rate limit must never be mistaken for a missing account.
  for (const err of [
    Object.assign(new Error('x'), { isRateLimit: true }),
    { code: 'FB_RAPIDAPI_COOLDOWN' },
    { response: { status: 429 } }
  ]) {
    const outcome = classifyScanError(err);
    assert.notStrictEqual(outcome, SCAN_OUTCOME.IDENTITY_UNRESOLVED, 'rate limit is not an identity failure');
    assert.notStrictEqual(outcome, SCAN_OUTCOME.API_ERROR, 'rate limit is not a generic API error');
    assert.notStrictEqual(outcome, SCAN_OUTCOME.OK, 'rate limit is never a success');
  }

  // ── 7 / 8. X must propagate, not flatten to null ────────────────────────
  const xSrc = read('services/rapidApiXService.js');
  assert.ok(
    /else if \(error\.isRateLimit\) \{[\s\S]{0,400}?throw error;/.test(xSrc),
    'rapidApiXService must rethrow rate-limit errors instead of returning null'
  );
  // The null branch in monitorXSource is what increments api_fail_count and can
  // reach api_not_found_10x — a rate limit must never be able to enter it.
  const monitorSrc = read('services/monitorService.js');
  const nullBranch = monitorSrc.slice(
    monitorSrc.indexOf('fetchUserTweets returned null'),
    monitorSrc.indexOf('fetchUserTweets returned null') + 1200
  );
  assert.ok(nullBranch.includes('api_not_found_10x'), 'sanity: located the auto-deactivation branch');
  assert.ok(
    !/isRateLimit/.test(nullBranch),
    'the auto-deactivation branch must be unreachable from a rate limit'
  );

  // ── Instagram must surface the rate limit rather than returning null ────
  const igSrc = read('services/rapidApiInstagramService.js');
  assert.ok(
    /if \(lastRateLimitError\) \{[\s\S]{0,300}?throw lastRateLimitError;/.test(igSrc),
    'fetchUserPosts must throw when every endpoint was rate limited'
  );
  assert.ok(
    monitorSrc.includes('if (postsErr?.isRateLimit) throw postsErr;'),
    'monitorInstagramSource must rethrow rate limits instead of marking API_ERROR'
  );

  // ── Facebook must classify identically on scheduled and manual paths ────
  const fbSrc = read('services/rapidApiFacebookService.js');
  assert.ok(
    !/if \(error\?\.code === 'FB_RAPIDAPI_COOLDOWN'\) return null;/.test(fbSrc),
    'cooldown must never be converted to null — that is what hid it from the breaker'
  );
  assert.strictEqual(
    (fbSrc.match(/if \(error\?\.code === 'FB_RAPIDAPI_COOLDOWN' \|\| error\?\.response\?\.status === 429\) \{\n\s*throw error;/g) || []).length,
    2,
    'both fetchPageDetails and fetchPagePosts must propagate cooldown unconditionally'
  );
  // The per-key 24h cooldown must survive untouched.
  assert.ok(fbSrc.includes('markKeyRateLimited(key, 86400)'), 'per-key 24h cooldown must remain');
  assert.ok(fbSrc.includes('rotating key and retrying'), 'key rotation must remain');

  // ── 25. No removed platform creeps back in ──────────────────────────────
  for (const file of [
    'services/monitorService.js',
    'services/velocityAlertService.js',
    'services/rapidApiXService.js',
    'services/rapidApiInstagramService.js',
    'services/rapidApiFacebookService.js'
  ]) {
    const body = read(file);
    assert.ok(!/\breddit\b/i.test(body), `${file} must not reference Reddit`);
    assert.ok(!/\btelegram\b/i.test(body), `${file} must not reference Telegram`);
  }

  console.log('rate-limit propagation self-check: ALL PASSED');
};

try {
  run();
  process.exit(0);
} catch (err) {
  console.error('SELF-CHECK FAILED:', err.message);
  process.exit(1);
}
