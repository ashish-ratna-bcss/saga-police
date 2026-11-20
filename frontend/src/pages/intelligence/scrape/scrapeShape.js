/**
 * Reads the Scrape (Bluweb) API's real field names and turns them into what the page shows.
 *
 *   crawl      { crawl_id, status, seed_url, max_pages, max_depth, statistics{...}, error }
 *   statistics { pages_fetched, pages_extracted, pages_failed, pages_discovered, duration_ms,
 *                bytes_downloaded, new_documents, updated_documents, ... }
 *   page       { url, depth, status, fetch_strategy, http_status, document_id, error }
 *   document   { document_id, url, title, author, published_at, page_type, extraction_confidence,
 *                current_version, entity_ids }
 *   version    { version_number, title, content }                 (the page text)
 *   entity     { entity_id, entity_type, canonical_name, confidence }
 *   entity->documents  { entity_id, document_ids }
 *
 * The page used to read `pages_crawled` / `error_count`, which this API never sends, so every
 * crawl showed "0 pages". Old field names are still accepted as a fallback.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

/** Counters for a crawl. */
export const crawlStats = (d) => {
  const s = d?.statistics || {};
  const fetched = num(s.pages_fetched ?? s.pages_crawled ?? d?.pages_crawled);
  return {
    pagesFetched: fetched,
    pagesAttempted: num(s.pages_attempted ?? fetched),
    pagesExtracted: num(s.pages_extracted),
    pagesFailed: num(s.pages_failed ?? d?.error_count),
    linksFound: num(s.pages_discovered),
    durationMs: num(s.duration_ms),
    bytes: num(s.bytes_downloaded),
    newDocuments: num(s.new_documents),
    updatedDocuments: num(s.updated_documents),
  };
};

/** 0-99 while a crawl is running. */
export const crawlProgress = (d, maxPages) => {
  const st = crawlStats(d);
  const cap = Math.max(num(maxPages) || num(d?.max_pages) || 1, 1);
  return Math.min(99, Math.round((Math.max(st.pagesFetched, st.pagesAttempted) / cap) * 100));
};

export const formatBytes = (n) => {
  const b = num(n);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDuration = (ms) => {
  const s = Math.round(num(ms) / 1000);
  if (s < 1) return '<1s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

/** "NEWS_ARTICLE" -> "news article". */
export const prettyLabel = (t) => String(t ?? '').replace(/[_-]+/g, ' ').trim().toLowerCase();

/** Path part of a URL, for compact lists. */
export const pathOf = (url) => {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || '/';
  } catch {
    return String(url ?? '');
  }
};

/** Pages visited by the crawl, ready for a table. */
export const normalizePages = (pages) =>
  (Array.isArray(pages) ? pages : []).map((p) => ({
    url: p?.url ?? '',
    depth: p?.depth ?? 0,
    status: p?.status || 'unknown',
    method: p?.fetch_strategy || '',
    http: p?.http_status ?? null,
    documentId: p?.document_id ?? null,
    error: p?.error || null,
  }));

/** Documents extracted by the crawl. */
export const normalizeDocuments = (docs) =>
  (Array.isArray(docs) ? docs : []).map((d) => ({
    id: d?.document_id ?? d?.id,
    url: d?.canonical_url || d?.url || '',
    title: d?.title || d?.canonical_url || d?.url || 'Untitled page',
    author: d?.author || null,
    publishedAt: d?.published_at || null,
    pageType: prettyLabel(d?.page_type),
    confidence: d?.extraction_confidence ?? null,
    version: d?.current_version ?? 1,
    entityIds: Array.isArray(d?.entity_ids) ? d.entity_ids : [],
  }));

/**
 * Entities that appear on this crawl's pages.
 * `links` maps entity_id -> document_ids (from /entities/{id}/documents); a document's own
 * `entity_ids` is also honoured. Entities seen only on other crawls are left out.
 */
export const entitiesForCrawl = (entities, links, documents) => {
  const docIds = new Set(documents.map((d) => d.id));
  const fromDocs = new Map();
  documents.forEach((d) => d.entityIds.forEach((eid) => {
    if (!fromDocs.has(eid)) fromDocs.set(eid, new Set());
    fromDocs.get(eid).add(d.id);
  }));
  return (Array.isArray(entities) ? entities : [])
    .map((e) => {
      const id = e?.entity_id ?? e?.id;
      const linked = new Set([...(links.get(id) || []), ...(fromDocs.get(id) || [])]);
      return {
        id,
        name: e?.canonical_name ?? e?.name ?? '',
        type: prettyLabel(e?.entity_type),
        confidence: e?.confidence ?? null,
        documentIds: [...linked].filter((x) => docIds.has(x)),
      };
    })
    .filter((e) => e.name && e.documentIds.length);
};

/** [{ type, items }] with the biggest groups first. */
export const groupByType = (list) => {
  const by = new Map();
  list.forEach((e) => {
    const k = e.type || 'other';
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  });
  return [...by.entries()]
    .map(([type, items]) => ({ type, items: items.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)) }))
    .sort((a, b) => b.items.length - a.items.length || a.type.localeCompare(b.type));
};

/** document id -> entities on that page. */
export const entitiesByDocument = (list) => {
  const m = new Map();
  list.forEach((e) => e.documentIds.forEach((id) => {
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(e);
  }));
  return m;
};
