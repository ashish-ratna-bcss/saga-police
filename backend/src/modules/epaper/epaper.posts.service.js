/**
 * E-Paper posts saved in the tenant database.
 *
 * The E-Paper service owns extraction; this module keeps our own copy of every article that was
 * fetched through the app, so the list survives even if the service's corpus is rebuilt.
 */
const dbOf = require('../../lib/dbOf');
const { forward } = require('../../services/epaper');

const MAX_FETCH = 200;
const MAX_BROWSE_PAGES = 5;
const ENRICH_CONCURRENCY = 6;

const ready = new WeakMap(); // prisma client -> Promise

const ensureTable = (prisma) => {
  if (!ready.has(prisma)) {
    const p = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS epaper_posts (
          id BIGSERIAL PRIMARY KEY,
          uid TEXT NOT NULL,
          paper TEXT NULL,
          edition TEXT NULL,
          pub_date DATE NULL,
          page_number INTEGER NULL,
          headline TEXT NULL,
          body TEXT NULL,
          byline TEXT NULL,
          dateline TEXT NULL,
          lang TEXT NULL,
          category TEXT NULL,
          subcategory TEXT NULL,
          primary_beat TEXT NULL,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
          job_id TEXT NULL,
          crop TEXT NULL,
          bbox JSONB NOT NULL DEFAULT '[]'::jsonb,
          text_source TEXT NULL,
          score DOUBLE PRECISION NOT NULL DEFAULT 0,
          raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          fetched_by INTEGER NULL,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT epaper_posts_uid_key UNIQUE (uid)
        )
      `);
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS epaper_posts_pub_date_idx ON epaper_posts (pub_date DESC, id DESC)'
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS epaper_posts_paper_date_idx ON epaper_posts (paper, pub_date DESC)'
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS epaper_posts_category_idx ON epaper_posts (category)'
      );
    })();
    p.catch(() => ready.delete(prisma));
    ready.set(prisma, p);
  }
  return ready.get(prisma);
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cleanDate = (v) => (DATE_RE.test(String(v || '')) ? String(v) : null);
const cleanText = (v, max = 200) => String(v || '').trim().slice(0, max);

const decode = (response) => {
  const buf = Buffer.from(response.data || []);
  const text = buf.toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const callService = async (path, query) => {
  const response = await forward({ method: 'GET', path, query });
  const body = decode(response);
  if (response.status >= 400) {
    const err = new Error(
      (body && (body.detail || body.error?.message || body.error)) || `E-Paper service returned ${response.status}`
    );
    err.status = 502;
    throw err;
  }
  return body;
};

/** Run `fn` over `items` with at most `limit` in flight. */
const mapPool = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

const toRow = (hit, full) => {
  const a = { ...hit, ...(full || {}) };
  const uid = a.uid || (a.job_id && a.seq != null ? `${a.job_id}:${a.seq}` : null);
  if (!uid) return null;
  return {
    uid: String(uid),
    paper: a.paper || null,
    edition: a.edition || null,
    pub_date: cleanDate(a.date),
    page_number: Number.isFinite(Number(a.page_number)) ? Number(a.page_number) : null,
    headline: a.headline || '',
    body: a.body || '',
    byline: a.byline || '',
    dateline: a.dateline || '',
    lang: a.lang || null,
    category: a.category || null,
    subcategory: a.subcategory || null,
    primary_beat: a.primary_beat || null,
    tags: Array.isArray(a.tags) ? a.tags : [],
    keywords: Array.isArray(a.keywords) ? a.keywords : [],
    job_id: a.job_id || null,
    crop: a.crop || null,
    bbox: Array.isArray(a.bbox) ? a.bbox : [],
    text_source: a.text_source || null,
    score: Number(a.score) || 0,
  };
};

const upsertRows = async (prisma, rows, userId) => {
  let added = 0;
  const saved = [];
  for (const r of rows) {
    const res = await prisma.$queryRawUnsafe(
      `INSERT INTO epaper_posts
         (uid, paper, edition, pub_date, page_number, headline, body, byline, dateline, lang,
          category, subcategory, primary_beat, tags, keywords, job_id, crop, bbox, text_source,
          score, raw_data, fetched_by)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18::jsonb,$19,$20,$21::jsonb,$22)
       ON CONFLICT (uid) DO UPDATE SET
         paper = EXCLUDED.paper, edition = EXCLUDED.edition, pub_date = EXCLUDED.pub_date,
         page_number = EXCLUDED.page_number, headline = EXCLUDED.headline,
         body = CASE WHEN length(EXCLUDED.body) >= length(COALESCE(epaper_posts.body, '')) THEN EXCLUDED.body ELSE epaper_posts.body END,
         byline = EXCLUDED.byline, dateline = EXCLUDED.dateline, lang = EXCLUDED.lang,
         category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
         primary_beat = EXCLUDED.primary_beat, tags = EXCLUDED.tags, keywords = EXCLUDED.keywords,
         job_id = EXCLUDED.job_id, crop = EXCLUDED.crop, bbox = EXCLUDED.bbox,
         text_source = EXCLUDED.text_source, score = EXCLUDED.score, updated_at = NOW()
       RETURNING id::int AS id, (xmax = 0) AS inserted`,
      r.uid, r.paper, r.edition, r.pub_date, r.page_number, r.headline, r.body, r.byline, r.dateline,
      r.lang, r.category, r.subcategory, r.primary_beat, JSON.stringify(r.tags), JSON.stringify(r.keywords),
      r.job_id, r.crop, JSON.stringify(r.bbox), r.text_source, r.score, '{}', userId || null
    );
    if (res[0]?.inserted) added += 1;
    saved.push(res[0]?.id);
  }
  return { added, ids: saved.filter(Boolean) };
};

const SELECT_COLS = `id::int AS id, uid, paper, edition, to_char(pub_date, 'YYYY-MM-DD') AS date, page_number, headline,
  body, byline, dateline, lang, category, subcategory, primary_beat, tags, keywords, job_id, crop,
  text_source, score, to_char(fetched_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fetched_at`;

/** All saved posts, newest paper date first. */
const listPosts = async ({ db, q, paper, category, dateFrom, dateTo, page = 1, perPage = 30 }) => {
  const prisma = dbOf(db);
  await ensureTable(prisma);

  const where = [];
  const params = [];
  const add = (build, value) => {
    params.push(value);
    where.push(build(`$${params.length}`));
  };
  const text = cleanText(q, 120);
  if (text) {
    const like = `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    add((p) => `(headline ILIKE ${p} OR body ILIKE ${p} OR byline ILIKE ${p})`, like);
  }
  if (paper) add((p) => `paper = ${p}`, cleanText(paper));
  if (category) add((p) => `category = ${p}`, cleanText(category));
  if (cleanDate(dateFrom)) add((p) => `pub_date >= ${p}::date`, dateFrom);
  if (cleanDate(dateTo)) add((p) => `pub_date <= ${p}::date`, dateTo);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const size = Math.max(1, Math.min(Number(perPage) || 30, 100));
  const pg = Math.max(1, Number(page) || 1);

  const [{ n } = { n: 0 }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM epaper_posts ${clause}`, ...params);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${SELECT_COLS} FROM epaper_posts ${clause}
     ORDER BY pub_date DESC NULLS LAST, paper ASC, page_number ASC NULLS LAST, id DESC
     LIMIT ${size} OFFSET ${(pg - 1) * size}`,
    ...params
  );
  const papers = await prisma.$queryRawUnsafe(
    `SELECT paper, count(*)::int AS n FROM epaper_posts WHERE paper IS NOT NULL GROUP BY paper ORDER BY n DESC`
  );
  const categories = await prisma.$queryRawUnsafe(
    `SELECT category, count(*)::int AS n FROM epaper_posts WHERE COALESCE(category, '') <> '' GROUP BY category ORDER BY n DESC`
  );
  const totalAll = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM epaper_posts');
  return {
    total: n,
    total_saved: totalAll[0]?.n || 0,
    page: pg,
    per_page: size,
    pages: Math.max(1, Math.ceil(n / size)),
    results: rows,
    papers,
    categories,
  };
};

