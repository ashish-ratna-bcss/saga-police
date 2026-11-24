/**
 * Tools → Profile Report: every SQL statement against the module's tables.
 * Drafts: an account is a draft from the moment its Fetch is clicked until the profile is Saved. Drafts are
 * collected straight away (that is what Fetch does) but are left out of lists, analysis and reports until Save,
 * and are removed again if the dialog is cancelled.
 */
const { ensureTables } = require('./profileReport.schema');
const { cleanDeep, json } = require('./profileReport.util');
const { flatten, mediaTextOf, sceneOf, cleanTranslation } = require('../../services/media_post_analysis/imageText');

const ACCOUNT_COLS = `id, subject_id, platform, handle, data, preview_data, is_draft, fetch_status, fetch_mode, fetch_pages,
  posts_fetched, fetch_error, started_at, finished_at, last_fetched_at, created_at`;

const q = async (prisma, sql, ...params) => {
  await ensureTables(prisma);
  return prisma.$queryRawUnsafe(sql, ...params);
};
const exec = async (prisma, sql, ...params) => {
  await ensureTables(prisma);
  return prisma.$executeRawUnsafe(sql, ...params);
};

/* ----------------------------------------------------------------------------- subjects ----------- */

const createDraftSubject = async (prisma, { userId = null, userName = null } = {}) => {
  const rows = await q(
    prisma,
    `INSERT INTO profile_report_subjects (status, created_by, created_by_name) VALUES ('draft', $1, $2)
     RETURNING id, display_name, notes, status`,
    userId, userName
  );
  return rows[0];
};

const getSubject = async (prisma, id) => {
  const rows = await q(prisma, `SELECT id, display_name, notes, status, created_by_name, created_at, updated_at FROM profile_report_subjects WHERE id = $1`, id);
  return rows[0] || null;
};

/** Post counts for the given subjects, over saved (non-draft) accounts only. */
const countsFor = async (prisma, subjectIds) => {
  if (!subjectIds.length) return new Map();
  const rows = await q(
    prisma,
    `SELECT p.subject_id,
            COUNT(*)::int AS posts,
            COUNT(*) FILTER (WHERE p.analysis_status = 'done')::int AS done,
            COUNT(*) FILTER (WHERE p.analysis_status = 'skipped')::int AS skipped,
            COUNT(*) FILTER (WHERE p.analysis_status = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE p.analysis_status IN ('pending', 'processing'))::int AS waiting,
            COALESCE(MAX(p.id), 0)::text AS max_post_id
       FROM profile_report_posts p
       JOIN profile_report_accounts a ON a.id = p.account_id AND a.is_draft = FALSE
      WHERE p.subject_id = ANY($1::int[])
      GROUP BY p.subject_id`,
    subjectIds
  );
  return new Map(rows.map((r) => [r.subject_id, r]));
};

const EMPTY_COUNTS = { posts: 0, done: 0, skipped: 0, failed: 0, waiting: 0, max_post_id: '0' };

const accountsFor = async (prisma, subjectIds, { includeDrafts = false } = {}) => {
  if (!subjectIds.length) return new Map();
  const rows = await q(
    prisma,
    `SELECT ${ACCOUNT_COLS} FROM profile_report_accounts
      WHERE subject_id = ANY($1::int[]) ${includeDrafts ? '' : 'AND is_draft = FALSE'}
      ORDER BY id`,
    subjectIds
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.subject_id)) map.set(r.subject_id, []);
    map.get(r.subject_id).push(r);
  }
  return map;
};

const accountSummary = (a, counts) => ({
  id: a.id,
  platform: a.platform,
  handle: a.handle,
  is_draft: a.is_draft,
  fetch_status: a.fetch_status,
  fetch_mode: a.fetch_mode,
  fetch_pages: a.fetch_pages,
  posts_fetched: a.posts_fetched,
  fetch_error: a.fetch_error,
  last_fetched_at: a.last_fetched_at,
  preview: a.preview_data?.summary || null,
  data: a.data || {},
  ...(counts || {}),
});

const reportBadges = async (prisma, subjectIds) => {
  if (!subjectIds.length) return new Map();
  const rows = await q(
    prisma,
    `SELECT subject_id, generated_at, summary_source, posts_count, report->>'attention_level' AS attention_level
       FROM profile_report_reports WHERE subject_id = ANY($1::int[])`,
    subjectIds
  );
  return new Map(rows.map((r) => [r.subject_id, r]));
};

