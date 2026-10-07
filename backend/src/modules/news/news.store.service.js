/**
 * Per-tenant storage for Tools → News.
 *
 * The news API only caches articles in memory for ~10 minutes, so every article a
 * tenant's search returns is kept in that tenant's own database (req.tenantPrisma),
 * together with who searched what. Tenants never share rows: each has its own DB.
 *
 * Tables are created on first use (like search_history), so they only exist in tenant
 * DBs where someone with Analysis Tools access has used News. To create them up front
 * for every tenant with that access, run: node scripts/ensure-news-tables.js
 *
 *   news_articles         one row per article (article_id = upstream sha256(url)[:16],
 *                         stable across scrapes, so re-seeing an article updates it)
 *   news_searches         one row per search: user, filters, upstream total
 *   news_search_articles  which articles each search returned, in result order
 */

const { Prisma } = require('../../generated/tenant-client');
const dbOf = require('../../lib/dbOf');
const { keywordSql, HAY_COLUMNS } = require('./news.keywords');

const ARTICLE_TEXT_FIELDS = [
  'title', 'summary', 'content', 'source', 'source_id', 'source_url',
  'language', 'country', 'state', 'district', 'location', 'image_url',
];
// Filters worth remembering on a search (paging params are not part of "what was searched").
const SEARCH_FILTER_KEYS = ['keyword', 'min_match', 'country', 'language', 'location', 'state', 'district', 'source'];
const MAX_PAGE_SIZE = 100;

const ensuredClients = new WeakSet();

