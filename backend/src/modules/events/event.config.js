/**
 * Tunables for the events module. Everything is numeric/behavioural and read
 * from env so each deployment (tenant set) can tune it; there are no word,
 * entity or place lists in code.
 */
const num = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

module.exports = {
  /** Max keywords+hashtags saved per event. */
  maxKeywords: Math.max(1, num('EVENT_MAX_KEYWORDS', 60)),
  /** Max distinct search queries per platform per scan. */
  maxQueriesPerPlatform: Math.max(1, num('EVENT_MAX_QUERIES', 12)),
  /** Parallel search calls per platform (kept low to stay under provider rate limits). */
  queryConcurrency: Math.max(1, num('EVENT_QUERY_CONCURRENCY', 2)),
  /** Pause between query batches, ms. */
  queryDelayMs: num('EVENT_QUERY_DELAY_MS', 400),
  /** Minimum engagement score for a newly found post (0 = off). Only applied when the platform reports metrics. */
  minEngagement: num('EVENT_MIN_ENGAGEMENT', 3),
  /** A token seen in at least this share of the tenant's own posts is "generic". */
  genericDocFreq: num('EVENT_GENERIC_DF', 0.02),
  /** Stricter share used for first/last words of a phrase (function words). */
  edgeDocFreq: num('EVENT_EDGE_DF', 0.05),
  /** Minimum number of tenant posts needed before corpus statistics are trusted. */
  minCorpusDocs: num('EVENT_MIN_CORPUS_DOCS', 300),
  corpusSampleSize: Math.max(200, num('EVENT_CORPUS_SAMPLE', 4000)),
  corpusTtlMs: num('EVENT_CORPUS_TTL_MS', 60 * 60 * 1000),
  /** Max stored posts examined per event when listing/counting (list and dashboard must use the same cap). */
  maxRowsScanned: Math.max(1000, num('EVENT_MAX_ROWS_SCANNED', 20000)),
  /** Duplicate-event warning: keyword-token overlap needed (0-1). */
  duplicateOverlap: num('EVENT_DUPLICATE_OVERLAP', 0.5),
};