const getPost = async ({ db, id }) => {
  const prisma = dbOf(db);
  await ensureTable(prisma);
  const rows = await prisma.$queryRawUnsafe(`SELECT ${SELECT_COLS} FROM epaper_posts WHERE id = $1`, Number(id) || 0);
  return rows[0] || null;
};

/**
 * Ask the E-Paper service for posts matching the filters, save them all here, return what was saved.
 * With a keyword it runs a ranked search; otherwise it lists the matching issues in print order.
 */
const fetchAndSave = async ({ db, userId, paper, dateFrom, dateTo, category, q, limit = 100 }) => {
  const prisma = dbOf(db);
  await ensureTable(prisma);

  const cap = Math.max(1, Math.min(Number(limit) || 100, MAX_FETCH));
  const filters = {};
  if (paper) filters.paper = cleanText(paper);
  if (cleanDate(dateFrom)) filters.date_from = dateFrom;
  if (cleanDate(dateTo)) filters.date_to = dateTo;
  if (category) filters.category = cleanText(category);

  let hits = [];
  const keyword = cleanText(q, 120);
  if (keyword) {
    const data = await callService('/api/search', { ...filters, q: keyword, limit: cap });
    hits = Array.isArray(data?.results) ? data.results : [];
  } else {
    for (let page = 1; page <= MAX_BROWSE_PAGES && hits.length < cap; page += 1) {
      const data = await callService('/api/browse', { ...filters, page, per_page: Math.min(100, cap - hits.length) });
      const got = Array.isArray(data?.results) ? data.results : [];
      hits = hits.concat(got);
      if (page >= (data?.pages || 1) || got.length === 0) break;
    }
  }
  hits = hits.slice(0, cap);

  // Search and browse return a 600-character snippet; fetch the whole article so the copy we keep is complete.
  const rows = (await mapPool(hits, ENRICH_CONCURRENCY, async (hit) => {
    let full = null;
    if (hit.uid) {
      try {
        const data = await callService(`/api/article/${encodeURIComponent(hit.uid)}`);
        full = data?.article || null;
      } catch {
        full = null;
      }
    }
    return toRow(hit, full ? { body: full.body, byline: full.byline, dateline: full.dateline, lang: full.lang || hit.lang } : null);
  })).filter(Boolean);

  const { added, ids } = await upsertRows(prisma, rows, userId);
  let results = [];
  if (ids.length) {
    results = await prisma.$queryRawUnsafe(
      `SELECT ${SELECT_COLS} FROM epaper_posts WHERE id = ANY($1::text[]::bigint[])
       ORDER BY pub_date DESC NULLS LAST, paper ASC, page_number ASC NULLS LAST, id DESC`,
      ids.map(String)
    );
  }
  return { found: hits.length, saved: rows.length, added, updated: rows.length - added, results };
};


