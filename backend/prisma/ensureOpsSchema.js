/**
 * Shared operational DDL for tenant DBs (and optional main-DB ops bootstrap).
 * Keep in sync with ops models in schema.prisma (not roles/users — those stay on main).
 * Schema only — no seed INSERTs.
 */

/**
 * Create enums + ops tables on the given Prisma client.
 * @param {import('../src/generated/tenant-client').PrismaClient} prisma
 */
async function ensureOpsSchema(prisma) {
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
  await prisma.$executeRawUnsafe(`
    ALTER TABLE platforms ADD COLUMN IF NOT EXISTS blugate_client_key TEXT NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE platforms ADD COLUMN IF NOT EXISTS api_key TEXT NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE platforms ADD COLUMN IF NOT EXISTS low_threshold INTEGER NOT NULL DEFAULT 100
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE platforms ADD COLUMN IF NOT EXISTS medium_threshold INTEGER NOT NULL DEFAULT 500
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE platforms ADD COLUMN IF NOT EXISTS high_threshold INTEGER NOT NULL DEFAULT 1000
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE platforms ADD COLUMN IF NOT EXISTS time_window_minutes INTEGER NOT NULL DEFAULT 60
  `);
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
      CONSTRAINT social_media_accounts_platform_id_handle_key UNIQUE (platform_id, handle)
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'profile'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS poll_interval_minutes INTEGER NOT NULL DEFAULT 30
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS last_fetched_history JSONB NOT NULL DEFAULT '[]'::jsonb
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_grievance_reports_unique_code_key UNIQUE (unique_code),
      CONSTRAINT social_media_grievance_reports_type_grievance_key UNIQUE (report_type, grievance_id)
    )
  `);

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
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_event_media
      ADD COLUMN IF NOT EXISTS analysis_status analysis_status_enum NOT NULL DEFAULT 'pending'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_event_media
      ADD COLUMN IF NOT EXISTS analysis_result JSONB NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_event_media
      ADD COLUMN IF NOT EXISTS analysis_error TEXT NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_event_media
      ADD COLUMN IF NOT EXISTS analysis_attempts INTEGER NOT NULL DEFAULT 0
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_event_media
      ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ NULL
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_event_media_analysis_status_fetched_at_idx
    ON social_media_event_media (analysis_status, fetched_at)
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
    CREATE INDEX IF NOT EXISTS audit_logs_resource_type_created_at_idx ON audit_logs (resource_type, created_at DESC)
  `);
}

module.exports = {
  ensureOpsSchema,
};
