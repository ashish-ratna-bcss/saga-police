/**
 * Tools → Profile Report: the tenant's own tables.
 *
 * Kept apart from the Profile Catalog on purpose: a report profile is looked at once, not monitored, so its
 * posts never reach alerts, relevance scores or the monitoring scheduler. Created on first use (like E-Paper),
 * one set per tenant database.
 *
 *   profile_report_subjects   the person / page being studied
 *   profile_report_accounts   one row per platform account, with its collection progress (cursor, pages, posts)
 *   profile_report_posts      every collected post, with its own OCR / sentiment / risk analysis
 *   profile_report_reports    the saved AI report (one per subject)
 */
const ready = new WeakMap(); // prisma client -> Promise

const DDL = [
  `CREATE TABLE IF NOT EXISTS profile_report_subjects (
     id SERIAL PRIMARY KEY,
     display_name TEXT NOT NULL DEFAULT '',
     notes TEXT NULL,
     status TEXT NOT NULL DEFAULT 'draft',
     created_by INTEGER NULL,
     created_by_name TEXT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS profile_report_accounts (
     id SERIAL PRIMARY KEY,
     subject_id INTEGER NOT NULL REFERENCES profile_report_subjects(id) ON DELETE CASCADE,
     platform TEXT NOT NULL,
     handle TEXT NOT NULL,
     data JSONB NOT NULL DEFAULT '{}'::jsonb,
     preview_data JSONB NOT NULL DEFAULT '{}'::jsonb,
     is_draft BOOLEAN NOT NULL DEFAULT TRUE,
     fetch_status TEXT NOT NULL DEFAULT 'pending',
     fetch_mode TEXT NOT NULL DEFAULT 'full',
     fetch_cursor TEXT NULL,
     fetch_pages INTEGER NOT NULL DEFAULT 0,
     posts_fetched INTEGER NOT NULL DEFAULT 0,
     fetch_error TEXT NULL,
     claimed_at TIMESTAMPTZ NULL,
     started_at TIMESTAMPTZ NULL,
     finished_at TIMESTAMPTZ NULL,
     last_fetched_at TIMESTAMPTZ NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS profile_report_accounts_identity_idx
     ON profile_report_accounts (subject_id, platform, lower(handle))`,
  `CREATE INDEX IF NOT EXISTS profile_report_accounts_fetch_idx
     ON profile_report_accounts (fetch_status) WHERE fetch_status IN ('pending', 'running')`,
  `CREATE TABLE IF NOT EXISTS profile_report_posts (
     id BIGSERIAL PRIMARY KEY,
     subject_id INTEGER NOT NULL REFERENCES profile_report_subjects(id) ON DELETE CASCADE,
     account_id INTEGER NOT NULL REFERENCES profile_report_accounts(id) ON DELETE CASCADE,
     platform TEXT NOT NULL,
     external_id TEXT NOT NULL,
     url TEXT NULL,
     text TEXT NULL,
     author_name TEXT NULL,
     author_handle TEXT NULL,
     media_type TEXT NULL,
     kind TEXT NOT NULL DEFAULT 'original',
     media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
     engagement JSONB NOT NULL DEFAULT '{}'::jsonb,
     posted_at TIMESTAMPTZ NULL,
     raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
     image_analysis JSONB NULL,
     analysis_status TEXT NOT NULL DEFAULT 'pending',
     analysis_attempts INTEGER NOT NULL DEFAULT 0,
     analysis_error TEXT NULL,
     analysis_result JSONB NOT NULL DEFAULT '{}'::jsonb,
     analyzed_at TIMESTAMPTZ NULL,
     claimed_at TIMESTAMPTZ NULL,
     fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT profile_report_posts_account_ext_key UNIQUE (account_id, external_id)
   )`,
  `CREATE INDEX IF NOT EXISTS profile_report_posts_subject_idx
     ON profile_report_posts (subject_id, posted_at DESC NULLS LAST, id DESC)`,
  `CREATE INDEX IF NOT EXISTS profile_report_posts_todo_idx
     ON profile_report_posts (analysis_status, posted_at DESC NULLS LAST, id DESC)
     WHERE analysis_status IN ('pending', 'processing')`,
  `CREATE TABLE IF NOT EXISTS profile_report_reports (
     subject_id INTEGER PRIMARY KEY REFERENCES profile_report_subjects(id) ON DELETE CASCADE,
     report JSONB NOT NULL DEFAULT '{}'::jsonb,
     facts JSONB NOT NULL DEFAULT '{}'::jsonb,
     evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
     summary_source TEXT NOT NULL DEFAULT 'llm',
     llm_notice TEXT NULL,
     model TEXT NULL,
     posts_count INTEGER NOT NULL DEFAULT 0,
     analysed_count INTEGER NOT NULL DEFAULT 0,
     last_post_id BIGINT NULL,
     generated_by_id INTEGER NULL,
     generated_by_name TEXT NULL,
     generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // The first version of the report lived in the Profile Catalog; it was removed and its table is dropped.
  'DROP TABLE IF EXISTS social_profile_behavior_reports',
];

/** Several API processes may create the tables at the same moment; the loser of that race just runs the statement again. */
const run = async (prisma, sql) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (err) {
      const raced = /already exists|duplicate key|tuple concurrently updated/i.test(String(err?.message || ''));
      if (!raced || attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
};

/** Create the tables once per Prisma client. A failed attempt is retried on the next call. */
const ensureTables = (prisma) => {
  if (!ready.has(prisma)) {
    const p = (async () => {
      for (const sql of DDL) await run(prisma, sql);
    })();
    p.catch(() => ready.delete(prisma));
    ready.set(prisma, p);
  }
  return ready.get(prisma);
};

module.exports = { ensureTables, DDL };