/* ───────────── Extract a page / edition from the catalogue, then save what it produced ───────────── */

const postService = async (path, body) => {
  const response = await forward({ method: 'POST', path, body });
  const parsed = decode(response);
  if (response.status >= 400) {
    const err = new Error(
      (parsed && (parsed.detail || parsed.error?.message || parsed.error)) || `E-Paper service returned ${response.status}`
    );
    err.status = response.status === 400 ? 400 : 502;
    throw err;
  }
  return parsed;
};

const int = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

/** Start reading a page (or a page range / whole paper). Returns the service job id. */
const startExtract = async ({ host, titleId, date, edition, scope = 'page', pageNo, fromPage, toPage, withText = true }) => {
  const h = cleanText(host, 120);
  const t = cleanText(titleId, 60);
  if (!h || !/^[a-z0-9.-]+$/i.test(h)) {
    const err = new Error('Pick a newspaper');
    err.status = 400;
    throw err;
  }
  if (!t) {
    const err = new Error('Pick an edition');
    err.status = 400;
    throw err;
  }
  if (!cleanDate(date)) {
    const err = new Error('Pick a date');
    err.status = 400;
    throw err;
  }
  const common = { host: h, title_id: t, date, edition: cleanText(edition, 120) };
  if (scope === 'page') {
    const out = await postService('/api/jobs/fetch', { ...common, page_no: int(pageNo, 1, 200, 1), with_text: Boolean(withText) });
    return { job_id: out.job_id, kind: 'page' };
  }
  const range = scope === 'range'
    ? { from_page: int(fromPage, 1, 200, 1), to_page: int(toPage, 1, 200, int(fromPage, 1, 200, 1)) }
    : {};
  const out = await postService('/api/jobs/ingest', { ...common, ...range });
  return { job_id: out.job_id, kind: 'edition' };
};

const JOB_ID_RE = /^[a-f0-9]{6,32}$/i;
const imported = new Map(); // job id -> summary (so polling does not re-import)

