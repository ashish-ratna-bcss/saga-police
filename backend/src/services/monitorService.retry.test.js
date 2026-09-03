/**
 * P1 regression: the pending-analysis sweep must not starve old work.
 * Run directly:  node src/services/monitorService.retry.test.js
 *
 * Pure selection logic only — no database, no network.
 */
const assert = require('assert');
const { selectPendingForRetry } = require('./monitorScanLogic');

// Minimal Content-shaped doc. `text` decides hasAnalyzableContent().
const doc = (id, text = 'a real sentence worth analysing') => ({ id, text });

const run = () => {
  const SCAN_WIDTH = 300;
  const LIMIT = 100;

  // Five genuinely old pending items, buried under a flood of new ingestion.
  const oldPending = Array.from({ length: 5 }, (_, i) => doc(`old-${i}`));
  const flood = Array.from({ length: 400 }, (_, i) => doc(`new-${i}`));

  // What the two bounded reads would return: newest-first sees only the flood,
  // oldest-first sees the old items at the head.
  const newest = [...flood].reverse().slice(0, SCAN_WIDTH);
  const oldest = [...oldPending, ...flood].slice(0, SCAN_WIDTH);

  const picked = selectPendingForRetry({
    newest,
    oldest,
    analyzedIds: new Set(),
    limit: LIMIT
  });

  assert.strictEqual(picked.length, LIMIT, 'the batch is filled to the configured limit');
  for (const old of oldPending) {
    assert.ok(picked.includes(old.id), `starved item ${old.id} must be selected despite 400 newer items`);
  }
  assert.strictEqual(new Set(picked).size, picked.length, 'no duplicate analysis jobs');

  // Under the old newest-only strategy the flood alone filled the batch.
  const newestOnly = newest.filter((c) => true).slice(0, LIMIT).map((c) => c.id);
  assert.ok(
    oldPending.every((o) => !newestOnly.includes(o.id)),
    'sanity: the newest-only strategy really did starve these items'
  );

  // ── Already-analysed content is never re-queued ─────────────────────────
  const analyzed = new Set(['old-0', 'old-1']);
  const afterAnalysis = selectPendingForRetry({ newest, oldest, analyzedIds: analyzed, limit: LIMIT });
  assert.ok(!afterAnalysis.includes('old-0'), 'analysed content must not be retried');
  assert.ok(!afterAnalysis.includes('old-1'), 'analysed content must not be retried');
  assert.ok(afterAnalysis.includes('old-2'), 'still-pending content is retried');

  // ── Content with nothing analysable is excluded, not churned forever ────
  const placeholders = [
    doc('ph-0', 'Instagram Post'),
    doc('ph-1', 'Media Count: 3'),
    doc('ph-2', 'https://example.com/only-a-link'),
    doc('ph-3', '')
  ];
  const withPlaceholders = selectPendingForRetry({
    newest: placeholders,
    oldest: placeholders,
    analyzedIds: new Set(),
    limit: LIMIT
  });
  assert.deepStrictEqual(withPlaceholders, [], 'no-text content must never enter the retry batch');

  // ── Small backlogs still drain completely ───────────────────────────────
  const few = [doc('a'), doc('b'), doc('c')];
  const all = selectPendingForRetry({ newest: few, oldest: few, analyzedIds: new Set(), limit: LIMIT });
  assert.strictEqual(all.length, 3, 'a backlog smaller than the limit is taken whole');

  // ── Empty input is safe ─────────────────────────────────────────────────
  assert.deepStrictEqual(
    selectPendingForRetry({ newest: [], oldest: [], analyzedIds: new Set(), limit: LIMIT }),
    []
  );

  // ── Cooldown / in-flight jobs are skipped ───────────────────────────────
  const { isRetryEligible } = require('./analysisJobState');
  const now = Date.now();
  const cooling = [
    doc('cool-1'),
    { ...doc('cool-2'), analysis_job: { status: 'timeout', next_retry_at: new Date(now + 60_000) } },
    { ...doc('cool-3'), analysis_job: { status: 'processing', started_at: new Date(now - 1_000) } },
    { ...doc('cool-4'), analysis_job: { status: 'timeout', next_retry_at: new Date(now - 1_000) } }
  ];
  const cooled = selectPendingForRetry({
    newest: cooling,
    oldest: cooling,
    analyzedIds: new Set(),
    limit: 10,
    now,
    isEligible: isRetryEligible
  });
  assert.deepStrictEqual(cooled.sort(), ['cool-1', 'cool-4'], 'cooldown and in-flight jobs must wait');

  console.log('monitorService retry-fairness self-check: ALL PASSED');
};

try {
  run();
  process.exit(0);
} catch (err) {
  console.error('SELF-CHECK FAILED:', err.message);
  process.exit(1);
}
