/**
 * Per-tenant storage for Tools → News. The tenant's own database (req.tenantPrisma) is
 * what the News page shows: every search reads news_articles with its filters, and a
 * live fetch from the news API only adds to it (saveCollected). So past coverage stays
 * searchable after it has dropped off the news sites. Tenants never share rows.
 *
 * Tables are created on first use (like search_history), so they only exist in tenant
 * DBs where someone with Analysis Tools access has used News. To create them up front
 * for every tenant with that access, run: node scripts/ensure-news-tables.js
 *
 *   news_articles  every collected article (article_id = upstream sha256(url)[:16],
 *                  stable across scrapes, so re-seeing an article updates its row)
 *   news_searches  search history: who searched what, with which filters, when
 *
 * (Older installs also have news_search_articles; it is no longer read or written.)
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
    `CREATE INDEX IF NOT EXISTS idx_news_articles_first_seen ON news_articles (first_seen_at DESC)`,
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

/** Upserts articles; returns how many were new to this tenant. */
const upsertArticles = async (tx, articles) => {
  const rows = articles
    .filter((a) => a && a.id)
    .map((a) => {
      const text = ARTICLE_TEXT_FIELDS.map((f) => String(a[f] ?? ''));
      return Prisma.sql`(${String(a.id)}, ${Prisma.join(text)}, ${toDateOrNull(a.published_at)})`;
    });
  if (!rows.length) return 0;

  // A re-scrape can come back thinner (e.g. no body extracted this time), so never
  // overwrite stored text with an empty value. xmax = 0 marks rows that were
  // inserted rather than updated.
  const keep = (f) => Prisma.raw(`${f} = COALESCE(NULLIF(EXCLUDED.${f}, ''), news_articles.${f})`);
  const written = await tx.$queryRaw`
    INSERT INTO news_articles (article_id, ${Prisma.raw(ARTICLE_TEXT_FIELDS.join(', '))}, published_at)
    VALUES ${Prisma.join(rows)}
    ON CONFLICT (article_id) DO UPDATE SET
      ${Prisma.join(ARTICLE_TEXT_FIELDS.map(keep))},
      published_at = COALESCE(EXCLUDED.published_at, news_articles.published_at),
      last_seen_at = NOW(),
      seen_count = news_articles.seen_count + 1
    RETURNING (xmax = 0) AS inserted
  `;
  return written.filter((r) => r.inserted).length;
};

/**
 * Save what a live fetch returned for the caller's tenant and log the search.
 * A known search_id (re-fetching the same search, e.g. "fetch the rest") updates that
 * history row instead of adding another.
 *
 * collected_at is the transaction's NOW() — the exact first_seen_at of every article
 * this fetch added — so the page can tag them "New" using database time only.
 *
 * @param {{ user, query, articles: object[], liveCount: number }} collected
 * @returns {Promise<{ search_id: string, fetched: number, new: number, collected_at: Date }>}
 */
const saveCollected = async (db, { user, query = {}, articles = [], liveCount = 0 }) => {
  const prisma = dbOf(db);
  await ensureNewsTables(prisma);

  // Pages can overlap if sources finish between calls; ON CONFLICT can't touch a row twice.
  const seen = new Set();
  const unique = articles.filter((a) => a?.id && !seen.has(a.id) && seen.add(a.id));
  const requestedSearchId = /^\d+$/.test(String(query.search_id || '')) ? String(query.search_id) : null;

  return prisma.$transaction(async (tx) => {
    const [{ now: collectedAt }] = await tx.$queryRaw`SELECT NOW() AS now`;
    const inserted = await upsertArticles(tx, unique);

    let searchId = null;
    if (requestedSearchId) {
      const found = await tx.$queryRaw`
        UPDATE news_searches SET result_count = GREATEST(result_count, ${toInt(liveCount, 0)})
        WHERE id = ${BigInt(requestedSearchId)}
        RETURNING id`;
      if (found.length) searchId = String(found[0].id);
    }
    if (!searchId) {
      const created = await tx.$queryRaw`
        INSERT INTO news_searches (user_id, user_name, filters, result_count)
        VALUES (${user?.id != null ? Number(user.id) : null}, ${user?.name || user?.username || null},
                ${JSON.stringify(pickSearchFilters(query))}::jsonb, ${toInt(liveCount, unique.length)})
        RETURNING id`;
      searchId = String(created[0].id);
    }
    return { search_id: searchId, fetched: unique.length, new: inserted, collected_at: collectedAt };
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

/** Normalized text column for non-Latin keywords, only computed when a keyword has them. */
const hayColumns = (keyword) => (keyword.needsHay ? Prisma.sql`, ${HAY_COLUMNS}` : Prisma.empty);

// search_tsv is stored compressed (TOAST); every flag that reads it would decompress
// it again — ~150 times per row for a long list. Concatenating with an empty
// tsvector materializes one decompressed copy per row for all the flags to share.
const SEARCH_TSV = Prisma.sql`(a.search_tsv || ''::tsvector) AS search_tsv`;

/** What the keyword flags read: the word index, plus title/text only for non-Latin keywords. */
const scoringColumns = (keyword) => {
  if (!keyword.ranked) return Prisma.empty;
  return keyword.needsHay
    ? Prisma.sql`, ${SEARCH_TSV}, a.title ${hayColumns(keyword)}`
    : Prisma.sql`, ${SEARCH_TSV}`;
};

/**
 * What the News page shows: this tenant's collected articles, filtered (keyword or
 * keyword list with min_match, country, language, state, district, source, location,
 * from/to) and paged. With a keyword, best matches first (news.keywords.js);
 * otherwise newest first.
 */
const listArticles = async (db, query = {}) => {
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
    SELECT ${LIST_COLUMNS}, p.matched_phrases, p.match_score, p.total_count
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
    // matched_terms (the matched keywords' words) drive highlighting on the page.
    articles: pageRows.map(({ total_count, ...a }) => ({
      ...a,
      matched_terms: [...new Set((a.matched_phrases || []).flatMap((p) => keyword.wordsOf.get(p) || []))],
    })),
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
      SELECT s.id, s.user_id, s.user_name, s.filters, s.result_count, s.created_at
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

/** Delete a search the caller ran from the history. Its articles stay saved. */
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
  saveCollected,
  listArticles,
  getSavedArticle,
  listSearches,
  deleteSearch,
};
