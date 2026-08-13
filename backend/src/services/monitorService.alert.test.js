/**
 * P0 regression: an existing Alert must never be downgraded by a later monitor
 * cycle. Run directly:  node src/services/monitorService.alert.test.js
 *
 * Assert-based and dependency-free — exercises the pure decision functions only,
 * never the database, the network or any platform API.
 */
const assert = require('assert');
const {
  ANALYSIS_STATUS,
  isUsableAnalysis,
  buildExistingAlertUpdate
} = require('./monitorScanLogic');

const alert = (over = {}) => ({
  id: 'alert-1',
  risk_level: 'high',
  virality_level: null,
  virality_detected_at: null,
  threat_details: { risk_score: 87, reasons: ['expert logic'] },
  ...over
});

const noRiskFieldsIn = (update, label) => {
  const set = update?.$set || {};
  for (const key of [
    'risk_level', 'title', 'description', 'analysis_id',
    'classification_explanation', 'threat_details.risk_score',
    'threat_details.reasons', 'threat_details.intent',
    'violated_policies', 'legal_sections', 'matched_keywords_normalized'
  ]) {
    assert.ok(!(key in set), `${label}: "${key}" must not be rewritten on a monitor cycle`);
  }
};

const run = () => {
  // ── The analysis status discriminator ───────────────────────────────────
  assert.strictEqual(isUsableAnalysis(false), false, 'a bare false is never a usable analysis');
  assert.strictEqual(isUsableAnalysis(null), false, 'null is never a usable analysis');
  assert.strictEqual(isUsableAnalysis(undefined), false, 'undefined is never a usable analysis');
  assert.strictEqual(
    isUsableAnalysis({ status: ANALYSIS_STATUS.FAILED, risk_score: 0 }), false,
    'a FAILED analysis is not a LOW analysis'
  );
  assert.strictEqual(
    isUsableAnalysis({ status: ANALYSIS_STATUS.SKIPPED_NO_TEXT }), false,
    'a skipped analysis is not a usable result'
  );
  assert.strictEqual(
    isUsableAnalysis({ status: ANALYSIS_STATUS.ANALYZED, risk_score: 12 }), true,
    'a genuine low-risk analysis IS usable'
  );

  // ── 1-3. Existing alerts keep their severity across a re-poll ────────────
  for (const level of ['high', 'medium', 'low']) {
    const existing = alert({ risk_level: level });
    const update = buildExistingAlertUpdate(existing, {
      viralityLevel: null,
      velocityData: undefined,
      velocityPriority: null,
      riskRefresh: null
    });
    assert.strictEqual(update, null, `${level.toUpperCase()} alert with no virality change must produce no write at all`);
  }

  // risk_score 87 survives specifically.
  const scored = alert({ risk_level: 'high', threat_details: { risk_score: 87 } });
  const scoredUpdate = buildExistingAlertUpdate(scored, { viralityLevel: 'medium', velocityPriority: 'MEDIUM' });
  noRiskFieldsIn(scoredUpdate, 'risk_score 87');
  assert.strictEqual(scored.threat_details.risk_score, 87, 'risk_score must be untouched');

  // ── 5. Virality upgrades without touching risk ──────────────────────────
  const viral = buildExistingAlertUpdate(alert({ risk_level: 'high', virality_level: 'low' }), {
    viralityLevel: 'high',
    velocityData: { metric: 'likes', current_value: 1200 },
    velocityPriority: 'HIGH'
  });
  assert.strictEqual(viral.$set.virality_level, 'high', 'virality must upgrade low -> high');
  assert.strictEqual(viral.$set.priority, 'HIGH');
  assert.ok(viral.$set.virality_detected_at instanceof Date, 'first virality stamps a detection time');
  noRiskFieldsIn(viral, 'virality upgrade');

  // Virality never moves DOWN.
  const downgrade = buildExistingAlertUpdate(alert({ virality_level: 'high' }), {
    viralityLevel: 'low',
    velocityPriority: 'LOW'
  });
  assert.strictEqual(downgrade, null, 'virality must never be downgraded');

  // A viral low-risk post keeps BOTH dimensions independently.
  const lowRiskViral = buildExistingAlertUpdate(alert({ risk_level: 'low', virality_level: null }), {
    viralityLevel: 'high',
    velocityPriority: 'HIGH'
  });
  assert.strictEqual(lowRiskViral.$set.virality_level, 'high');
  noRiskFieldsIn(lowRiskViral, 'low risk + high virality');

  // An already-detected alert keeps its ORIGINAL detection timestamp.
  const firstSeen = new Date('2026-08-01T00:00:00Z');
  const reUpgrade = buildExistingAlertUpdate(
    alert({ virality_level: 'low', virality_detected_at: firstSeen }),
    { viralityLevel: 'high', velocityPriority: 'HIGH' }
  );
  assert.ok(!('virality_detected_at' in reUpgrade.$set), 'first-detection time must not be overwritten');

  // ── The explicit rescan tool is the only path allowed to refresh risk ────
  const refreshed = buildExistingAlertUpdate(alert(), {
    viralityLevel: null,
    riskRefresh: { risk_level: 'medium', title: 'MEDIUM Risk: x' }
  });
  assert.strictEqual(refreshed.$set.risk_level, 'medium', 'rescan may re-derive risk');
  assert.strictEqual(refreshed.$set.title, 'MEDIUM Risk: x');

  // ── Guard rails ─────────────────────────────────────────────────────────
  assert.strictEqual(buildExistingAlertUpdate(null, {}), null, 'no alert -> no update');
  assert.strictEqual(buildExistingAlertUpdate(alert(), {}), null, 'no dynamic change -> no write');

  console.log('monitorService alert-preservation self-check: ALL PASSED');
};

try {
  run();
  process.exit(0);
} catch (err) {
  console.error('SELF-CHECK FAILED:', err.message);
  process.exit(1);
}