const withProgress = (subject, accounts, counts, badge) => {
  const c = counts || EMPTY_COUNTS;
  const collecting = accounts.filter((a) => a.fetch_status === 'pending' || a.fetch_status === 'running').length;
  return {
    id: subject.id,
    display_name: subject.display_name,
    notes: subject.notes,
    status: subject.status,
    created_by_name: subject.created_by_name,
    created_at: subject.created_at,
    accounts: accounts.map((a) => accountSummary(a)),
    posts: c.posts,
    analysed: c.done,
    skipped: c.skipped,
    failed: c.failed,
    waiting: c.waiting,
    collecting,
    report: badge
      ? { generated_at: badge.generated_at, attention_level: badge.attention_level, summary_source: badge.summary_source }
      : null,
  };
};

/** Saved profiles, newest first, each with its accounts, post / analysis progress and last report. */
const listSubjects = async (prisma, { search = '' } = {}) => {
  const term = String(search || '').trim();
  const subjects = await q(
    prisma,
    `SELECT s.id, s.display_name, s.notes, s.status, s.created_by_name, s.created_at, s.updated_at
       FROM profile_report_subjects s
      WHERE s.status = 'active'
        ${term ? `AND (s.display_name ILIKE $1 OR EXISTS (SELECT 1 FROM profile_report_accounts a WHERE a.subject_id = s.id AND a.handle ILIKE $1))` : ''}
      ORDER BY s.id DESC`,
    ...(term ? [`%${term.replace(/[%_]/g, '\\$&')}%`] : [])
  );
  const ids = subjects.map((s) => s.id);
  const [accounts, counts, badges] = await Promise.all([accountsFor(prisma, ids), countsFor(prisma, ids), reportBadges(prisma, ids)]);
  return subjects.map((s) => withProgress(s, accounts.get(s.id) || [], counts.get(s.id), badges.get(s.id)));
};

/** One profile, including its draft accounts (the Add / Edit dialog needs them). */
const getSubjectDetail = async (prisma, id) => {
  const subject = await getSubject(prisma, id);
  if (!subject) return null;
  const [accounts, counts, badges] = await Promise.all([
    accountsFor(prisma, [id], { includeDrafts: true }),
    countsFor(prisma, [id]),
    reportBadges(prisma, [id]),
  ]);
  const all = accounts.get(id) || [];
  const view = withProgress(subject, all.filter((a) => !a.is_draft), counts.get(id), badges.get(id));
  return { ...view, accounts: all.map((a) => accountSummary(a)) };
};

const deleteSubject = async (prisma, id) => exec(prisma, `DELETE FROM profile_report_subjects WHERE id = $1`, id);

/** Cancel in the dialog: draft accounts go, and a profile that was never saved goes with them. */
const discardDrafts = async (prisma, subjectId) => {
  await exec(prisma, `DELETE FROM profile_report_accounts WHERE subject_id = $1 AND is_draft = TRUE`, subjectId);
  await exec(prisma, `DELETE FROM profile_report_subjects WHERE id = $1 AND status = 'draft'`, subjectId);
};

/**
 * Save: keep the listed accounts (drafts become saved), remove saved accounts that were taken out of the list,
 * and make the profile active. Returns the saved profile.
 */
const finalizeSubject = async (prisma, id, { displayName, notes, keepAccountIds }) => {
  const keep = (keepAccountIds || []).map(Number).filter(Number.isInteger);
  await exec(prisma, `DELETE FROM profile_report_accounts WHERE subject_id = $1 AND NOT (id = ANY($2::int[]))`, id, keep);
  await exec(prisma, `UPDATE profile_report_accounts SET is_draft = FALSE, updated_at = NOW() WHERE subject_id = $1 AND is_draft = TRUE`, id);
  await exec(
    prisma,
    `UPDATE profile_report_subjects SET display_name = $2, notes = $3, status = 'active', updated_at = NOW() WHERE id = $1`,
    id, displayName, notes || null
  );
  return getSubjectDetail(prisma, id);
};

/** Drafts nobody saved or cancelled (closed browser) are removed after a day. */
const sweepStaleDrafts = async (prisma) => {
  await exec(prisma, `DELETE FROM profile_report_accounts WHERE is_draft = TRUE AND updated_at < NOW() - INTERVAL '24 hours'`);
  await exec(
    prisma,
    `DELETE FROM profile_report_subjects s WHERE s.status = 'draft' AND s.updated_at < NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (SELECT 1 FROM profile_report_accounts a WHERE a.subject_id = s.id)`
  );
};

/* ----------------------------------------------------------------------------- accounts ----------- */

/**
 * Fetch clicked for an account: record it (or find it again, so a second click never restarts a collection
 * that is already under way) and queue its collection. A collection that failed is picked up again from where it stopped.
 */
