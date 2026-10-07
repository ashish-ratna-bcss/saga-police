// Catalog of the Blugate "news-api" endpoints (Blura News API), mirrored from
// blugateapis/news-api-blugate-documentation.json. blugate.news.api_client.js looks
// these up by key; only the params declared here are forwarded upstream.
//
// Multi-select filters take comma-separated values: values within one filter are
// ORed, different filters are ANDed (e.g. country=India,United States&language=Telugu).

const MULTI = 'Comma-separated for multi-select; values are ORed together.';

const NEWS_ENDPOINTS = {
  HEALTH: {
    method: 'GET',
    path: '/health',
    usedFor: 'Liveness check of the news service behind the gateway',
    params: [],
  },
  SOURCES: {
    method: 'GET',
    path: '/news/sources',
    usedFor: 'Active news sources — builds the Country / Language / State / Source filter lists',
    params: [
      { name: 'country', in: 'query', required: false, description: `e.g. 'India,United States'. ${MULTI}` },
      { name: 'state', in: 'query', required: false, description: `e.g. 'Telangana,Tamil Nadu'. ${MULTI}` },
      { name: 'language', in: 'query', required: false, description: `e.g. 'English,Telugu'. ${MULTI}` },
      { name: 'source', in: 'query', required: false, description: `Registry ids or name substrings. ${MULTI}` },
    ],
  },
  ARTICLES: {
    method: 'GET',
    path: '/news/articles',
    usedFor: 'Filtered, paginated articles → { count, limit, offset, articles[] }',
    // Sources are scraped live on a cold cache upstream: 60–90 s is normal for the first
    // request, then cached ~10 min. Leave headroom over that for the gateway hop.
    timeout: 150000,
    params: [
      { name: 'keyword', in: 'query', required: false, description: "e.g. 'drugs', 'corruption'" },
      { name: 'country', in: 'query', required: false, description: `e.g. 'India,United States'. ${MULTI}` },
      { name: 'language', in: 'query', required: false, description: `e.g. 'English,Telugu'. ${MULTI}` },
      { name: 'location', in: 'query', required: false, description: `Matched against district/location/state. ${MULTI}` },
      { name: 'state', in: 'query', required: false, description: `e.g. 'Telangana,Andhra Pradesh'. ${MULTI}` },
      { name: 'district', in: 'query', required: false, description: `e.g. 'Hyderabad,Karimnagar'. ${MULTI}` },
      { name: 'source', in: 'query', required: false, description: `Registry ids from SOURCES (preferred). ${MULTI}` },
      { name: 'limit', in: 'query', required: false, description: 'Page size, 1–100 (default 20)' },
      { name: 'offset', in: 'query', required: false, description: 'Articles to skip (default 0)' },
    ],
  },
  ARTICLE: {
    method: 'GET',
    path: '/news/articles/{article_id}',
    usedFor: 'One article by id — only while it is still in the upstream cache (else 404)',
    params: [
      { name: 'article_id', in: 'path', required: true, description: 'id from an ARTICLES result' },
    ],
  },
};

module.exports = { NEWS_ENDPOINTS };
