/**
 * Node-only assert check for stance parsing/backward-compatibility in
 * intelligence.client.service.js#flattenResult and #sanitizeTenantName. No
 * DB, no network — safe to run anywhere:
 *   node backend/scripts/verify-stance-parsing.js
 *
 * The response shape asserted here (flat `stance`/`stance_confidence`
 * strings/numbers on the `intelligence` object, labels "Support"|"Oppose"|
 * "Neutral"|"Unclear") matches the ACTUAL contract implemented in
 * /home/ashish-ratna/social_media_sentiment_analysis (src/intelligence.py
 * IntelligenceResult + config.STANCE_LABELS, commit 217e11b), not a
 * hypothetical one — confirmed by reading that repo directly.
 */
const assert = require('assert');
const {
  flattenResult,
  sanitizeTenantName,
} = require('../src/modules/intelligence/intelligence.client.service');

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

// 1. Real API response shape: flat stance (Title Case) + numeric stance_confidence.
{
  const item = basePipelineItem({ stance: 'Oppose', stance_confidence: 0.76 });
  const flat = flattenResult(item);
  assert.strictEqual(flat.stance, 'oppose');
  assert.strictEqual(flat.stance_confidence, 0.76);
  assert.strictEqual(flat.sentiment, 'negative');
  assert.strictEqual(flat.risk_score, 62);
}

// 2. A genuine 0.0 confidence (e.g. stance "Unclear") must survive, not be
//    coerced to null by a `||` bug.
{
  const item = basePipelineItem({ stance: 'Unclear', stance_confidence: 0.0 });
  const flat = flattenResult(item);
  assert.strictEqual(flat.stance, 'unclear');
  assert.strictEqual(flat.stance_confidence, 0, 'a real 0.0 confidence must not become null');
}

// 3. Older/unmigrated Sentiment API response with no `stance` key at all ->
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

// 4. Unknown/invalid stance label -> dropped, not passed through.
{
  const item = basePipelineItem({ stance: 'strongly_disagrees', stance_confidence: 0.9 });
  const flat = flattenResult(item);
  assert.strictEqual(flat.stance, null, 'an out-of-taxonomy label must not be persisted');
  assert.strictEqual(flat.stance_confidence, null, 'confidence must not be kept without a valid label');
}

// 5. Non-numeric stance_confidence -> null, not NaN.
{
  const item = basePipelineItem({ stance: 'Support', stance_confidence: 'high' });
  const flat = flattenResult(item);
  assert.strictEqual(flat.stance, 'support');
  assert.strictEqual(flat.stance_confidence, null);
}

// 6. Existing failure semantics unchanged: source=error still yields null
//    for the whole result, stance included.
{
  const item = basePipelineItem({ source: 'error', stance: 'Oppose', stance_confidence: 0.9 });
  assert.strictEqual(flattenResult(item), null);
}

// 7. sanitizeTenantName: control characters stripped, so a stray byte in an
//    admin's free-text branding title can never 422 the whole intelligence
//    call (Sentiment API's _validate_tenant_name rejects on control chars).
{
  assert.strictEqual(sanitizeTenantName('Tenant 1 Police'), 'Tenant 1 Police');
  assert.strictEqual(sanitizeTenantName('Tenant\x001 Police\x1f'), 'Tenant 1 Police');
  assert.strictEqual(sanitizeTenantName('  Tenant   1  '), 'Tenant 1');
  assert.strictEqual(sanitizeTenantName(null), '');
  assert.strictEqual(sanitizeTenantName('a'.repeat(500)).length, 200);
}

console.log('verify-stance-parsing: all checks passed');
