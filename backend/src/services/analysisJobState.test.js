/**
 * Run: node src/services/analysisJobState.test.js
 */
const assert = require('assert');
const { classifyAnalysisError, isRetryEligible } = require('./analysisJobState');

const now = Date.now();

assert.strictEqual(classifyAnalysisError({ status: 429, retryAfterS: 12 }).kind, 'backpressure');
assert.strictEqual(classifyAnalysisError({ message: 'timeout of 180000ms exceeded' }).kind, 'timeout');
assert.strictEqual(classifyAnalysisError({ message: 'ECONNREFUSED' }).kind, 'failed');

assert.strictEqual(isRetryEligible({ id: 'a' }, now), true);
assert.strictEqual(isRetryEligible({ id: 'a', analysis_job: { status: 'done' } }, now), false);
assert.strictEqual(
  isRetryEligible({
    id: 'a',
    analysis_job: { status: 'timeout', next_retry_at: new Date(now + 60_000) }
  }, now),
  false
);
assert.strictEqual(
  isRetryEligible({
    id: 'a',
    analysis_job: { status: 'timeout', next_retry_at: new Date(now - 1_000) }
  }, now),
  true
);

console.log('analysisJobState self-check: ALL PASSED');
