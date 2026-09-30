/**
 * Reddit provider endpoints (Blugate gateway).
 * From blugateapis/reddit-nandeep-blugate-documentation.json.
 * Base URL: …/api/gateway/reddit — paths below are relative to that base.
 */
const REDDIT_ENDPOINTS = {
  HEALTH: {
    method: 'GET',
    path: '/health',
    usedFor: 'Liveness — System Health',
    params: [],
  },
  READY: {
    method: 'GET',
    path: '/ready',
    usedFor: 'Readiness — System Health',
    params: [],
  },
  RSS_MONITOR: {
    method: 'POST',
    path: '/api/reddit/rss/monitor',
    usedFor: 'Keyword/event monitoring via Reddit public RSS — Event scans (bulk keywords in one call)',
    params: [
      { name: 'query', in: 'body', required: false, type: 'string' },
      { name: 'keywords', in: 'body', required: false, type: 'array', description: "OR'd into one query when query is omitted" },
      { name: 'strong_keywords', in: 'body', required: false, type: 'array' },
      { name: 'exclude', in: 'body', required: false, type: 'array' },
      { name: 'match_field', in: 'body', required: false, type: 'string' },
      { name: 'min_matches', in: 'body', required: false, type: 'integer' },
      { name: 'subreddits', in: 'body', required: false, type: 'array' },
      { name: 'sort', in: 'body', required: false, type: 'string' },
      { name: 'time_range', in: 'body', required: false, type: 'string' },
      { name: 'from_date', in: 'body', required: false, type: 'string' },
      { name: 'to_date', in: 'body', required: false, type: 'string' },
      { name: 'limit', in: 'body', required: false, type: 'integer' },
    ],
  },
  RSS_EVENT: {
    method: 'POST',
    path: '/api/reddit/rss/event',
    usedFor: 'Event monitoring with fixed subreddit/keyword strategy',
    params: [
      { name: 'subreddits', in: 'body', required: false, type: 'array' },
      { name: 'keywords', in: 'body', required: false, type: 'array' },
      { name: 'strong_keywords', in: 'body', required: false, type: 'array' },
      { name: 'exclude', in: 'body', required: false, type: 'array' },
      { name: 'match_field', in: 'body', required: false, type: 'string' },
      { name: 'min_matches', in: 'body', required: false, type: 'integer' },
      { name: 'time_range', in: 'body', required: false, type: 'string' },
      { name: 'from_date', in: 'body', required: false, type: 'string' },
      { name: 'to_date', in: 'body', required: false, type: 'string' },
      { name: 'limit', in: 'body', required: false, type: 'integer' },
    ],
  },
  RSS_SEARCH: {
    method: 'GET',
    path: '/api/reddit/rss/search',
    usedFor: 'GET form of /monitor — keyword search',
    params: [
      { name: 'q', in: 'query', required: false, type: 'string' },
      { name: 'keywords', in: 'query', required: false, type: 'array' },
      { name: 'limit', in: 'query', required: false, type: 'integer' },
    ],
  },
  RSS_USER: {
    method: 'POST',
    path: '/api/reddit/rss/user',
    usedFor: 'Profile activity monitoring via Reddit public RSS',
    params: [
      { name: 'username', in: 'body', required: true, type: 'string' },
      { name: 'kind', in: 'body', required: false, type: 'string' },
      { name: 'keywords', in: 'body', required: false, type: 'array' },
      { name: 'limit', in: 'body', required: false, type: 'integer' },
    ],
  },
};

module.exports = {
  REDDIT_ENDPOINTS,
};
