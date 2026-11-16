/**
 * Tenant-scoped retrieval: embeddings when available, plus module SQL
 * when the user asks for alerts/events/etc. that may not be embedded yet.
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

/** Soft focus from phrasing — used to pick tables / SQL module lists. */
function inferModuleFocus(question) {
  const q = String(question || '').toLowerCase();
  if (/\balerts?\b|\bhigh\s*risk\b|\bthreats?\b/.test(q) && !/\bposts?\b|\bcontents?\b/.test(q)) {
    return 'alerts';
  }
  if (/\bgrievances?\b|\bcomplaints?\b/.test(q)) return 'grievances';
  if (/\bevents?\b|\brally\b|\bprotest\b|\bfestival\b/.test(q) && !/\bposts?\b/.test(q)) {
    return 'events';
  }
  if (/\bnews\b|\barticles?\b/.test(q) && !/\bposts?\b|\balerts?\b/.test(q)) return 'news';
  if (/\bposts?\b|\bcontents?\b|\btweets?\b|\breels?\b/.test(q)) return 'posts';
  return null;
}

function inferRiskLevel(question) {
  const q = String(question || '').toLowerCase();
  if (/\bhigh\b/.test(q)) return 'high';
  if (/\bmedium\b/.test(q)) return 'medium';
  if (/\blow\b/.test(q)) return 'low';
  return null;
}

function inferSourceTables(question, explicit) {
  if (Array.isArray(explicit) && explicit.length) {
    return explicit.map((t) => String(t));
  }
  const focus = inferModuleFocus(question);
  switch (focus) {
    case 'alerts':
      return ['social_media_alerts'];
    case 'grievances':
      return ['social_media_grievances'];
    case 'events':
      return ['social_media_events'];
    case 'news':
      return ['news_articles'];
    case 'posts':
      return ['social_media_posts'];
    default:
      return null;
  }
}

