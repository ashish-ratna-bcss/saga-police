/**
 * P2 regression: virality must read the engagement fields the platforms
 * actually persist. Run directly:  node src/services/velocityAlertService.test.js
 *
 * Pure — asserts the metric contract against the Content schema and the
 * engagement builders. No database, no network.
 */
require('../test/stubUuid.cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { VELOCITY_METRICS } = require('./velocityAlertService');
const {
  extractInstagramEngagement,
  extractYouTubeEngagement,
  engagementFromXMetricsBag
} = require('../utils/engagementMetrics');

// Mirrors the threshold comparison inside checkVelocity (thresholds and the
// 60-minute window are unchanged and deliberately not exercised here).
const triggered = (engagement, threshold) =>
  VELOCITY_METRICS.filter((m) => (engagement[m] || 0) >= threshold);

const run = () => {
  // ── 24. Every platform's real fields are read ───────────────────────────
  const x = engagementFromXMetricsBag({ like: 10, retweet: 20, reply: 1200, view: 5, quote: 2 });
  assert.strictEqual(x.replies, 1200, 'sanity: X stores replies, not comments');
  assert.ok(
    triggered(x, 1000).includes('replies'),
    'X reply-driven virality must trigger — `replies` was previously never read'
  );

  const fb = { likes: 5, comments: 10, shares: 1200, views: 3 };
  assert.ok(
    triggered(fb, 1000).includes('shares'),
    'Facebook share-driven virality must trigger — `shares` was previously never read'
  );

  const ig = extractInstagramEngagement({ like_count: 1200, comment_count: 4 });
  assert.ok(triggered(ig, 1000).includes('likes'), 'Instagram likes still trigger');

  const yt = extractYouTubeEngagement({ viewCount: '1200', likeCount: '4', commentCount: '2' });
  assert.ok(triggered(yt, 1000).includes('views'), 'YouTube views still trigger');

  // Previously-working metrics must not regress.
  assert.ok(triggered({ retweets: 1200 }, 1000).includes('retweets'), 'retweets still counted');
  assert.ok(triggered({ comments: 1200 }, 1000).includes('comments'), 'comments still counted');
  assert.ok(triggered({ views: 1200 }, 1000).includes('views'), 'views still counted');
  assert.ok(triggered({ likes: 1200 }, 1000).includes('likes'), 'likes still counted');

  // Sparse engagement (a platform that never reports a field) is not a trigger.
  assert.deepStrictEqual(triggered({ likes: 1 }, 1000), [], 'absent fields read as 0, never as a trigger');

  // ── Every velocity metric must exist on the Content schema ──────────────
  const contentSrc = fs.readFileSync(path.join(__dirname, '..', 'models/Content.js'), 'utf8');
  const engagementBlock = contentSrc.slice(
    contentSrc.indexOf('engagement: {'),
    contentSrc.indexOf('retweet_network')
  );
  for (const metric of VELOCITY_METRICS) {
    assert.ok(
      new RegExp(`\\b${metric}:\\s*\\{\\s*type:\\s*Number`).test(engagementBlock),
      `Content.engagement must declare "${metric}" — velocity reads it`
    );
  }

  // ── engagement_history must be able to hold what the monitors push ──────
  const historyBlock = contentSrc.slice(
    contentSrc.indexOf('engagement_history: ['),
    contentSrc.indexOf('raw_data:')
  );
  for (const field of ['views', 'likes', 'comments', 'retweets', 'replies', 'shares']) {
    assert.ok(
      new RegExp(`\\b${field}:\\s*Number`).test(historyBlock),
      `engagement_history must declare "${field}" or strict mode silently drops it`
    );
  }

  // ── Risk and virality stay separate dimensions ──────────────────────────
  const velocitySrc = fs.readFileSync(path.join(__dirname, 'velocityAlertService.js'), 'utf8');
  const checkVelocityBody = velocitySrc.slice(
    velocitySrc.indexOf('const checkVelocity'),
    velocitySrc.indexOf('const checkAndCreateVelocityAlerts')
  );
  assert.ok(
    !/risk_level/.test(checkVelocityBody),
    'checkVelocity must never touch risk_level — virality is reach, not danger'
  );

  console.log('velocity metric-contract self-check: ALL PASSED');
};

try {
  run();
  process.exit(0);
} catch (err) {
  console.error('SELF-CHECK FAILED:', err.message);
  process.exit(1);
}