const upsertDraftAccount = async (prisma, { subjectId, platform, handle, data, previewData }) => {
  const rows = await q(
    prisma,
    `INSERT INTO profile_report_accounts (subject_id, platform, handle, data, preview_data, is_draft, fetch_status)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, TRUE, 'pending')
     ON CONFLICT (subject_id, platform, lower(handle)) DO UPDATE SET
       data = EXCLUDED.data,
       preview_data = EXCLUDED.preview_data,
       fetch_status = CASE WHEN profile_report_accounts.fetch_status = 'failed' THEN 'pending' ELSE profile_report_accounts.fetch_status END,
       fetch_error = CASE WHEN profile_report_accounts.fetch_status = 'failed' THEN NULL ELSE profile_report_accounts.fetch_error END,
       claimed_at = CASE WHEN profile_report_accounts.fetch_status = 'failed' THEN NULL ELSE profile_report_accounts.claimed_at END,
       updated_at = NOW()
     RETURNING ${ACCOUNT_COLS}`,
    subjectId, platform, handle, json(data, {}), json(previewData, {})
  );
  return rows[0];
};

const getAccount = async (prisma, id) => {
  const rows = await q(prisma, `SELECT ${ACCOUNT_COLS} FROM profile_report_accounts WHERE id = $1`, id);
  return rows[0] || null;
};

const deleteAccount = async (prisma, id) => exec(prisma, `DELETE FROM profile_report_accounts WHERE id = $1`, id);

/** Refresh posts: walk the timeline again from the newest post and stop at the first page with nothing new. */
const requestRefresh = async (prisma, subjectId) =>
  exec(
    prisma,
    `UPDATE profile_report_accounts
        SET fetch_status = 'pending', fetch_mode = 'refresh', fetch_cursor = NULL, fetch_error = NULL, claimed_at = NULL, updated_at = NOW()
      WHERE subject_id = $1 AND is_draft = FALSE AND fetch_status IN ('done', 'failed')`,
    subjectId
  );

/** Collection that stopped on an error continues from its saved cursor. */
const retryFetch = async (prisma, subjectId) =>
  exec(
    prisma,
    `UPDATE profile_report_accounts SET fetch_status = 'pending', fetch_error = NULL, claimed_at = NULL, updated_at = NOW()
      WHERE subject_id = $1 AND fetch_status = 'failed'`,
    subjectId
  );

/** Posts whose analysis gave up are tried again. */
const retryAnalysis = async (prisma, subjectId) =>
  exec(
    prisma,
    `UPDATE profile_report_posts SET analysis_status = 'pending', analysis_attempts = 0, analysis_error = NULL, claimed_at = NULL
      WHERE subject_id = $1 AND analysis_status = 'failed'`,
    subjectId
  );

/* ------------------------------------------------------------------------------- posts ------------- */

const POST_COLUMNS = [
  'subject_id', 'account_id', 'platform', 'external_id', 'url', 'text', 'author_name', 'author_handle',
  'media_type', 'kind', 'media_urls', 'engagement', 'posted_at', 'raw_data',
];
const CASTS = { media_urls: '::jsonb', engagement: '::jsonb', raw_data: '::jsonb', posted_at: '::timestamptz' };

/**
 * Store one page of collected posts. Posts already stored keep their analysis; only counts and links are refreshed.
 * @returns {{ inserted: number, seen: number }}
 */
const upsertPosts = async (prisma, { subjectId, accountId, platform }, posts, kindOf) => {
  const byId = new Map();
  for (const p of posts) if (p && p.external_id != null && !byId.has(String(p.external_id))) byId.set(String(p.external_id), p);
  const unique = [...byId.values()];
  if (!unique.length) return { inserted: 0, seen: 0 };

  const params = [];
  const tuples = unique.map((p) => {
    const row = {
      subject_id: subjectId,
      account_id: accountId,
      platform,
      external_id: String(p.external_id),
      url: p.url || null,
      text: p.text == null ? null : cleanDeep(String(p.text)),
      author_name: p.author_name || null,
      author_handle: p.author_handle || null,
      media_type: p.media_type || null,
      kind: kindOf(p),
      media_urls: json(p.media_urls, []),
      engagement: json(p.engagement, {}),
      posted_at: p.posted_at ? new Date(p.posted_at).toISOString() : null,
      raw_data: json(p.raw_data, {}),
    };
    const marks = POST_COLUMNS.map((c) => {
      params.push(row[c]);
      return `$${params.length}${CASTS[c] || ''}`;
    });
    return `(${marks.join(', ')})`;
  });

  const rows = await q(
    prisma,
    `INSERT INTO profile_report_posts (${POST_COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}
     ON CONFLICT (account_id, external_id) DO UPDATE SET
       url = EXCLUDED.url, engagement = EXCLUDED.engagement, media_urls = EXCLUDED.media_urls, updated_at = NOW()
     RETURNING (xmax = 0) AS inserted`,
    ...params
  );
  return { inserted: rows.filter((r) => r.inserted).length, seen: unique.length };
};

