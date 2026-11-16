/**
 * Tenant-scoped semantic (+ hybrid) retrieval over embeddings.chunks.
 * One parameterized path — no per-intent hardcoded SQL branches.
 */

const DEFAULT_BACKEND = 'embed_anything';
const DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const DEFAULT_TOP_K = 8;
const MAX_TOP_K = 20;

const embedConfig = () => ({
  backend: String(process.env.EMBEDDING_BACKEND || DEFAULT_BACKEND),
  model: String(process.env.EMBEDDING_MODEL || DEFAULT_MODEL),
});

const clampTopK = (n) => {
  const k = Number.parseInt(String(n ?? DEFAULT_TOP_K), 10);
  if (!Number.isFinite(k) || k < 1) return DEFAULT_TOP_K;
  return Math.min(MAX_TOP_K, k);
};

/**
 * @param {object} prisma tenant Prisma client
 * @param {string} question
 * @param {{ topK?: number, dateFrom?: string|null, dateTo?: string|null, sourceTables?: string[]|null, keyword?: string|null }} opts
 */
async function retrieveChunks(prisma, question, opts = {}) {
  const q = String(question || '').trim();
  if (!q) return [];

  const topK = clampTopK(opts.topK);
  const { backend, model } = embedConfig();
  const dateFrom = opts.dateFrom ? new Date(opts.dateFrom) : null;
  const dateTo = opts.dateTo ? new Date(opts.dateTo) : null;
  const tables = Array.isArray(opts.sourceTables) && opts.sourceTables.length
    ? opts.sourceTables.map((t) => String(t))
    : null;
  const keyword = opts.keyword ? String(opts.keyword).trim().slice(0, 120) : null;

  const vectorRows = await prisma.$queryRawUnsafe(
    `
    WITH q AS (
      SELECT embed_text($1::text, $2::text, $3::text) AS v
    )
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.source_table,
      c.source_id,
      c.content,
      c.chunk_index,
      (c.embedding <=> (SELECT v FROM q))::float8 AS dist
    FROM embeddings.chunks c
    JOIN embeddings.documents d ON d.id = c.document_id
    WHERE d.status = 'active'
      AND ($4::timestamptz IS NULL OR c.created_at >= $4::timestamptz)
      AND ($5::timestamptz IS NULL OR c.created_at <= $5::timestamptz)
      AND ($6::text[] IS NULL OR c.source_table = ANY($6::text[]))
    ORDER BY dist ASC
    LIMIT $7
    `,
    backend,
    model,
    q.slice(0, 4000),
    dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom.toISOString() : null,
    dateTo && !Number.isNaN(dateTo.getTime()) ? dateTo.toISOString() : null,
    tables,
    topK
  );

  let hybridRows = [];
  if (keyword && keyword.length >= 2) {
    hybridRows = await prisma.$queryRawUnsafe(
      `
      SELECT
        c.id AS chunk_id,
        c.document_id,
        c.source_table,
        c.source_id,
        c.content,
        c.chunk_index,
        0.5::float8 AS dist
      FROM embeddings.chunks c
      JOIN embeddings.documents d ON d.id = c.document_id
      WHERE d.status = 'active'
        AND c.content ILIKE '%' || $1 || '%'
        AND ($2::timestamptz IS NULL OR c.created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR c.created_at <= $3::timestamptz)
        AND ($4::text[] IS NULL OR c.source_table = ANY($4::text[]))
      ORDER BY c.created_at DESC
      LIMIT $5
      `,
      keyword,
      dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom.toISOString() : null,
      dateTo && !Number.isNaN(dateTo.getTime()) ? dateTo.toISOString() : null,
      tables,
      Math.min(topK, 8)
    );
  }

  const byId = new Map();
  for (const row of [...hybridRows, ...vectorRows]) {
    const id = String(row.chunk_id);
    const prev = byId.get(id);
    if (!prev || Number(row.dist) < Number(prev.dist)) {
      byId.set(id, {
        chunk_id: row.chunk_id,
        document_id: row.document_id,
        source_table: row.source_table,
        source_id: String(row.source_id),
        content: row.content || '',
        chunk_index: row.chunk_index,
        similarity_score: Number(row.dist),
      });
    }
  }

  return [...byId.values()]
    .sort((a, b) => a.similarity_score - b.similarity_score)
    .slice(0, topK);
}

/** Safe aggregates for count questions (parameterized — no free-form SQL). */
async function countPostsInRange(prisma, { dateFrom, dateTo, keyword } = {}) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  const kw = keyword ? `%${String(keyword).slice(0, 80)}%` : null;
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT count(*)::int AS n
    FROM social_media_posts
    WHERE ($1::timestamptz IS NULL OR coalesce(posted_at, fetched_at) >= $1::timestamptz)
      AND ($2::timestamptz IS NULL OR coalesce(posted_at, fetched_at) <= $2::timestamptz)
      AND ($3::text IS NULL OR text ILIKE $3)
    `,
    from && !Number.isNaN(from.getTime()) ? from.toISOString() : null,
    to && !Number.isNaN(to.getTime()) ? to.toISOString() : null,
    kw
  );
  return rows[0]?.n ?? 0;
}

async function countAlertsInRange(prisma, { dateFrom, dateTo } = {}) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT count(*)::int AS n
    FROM social_media_alerts
    WHERE ($1::timestamptz IS NULL OR coalesce(posted_at, created_at) >= $1::timestamptz)
      AND ($2::timestamptz IS NULL OR coalesce(posted_at, created_at) <= $2::timestamptz)
    `,
    from && !Number.isNaN(from.getTime()) ? from.toISOString() : null,
    to && !Number.isNaN(to.getTime()) ? to.toISOString() : null
  );
  return rows[0]?.n ?? 0;
}

const looksLikeCountQuestion = (q) =>
  /\b(how many|count|number of|total|how much)\b/i.test(String(q || ''));

module.exports = {
  retrieveChunks,
  countPostsInRange,
  countAlertsInRange,
  looksLikeCountQuestion,
  clampTopK,
  embedConfig,
  DEFAULT_TOP_K,
  MAX_TOP_K,
};