const importJob = async ({ prisma, userId, jobId, fromPage, toPage }) => {
  const data = await callService(`/api/jobs/${jobId}`);
  const job = data?.job || {};
  const papers = await callService('/api/papers').catch(() => []);
  const lang = (Array.isArray(papers) ? papers : []).find((p) => p.name === job.paper)?.lang || null;

  let rows = [];
  const jobArticles = Array.isArray(data?.articles) ? data.articles : [];

  if (job.kind === 'edition' || !jobArticles.length) {
    // Range / whole-paper runs file their articles in the archive: pull them back by paper and day.
    let hits = [];
    for (let page = 1; page <= MAX_BROWSE_PAGES * 4; page += 1) {
      const out = await callService('/api/browse', { paper: job.paper, date: job.date, page, per_page: 100 });
      const got = Array.isArray(out?.results) ? out.results : [];
      hits = hits.concat(got);
      if (page >= (out?.pages || 1) || got.length === 0) break;
    }
    if (job.edition) hits = hits.filter((h) => !h.edition || h.edition === job.edition);
    if (fromPage || toPage) {
      const lo = fromPage || 1;
      const hi = toPage || 9999;
      hits = hits.filter((h) => !h.page_number || (h.page_number >= lo && h.page_number <= hi));
    }
    rows = (await mapPool(hits, ENRICH_CONCURRENCY, async (hit) => {
      let full = null;
      if (hit.uid) {
        try { full = (await callService(`/api/article/${encodeURIComponent(hit.uid)}`))?.article || null; } catch { full = null; }
      }
      return toRow(hit, full ? { body: full.body, byline: full.byline, dateline: full.dateline, lang: full.lang || hit.lang } : null);
    })).filter(Boolean);
  } else {
    rows = jobArticles
      .map((a) => toRow({
        ...a,
        paper: job.paper,
        edition: job.edition,
        date: job.date,
        page_number: job.page_no,
        job_id: job.id,
        lang: a.lang || lang,
      }, null))
      .filter(Boolean);
  }

  // Unread fragments (no headline and no text) are not posts.
  rows = rows.filter((r) => (r.headline || '').trim() || (r.body || '').trim());
  const { added, ids } = await upsertRows(prisma, rows, userId);
  return { found: rows.length, saved: rows.length, added, updated: rows.length - added, ids };
};

/** Progress of a started job; when it has finished, saves its posts (once) and returns them. */
const extractStatus = async ({ db, userId, jobId, fromPage, toPage }) => {
  const prisma = dbOf(db);
  await ensureTable(prisma);
  if (!JOB_ID_RE.test(String(jobId || ''))) {
    const err = new Error('Invalid job id');
    err.status = 400;
    throw err;
  }
  const data = await callService(`/api/jobs/${jobId}`);
  const job = data?.job || {};
  const progress = {
    job_id: jobId,
    status: job.status || 'queued',
    stage: job.stage || '',
    kind: job.kind || 'page',
    n_pages: job.n_pages || 0,
    pages_done: job.pages_done || 0,
    pages_failed: job.pages_failed || 0,
    pages_skipped: job.pages_skipped || 0,
    paper: job.paper || '',
    edition: job.edition || '',
    date: job.date || '',
  };
  if (job.status === 'error') return { ...progress, error: job.error || 'The page could not be read' };
  if (job.status !== 'done') return progress;

  let summary = imported.get(jobId);
  if (!summary) {
    summary = await importJob({ prisma, userId, jobId, fromPage: int(fromPage, 0, 200, 0), toPage: int(toPage, 0, 200, 0) });
    imported.set(jobId, summary);
    if (imported.size > 60) imported.delete(imported.keys().next().value);
  }
  let results = [];
  if (summary.ids.length) {
    results = await prisma.$queryRawUnsafe(
      `SELECT ${SELECT_COLS} FROM epaper_posts WHERE id = ANY($1::text[]::bigint[])
       ORDER BY page_number ASC NULLS LAST, id ASC`,
      summary.ids.map(String)
    );
  }
  return { ...progress, found: summary.found, saved: summary.saved, added: summary.added, updated: summary.updated, results };
};

module.exports = { ensureTable, listPosts, getPost, fetchAndSave, startExtract, extractStatus, upsertRows, toRow };