const SENTIMENTS = ['positive', 'neutral', 'negative'];
const RISKS = ['low', 'medium', 'high', 'critical'];
const STATUSES = { waiting: ['pending', 'processing'], done: ['done'], skipped: ['skipped'], failed: ['failed'] };

/** Posts of a saved profile, newest first, with the analysis the screen shows (no raw payloads). */
const listPosts = async (prisma, subjectId, { platform, sentiment, risk, status, q: text, page = 1, limit = 30 } = {}) => {
  const where = ['p.subject_id = $1'];
  const params = [subjectId];
  const add = (sql, value) => { params.push(value); where.push(sql.split('?').join(`$${params.length}`)); };
  if (platform) add('p.platform = ?', String(platform).toLowerCase());
  if (SENTIMENTS.includes(String(sentiment))) add(`lower(p.analysis_result->>'sentiment') = ?`, String(sentiment));
  if (RISKS.includes(String(risk))) add(`lower(p.analysis_result->>'risk_level') = ?`, String(risk));
  if (STATUSES[status]) add('p.analysis_status = ANY(?::text[])', STATUSES[status]);
  if (String(text || '').trim()) add(`(p.text ILIKE ? OR p.analysis_result->>'english_text' ILIKE ?)`, `%${String(text).trim().replace(/[%_]/g, '\\$&')}%`);
  const clause = where.join(' AND ');
  const size = Math.max(1, Math.min(Number(limit) || 30, 100));
  const pageNo = Math.max(1, Number(page) || 1);

  const [{ n }] = await q(
    prisma,
    `SELECT COUNT(*)::int AS n FROM profile_report_posts p JOIN profile_report_accounts a ON a.id = p.account_id AND a.is_draft = FALSE WHERE ${clause}`,
    ...params
  );
  const rows = await q(
    prisma,
    `SELECT p.id::text AS id, p.account_id, p.platform, p.external_id, p.url, p.text, p.author_name, p.author_handle,
            p.media_type, p.kind, p.media_urls, p.engagement, p.posted_at, p.fetched_at, p.analysis_status, p.analysis_error,
            p.analysis_result, p.image_analysis
       FROM profile_report_posts p JOIN profile_report_accounts a ON a.id = p.account_id AND a.is_draft = FALSE
      WHERE ${clause}
      ORDER BY p.posted_at DESC NULLS LAST, p.id DESC
      LIMIT ${size} OFFSET ${(pageNo - 1) * size}`,
    ...params
  );
  return {
    total: n,
    page: pageNo,
    limit: size,
    total_pages: Math.max(1, Math.ceil(n / size)),
    posts: rows.map(serializePost),
  };
};

/** The text analysis reads for a picture: what is printed on it, or else what it shows. Always readable text. */
const imageTextOf = (img) => {
  if (!img || typeof img !== 'object' || img.failed) return '';
  return mediaTextOf(img, { sep: ' ', visible: false });
};
/** Only the words printed on the picture (OCR), apart from any description of the scene. */
const printedTextOf = (img) => (!img || typeof img !== 'object' || img.failed ? '' : flatten(img.full_text));

const serializePost = (r) => {
  const a = r.analysis_result && typeof r.analysis_result === 'object' ? r.analysis_result : {};
  return {
    id: r.id,
    account_id: r.account_id,
    platform: r.platform,
    url: r.url,
    text: r.text || '',
    author_name: r.author_name,
    author_handle: r.author_handle,
    media_type: r.media_type,
    kind: r.kind,
    media_urls: Array.isArray(r.media_urls) ? r.media_urls.slice(0, 4) : [],
    engagement: r.engagement || {},
    posted_at: r.posted_at,
    fetched_at: r.fetched_at,
    analysis_status: r.analysis_status,
    analysis_error: r.analysis_status === 'failed' ? 'The analysis service could not process this post.' : null,
    analysis: r.analysis_status === 'done' ? {
      sentiment: a.sentiment || null,
      risk_level: a.risk_level || null,
      risk_score: a.risk_score ?? null,
      stance: a.stance || null,
      category: a.category || null,
      summary: a.summary || null,
      language: a.language || null,
      english_text: cleanTranslation(a.english_text),
      matched_keywords: Array.isArray(a.matched_keywords) ? a.matched_keywords.map((k) => (typeof k === 'string' ? k : k?.keyword)).filter(Boolean) : [],
    } : null,
    image_text: printedTextOf(r.image_analysis) || null,
    image_description: sceneOf(r.image_analysis) || null,
  };
};

