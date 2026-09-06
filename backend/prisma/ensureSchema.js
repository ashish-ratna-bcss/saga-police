/**
 * Ensure Postgres has tables matching prisma/schema.prisma.
 * Handles the roles + users.role_id migration without force-reset.
 * Migrates legacy fat social_media_profiles → profiles + accounts.
 */
require('dotenv').config();

const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const { ACCESS_FEATURES } = require('../src/modules/auth/access_features');

const BACKEND_ROOT = path.join(__dirname, '..');
const EXPECTED_TABLES = 18;

async function countPublicTables(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `;
  return rows[0]?.count ?? 0;
}

async function hasRolesTable(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT to_regclass('public.roles') IS NOT NULL AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function hasUsersRoleId(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'role_id'
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function tableExists(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public.${name}') IS NOT NULL AS exists`
  );
  return Boolean(rows[0]?.exists);
}

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = '${table}'
        AND column_name = '${column}'
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

const pagesFor = (role) => (ACCESS_FEATURES[role] || []).map((item) => item.path);

/**
 * Create roles + backfill users.role_id before prisma db push can set NOT NULL.
 */
async function migrateRolesAndRoleId(prisma) {
  console.log('[postgres] preparing roles + users.role_id…');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      allowed_pages TEXT[] NOT NULL DEFAULT '{}',
      assignable_by TEXT[] NOT NULL DEFAULT '{superadmin}',
      can_manage_users BOOLEAN NOT NULL DEFAULT false,
      can_manage_roles BOOLEAN NOT NULL DEFAULT false,
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS assignable_by TEXT[] NOT NULL DEFAULT '{superadmin}'
  `);

  const systemRoles = [
    {
      slug: 'superadmin',
      name: 'Super Admin',
      pages: pagesFor('superadmin'),
      assignable_by: ['superadmin'],
      can_manage_users: true,
      can_manage_roles: true,
    },
    {
      slug: 'admin',
      name: 'Admin',
      pages: pagesFor('admin'),
      assignable_by: ['superadmin'],
      can_manage_users: true,
      can_manage_roles: false,
    },
    {
      slug: 'user',
      name: 'User',
      pages: pagesFor('user'),
      assignable_by: ['superadmin', 'admin'],
      can_manage_users: false,
      can_manage_roles: false,
    },
  ];

  for (const role of systemRoles) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO roles (name, slug, allowed_pages, assignable_by, can_manage_users, can_manage_roles, is_system)
      VALUES ($1, $2, $3::text[], $4::text[], $5, $6, true)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        allowed_pages = EXCLUDED.allowed_pages,
        can_manage_users = EXCLUDED.can_manage_users,
        can_manage_roles = EXCLUDED.can_manage_roles,
        is_system = true,
        updated_at = NOW()
      `,
      role.name,
      role.slug,
      role.pages,
      role.assignable_by,
      role.can_manage_users,
      role.can_manage_roles
    );
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role_id INTEGER
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE users
    SET role_id = (SELECT id FROM roles WHERE slug = 'superadmin' LIMIT 1)
    WHERE role_id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ALTER COLUMN role_id SET NOT NULL
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_role_id_fkey'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_role_id_fkey
        FOREIGN KEY (role_id) REFERENCES roles(id);
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE users DROP COLUMN IF EXISTS role
  `);

  console.log('[postgres] roles + users.role_id ready');
}

async function ensureUserThemeColumns(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ui_mode TEXT NOT NULL DEFAULT 'light'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ALTER COLUMN ui_mode SET DEFAULT 'light'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS theme_color TEXT NOT NULL DEFAULT '#1e3a8a'
  `);
}

