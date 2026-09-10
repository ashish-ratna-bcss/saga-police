const { Prisma } = require('../../generated/tenant-client');
const dbOf = require('../../lib/dbOf');

const ensureSearchHistoryTable = async (prisma) => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS search_history (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER,
      query TEXT NOT NULL,
      platform TEXT,
      results_text TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_search_history_user
    ON search_history (user_id, created_at DESC)
  `);
};

const buildResultsSearchText = (results) => {
  if (!Array.isArray(results) || results.length === 0) return '';
  const snippets = [];
  for (const item of results.slice(0, 300)) {
    if (!item || typeof item !== 'object') continue;
    const parts = [
      item.text,
      item.title,
      item.description,
      item.author,
      item.author_handle,
      item.channelTitle,
      item.screen_name,
      item.name,
      item.url,
      item.content_url,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (parts.length) snippets.push(parts.join(' '));
  }
  return snippets.join(' ').slice(0, 20000);
};

const saveSearchHistory = async ({
  db,
  userId,
  query,
  searchType,
  platform,
  results,
  platformCounts,
  platformErrors,
  durationMs,
  searchedAt,
}) => {
  const prisma = dbOf(db);
  await ensureSearchHistoryTable(prisma);

  const normalizedQuery = String(query || '').trim();
  const normalizedSearchType = String(searchType || '').toLowerCase();
  const normalizedPlatform = String(platform || '').toLowerCase();
  if (!normalizedQuery) {
    const err = new Error('query is required');
    err.status = 400;
    throw err;
  }
  if (!['profiles', 'content'].includes(normalizedSearchType)) {
    const err = new Error('searchType must be profiles or content');
    err.status = 400;
    throw err;
  }
  const allowedPlatforms = ['all', 'x', 'youtube', 'facebook', 'instagram', 'telegram'];
  if (!allowedPlatforms.includes(normalizedPlatform)) {
    const err = new Error('Invalid platform');
    err.status = 400;
    throw err;
  }

  const safeResults = Array.isArray(results) ? results : [];
  const resultsSearchText = buildResultsSearchText(safeResults).toLowerCase();
  const meta = {
    search_type: normalizedSearchType,
    total_results: safeResults.length,
    platform_counts: platformCounts && typeof platformCounts === 'object' ? platformCounts : {},
    platform_errors: platformErrors && typeof platformErrors === 'object' ? platformErrors : {},
    duration_ms: Number.isFinite(Number(durationMs)) ? Number(durationMs) : 0,
    searched_at: searchedAt ? new Date(searchedAt).toISOString() : new Date().toISOString(),
    results: safeResults,
    user_email: '',
  };

  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO search_history (user_id, query, platform, results_text, meta)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    userId != null ? Number(userId) : null,
    normalizedQuery,
    normalizedPlatform,
    resultsSearchText,
    JSON.stringify(meta)
  );
  return { id: rows?.[0]?.id != null ? String(rows[0].id) : null };
};

const listSearchHistory = async ({
  db,
  userId,
  page = 1,
  limit = 20,
  searchType,
  platform,
  q,
  from,
  to,
}) => {
  const prisma = dbOf(db);
  await ensureSearchHistoryTable(prisma);

  const parsedPage = Math.max(Number(page) || 1, 1);
  const parsedLimit = 20;
  const offset = (parsedPage - 1) * parsedLimit;

  const conditions = [Prisma.sql`user_id = ${Number(userId)}`];

  if (searchType && ['profiles', 'content'].includes(String(searchType).toLowerCase())) {
    conditions.push(Prisma.sql`meta->>'search_type' = ${String(searchType).toLowerCase()}`);
  }
  if (
    platform &&
    ['all', 'x', 'youtube', 'facebook', 'instagram', 'telegram'].includes(String(platform).toLowerCase())
  ) {
    conditions.push(Prisma.sql`platform = ${String(platform).toLowerCase()}`);
  }

  const searchText = String(q || '').trim();
  if (searchText) {
    const like = `%${searchText.toLowerCase()}%`;
    conditions.push(
      Prisma.sql`(LOWER(query) LIKE ${like} OR LOWER(COALESCE(results_text, '')) LIKE ${like})`
    );
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) {
    conditions.push(Prisma.sql`created_at >= ${fromDate}`);
  }
  if (toDate && !Number.isNaN(toDate.getTime())) {
    toDate.setHours(23, 59, 59, 999);
    conditions.push(Prisma.sql`created_at <= ${toDate}`);
  }

  const whereSql =
    conditions.length === 1
      ? conditions[0]
      : Prisma.sql`${Prisma.join(conditions, ' AND ')}`;

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*)::int AS total FROM search_history WHERE ${whereSql}`,
    prisma.$queryRaw`
      SELECT id, user_id, query, platform, results_text, meta, created_at
      FROM search_history
      WHERE ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ${parsedLimit} OFFSET ${offset}
    `,
  ]);

  const total = countRows?.[0]?.total || 0;
  const items = (rows || []).map((row) => {
    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
    const totalResults = Number(meta.total_results || 0);
    return {
      id: String(row.id),
      query: row.query,
      search_type: meta.search_type || 'profiles',
      platform: row.platform || 'all',
      total_results: totalResults,
      platform_counts: meta.platform_counts || {},
      platform_errors: meta.platform_errors || {},
      duration_ms: meta.duration_ms || 0,
      searched_at: meta.searched_at || row.created_at,
      created_at: row.created_at,
      matched_results_count: searchText ? totalResults : totalResults,
    };
  });

  return {
    items,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.max(Math.ceil(total / parsedLimit), 1),
    },
  };
};

const getSearchHistoryById = async ({ db, userId, id }) => {
  const prisma = dbOf(db);
  await ensureSearchHistoryTable(prisma);

  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const err = new Error('Search history not found');
    err.status = 404;
    throw err;
  }

  const rows = await prisma.$queryRaw`
    SELECT id, user_id, query, platform, results_text, meta, created_at
    FROM search_history
    WHERE id = ${numericId} AND user_id = ${Number(userId)}
    LIMIT 1
  `;
  const row = rows?.[0];
  if (!row) {
    const err = new Error('Search history not found');
    err.status = 404;
    throw err;
  }
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  return {
    id: String(row.id),
    query: row.query,
    search_type: meta.search_type || 'profiles',
    platform: row.platform || 'all',
    total_results: meta.total_results || 0,
    platform_counts: meta.platform_counts || {},
    platform_errors: meta.platform_errors || {},
    duration_ms: meta.duration_ms || 0,
    searched_at: meta.searched_at || row.created_at,
    created_at: row.created_at,
    results: Array.isArray(meta.results) ? meta.results : [],
  };
};

module.exports = {
  saveSearchHistory,
  listSearchHistory,
  getSearchHistoryById,
  ensureSearchHistoryTable,
};
