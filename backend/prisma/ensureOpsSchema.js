/**
 * Shared operational DDL for tenant DBs (and optional main-DB ops bootstrap).
 * Keep in sync with ops models in schema.prisma (not roles/users — those stay on main).
 * Schema only — no seed INSERTs.
 *
 * Also ensures embeddings.* (documents / chunks / jobs) for future AI retrieval.
 */

const { ensureEmbeddingsSchema } = require('./ensureEmbeddingsSchema');
const { withTenantSchemaLockRetry } = require('./schemaLock');

/** Once per Prisma client instance — EventScheduler/requests must not re-run DDL. */
const ensuredClients = new WeakMap();
/** After a failed/busy ensure, skip retries briefly so we do not pile AccessExclusive waits. */
const ensureCooldownUntil = new WeakMap();
const ENSURE_FAIL_COOLDOWN_MS = 30_000;

const IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * Skip ALTER when the column already exists. ADD COLUMN IF NOT EXISTS still
 * takes ACCESS EXCLUSIVE and, once queued, blocks every read on that table
 * for as long as embeddings.process_pending_jobs holds its own lock.
 * Identifiers are code constants only (never user input).
 */
async function addColumnIfMissing(prisma, table, column, typeSql) {
  if (!IDENT.test(table) || !IDENT.test(column)) {
    throw new Error(`unsafe identifier: ${table}.${column}`);
  }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = '${table}'
       AND a.attname = '${column}'
       AND a.attnum > 0
       AND NOT a.attisdropped
     LIMIT 1`
  );
  if (Array.isArray(rows) && rows.length > 0) return;

  // NOWAIT: fail immediately instead of joining the lock queue. A queued
  // AccessExclusive blocks new reads even while it is still waiting.
  try {
    await prisma.$executeRawUnsafe(
      `LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE NOWAIT`
    );
  } catch (err) {
    const msg = String(err?.message || err);
    if (/could not obtain lock|lock not available|55P03/i.test(msg)) {
      const busy = new Error(`schema ensure skipped alter ${table}.${column}: table busy`);
      busy.code = '55P03';
      throw busy;
    }
    throw err;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${typeSql}`
  );
}

