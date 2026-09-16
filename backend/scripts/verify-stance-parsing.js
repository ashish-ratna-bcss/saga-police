/**
 * Node-only assert check for stance parsing/backward-compatibility in
 * intelligence.client.service.js#flattenResult. No DB, no network — safe to
 * run anywhere: `node backend/scripts/verify-stance-parsing.js`.
 *
 * Covers what a live integration test would otherwise have to prove about
 * the additive contract: an older Sentiment API response (no `stance` key)
 * must still parse exactly as it did before this feature, and a malformed
 * or unrecognized stance must be dropped, never trusted verbatim.
 */
const assert = require('assert');
const { flattenResult } = require('../src/modules/intelligence/intelligence.client.service');

const basePipelineItem = (overrides = {}) => ({
  sentiment: 'Negative',
  confidence: 0.83,
  language: 'en',
  english_text: 'The police failed to stop this criminal.',
  was_translated: false,
  intelligence: {
    source: 'provider',
    category: 'Public Safety',
    intent: 'Complaint',
    risk_score: 62,
    reasoning: 'Describes police inaction.',
    summary: 'Author criticizes police response.',
    recommended_action: 'Monitor',
    evidence_confidence: 'medium',
    signals: [],
    model: 'test-model',
    ...overrides,
  },
});

// 1. New API response with a valid stance object -> parsed and lowercased.
{
  const item = basePipelineItem({ stance: { label: 'Against', confidence: 'High' } });
  const flat = flattenResult(item);
  assert.strictEqual(flat.stance, 'against');
  assert.strictEqual(flat.stance_confidence, 'high');
  assert.strictEqual(flat.sentiment, 'negative');
  assert.strictEqual(flat.risk_score, 62);
}

// 2. Older/unmigrated Sentiment API response with no `stance` key at all ->
//    everything else must parse exactly as before this feature; stance is
//    just absent (null), never a crash and never a fabricated default.
{
  const item = basePipelineItem();
  const flat = flattenResult(item);
  assert.strictEqual(flat.stance, null);
  assert.strictEqual(flat.stance_confidence, null);
  assert.strictEqual(flat.sentiment, 'negative');
  assert.strictEqual(flat.category, 'Public Safety');
}

// 3. Malformed stance: a bare string instead of {label, confidence} object.
{
  const item = basePipelineItem({ stance: 'against' });
  const flat = flattenResult(item);
  assert.strictEqual(flat.stance, null, 'a non-object stance must not be trusted verbatim');
}

// 4. Unknown/invalid stance label -> dropped, not passed through.
{
  const item = basePipelineItem({ stance: { label: 'strongly_disagrees', confidence: 'high' } });
  const flat = flattenResult(item);
  assert.strictEqual(flat.stance, null, 'an out-of-taxonomy label must not be persisted');
}

// 5. Existing failure semantics unchanged: source=error still yields null
//    for the whole result, stance included.
{
  const item = basePipelineItem({ source: 'error', stance: { label: 'against', confidence: 'high' } });
  assert.strictEqual(flattenResult(item), null);
}

console.log('verify-stance-parsing: all checks passed');
