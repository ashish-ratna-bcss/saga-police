// Shapes copied from the live Scrape API (a finished crawl of 10 pages, 6 extracted), with the real
// site replaced by example.com. Shared by the scrape tests.

export const CRAWL_ID = 'b943c4f6-61c3-4d31-997d-cbf49ad87611';
export const DOC_A = 'fe923af0-1ad3-4bdf-ae65-8d6fd701fd9f';
export const DOC_B = '099d8e24-6548-421f-adc1-2f8e684f8e37';
export const DOC_OTHER = '00000000-aaaa-bbbb-cccc-000000000000'; // belongs to some other crawl
export const ENT_ORG = '8ff8ea15-708f-460f-aa43-361499c01238';
export const ENT_PHONE = '09f17ba7-e3cd-4d5e-bc39-04cfa5a90412';
export const ENT_ELSEWHERE = '82b32e40-ea73-4ff0-8246-3fa0b3470fa6';

export const crawl = {
  crawl_id: CRAWL_ID,
  status: 'completed',
  seed_url: 'https://example.com/',
  max_pages: 10,
  max_depth: 2,
  created_at: '2026-11-20T09:07:42.707804Z',
  started_at: '2026-11-20T09:07:51.987210Z',
  completed_at: '2026-11-20T09:08:59.332099Z',
  error: null,
  statistics: {
    http_pages: 0,
    duration_ms: 67338.03074155003,
    pages_failed: 1,
    browser_pages: 10,
    new_documents: 0,
    pages_fetched: 10,
    pages_attempted: 11,
    pages_extracted: 6,
    bytes_downloaded: 1442125,
    pages_discovered: 606,
    updated_documents: 6,
    sink_filtered_urls: 0,
    ssrf_rejected_urls: 0,
    duplicate_documents: 0,
  },
};

export const pages = [
  { url: 'https://example.com/our-team/', normalized_url: 'https://example.com/our-team', depth: 0, status: 'fetched', fetch_strategy: 'browser', http_status: 200, document_id: DOC_A, error: null },
  { url: 'https://example.com/about-us/', normalized_url: 'https://example.com/about-us', depth: 1, status: 'fetched', fetch_strategy: 'browser', http_status: 200, document_id: DOC_B, error: null },
  { url: 'https://example.com/broken/', normalized_url: 'https://example.com/broken', depth: 1, status: 'failed', fetch_strategy: 'http', http_status: 404, document_id: null, error: 'Not found' },
  { url: 'javascript:alert(1)', normalized_url: 'javascript:alert(1)', depth: 2, status: 'failed', fetch_strategy: 'http', http_status: null, document_id: null, error: 'blocked scheme' },
];

export const documents = [
  {
    document_id: DOC_A,
    url: 'https://example.com/our-directors/',
    canonical_url: 'https://example.com/our-directors/',
    domain: 'example.com',
    title: 'Our Directors | Example Corp',
    author: 'Example Corp; Test2',
    published_at: '2026-02-01T00:00:00Z',
    language: null,
    content_type: 'html',
    page_type: 'NEWS_ARTICLE',
    extraction_method: 'news',
    extraction_confidence: 0.66,
    current_version: 2,
    collected_at: '2026-11-12T08:28:48.373267Z',
    entity_ids: [],
  },
  {
    document_id: DOC_B,
    url: 'https://example.com/about-us/',
    canonical_url: 'https://example.com/about-us/',
    domain: 'example.com',
    title: 'About Us | Example Corp',
    author: null,
    published_at: null,
    content_type: 'html',
    page_type: 'GENERIC',
    extraction_confidence: 0.5,
    current_version: 1,
    entity_ids: [],
  },
];

export const entities = [
  { entity_id: ENT_ORG, entity_type: 'ORGANIZATION', canonical_name: 'Example Corp', normalized_name: 'example corp', confidence: 0.75 },
  { entity_id: ENT_PHONE, entity_type: 'PHONE', canonical_name: '(0651)221196', normalized_name: '(0651)221196', confidence: 0.82 },
  { entity_id: ENT_ELSEWHERE, entity_type: 'ORGANIZATION', canonical_name: 'Seen On Another Site Ltd', normalized_name: 'seen on another site ltd', confidence: 0.7 },
];

// /entities/{id}/documents
export const entityDocuments = {
  [ENT_ORG]: { entity_id: ENT_ORG, document_ids: [DOC_A, DOC_B] },
  [ENT_PHONE]: { entity_id: ENT_PHONE, document_ids: [DOC_B] },
  [ENT_ELSEWHERE]: { entity_id: ENT_ELSEWHERE, document_ids: [DOC_OTHER] },
};

// /documents/{id}/versions/{n}
export const versions = {
  [`${DOC_A}:2`]: { version_number: 2, change_type: 'UPDATED', title: 'Our Directors | Example Corp', content: 'Our directors are visionary leaders who drive innovation and guide strategic decisions.', content_hash: 'x' },
  [`${DOC_B}:1`]: { version_number: 1, change_type: 'NEW', title: 'About Us | Example Corp', content: '', content_hash: 'y' },
};