async function createIndexIfMissing(prisma, indexName, createSql) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 AS ok FROM pg_class WHERE relkind = 'i' AND relname = $1 LIMIT 1`,
    indexName
  );
  if (Array.isArray(rows) && rows.length > 0) return;
  await prisma.$executeRawUnsafe(createSql);
}

/**
 * Create enums + ops tables on the given Prisma client.
 * @param {import('../src/generated/tenant-client').PrismaClient} prisma
 * @param {{ locked?: boolean, force?: boolean }} [opts] pass locked:true when caller already holds schema lock
 */
async function ensureOpsSchema(prisma, opts = {}) {
  if (!opts.locked) {
    if (!opts.force) {
      const existing = ensuredClients.get(prisma);
      if (existing) return existing;
      const coolUntil = ensureCooldownUntil.get(prisma) || 0;
      if (Date.now() < coolUntil) return;
    }
    const run = withTenantSchemaLockRetry(prisma, (tx) =>
      ensureOpsSchema(tx, { locked: true })
    ).catch((err) => {
      ensuredClients.delete(prisma);
      ensureCooldownUntil.set(prisma, Date.now() + ENSURE_FAIL_COOLDOWN_MS);
      throw err;
    });
    ensuredClients.set(prisma, run);
    return run;
  }

  // Fail fast on lock waits — never sit behind process_pending_jobs holding AccessExclusive.
  await prisma.$executeRawUnsafe(`SET LOCAL lock_timeout = '2s'`);
  await prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = '45s'`);

  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE monitoring_status_enum AS ENUM ('started', 'stopped');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE analysis_status_enum AS ENUM ('pending', 'processing', 'done', 'failed', 'skipped');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_profiles (
      id SERIAL PRIMARY KEY,
      display_name TEXT NULL,
      notes TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS platforms (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      icon TEXT NULL,
      color TEXT NULL,
      fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      blugate_client_key TEXT NULL,
      api_key TEXT NULL,
      low_threshold INTEGER NOT NULL DEFAULT 100,
      medium_threshold INTEGER NOT NULL DEFAULT 500,
      high_threshold INTEGER NOT NULL DEFAULT 1000,
      time_window_minutes INTEGER NOT NULL DEFAULT 60,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await addColumnIfMissing(prisma, 'platforms', 'blugate_client_key', 'TEXT NULL');
  await addColumnIfMissing(prisma, 'platforms', 'api_key', 'TEXT NULL');
  await addColumnIfMissing(prisma, 'platforms', 'low_threshold', 'INTEGER NOT NULL DEFAULT 100');
  await addColumnIfMissing(prisma, 'platforms', 'medium_threshold', 'INTEGER NOT NULL DEFAULT 500');
  await addColumnIfMissing(prisma, 'platforms', 'high_threshold', 'INTEGER NOT NULL DEFAULT 1000');
  await addColumnIfMissing(prisma, 'platforms', 'time_window_minutes', 'INTEGER NOT NULL DEFAULT 60');
  // One-time copy from legacy alert_thresholds (if that table still exists).
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF to_regclass('public.alert_thresholds') IS NOT NULL THEN
        UPDATE platforms p
        SET
          low_threshold = t.low_threshold,
          medium_threshold = t.medium_threshold,
          high_threshold = t.high_threshold,
          time_window_minutes = t.time_window_minutes
        FROM alert_thresholds t
        WHERE t.platform = p.slug;
      END IF;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_accounts (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER NOT NULL REFERENCES social_media_profiles(id) ON DELETE CASCADE,
      platform_id INTEGER NOT NULL REFERENCES platforms(id),
      handle TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      preview_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      type TEXT NOT NULL DEFAULT 'profile',
      is_active BOOLEAN NOT NULL DEFAULT true,
      poll_interval_minutes INTEGER NOT NULL DEFAULT 30,
      monitoring_status monitoring_status_enum NOT NULL DEFAULT 'stopped',
      monitoring_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_fetched_at TIMESTAMPTZ NULL,
      last_fetched_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_accounts_platform_id_handle_type_key UNIQUE (platform_id, handle, type)
    )
  `);
  await addColumnIfMissing(prisma, 'social_media_accounts', 'type', `TEXT NOT NULL DEFAULT 'profile'`);
  await addColumnIfMissing(prisma, 'social_media_accounts', 'poll_interval_minutes', 'INTEGER NOT NULL DEFAULT 30');
  await addColumnIfMissing(prisma, 'social_media_accounts', 'last_fetched_at', 'TIMESTAMPTZ NULL');
  await addColumnIfMissing(
    prisma,
    'social_media_accounts',
    'last_fetched_history',
    `JSONB NOT NULL DEFAULT '[]'::jsonb`
  );
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'social_media_accounts_platform_id_handle_key'
      ) THEN
        ALTER TABLE social_media_accounts 
        DROP CONSTRAINT social_media_accounts_platform_id_handle_key;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'social_media_accounts_platform_id_handle_type_key'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'social_media_accounts_platform_id_handle_type_key'
      ) THEN
        ALTER TABLE social_media_accounts
        ADD CONSTRAINT social_media_accounts_platform_id_handle_type_key UNIQUE (platform_id, handle, type);
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_posts (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES social_media_accounts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NULL,
      text TEXT NULL,
      author_name TEXT NULL,
      author_handle TEXT NULL,
      media_type TEXT NULL,
      media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      engagement JSONB NOT NULL DEFAULT '{}'::jsonb,
      posted_at TIMESTAMPTZ NULL,
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      analysis_status analysis_status_enum NOT NULL DEFAULT 'pending',
      analysis_attempts INTEGER NOT NULL DEFAULT 0,
      analysis_error TEXT NULL,
      analysis_result JSONB NOT NULL DEFAULT '{}'::jsonb,
      analyzed_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_posts_platform_external_id_key UNIQUE (platform, external_id)
    )
  `);

  await addColumnIfMissing(
    prisma,
    'social_media_posts',
    'image_analysis',
    `JSONB NOT NULL DEFAULT '{}'::jsonb`
  );

  await createIndexIfMissing(
    prisma,
    'social_media_posts_analysis_status_posted_at_idx',
    `CREATE INDEX IF NOT EXISTS social_media_posts_analysis_status_posted_at_idx
     ON social_media_posts (analysis_status, posted_at, fetched_at, id)`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_alerts (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES social_media_posts(id) ON DELETE CASCADE,
      account_id INTEGER NULL,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NULL,
      content_url TEXT NULL,
      author TEXT NULL,
      author_handle TEXT NULL,
      alert_type TEXT NOT NULL DEFAULT 'ai_risk',
      risk_level TEXT NOT NULL,
      risk_score INTEGER NOT NULL DEFAULT 0,
      sentiment TEXT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_read BOOLEAN NOT NULL DEFAULT false,
      matched_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
      analysis_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      posted_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_alerts_platform_external_id_key UNIQUE (platform, external_id)
    )
  `);

  await addColumnIfMissing(
    prisma,
    'social_media_alerts',
    'image_analysis',
    `JSONB NOT NULL DEFAULT '{}'::jsonb`
  );

  await createIndexIfMissing(
    prisma,
    'social_media_alerts_status_posted_at_id_idx',
    `CREATE INDEX IF NOT EXISTS social_media_alerts_status_posted_at_id_idx
     ON social_media_alerts (status, posted_at DESC NULLS LAST, id DESC)`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_grievances (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES social_media_accounts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      complaint_code TEXT NULL,
      tagged_account TEXT NOT NULL,
      workflow_status TEXT NOT NULL DEFAULT 'received',
      classification TEXT NOT NULL DEFAULT 'unclassified',
      is_active BOOLEAN NOT NULL DEFAULT true,
      author_name TEXT NULL,
      author_handle TEXT NULL,
      content_url TEXT NULL,
      text TEXT NULL,
      posted_by JSONB NOT NULL DEFAULT '{}'::jsonb,
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      engagement JSONB NOT NULL DEFAULT '{}'::jsonb,
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      posted_at TIMESTAMPTZ NULL,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_grievances_platform_external_id_key UNIQUE (platform, external_id)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_grievance_reports (
      id TEXT PRIMARY KEY,
      report_type TEXT NOT NULL,
      unique_code TEXT NOT NULL,
      grievance_id TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'x',
      status TEXT NOT NULL DEFAULT 'PENDING',
      category TEXT NOT NULL DEFAULT 'Others',
      complaint_phone TEXT NOT NULL DEFAULT '',
      profile_id TEXT NULL,
      profile_link TEXT NULL,
      post_link TEXT NULL,
      post_date TIMESTAMPTZ NULL,
      post_description TEXT NULL,
      remarks TEXT NULL,
      message TEXT NULL,
      posted_by JSONB NOT NULL DEFAULT '{}'::jsonb,
      engagement JSONB NOT NULL DEFAULT '{}'::jsonb,
      informed_to JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by JSONB NOT NULL DEFAULT '{}'::jsonb,
      media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      media_s3_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      shared_at TIMESTAMPTZ NULL,
      shared_via TEXT NULL,
      action_taken_at TIMESTAMPTZ NULL,
      closed_at TIMESTAMPTZ NULL,
      escalated_at TIMESTAMPTZ NULL,
      report_pdf_url TEXT NULL,
      pdf_base64 TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_grievance_reports_unique_code_key UNIQUE (unique_code),
      CONSTRAINT social_media_grievance_reports_type_grievance_key UNIQUE (report_type, grievance_id)
    )
  `);

  await addColumnIfMissing(prisma, 'social_media_grievance_reports', 'pdf_base64', 'TEXT');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_grievance_contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT '',
      designation TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS keywords (
      id SERIAL PRIMARY KEY,
      keyword TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT keywords_keyword_key UNIQUE (keyword)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_occasion_calendar (
      id SERIAL PRIMARY KEY,
      sl_no INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      date_label TEXT NOT NULL DEFAULT '',
      monitoring_range TEXT NOT NULL DEFAULT '',
      suggested_keywords TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      platforms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      is_recurring BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_events (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_date TIMESTAMPTZ NULL,
      end_date TIMESTAMPTZ NULL,
      location TEXT NOT NULL DEFAULT '',
      platforms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
      high_risk_threshold INTEGER NULL,
      medium_risk_threshold INTEGER NULL,
      polling_interval_minutes INTEGER NOT NULL DEFAULT 60,
      monitoring_status monitoring_status_enum NOT NULL DEFAULT 'stopped',
      monitoring_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_fetched_at TIMESTAMPTZ NULL,
      last_fetched_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      origin TEXT NOT NULL DEFAULT 'manual',
      occasion_calendar_id INTEGER NULL REFERENCES social_media_occasion_calendar(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_event_media (
      id BIGSERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES social_media_events(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NULL,
      text TEXT NULL,
      author_name TEXT NULL,
      author_handle TEXT NULL,
      engagement JSONB NOT NULL DEFAULT '{}'::jsonb,
      media JSONB NOT NULL DEFAULT '[]'::jsonb,
      raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      posted_at TIMESTAMPTZ NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_event_media_event_platform_external_key UNIQUE (event_id, platform, external_id)
    )
  `);

  // Sentiment pipeline columns on event discoveries (same enum as catalog posts)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE analysis_status_enum AS ENUM ('pending', 'processing', 'done', 'failed', 'skipped');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await addColumnIfMissing(
    prisma,
    'social_media_event_media',
    'analysis_status',
    `analysis_status_enum NOT NULL DEFAULT 'pending'`
  );
  await addColumnIfMissing(prisma, 'social_media_event_media', 'analysis_result', `JSONB NULL`);
  await addColumnIfMissing(prisma, 'social_media_event_media', 'analysis_error', `TEXT NULL`);
  await addColumnIfMissing(
    prisma,
    'social_media_event_media',
    'analysis_attempts',
    `INTEGER NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(prisma, 'social_media_event_media', 'analyzed_at', `TIMESTAMPTZ NULL`);
  await addColumnIfMissing(
    prisma,
    'social_media_event_media',
    'image_analysis',
    `JSONB NOT NULL DEFAULT '{}'::jsonb`
  );
  await createIndexIfMissing(
    prisma,
    'social_media_event_media_analysis_status_fetched_at_idx',
    `CREATE INDEX IF NOT EXISTS social_media_event_media_analysis_status_fetched_at_idx
     ON social_media_event_media (analysis_status, fetched_at)`
  );
  await createIndexIfMissing(
    prisma,
    'social_media_event_media_analysis_status_posted_at_idx',
    `CREATE INDEX IF NOT EXISTS social_media_event_media_analysis_status_posted_at_idx
     ON social_media_event_media (analysis_status, posted_at, fetched_at, id)`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_event_summaries (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      event_id INTEGER NOT NULL REFERENCES social_media_events(id) ON DELETE CASCADE,
      summary_markdown TEXT NOT NULL,
      summary_source TEXT NOT NULL DEFAULT 'llm',
      llm_finish_reason TEXT NULL,
      summary_truncated BOOLEAN NOT NULL DEFAULT false,
      llm_error TEXT NULL,
      model TEXT NULL,
      stats JSONB NOT NULL DEFAULT '{}'::jsonb,
      evidence_traceability JSONB NOT NULL DEFAULT '[]'::jsonb,
      event_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      posts_snapshot_count INTEGER NOT NULL DEFAULT 0,
      last_media_id BIGINT NULL,
      pdf_base64 TEXT NULL,
      generated_by_id INTEGER NULL,
      generated_by_name TEXT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_event_summaries_event_id_key UNIQUE (event_id)
    )
  `);
  await addColumnIfMissing(prisma, 'social_media_event_summaries', 'generated_by_id', 'INTEGER');
  await addColumnIfMissing(prisma, 'social_media_event_summaries', 'generated_by_name', 'TEXT');
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_event_summaries_event_id_idx
    ON social_media_event_summaries (event_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS alert_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      risk_threshold_high INTEGER NOT NULL DEFAULT 70,
      risk_threshold_medium INTEGER NOT NULL DEFAULT 40,
      velocity_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS report_templates (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'all',
      html_content TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_by TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS policy_mappings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      category_id TEXT NOT NULL UNIQUE,
      definition TEXT NOT NULL,
      legal_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
      platform_policies JSONB NOT NULL DEFAULT '{}'::jsonb,
      keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      severity_level TEXT NOT NULL DEFAULT 'Medium',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

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

  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id INTEGER NULL,
      username TEXT NULL,
      email TEXT NULL,
      name TEXT NULL,
      role_slug TEXT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NULL,
      resource_id TEXT NULL,
      method TEXT NULL,
      path TEXT NULL,
      old_data JSONB NULL,
      new_data JSONB NULL,
      details JSONB NULL,
      ip TEXT NULL,
      user_agent TEXT NULL,
      device_label TEXT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS audit_logs_user_id_created_at_idx ON audit_logs (user_id, created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS audit_logs_action_created_at_idx ON audit_logs (action, created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_periscope_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_date DATE NOT NULL,
      day_of_week VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      organization VARCHAR(255) NOT NULL DEFAULT 'SPECIAL BRANCH POLICE',
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      programmes JSONB NOT NULL DEFAULT '[]'::jsonb,
      abstract JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT NULL,
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT periscope_reports_date_key UNIQUE (report_date)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS periscope_reports_date_idx ON social_media_periscope_reports (report_date DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS blugate_platform_meta (
      slug VARCHAR(80) PRIMARY KEY,
      base_url TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'available',
      last_seen_at TIMESTAMPTZ NULL,
      raw JSONB NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const [column, typeSql] of [
    ['app_slug', 'VARCHAR(80) NULL'],
    ['name', 'VARCHAR(120) NULL'],
    ['blugate_id', 'VARCHAR(40) NULL'],
    ['version', 'VARCHAR(40) NULL'],
    ['health', 'VARCHAR(40) NULL'],
    ['endpoint_count', 'INTEGER NULL'],
    ['change', 'VARCHAR(30) NULL'],
    ['first_seen_at', 'TIMESTAMPTZ NULL'],
  ]) {
    await addColumnIfMissing(prisma, 'blugate_platform_meta', column, typeSql);
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS custom_endpoints (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NULL,
      auth_header VARCHAR(80) NOT NULL DEFAULT 'Authorization',
      auth_scheme VARCHAR(40) NOT NULL DEFAULT 'Bearer',
      notes TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // AI embeddings store — same on every tenant; safe to re-run.
  // Do NOT schedule pg_cron here: CREATE EXTENSION failures abort this
  // transaction and roll back ops DDL. Cron is scheduled after commit
  // from ensureTenantSchema / provisionAdminDatabase.
  await ensureEmbeddingsSchema(prisma, { locked: true });
}

module.exports = {
  ensureOpsSchema,
};