async function ensurePlatformFields(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE platforms
    ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE platforms SET fields = '[
      {"key":"username","label":"Username","type":"text","required":true,"placeholder":"e.g. narendramodi"}
    ]'::jsonb
    WHERE slug IN ('x', 'twitter', 'instagram')
      AND (fields = '[]'::jsonb OR fields IS NULL)
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE platforms SET fields = '[
      {"key":"url","label":"Page URL","type":"url","required":true,"placeholder":"https://facebook.com/..."},
      {"key":"page_id","label":"Page ID","type":"text","required":false,"placeholder":"optional numeric id"}
    ]'::jsonb
    WHERE slug = 'facebook'
      AND (fields = '[]'::jsonb OR fields IS NULL)
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE platforms SET fields = '[
      {"key":"channel_url","label":"Channel URL","type":"url","required":true,"placeholder":"https://youtube.com/@..."},
      {"key":"channel_id","label":"Channel ID","type":"text","required":false,"placeholder":"UCxxxxxxxx"}
    ]'::jsonb
    WHERE slug = 'youtube'
      AND (fields = '[]'::jsonb OR fields IS NULL)
  `);
}

/**
 * Split legacy social_media_profiles (platform+monitoring on one row)
 * into social_media_profiles (main) + social_media_accounts (platform).
 *
 * Uses raw SQL only — never `prisma db push --accept-data-loss` mid-migration
 * (that would drop the renamed *_legacy tables).
 */
async function migrateCatalogSplit(prisma) {
  if (!(await tableExists(prisma, 'social_media_profiles'))) return false;

  const alreadySplit =
    (await tableExists(prisma, 'social_media_accounts')) &&
    !(await columnExists(prisma, 'social_media_profiles', 'platform_id'));
  if (alreadySplit) return false;

  const legacyShape = await columnExists(prisma, 'social_media_profiles', 'platform_id');
  if (!legacyShape) return false;

  console.log('[postgres] migrating catalog: profiles → profiles + accounts…');

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE monitoring_status_enum AS ENUM ('started', 'stopped');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Rename fat tables out of the way (keep data)
  if (!(await tableExists(prisma, 'social_media_profiles_legacy'))) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE social_media_profiles RENAME TO social_media_profiles_legacy'
    );
  }
  if (
    (await tableExists(prisma, 'social_media_posts')) &&
    (await columnExists(prisma, 'social_media_posts', 'profile_id')) &&
    !(await tableExists(prisma, 'social_media_posts_legacy'))
  ) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE social_media_posts RENAME TO social_media_posts_legacy'
    );
  }

  // Create slim profile + accounts + posts (match schema.prisma)
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
    CREATE INDEX IF NOT EXISTS social_media_profiles_is_active_idx
    ON social_media_profiles (is_active)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS social_media_accounts (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER NOT NULL REFERENCES social_media_profiles(id) ON DELETE CASCADE,
      platform_id INTEGER NOT NULL REFERENCES platforms(id),
      handle TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      preview_data JSONB NOT NULL DEFAULT '{}'::jsonb,
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
    CREATE INDEX IF NOT EXISTS social_media_accounts_profile_id_idx ON social_media_accounts (profile_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_accounts_platform_id_idx ON social_media_accounts (platform_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_accounts_is_active_idx ON social_media_accounts (is_active)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_accounts_monitoring_status_idx ON social_media_accounts (monitoring_status)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_accounts_last_fetched_at_idx ON social_media_accounts (last_fetched_at)
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
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT social_media_posts_platform_external_id_key UNIQUE (platform, external_id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_posts_account_id_posted_at_idx
    ON social_media_posts (account_id, posted_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_posts_fetched_at_idx ON social_media_posts (fetched_at)
  `);

  const legacyRows = await prisma.$queryRawUnsafe(
    'SELECT * FROM social_media_profiles_legacy ORDER BY id ASC'
  );
  console.log(`[postgres] moving ${legacyRows.length} legacy profile row(s)…`);

  const entityToProfileId = new Map();
  const legacyIdToAccountId = new Map();

  for (const row of legacyRows) {
    const entityKey = row.entity_id || `solo-${row.id}`;
    let profileId = entityToProfileId.get(entityKey);
    if (!profileId) {
      const created = await prisma.$queryRawUnsafe(
        `INSERT INTO social_media_profiles (display_name, notes, is_active)
         VALUES ($1, $2, $3)
         RETURNING id`,
        row.display_name || null,
        row.notes || null,
        row.is_active !== false
      );
      profileId = created[0].id;
      entityToProfileId.set(entityKey, profileId);
    }

    const createdAcc = await prisma.$queryRawUnsafe(
      `INSERT INTO social_media_accounts (
         profile_id, platform_id, handle, data, preview_data, is_active,
         poll_interval_minutes, monitoring_status, monitoring_logs,
         last_fetched_at, last_fetched_history
       ) VALUES (
         $1, $2, $3, $4::jsonb, $5::jsonb, $6,
         $7, $8::monitoring_status_enum, $9::jsonb,
         $10, $11::jsonb
       )
       RETURNING id`,
      profileId,
      row.platform_id,
      row.handle,
      JSON.stringify(row.data || {}),
      JSON.stringify(row.preview_data || {}),
      row.is_active !== false,
      row.poll_interval_minutes || 30,
      row.monitoring_status || 'stopped',
      JSON.stringify(row.monitoring_logs || []),
      row.last_fetched_at || null,
      JSON.stringify(row.last_fetched_history || [])
    );
    legacyIdToAccountId.set(row.id, createdAcc[0].id);
  }

  if (await tableExists(prisma, 'social_media_posts_legacy')) {
    const posts = await prisma.$queryRawUnsafe(
      'SELECT * FROM social_media_posts_legacy ORDER BY id ASC'
    );
    console.log(`[postgres] moving ${posts.length} post(s)…`);
    for (const post of posts) {
      const accountId = legacyIdToAccountId.get(post.profile_id);
      if (!accountId) continue;
      await prisma.$executeRawUnsafe(
        `INSERT INTO social_media_posts (
           account_id, platform, external_id, url, text, author_name, author_handle,
           media_type, media_urls, engagement, posted_at, raw_data, fetched_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13
         )
         ON CONFLICT (platform, external_id) DO NOTHING`,
        accountId,
        post.platform,
        String(post.external_id),
        post.url || null,
        post.text || null,
        post.author_name || null,
        post.author_handle || null,
        post.media_type || null,
        JSON.stringify(post.media_urls || []),
        JSON.stringify(post.engagement || {}),
        post.posted_at || null,
        JSON.stringify(post.raw_data || {}),
        post.fetched_at || new Date()
      );
    }
  }

  console.log('[postgres] catalog split complete (drop *_legacy manually when happy)');
  return true;
}