const ensureNewsTables = async (prisma) => {
  if (ensuredClients.has(prisma)) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS news_articles (
      article_id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      published_at TIMESTAMPTZ NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      seen_count INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles (published_at DESC NULLS LAST)`,
    `CREATE INDEX IF NOT EXISTS idx_news_articles_last_seen ON news_articles (last_seen_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_news_articles_source_id ON news_articles (source_id)`,
    // Word index for keyword search (news.keywords.js): the article's [a-z0-9] words,
    // title weighted 'A'. Generated, so Postgres keeps it current on every upsert;
    // adding it to an existing table backfills the rows already there.
    `ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS search_tsv tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g')), 'A') ||
      to_tsvector('simple', regexp_replace(lower(summary || ' ' || content), '[^a-z0-9]+', ' ', 'g'))
    ) STORED`,
    `CREATE INDEX IF NOT EXISTS idx_news_articles_search ON news_articles USING GIN (search_tsv)`,
    `CREATE TABLE IF NOT EXISTS news_searches (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NULL,
      user_name TEXT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      result_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_news_searches_created ON news_searches (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_news_searches_user ON news_searches (user_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS news_search_articles (
      search_id BIGINT NOT NULL REFERENCES news_searches(id) ON DELETE CASCADE,
      article_id TEXT NOT NULL REFERENCES news_articles(article_id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      PRIMARY KEY (search_id, article_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_news_search_articles_article ON news_search_articles (article_id)`,
  ];
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }
  ensuredClients.add(prisma);
};

const httpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const toInt = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Comma list (or repeated query key) → trimmed non-empty values, as the API accepts them. */
const parseMulti = (value) => {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '');
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
};

const pickSearchFilters = (query = {}) => {
  const filters = {};
  for (const key of SEARCH_FILTER_KEYS) {
    // The keyword is free text (commas, quotes and all); the rest are comma lists.
    if (key === 'keyword') {
      const keyword = String(query.keyword ?? '').trim();
      if (keyword) filters.keyword = keyword;
      continue;
    }
    const values = parseMulti(query[key]);
    if (values.length) filters[key] = values.join(',');
  }
  return filters;
};

/* ---------- write ---------- */

const upsertArticles = async (tx, articles) => {
  const rows = articles
    .filter((a) => a && a.id)
    .map((a) => {
      const text = ARTICLE_TEXT_FIELDS.map((f) => String(a[f] ?? ''));
      return Prisma.sql`(${String(a.id)}, ${Prisma.join(text)}, ${toDateOrNull(a.published_at)})`;
    });
  if (!rows.length) return 0;

  // A re-scrape can come back thinner (e.g. no body extracted this time), so never
  // overwrite stored text with an empty value.
  const keep = (f) => Prisma.raw(`${f} = COALESCE(NULLIF(EXCLUDED.${f}, ''), news_articles.${f})`);
  await tx.$executeRaw`
    INSERT INTO news_articles (article_id, ${Prisma.raw(ARTICLE_TEXT_FIELDS.join(', '))}, published_at)
    VALUES ${Prisma.join(rows)}
    ON CONFLICT (article_id) DO UPDATE SET
      ${Prisma.join(ARTICLE_TEXT_FIELDS.map(keep))},
      published_at = COALESCE(EXCLUDED.published_at, news_articles.published_at),
      last_seen_at = NOW(),
      seen_count = news_articles.seen_count + 1
  `;
  return rows.length;
};

/**
 * Store one page of a live search for the caller's tenant.
 * A request without a (known) search_id starts a new news_searches row; paging or
 * re-paging that search passes the search_id back so its articles join the same row.
 *
 * @returns {Promise<{ search_id: string, stored: number }>}
 */
const recordSearchPage = async (db, { user, query, data }) => {
  const prisma = dbOf(db);
  await ensureNewsTables(prisma);

  // The upstream API dedupes by id, but guard anyway: ON CONFLICT can't touch one row twice.
  const seen = new Set();
  const articles = (Array.isArray(data?.articles) ? data.articles : [])
    .filter((a) => a?.id && !seen.has(a.id) && seen.add(a.id));
  const offset = toInt(data?.offset ?? query.offset, 0);
  const requestedSearchId = /^\d+$/.test(String(query.search_id || '')) ? String(query.search_id) : null;

  return prisma.$transaction(async (tx) => {
    const stored = await upsertArticles(tx, articles);

    let searchId = null;
    if (requestedSearchId) {
      // Re-running a search can find more than the first run (sources that were
      // still loading upstream have finished), so keep the larger total.
      const found = await tx.$queryRaw`
        UPDATE news_searches SET result_count = GREATEST(result_count, ${toInt(data?.count, 0)})
        WHERE id = ${BigInt(requestedSearchId)}
        RETURNING id`;
      if (found.length) searchId = String(found[0].id);
    }
    if (!searchId) {
      const filters = pickSearchFilters(query);
      const created = await tx.$queryRaw`
        INSERT INTO news_searches (user_id, user_name, filters, result_count)
        VALUES (${user?.id != null ? Number(user.id) : null}, ${user?.name || user?.username || null},
                ${JSON.stringify(filters)}::jsonb, ${toInt(data?.count, articles.length)})
        RETURNING id
      `;
      searchId = String(created[0].id);
    }

    if (articles.length) {
      const links = articles.map((a, i) => Prisma.sql`(${BigInt(searchId)}, ${String(a.id)}, ${offset + i})`);
      await tx.$executeRaw`
        INSERT INTO news_search_articles (search_id, article_id, position)
        VALUES ${Prisma.join(links)}
        ON CONFLICT (search_id, article_id) DO NOTHING
      `;
    }
    return { search_id: searchId, stored };
  });
};

/* ---------- read ---------- */

// Lists leave out the full text (it can be 15 KB+ per article) but keep its length,
// so cards can say "Read full article · N words".
const LIST_COLUMNS = Prisma.sql`
  a.article_id AS id, a.title, a.summary, a.source, a.source_id, a.source_url, a.language,
  a.country, a.state, a.district, a.location, a.image_url, a.published_at,
  a.first_seen_at, a.last_seen_at, a.seen_count,
  COALESCE(array_length(regexp_split_to_array(NULLIF(btrim(a.content), ''), '\\s+'), 1), 0) AS word_count`;

const iLike = (column, values) =>
  Prisma.sql`(${Prisma.join(values.map((v) => Prisma.sql`${Prisma.raw(column)} ILIKE ${`%${v}%`}`), ' OR ')})`;

/**
 * Same semantics as the live API: OR within a filter, AND across filters, substring
 * match. `extra` conditions (the keyword prefilter) are ANDed in, so the GIN word
 * index can narrow the rows in the same scan.
 */
const buildArticleWhere = (query, extra = null) => {
  const where = [];
  for (const key of ['country', 'language', 'state', 'district']) {
    const values = parseMulti(query[key]);
    if (values.length) where.push(iLike(`a.${key}`, values));
  }
  const locations = parseMulti(query.location);
  if (locations.length) {
    where.push(Prisma.sql`(${Prisma.join(locations.map((v) => Prisma.sql`
      (a.location || ' ' || a.district || ' ' || a.state) ILIKE ${`%${v}%`}`), ' OR ')})`);
  }
  const sources = parseMulti(query.source);
  if (sources.length) {
    where.push(Prisma.sql`(a.source_id = ANY(${sources}) OR ${iLike('a.source', sources)})`);
  }
  const from = toDateOrNull(query.from);
  if (from) where.push(Prisma.sql`COALESCE(a.published_at, a.first_seen_at) >= ${from}`);
  const to = toDateOrNull(query.to);
  if (to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to.setUTCHours(23, 59, 59, 999);
    where.push(Prisma.sql`COALESCE(a.published_at, a.first_seen_at) <= ${to}`);
  }
  if (extra) where.push(extra);
  return where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty;
};

const page = (query) => ({
  limit: toInt(query.limit, 20, { min: 1, max: MAX_PAGE_SIZE }),
  offset: toInt(query.offset, 0),
});

// The per-word flag columns (kt0, kh0, kr0, kp) keywordSql adds are internal.
const FLAG_COLUMN = /^k[thrp]\d*$/;
const withoutFlags = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !FLAG_COLUMN.test(k)));

/** Raw-text column for Indian-script words, only computed when a keyword has them. */
const hayColumns = (keyword) => (keyword.needsHay ? Prisma.sql`, ${HAY_COLUMNS}` : Prisma.empty);

// search_tsv is stored compressed (TOAST); every flag that reads it would decompress
// it again — ~150 times per row for a long list. Concatenating with an empty
// tsvector materializes one decompressed copy per row for all the flags to share.
const SEARCH_TSV = Prisma.sql`(a.search_tsv || ''::tsvector) AS search_tsv`;

/** What the keyword flags read: the word index, plus title/raw text only for Indian-script words. */
const scoringColumns = (keyword) => {
  if (!keyword.ranked) return Prisma.empty;
  return keyword.needsHay
    ? Prisma.sql`, ${SEARCH_TSV}, a.title ${hayColumns(keyword)}`
    : Prisma.sql`, ${SEARCH_TSV}`;
};

/**
 * Every article this tenant has collected. Same shape as the live search: with a
 * keyword (one phrase or a comma-separated list), best matches first — see
 * news.keywords.js; otherwise newest first.
 */
const listSavedArticles = async (db, query = {}) => {
  const prisma = dbOf(db);
  await ensureNewsTables(prisma);
  const { limit, offset } = page(query);
  const keyword = keywordSql(query.keyword, query.min_match);
  const where = keyword.where ? Prisma.sql`WHERE ${keyword.where}` : Prisma.empty;
  // In the ranking step match_score is an output column (no table prefix); outside it, p.match_score.
  const rank = (alias) => (keyword.ranked ? Prisma.raw(`${alias ? `${alias}.` : ""}match_score DESC,`) : Prisma.empty);

  // Rank on light columns only — id, dates and the index-backed word flags — so no
  // article text is read for rows that won't be on this page. OFFSET 0 fences stop
  // Postgres inlining the subqueries, which would re-evaluate every flag at each
  // place the outer query uses it.
  const scored = Prisma.sql`
    SELECT a.article_id AS id, a.published_at, a.last_seen_at ${keyword.flags}
    FROM (
      SELECT a.article_id, a.published_at, a.last_seen_at ${scoringColumns(keyword)}
      FROM news_articles a ${buildArticleWhere(query, keyword.prefilter)}
      OFFSET 0
    ) a
    OFFSET 0`;

  // The window count is the total before LIMIT, so ranking runs once, not again for COUNT.
  // Full columns (text, word counts) are then read for just the page's rows.
  const pageRows = await prisma.$queryRaw`
    WITH page AS (
      SELECT s.id, s.published_at, s.last_seen_at, ${keyword.select}, COUNT(*) OVER ()::int AS total_count
      FROM (${scored}) s ${where}
      ORDER BY ${rank("")} s.published_at DESC NULLS LAST, s.last_seen_at DESC, s.id
      LIMIT ${limit} OFFSET ${offset}
    )
    SELECT ${LIST_COLUMNS}, p.matched_terms, p.matched_phrases, p.match_score, p.total_count
    FROM page p JOIN news_articles a ON a.article_id = p.id
    ORDER BY ${rank('p')} p.published_at DESC NULLS LAST, p.last_seen_at DESC, p.id`;
  // Past the last page there are no rows to carry the total; only then count separately.
  const count = pageRows.length
    ? pageRows[0].total_count
    : (offset > 0
      ? (await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM (${scored}) s ${where}`)[0]?.count || 0
      : 0);
  return {
    count,
    limit,
    offset,
    articles: pageRows.map(({ total_count, ...a }) => a),
    query_terms: keyword.terms,
    query_phrases: keyword.phrases,
  };
};

/** One stored article with its full text, or null. */
const getSavedArticle = async (db, articleId) => {
  const prisma = dbOf(db);
  await ensureNewsTables(prisma);
  const rows = await prisma.$queryRaw`
    SELECT ${LIST_COLUMNS}, a.content FROM news_articles a WHERE a.article_id = ${String(articleId)}`;
  return rows[0] || null;
};

/** This tenant's searches, newest first, with who ran them. */
const listSearches = async (db, query = {}, user = null) => {
  const prisma = dbOf(db);
  await ensureNewsTables(prisma);
  const { limit, offset } = page(query);

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM news_searches`,
    prisma.$queryRaw`
      SELECT s.id, s.user_id, s.user_name, s.filters, s.result_count, s.created_at,
             (SELECT COUNT(*)::int FROM news_search_articles l WHERE l.search_id = s.id) AS stored_count
      FROM news_searches s
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
  ]);
  const items = rows.map((r) => ({
    ...r,
    id: String(r.id),
    filters: r.filters && typeof r.filters === 'object' ? r.filters : {},
    mine: user?.id != null && r.user_id === Number(user.id),
  }));
  return { count: countRows[0]?.count || 0, limit, offset, items };
};

/** Articles a stored search returned, in their original order. */
const listSearchArticles = async (db, searchId, query = {}) => {
  if (!/^\d+$/.test(String(searchId))) throw httpError(404, 'Search not found');
  const prisma = dbOf(db);
  await ensureNewsTables(prisma);
  const { limit, offset } = page(query);
  const id = BigInt(searchId);

  const search = await prisma.$queryRaw`
    SELECT id, user_id, user_name, filters, result_count, created_at FROM news_searches WHERE id = ${id}`;
  if (!search.length) throw httpError(404, 'Search not found');
  // Recompute which of the search's words/phrases each article matched, for the
  // card badges; the order stays as the live search ranked it.
  const keyword = keywordSql(search[0].filters?.keyword, search[0].filters?.min_match);

  // Page first (stored order needs no scoring), then flag only that page's rows.
  // OFFSET 0 fences: see listSavedArticles.
  const [countRows, articles] = await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM news_search_articles WHERE search_id = ${id}`,
    prisma.$queryRaw`
      WITH page AS (
        SELECT l.article_id, l.position FROM news_search_articles l
        WHERE l.search_id = ${id}
        ORDER BY l.position
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT s.*, ${keyword.select}
      FROM (
        SELECT ${LIST_COLUMNS}, a.position ${keyword.flags}
        FROM (SELECT a.*, p.position ${hayColumns(keyword)} FROM page p JOIN news_articles a ON a.article_id = p.article_id OFFSET 0) a
        OFFSET 0
      ) s
      ORDER BY s.position`,
  ]);
  return {
    search: { ...search[0], id: String(search[0].id) },
    count: countRows[0]?.count || 0,
    limit,
    offset,
    articles: articles.map(({ position, ...a }) => withoutFlags(a)),
    query_terms: keyword.terms,
    query_phrases: keyword.phrases,
  };
};

/** Delete a search the caller ran. Its articles stay in the tenant archive. */
const deleteSearch = async (db, searchId, user) => {
  if (!/^\d+$/.test(String(searchId))) throw httpError(404, 'Search not found');
  const prisma = dbOf(db);
  await ensureNewsTables(prisma);
  const rows = await prisma.$queryRaw`SELECT user_id FROM news_searches WHERE id = ${BigInt(searchId)}`;
  if (!rows.length) throw httpError(404, 'Search not found');
  if (rows[0].user_id !== Number(user?.id)) throw httpError(403, 'You can only delete your own searches');
  await prisma.$executeRaw`DELETE FROM news_searches WHERE id = ${BigInt(searchId)}`;
};

module.exports = {
  ensureNewsTables,
  pickSearchFilters,
  recordSearchPage,
  listSavedArticles,
  getSavedArticle,
  listSearches,
  listSearchArticles,
  deleteSearch,
};