function isoOrNull(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

/**
 * @param {object} prisma tenant Prisma client
 * @param {string} question
 * @param {{ topK?: number, dateFrom?: string|null, dateTo?: string|null, sourceTables?: string[]|null, keyword?: string|null }} opts
 */
async function retrieveChunks(prisma, question, opts = {}) {
  const q = String(question || '').trim();
  if (!q) return [];

  const topK = clampTopK(opts.topK);
  const focus = inferModuleFocus(q);
  const risk = inferRiskLevel(q);
  const tables = inferSourceTables(q, opts.sourceTables);
  const dateFrom = opts.dateFrom ? new Date(opts.dateFrom) : null;
  const dateTo = opts.dateTo ? new Date(opts.dateTo) : null;
  const keyword = opts.keyword ? String(opts.keyword).trim().slice(0, 120) : null;

  // Prefer live module rows when user asks for alerts/events/grievances —
  // those tables are often thin or missing in embeddings.chunks.
  // Ignore browse words as keywords — they wipe out real module lists.
  const searchKw =
    keyword && !/^(latest|recent|show|list|find|today|yesterday|alerts?|posts?|events?|high|risk)$/i.test(keyword)
      ? keyword
      : null;

  if (focus === 'alerts') {
    const rows = await listAlerts(prisma, {
      dateFrom,
      dateTo,
      riskLevel: risk,
      limit: topK,
      keyword: searchKw,
    });
    if (rows.length) return rows;
  }
  if (focus === 'events') {
    const rows = await listEvents(prisma, { dateFrom, dateTo, limit: topK, keyword: searchKw });
    if (rows.length) return rows;
  }
  if (focus === 'grievances') {
    const rows = await listGrievances(prisma, { dateFrom, dateTo, limit: topK, keyword: searchKw });
    if (rows.length) return rows;
  }

  return retrieveFromEmbeddings(prisma, q, {
    topK,
    dateFrom,
    dateTo,
    tables,
    keyword,
  });
}

async function retrieveFromEmbeddings(prisma, question, { topK, dateFrom, dateTo, tables, keyword }) {
  const { backend, model } = embedConfig();
  const from = isoOrNull(dateFrom);
  const to = isoOrNull(dateTo);

  let vectorRows = [];
  try {
    vectorRows = await prisma.$queryRawUnsafe(
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
      String(question).slice(0, 4000),
      from,
      to,
      tables,
      topK
    );
  } catch {
    vectorRows = [];
  }

  // If table filter returned nothing (e.g. alerts not embedded), retry without table filter
  // only when we did not already have a module-SQL path (caller handles that).
  if (!vectorRows.length && tables?.length) {
    try {
      vectorRows = await prisma.$queryRawUnsafe(
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
        ORDER BY dist ASC
        LIMIT $6
        `,
        backend,
        model,
        String(question).slice(0, 4000),
        from,
        to,
        topK
      );
      // Drop off-focus noise when user asked for a specific module
      if (tables?.length) {
        const wanted = new Set(tables);
        const filtered = vectorRows.filter((r) => wanted.has(r.source_table));
        if (filtered.length) vectorRows = filtered;
        else vectorRows = []; // do not return mismatched posts for "alerts"
      }
    } catch {
      vectorRows = [];
    }
  }

  let hybridRows = [];
  if (keyword && keyword.length >= 2) {
    try {
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
        from,
        to,
        tables,
        Math.min(topK, 8)
      );
    } catch {
      hybridRows = [];
    }
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

async function listAlerts(prisma, { dateFrom, dateTo, riskLevel, limit = 8, keyword } = {}) {
  const from = isoOrNull(dateFrom);
  const to = isoOrNull(dateTo);
  const risk = riskLevel ? String(riskLevel).toLowerCase() : null;
  const kw = keyword && keyword.length >= 3 ? `%${keyword.slice(0, 80)}%` : null;
  try {
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT
        id,
        title,
        platform,
        risk_level,
        coalesce(posted_at, created_at) AS published_at,
        content_url AS url,
        left(coalesce(description, title, ''), 500) AS body,
        author_handle
      FROM social_media_alerts
      WHERE ($1::timestamptz IS NULL OR coalesce(posted_at, created_at) >= $1::timestamptz)
        AND ($2::timestamptz IS NULL OR coalesce(posted_at, created_at) <= $2::timestamptz)
        AND ($3::text IS NULL OR lower(coalesce(risk_level, '')) = $3)
        AND (
          $4::text IS NULL
          OR title ILIKE $4
          OR coalesce(description, '') ILIKE $4
        )
      ORDER BY coalesce(posted_at, created_at) DESC NULLS LAST
      LIMIT $5
      `,
      from,
      to,
      risk,
      kw,
      Math.min(20, Math.max(1, limit))
    );
    return (rows || []).map((r) => ({
      chunk_id: null,
      document_id: null,
      source_table: 'social_media_alerts',
      source_id: String(r.id),
      content: [
        r.title,
        r.author_handle ? `handle: @${String(r.author_handle).replace(/^@/, '')}` : null,
        r.platform ? `platform: ${r.platform}` : null,
        r.risk_level ? `risk_level: ${r.risk_level}` : null,
        r.published_at ? `date: ${r.published_at}` : null,
        r.url ? `url: ${r.url}` : null,
        r.body,
      ]
        .filter(Boolean)
        .join('\n'),
      chunk_index: 0,
      similarity_score: 0,
      _meta: {
        title: r.title,
        platform: r.platform,
        published_at: r.published_at,
        url: r.url,
        risk_level: r.risk_level,
      },
    }));
  } catch {
    return [];
  }
}

async function listEvents(prisma, { dateFrom, dateTo, limit = 8, keyword } = {}) {
  const from = isoOrNull(dateFrom);
  const to = isoOrNull(dateTo);
  const kw = keyword && keyword.length >= 3 ? `%${keyword.slice(0, 80)}%` : null;
  try {
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT id, name, start_date, end_date, left(coalesce(description, ''), 500) AS body
      FROM social_media_events
      WHERE ($1::timestamptz IS NULL OR coalesce(start_date, created_at) >= $1::timestamptz)
        AND ($2::timestamptz IS NULL OR coalesce(start_date, created_at) <= $2::timestamptz)
        AND ($3::text IS NULL OR name ILIKE $3 OR description ILIKE $3)
      ORDER BY coalesce(start_date, created_at) DESC NULLS LAST
      LIMIT $4
      `,
      from,
      to,
      kw,
      Math.min(20, Math.max(1, limit))
    );
    return (rows || []).map((r) => ({
      chunk_id: null,
      source_table: 'social_media_events',
      source_id: String(r.id),
      content: [r.name, r.start_date ? `date: ${r.start_date}` : null, r.body].filter(Boolean).join('\n'),
      similarity_score: 0,
      _meta: { title: r.name, published_at: r.start_date, risk_level: null, url: null, platform: null },
    }));
  } catch {
    return [];
  }
}

async function listGrievances(prisma, { dateFrom, dateTo, limit = 8, keyword } = {}) {
  const from = isoOrNull(dateFrom);
  const to = isoOrNull(dateTo);
  const kw = keyword && keyword.length >= 3 ? `%${keyword.slice(0, 80)}%` : null;
  try {
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT id, platform, posted_at, content_url AS url,
             left(coalesce(text, ''), 500) AS body
      FROM social_media_grievances
      WHERE ($1::timestamptz IS NULL OR coalesce(posted_at, created_at) >= $1::timestamptz)
        AND ($2::timestamptz IS NULL OR coalesce(posted_at, created_at) <= $2::timestamptz)
        AND ($3::text IS NULL OR coalesce(text, '') ILIKE $3)
      ORDER BY coalesce(posted_at, created_at) DESC NULLS LAST
      LIMIT $4
      `,
      from,
      to,
      kw,
      Math.min(20, Math.max(1, limit))
    );
    return (rows || []).map((r) => ({
      chunk_id: null,
      source_table: 'social_media_grievances',
      source_id: String(r.id),
      content: [r.platform ? `platform: ${r.platform}` : null, r.url ? `url: ${r.url}` : null, r.body]
        .filter(Boolean)
        .join('\n'),
      similarity_score: 0,
      _meta: {
        title: String(r.body || '').slice(0, 120),
        platform: r.platform,
        published_at: r.posted_at,
        url: r.url,
      },
    }));
  } catch {
    return [];
  }
}

async function countPostsInRange(prisma, { dateFrom, dateTo, keyword } = {}) {
  const from = isoOrNull(dateFrom);
  const to = isoOrNull(dateTo);
  const kw = keyword ? `%${String(keyword).slice(0, 80)}%` : null;
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT count(*)::int AS n
    FROM social_media_posts
    WHERE ($1::timestamptz IS NULL OR coalesce(posted_at, fetched_at) >= $1::timestamptz)
      AND ($2::timestamptz IS NULL OR coalesce(posted_at, fetched_at) <= $2::timestamptz)
      AND ($3::text IS NULL OR text ILIKE $3)
    `,
    from,
    to,
    kw
  );
  return rows[0]?.n ?? 0;
}

async function countAlertsInRange(prisma, { dateFrom, dateTo, riskLevel } = {}) {
  const from = isoOrNull(dateFrom);
  const to = isoOrNull(dateTo);
  const risk = riskLevel ? String(riskLevel).toLowerCase() : null;
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT count(*)::int AS n
    FROM social_media_alerts
    WHERE ($1::timestamptz IS NULL OR coalesce(posted_at, created_at) >= $1::timestamptz)
      AND ($2::timestamptz IS NULL OR coalesce(posted_at, created_at) <= $2::timestamptz)
      AND ($3::text IS NULL OR lower(coalesce(risk_level, '')) = $3)
    `,
    from,
    to,
    risk
  );
  return rows[0]?.n ?? 0;
}

const looksLikeCountQuestion = (q) =>
  /\b(how many|count|number of|total|how much)\b/i.test(String(q || ''));

module.exports = {
  retrieveChunks,
  retrieveFromEmbeddings,
  listAlerts,
  listEvents,
  listGrievances,
  countPostsInRange,
  countAlertsInRange,
  looksLikeCountQuestion,
  inferModuleFocus,
  inferRiskLevel,
  inferSourceTables,
  clampTopK,
  embedConfig,
  DEFAULT_TOP_K,
  MAX_TOP_K,
};