async function ensureCatalogColumns(prisma) {
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

  if (!(await tableExists(prisma, 'social_media_accounts'))) return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS preview_data JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS monitoring_logs JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS last_fetched_history JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS poll_interval_minutes INTEGER NOT NULL DEFAULT 30
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_accounts
    ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ NULL
  `);

  if (!(await tableExists(prisma, 'social_media_posts'))) return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_posts
    ADD COLUMN IF NOT EXISTS analysis_status analysis_status_enum NOT NULL DEFAULT 'pending'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_posts
    ADD COLUMN IF NOT EXISTS analysis_attempts INTEGER NOT NULL DEFAULT 0
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_posts
    ADD COLUMN IF NOT EXISTS analysis_error TEXT NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_posts
    ADD COLUMN IF NOT EXISTS analysis_result JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_posts
    ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ NULL
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_posts_analysis_status_fetched_at_idx
    ON social_media_posts (analysis_status, fetched_at)
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
    CREATE INDEX IF NOT EXISTS social_media_alerts_status_created_at_idx
    ON social_media_alerts (status, created_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_alerts_risk_level_created_at_idx
    ON social_media_alerts (risk_level, created_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_alerts_post_id_idx
    ON social_media_alerts (post_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_alerts_account_id_idx
    ON social_media_alerts (account_id)
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
    CREATE INDEX IF NOT EXISTS social_media_grievances_account_id_posted_at_idx
    ON social_media_grievances (account_id, posted_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_grievances_workflow_status_posted_at_idx
    ON social_media_grievances (workflow_status, posted_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_grievances_platform_posted_at_idx
    ON social_media_grievances (platform, posted_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_grievances_is_active_posted_at_idx
    ON social_media_grievances (is_active, posted_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_grievances_tagged_account_idx
    ON social_media_grievances (tagged_account)
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
    CREATE INDEX IF NOT EXISTS social_media_grievance_reports_type_status_created_at_idx
    ON social_media_grievance_reports (report_type, status, created_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_grievance_reports_grievance_id_idx
    ON social_media_grievance_reports (grievance_id)
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
    CREATE INDEX IF NOT EXISTS social_media_grievance_contacts_is_active_name_idx
    ON social_media_grievance_contacts (is_active, name)
  `);

  // Unique-code sequences (replaces social_media_grievance_report_counters table)
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS social_media_grievance_report_seq_g`);
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS social_media_grievance_report_seq_s`);
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS social_media_grievance_report_seq_c`);
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS social_media_grievance_report_seq_q`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS social_media_grievance_report_counters`);

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
    CREATE INDEX IF NOT EXISTS keywords_keyword_idx ON keywords (keyword)
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
    ALTER TABLE social_media_occasion_calendar
    ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_occasion_calendar_is_recurring_sl_no_idx
    ON social_media_occasion_calendar (is_recurring, sl_no)
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

  // Migrate legacy columns → Profiles-style monitoring fields
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE monitoring_status_enum AS ENUM ('started', 'stopped');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_events
    ADD COLUMN IF NOT EXISTS monitoring_status monitoring_status_enum NOT NULL DEFAULT 'stopped'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_events
    ADD COLUMN IF NOT EXISTS monitoring_logs JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_events
    ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE social_media_events
    ADD COLUMN IF NOT EXISTS last_fetched_history JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  // Copy legacy status / last_polled_at when still present
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_media_events' AND column_name = 'status'
      ) THEN
        UPDATE social_media_events
        SET monitoring_status = CASE
          WHEN lower(status) = 'active' THEN 'started'::monitoring_status_enum
          ELSE 'stopped'::monitoring_status_enum
        END
        WHERE monitoring_status = 'stopped'::monitoring_status_enum
          AND lower(status) = 'active';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_media_events' AND column_name = 'last_polled_at'
      ) THEN
        UPDATE social_media_events
        SET last_fetched_at = last_polled_at
        WHERE last_fetched_at IS NULL AND last_polled_at IS NOT NULL;
      END IF;
    END $$
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE social_media_events DROP COLUMN IF EXISTS status`);
  await prisma.$executeRawUnsafe(`ALTER TABLE social_media_events DROP COLUMN IF EXISTS auto_archive`);
  await prisma.$executeRawUnsafe(`ALTER TABLE social_media_events DROP COLUMN IF EXISTS archived_at`);
  await prisma.$executeRawUnsafe(`ALTER TABLE social_media_events DROP COLUMN IF EXISTS report_pdf_url`);
  await prisma.$executeRawUnsafe(`ALTER TABLE social_media_events DROP COLUMN IF EXISTS last_polled_at`);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_events_monitoring_status_created_at_idx
    ON social_media_events (monitoring_status, created_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_events_start_date_idx
    ON social_media_events (start_date)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_events_occasion_calendar_id_idx
    ON social_media_events (occasion_calendar_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_events_last_fetched_at_idx
    ON social_media_events (last_fetched_at)
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
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_event_media_event_id_posted_at_idx
    ON social_media_event_media (event_id, posted_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_event_media_platform_posted_at_idx
    ON social_media_event_media (platform, posted_at)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS social_media_event_media_fetched_at_idx
    ON social_media_event_media (fetched_at)
  `);
}

async function ensureSettingsTables(prisma) {
  // Drop legacy JSON blob table if present
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS app_settings`);

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
    CREATE TABLE IF NOT EXISTS alert_thresholds (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      platform TEXT NOT NULL UNIQUE,
      low_threshold INTEGER NOT NULL DEFAULT 100,
      medium_threshold INTEGER NOT NULL DEFAULT 500,
      high_threshold INTEGER NOT NULL DEFAULT 1000,
      time_window_minutes INTEGER NOT NULL DEFAULT 60,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    CREATE INDEX IF NOT EXISTS report_templates_platform_is_default_idx
    ON report_templates (platform, is_default)
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
    CREATE INDEX IF NOT EXISTS policy_mappings_is_active_category_id_idx
    ON policy_mappings (is_active, category_id)
  `);
}

async function main() {
  if (process.env.SKIP_PG_ENSURE === 'true') {
    console.log('[postgres] SKIP_PG_ENSURE=true — skipping schema check');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.warn('[postgres] DATABASE_URL not set — skipping schema check');
    return;
  }

  const prisma = new PrismaClient();

  try {
    const count = await countPublicTables(prisma);
    const rolesReady = count > 0 ? await hasRolesTable(prisma) : false;
    const roleIdReady = count > 0 ? await hasUsersRoleId(prisma) : false;

    if (!rolesReady || !roleIdReady) {
      await migrateRolesAndRoleId(prisma);
    }

    if ((await countPublicTables(prisma)) > 0) {
      await ensureUserThemeColumns(prisma);
      await ensurePlatformFields(prisma);
      await migrateCatalogSplit(prisma);
      await ensureCatalogColumns(prisma);
      await ensureSettingsTables(prisma);
    }

    const afterMigrate = await countPublicTables(prisma);
    const rolesOk = await hasRolesTable(prisma);
    const roleIdOk = await hasUsersRoleId(prisma);
    const hasAccounts = await tableExists(prisma, 'social_media_accounts');
    const stillLegacy =
      (await tableExists(prisma, 'social_media_profiles')) &&
      (await columnExists(prisma, 'social_media_profiles', 'platform_id'));

    if (afterMigrate >= EXPECTED_TABLES && rolesOk && roleIdOk && hasAccounts && !stillLegacy) {
      console.log(`[postgres] schema ready (${afterMigrate} tables)`);
      return;
    }

    console.log(
      `[postgres] found ${afterMigrate}/${EXPECTED_TABLES} tables (roles=${rolesOk}, accounts=${hasAccounts}) — syncing Prisma schema…`
    );

    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: BACKEND_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    execSync('npx prisma generate', {
      cwd: BACKEND_ROOT,
      stdio: 'inherit',
      env: process.env,
    });

    const after = await countPublicTables(prisma);
    console.log(`[postgres] schema synced (${after} tables)`);
  } catch (error) {
    console.error('[postgres] schema ensure failed:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