/**
 * Everything the report reads for one profile: every post of its saved accounts, no limit. Kept lean so a history of
 * tens of thousands of posts stays small in memory: no raw payloads, only the analysis fields the report uses, and
 * long texts cut to what the report can show.
 */
/**
 * One field of a stored JSON document for the report. Text is cut to n characters. A structured value (the image reader
 * sometimes returns an object for a description) is kept whole, because it is small, and made readable in code; only an
 * unusually large one is cut as text.
 */
const leanField = (col, key, n) => `CASE
                WHEN jsonb_typeof(${col}->'${key}') = 'string' THEN to_jsonb(left(${col}->>'${key}', ${n}))
                WHEN length((${col}->'${key}')::text) <= 2000 THEN ${col}->'${key}'
                ELSE to_jsonb(left((${col}->'${key}')::text, ${n})) END`;

const postsForReport = async (prisma, subjectId) =>
  q(
    prisma,
    `SELECT p.id::text AS id, p.platform, p.url, left(p.text, 1500) AS text, p.kind, p.media_type,
            CASE WHEN jsonb_typeof(p.media_urls) = 'array'
                 THEN (CASE WHEN jsonb_array_length(p.media_urls) > 0 THEN '["media"]'::jsonb ELSE '[]'::jsonb END)
                 ELSE '[]'::jsonb END AS media_urls,
            p.engagement, p.posted_at, p.fetched_at, p.analysis_status,
            jsonb_build_object(
              'sentiment', p.analysis_result->'sentiment', 'risk_level', p.analysis_result->'risk_level',
              'risk_score', p.analysis_result->'risk_score', 'stance', p.analysis_result->'stance',
              'category', p.analysis_result->'category', 'summary', to_jsonb(left(p.analysis_result->>'summary', 400)),
              'signals', p.analysis_result->'signals', 'matched_keywords', p.analysis_result->'matched_keywords',
              'legal_sections', p.analysis_result->'legal_sections', 'language', p.analysis_result->'language',
              'english_text', ${leanField('p.analysis_result', 'english_text', 1500)}, 'skipped', p.analysis_result->'skipped'
            ) AS analysis_result,
            jsonb_build_object(
              'full_text', ${leanField('p.image_analysis', 'full_text', 800)},
              'description', ${leanField('p.image_analysis', 'description', 400)},
              'summary', ${leanField('p.image_analysis', 'summary', 400)},
              'failed', p.image_analysis->'failed'
            ) AS image_analysis,
            a.handle AS account_handle
       FROM profile_report_posts p JOIN profile_report_accounts a ON a.id = p.account_id AND a.is_draft = FALSE
      WHERE p.subject_id = $1
      ORDER BY p.posted_at ASC NULLS FIRST, p.id ASC`,
    subjectId
  );

const subjectCounts = async (prisma, subjectId) => (await countsFor(prisma, [subjectId])).get(subjectId) || EMPTY_COUNTS;

/**
 * Posts that were analysed on the broken text "[object Object]" (an image description that arrived as structured data)
 * are put back in the queue. Their stored picture reading is kept, so the image is not read again; only the tone and
 * risk step is repeated, now on readable text. Safe to run any number of times: once re-analysed they no longer match.
 * @returns {Promise<number>} posts re-queued
 */
const requeueGarbledAnalysis = async (prisma) => exec(
  prisma,
  `UPDATE profile_report_posts
      SET analysis_status = 'pending', analysis_attempts = 0, claimed_at = NULL, analysis_error = NULL
    WHERE analysis_status = 'done' AND analysis_result::text LIKE '%[object Object]%'`
);

module.exports = {
  q,
  exec,
  EMPTY_COUNTS,
  createDraftSubject,
  getSubject,
  getSubjectDetail,
  listSubjects,
  deleteSubject,
  discardDrafts,
  finalizeSubject,
  sweepStaleDrafts,
  upsertDraftAccount,
  getAccount,
  deleteAccount,
  requestRefresh,
  retryFetch,
  retryAnalysis,
  upsertPosts,
  listPosts,
  postsForReport,
  subjectCounts,
  requeueGarbledAnalysis,
  imageTextOf,
  printedTextOf,
};
