const assert = require('assert');
const {
  buildEngagement,
  extractXEngagement,
  extractFacebookEngagement,
  extractInstagramEngagement,
  extractYouTubeEngagement,
  engagementFromXMetricsBag
} = require('./engagementMetrics');

// Explicit zero kept; missing omitted
assert.deepStrictEqual(buildEngagement({ likes: 0, views: undefined }), { likes: 0 });
assert.deepStrictEqual(buildEngagement({ comments: null }), {});

// X RapidAPI shape
assert.deepStrictEqual(
  extractXEngagement({
    legacy: { favorite_count: 10, retweet_count: 0, reply_count: 3, quote_count: 1 },
    views: { count: 99 }
  }),
  { likes: 10, retweets: 0, replies: 3, views: 99, quotes: 1 }
);

// X missing views blob entirely
assert.deepStrictEqual(
  extractXEngagement({ legacy: { favorite_count: 2 } }),
  { likes: 2 }
);

// Official public_metrics with no impressions key
assert.deepStrictEqual(
  extractXEngagement({
    publicMetrics: { like_count: 5, retweet_count: 1, reply_count: 0 }
  }),
  { likes: 5, retweets: 1, replies: 0 }
);

// Facebook — shares stays shares; missing views omitted
assert.deepStrictEqual(
  extractFacebookEngagement({ likes: 4, comments: 0, shares: 2 }),
  { likes: 4, comments: 0, shares: 2 }
);

// Instagram — fake retweets never invented; plays → views when present
assert.deepStrictEqual(
  extractInstagramEngagement({ like_count: 7, comment_count: 1, play_count: 50 }),
  { likes: 7, comments: 1, views: 50 }
);
assert.deepStrictEqual(
  extractInstagramEngagement({ like_count: 7 }),
  { likes: 7 }
);

// YouTube — missing likeCount omitted (hidden likes)
assert.deepStrictEqual(
  extractYouTubeEngagement({ viewCount: '100', commentCount: '3' }),
  { views: 100, comments: 3 }
);

// Metrics bag presence
assert.deepStrictEqual(
  engagementFromXMetricsBag({ like: '1', reply: '0' }),
  { likes: 1, replies: 0 }
);
assert.deepStrictEqual(engagementFromXMetricsBag({}), {});

console.log('engagementMetrics self-check: ALL PASSED');
