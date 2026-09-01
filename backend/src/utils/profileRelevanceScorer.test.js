const assert = require('assert');
const {
  scoreProfileStatic,
  blendProfileScore,
  describeBlend,
  confidenceFromCount
} = require('./profileRelevanceScorer');

const tests = [
  () => {
    const result = scoreProfileStatic({
      identifier: 'hihyderabad',
      display_name: 'Hi Hyderabad',
      category: 'news'
    });
    assert.ok(result.score < 100, `expected static below 100 (no double-count), got ${result.score}`);
    assert.ok(result.score >= 45, `expected meaningful static score, got ${result.score}`);
    assert.ok(!result.matched_terms.includes('hyd') || result.handle_score === 0, 'hyd should not duplicate hyderabad');
  },
  () => {
    const result = scoreProfileStatic({
      identifier: 'hyddeccannews',
      display_name: '@HYDDeccanNEWS',
      category: 'news'
    });
    assert.ok(result.score >= 60, `expected hyd/deccan score, got ${result.score}`);
    assert.ok(result.score < 90, `expected no inflated static score, got ${result.score}`);
  },
  () => {
    const result = scoreProfileStatic({
      identifier: 'nytimes',
      display_name: 'The New York Times',
      category: 'news'
    });
    assert.ok(result.score < 40, `expected low static score, got ${result.score}`);
  },
  () => {
    assert.strictEqual(blendProfileScore(75, 88, 3), 81);
    assert.strictEqual(blendProfileScore(75, 88, 8), 83);
    assert.strictEqual(describeBlend(75, 88, 12).score, 84);
    assert.strictEqual(blendProfileScore(75, 88, 52), Math.round(0.2 * 75 + 0.8 * 88));
    assert.strictEqual(blendProfileScore(75, 88, 0), 75);
  },
  () => {
    assert.strictEqual(confidenceFromCount(0), 'low');
    assert.strictEqual(confidenceFromCount(2), 'medium');
    assert.strictEqual(confidenceFromCount(6), 'high');
  }
];

let failed = 0;
for (const run of tests) {
  try {
    run();
  } catch (error) {
    failed += 1;
    console.error(error.message);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`profileRelevanceScorer: ${tests.length} passed`);
