-- =============================================================================
-- SOC-EYE / Blura Hub — PostgreSQL schema (single file)
-- Hybrid design: typed columns for query hot-path + JSONB for flexible payloads
-- PKs: SERIAL (small tables) / BIGSERIAL (high-volume)
-- Apply: psql "$DATABASE_URL" -f postgres-schema/schema.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Extensions
-- ---------------------------------------------------------------------------
-- (none required for SERIAL/BIGSERIAL)

-- ---------------------------------------------------------------------------
-- 2) Enums
-- ---------------------------------------------------------------------------
CREATE TYPE source_platform_enum AS ENUM ('youtube', 'x', 'instagram', 'facebook');
CREATE TYPE risk_level_enum AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE risk_level_alert_enum AS ENUM ('low', 'medium', 'high');
CREATE TYPE priority_enum AS ENUM ('low', 'medium', 'high');
CREATE TYPE priority_legacy_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE virality_level_enum AS ENUM ('low', 'medium', 'high');
CREATE TYPE relevance_priority_enum AS ENUM ('high', 'medium', 'hidden');
CREATE TYPE sentiment_enum AS ENUM ('positive', 'neutral', 'negative');
CREATE TYPE content_type_enum AS ENUM ('post', 'reel', 'story', 'highlight', 'video', 'tweet');
CREATE TYPE availability_status_enum AS ENUM ('available', 'deleted', 'expired', 'unknown');
CREATE TYPE alert_type_enum AS ENUM ('keyword_risk', 'ai_risk', 'velocity', 'new_post');
CREATE TYPE alert_status_enum AS ENUM ('active', 'acknowledged', 'resolved', 'false_positive', 'escalated');
CREATE TYPE event_status_enum AS ENUM ('planned', 'active', 'archived', 'paused');
CREATE TYPE event_origin_enum AS ENUM ('manual', 'master_calendar');
CREATE TYPE keyword_language_enum AS ENUM ('en', 'hi', 'te', 'all');
CREATE TYPE keyword_category_enum AS ENUM ('violence', 'threat', 'hate', 'other');
CREATE TYPE report_status_enum AS ENUM (
  'generated', 'printed', 'sent', 'sent_to_intermediary', 'awaiting_reply', 'closed'
);
CREATE TYPE poi_status_enum AS ENUM ('active', 'archived');
CREATE TYPE poi_social_platform_enum AS ENUM ('x', 'facebook', 'instagram', 'youtube', 'whatsapp');
CREATE TYPE grievance_platform_enum AS ENUM ('x', 'facebook', 'whatsapp');
CREATE TYPE grievance_workflow_status_enum AS ENUM (
  'received', 'reviewed', 'action_taken', 'closed', 'converted_to_fir'
);
CREATE TYPE grievance_classification_enum AS ENUM (
  'unclassified', 'acknowledged', 'complaint'
);
CREATE TYPE temp_module_enum AS ENUM ('profile', 'event', 'grievance', 'media_backfill');
CREATE TYPE temp_status_enum AS ENUM ('pending', 'processing', 'done', 'failed');
CREATE TYPE twitter_account_status_enum AS ENUM ('active', 'locked', 'cooldown', 'suspended');
CREATE TYPE story_media_type_enum AS ENUM ('image', 'video');
CREATE TYPE confidence_enum AS ENUM ('low', 'medium', 'high');
CREATE TYPE blend_mode_enum AS ENUM ('profile_only', 'balanced', 'posts_heavy', 'posts_dominant');
CREATE TYPE daily_programme_category_enum AS ENUM ('category1', 'category2', 'category3', 'category4');
CREATE TYPE daily_programme_permission_enum AS ENUM (
  'By Information', 'Permitted', 'Applied for Permission', 'Rejected'
);

-- ---------------------------------------------------------------------------
-- 3) Auth / RBAC
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  allowed_pages       TEXT[] NOT NULL DEFAULT '{}',
  assignable_by       TEXT[] NOT NULL DEFAULT '{superadmin}',
  can_manage_users    BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_roles    BOOLEAN NOT NULL DEFAULT FALSE,
  is_system           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id                          SERIAL PRIMARY KEY,
  name                        TEXT NOT NULL,
  username                    TEXT NOT NULL UNIQUE,
  email                       TEXT NOT NULL UNIQUE,
  password                    TEXT NOT NULL,
  role_id                     INTEGER NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  created_by                  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  ui_mode                     TEXT NOT NULL DEFAULT 'light',
  theme_color                 TEXT NOT NULL DEFAULT '#1e3a8a',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE page_permissions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  allowed_pages   TEXT[] NOT NULL DEFAULT '{}',
  permissions     JSONB,                          -- feature map per page
  updated_by      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4) Monitoring core
-- ---------------------------------------------------------------------------
CREATE TABLE sources (
  id                        SERIAL PRIMARY KEY,
  platform                  source_platform_enum NOT NULL,
  identifier                TEXT NOT NULL,
  platform_user_id          TEXT NOT NULL DEFAULT '',
  old_identifiers           TEXT[] NOT NULL DEFAULT '{}',
  display_name              TEXT NOT NULL,
  display_name_normalized   TEXT NOT NULL DEFAULT '',
  profile_image_url         TEXT,
  category                  TEXT NOT NULL DEFAULT 'unknown',
  priority                  priority_enum NOT NULL DEFAULT 'medium',
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified               BOOLEAN NOT NULL DEFAULT FALSE,
  created_by                INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  risk_level                risk_level_enum NOT NULL DEFAULT 'low',
  last_checked              TIMESTAMPTZ,
  last_identity_refresh_at  TIMESTAMPTZ,
  follower_count            TEXT NOT NULL DEFAULT '',
  joined_date               TEXT NOT NULL DEFAULT '',

  -- locality relevance (typed hot path)
  relevance_score           INTEGER,
  relevance_static_score    INTEGER,
  relevance_content_avg     NUMERIC(5,1),
  relevance_qualifying_posts INTEGER NOT NULL DEFAULT 0,
  relevance_total_posts     INTEGER NOT NULL DEFAULT 0,
  relevance_confidence      confidence_enum,
  relevance_blend_mode      blend_mode_enum,
  relevance_computed_at     TIMESTAMPTZ,

  -- flexible nests
  youtube_metadata          JSONB,
  statistics                JSONB,                -- subscriber/video/view counts
  history                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  relevance_meta            JSONB,                -- reason, matched_terms, weights, etc.

  CONSTRAINT sources_platform_identifier_uq UNIQUE (platform, identifier),
  CONSTRAINT sources_relevance_score_chk CHECK (
    relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 100)
  )
);

CREATE TABLE contents (
  id                        BIGSERIAL PRIMARY KEY,
  source_id                 INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  platform                  source_platform_enum NOT NULL,
  content_type              content_type_enum NOT NULL DEFAULT 'post',
  content_id                TEXT NOT NULL,         -- platform-native id
  content_url               TEXT NOT NULL,
  text                      TEXT NOT NULL DEFAULT '',
  scraped_content           TEXT,

  author                    TEXT NOT NULL,
  author_handle             TEXT NOT NULL,
  published_at              TIMESTAMPTZ NOT NULL,

  -- availability
  is_media_archived         BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted                BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at                TIMESTAMPTZ,
  is_expired                BOOLEAN NOT NULL DEFAULT FALSE,
  expired_at                TIMESTAMPTZ,
  last_availability_check   TIMESTAMPTZ,
  availability_status       availability_status_enum NOT NULL DEFAULT 'available',

  -- repost / quote
  is_repost                 BOOLEAN NOT NULL DEFAULT FALSE,
  original_author           TEXT,
  original_author_name      TEXT,
  original_author_avatar    TEXT,

  -- risk (denormalized for list filters)
  risk_score                INTEGER NOT NULL DEFAULT 0,
  risk_level                risk_level_enum NOT NULL DEFAULT 'low',
  threat_intent             TEXT,
  sentiment                 sentiment_enum NOT NULL DEFAULT 'neutral',

  -- locality relevance (typed)
  relevance_score           INTEGER,
  relevance_priority        relevance_priority_enum,
  is_locality_related       BOOLEAN,

  -- engagement scalars (latest snapshot)
  views                     INTEGER,
  likes                     INTEGER,
  comments_count            INTEGER,
  replies                   INTEGER,
  retweets                  INTEGER,
  shares                    INTEGER,
  quotes                    INTEGER,
  saves                     INTEGER,

  duration                  TEXT,
  tags                      TEXT[] NOT NULL DEFAULT '{}',
  category_id               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- JSONB blobs
  media                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  quoted_content            JSONB,
  url_cards                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  location                  JSONB,
  media_location            JSONB,
  analysis_job              JSONB,
  llm_verdict               JSONB,
  relevance_meta            JSONB,                -- matched_terms, reason, languages, category
  location_classification   JSONB,
  thumbnails                JSONB,
  threat_reasons            JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_factors              JSONB NOT NULL DEFAULT '[]'::jsonb,
  retweet_network           JSONB,
  engagement_history        JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_data                  JSONB,

  CONSTRAINT contents_platform_content_id_uq UNIQUE (platform, content_id),
  CONSTRAINT contents_risk_score_chk CHECK (risk_score >= 0 AND risk_score <= 100),
  CONSTRAINT contents_relevance_score_chk CHECK (
    relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 100)
  )
);

CREATE TABLE analyses (
  id                        BIGSERIAL PRIMARY KEY,
  content_id                BIGINT NOT NULL UNIQUE REFERENCES contents (id) ON DELETE CASCADE,
  risk_score                INTEGER NOT NULL DEFAULT 0,
  violence_score            INTEGER NOT NULL DEFAULT 0,
  threat_score              INTEGER NOT NULL DEFAULT 0,
  hate_score                INTEGER NOT NULL DEFAULT 0,
  sentiment                 sentiment_enum NOT NULL,
  risk_level                risk_level_enum NOT NULL,
  triggered_keywords        TEXT[] NOT NULL DEFAULT '{}',
  topic                     TEXT,
  context                   TEXT,
  summary                   TEXT,
  explanation               TEXT,
  intent                    TEXT,
  confidence                NUMERIC(6,3),
  language                  TEXT,
  reasons                   TEXT[] NOT NULL DEFAULT '{}',
  highlights                TEXT[] NOT NULL DEFAULT '{}',
  flagged_lines             JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_sections            JSONB NOT NULL DEFAULT '[]'::jsonb,
  violated_policies         JSONB NOT NULL DEFAULT '[]'::jsonb,
  layers                    JSONB,
  threat_model              JSONB,
  llm_analysis              JSONB,
  analyzed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT analyses_risk_score_chk CHECK (risk_score >= 0 AND risk_score <= 100)
);

CREATE TABLE alerts (
  id                          BIGSERIAL PRIMARY KEY,
  content_id                  BIGINT NOT NULL REFERENCES contents (id) ON DELETE CASCADE,
  source_id                   INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  content_ref_id              TEXT,
  source_category             TEXT,
  matched_keywords_normalized TEXT[] NOT NULL DEFAULT '{}',
  event_id                    INTEGER,              -- FK added after events table
  analysis_id                 BIGINT REFERENCES analyses (id) ON DELETE SET NULL,

  alert_type                  alert_type_enum NOT NULL DEFAULT 'keyword_risk',
  priority                    priority_legacy_enum NOT NULL DEFAULT 'MEDIUM', -- legacy
  virality_level              virality_level_enum,
  virality_detected_at        TIMESTAMPTZ,
  risk_level                  risk_level_alert_enum NOT NULL,

  title                       TEXT NOT NULL,
  description                 TEXT NOT NULL,
  content_url                 TEXT NOT NULL,
  platform                    source_platform_enum NOT NULL,
  author                      TEXT NOT NULL,
  author_handle               TEXT,

  status                      alert_status_enum NOT NULL DEFAULT 'active',
  content_published_at        TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by             INTEGER REFERENCES users (id) ON DELETE SET NULL,
  acknowledged_at             TIMESTAMPTZ,
  is_read                     BOOLEAN NOT NULL DEFAULT FALSE,
  is_priority                 BOOLEAN NOT NULL DEFAULT FALSE,
  priority_reason             TEXT NOT NULL DEFAULT '',
  notes                       TEXT,
  is_investigation            BOOLEAN NOT NULL DEFAULT FALSE,
  complaint_text              TEXT,
  classification_explanation  TEXT,

  velocity_data               JSONB,
  threat_details              JSONB,
  violated_policies           JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_sections              JSONB NOT NULL DEFAULT '[]'::jsonb,
  ml_analysis                 JSONB,
  llm_analysis                JSONB
);

CREATE TABLE alert_status_history (
  id                  BIGSERIAL PRIMARY KEY,
  alert_id            BIGINT NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
  from_status         alert_status_enum,
  to_status           alert_status_enum NOT NULL,
  changed_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,
  changed_by_email    TEXT,
  notes               TEXT NOT NULL DEFAULT '',
  at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 5) Events (+ master calendar must exist before FK)
-- ---------------------------------------------------------------------------
CREATE TABLE master_calendar_events (
  id                SERIAL PRIMARY KEY,
  sl_no             INTEGER NOT NULL,
  occasion          TEXT NOT NULL,
  event_date        TEXT NOT NULL,             -- e.g. "26 January"
  monitoring_range  TEXT NOT NULL DEFAULT '',
  keywords          TEXT NOT NULL DEFAULT '',
  remarks           TEXT NOT NULL DEFAULT '',
  is_recurring      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        TEXT NOT NULL DEFAULT 'system',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id                          SERIAL PRIMARY KEY,
  name                        TEXT NOT NULL,
  description                 TEXT NOT NULL DEFAULT '',
  start_date                  TIMESTAMPTZ,
  end_date                    TIMESTAMPTZ,
  location                    TEXT NOT NULL DEFAULT '',
  platforms                   source_platform_enum[] NOT NULL DEFAULT ARRAY['youtube','x']::source_platform_enum[],
  high_risk_threshold         INTEGER,
  medium_risk_threshold       INTEGER,
  polling_interval_minutes    INTEGER,
  status                      event_status_enum NOT NULL DEFAULT 'paused',
  auto_archive                BOOLEAN NOT NULL DEFAULT FALSE,
  last_polled_at              TIMESTAMPTZ,
  created_by                  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  origin                      event_origin_enum NOT NULL DEFAULT 'manual',
  master_calendar_event_id    INTEGER REFERENCES master_calendar_events (id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alerts
  ADD CONSTRAINT alerts_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE SET NULL;

CREATE TABLE event_keywords (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  keyword       TEXT NOT NULL,
  language      keyword_language_enum NOT NULL DEFAULT 'all',
  CONSTRAINT event_keywords_event_keyword_uq UNIQUE (event_id, keyword, language)
);

CREATE TABLE content_event_links (
  content_id    BIGINT NOT NULL REFERENCES contents (id) ON DELETE CASCADE,
  event_id      INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  linked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (content_id, event_id)
);

-- ---------------------------------------------------------------------------
-- 6) Grievances
-- ---------------------------------------------------------------------------
CREATE TABLE grievance_sources (
  id                  SERIAL PRIMARY KEY,
  handle              TEXT NOT NULL,
  platform            grievance_platform_enum NOT NULL DEFAULT 'x',
  display_name        TEXT NOT NULL,
  profile_image_url   TEXT,
  x_user_id           TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  department          TEXT NOT NULL DEFAULT 'General',
  designation         TEXT,
  contact_number      TEXT,
  total_grievances    INTEGER NOT NULL DEFAULT 0,
  stats               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked        TIMESTAMPTZ,
  CONSTRAINT grievance_sources_platform_handle_uq UNIQUE (platform, handle)
);

CREATE TABLE grievances (
  id                          BIGSERIAL PRIMARY KEY,
  complaint_code              TEXT,
  tweet_id                    TEXT NOT NULL UNIQUE,   -- external post id (platform-prefixed for FB)
  tweet_url                   TEXT NOT NULL DEFAULT '',
  tagged_account              TEXT NOT NULL,
  tagged_account_normalized   TEXT NOT NULL DEFAULT '',
  grievance_source_id         INTEGER REFERENCES grievance_sources (id) ON DELETE SET NULL,
  platform                    grievance_platform_enum NOT NULL DEFAULT 'x',
  complainant_phone           TEXT,
  source_ref                  TEXT,
  whatsapp_message_sid        TEXT,

  -- typed author / content hot fields
  author_handle               TEXT NOT NULL,
  author_display_name         TEXT,
  author_profile_image_url    TEXT,
  author_is_verified          BOOLEAN NOT NULL DEFAULT FALSE,
  author_follower_count       INTEGER NOT NULL DEFAULT 0,
  content_text                TEXT NOT NULL,
  content_full_text           TEXT,
  post_date                   TIMESTAMPTZ NOT NULL,
  detected_date               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  workflow_status             grievance_workflow_status_enum NOT NULL DEFAULT 'received',
  classification              grievance_classification_enum NOT NULL DEFAULT 'unclassified',
  escalation_count            INTEGER NOT NULL DEFAULT 0,
  fir_number                  TEXT,
  fir_converted_at            TIMESTAMPTZ,
  fir_converted_by            INTEGER REFERENCES users (id) ON DELETE SET NULL,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  posted_by                   JSONB,                  -- full author snapshot
  content                     JSONB,                  -- text + media
  context                     JSONB,                  -- reply/quote/thread context
  engagement                  JSONB,
  workflow_history            JSONB NOT NULL DEFAULT '[]'::jsonb,
  workflow_timestamps         JSONB NOT NULL DEFAULT '{}'::jsonb,
  escalation_history          JSONB NOT NULL DEFAULT '[]'::jsonb,
  acknowledgment              JSONB,
  complaint                   JSONB,
  criticism                   JSONB,
  grievance_workflow          JSONB,
  query_workflow              JSONB,
  suggestion                  JSONB,
  analysis                    JSONB,
  raw_data                    JSONB
);

-- Sparse uniques (Mongo sparse indexes): ignore NULL
CREATE UNIQUE INDEX grievances_complaint_code_uq
  ON grievances (complaint_code)
  WHERE complaint_code IS NOT NULL;

CREATE UNIQUE INDEX grievances_whatsapp_sid_uq
  ON grievances (whatsapp_message_sid)
  WHERE whatsapp_message_sid IS NOT NULL;

CREATE TABLE grievance_settings (
  id                      SERIAL PRIMARY KEY,
  settings_key            TEXT NOT NULL UNIQUE DEFAULT 'grievance_settings',
  max_sources             INTEGER NOT NULL DEFAULT 5,
  fetch_interval_minutes  INTEGER NOT NULL DEFAULT 15,
  auto_fetch_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  ai_analysis_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  default_priority        priority_enum NOT NULL DEFAULT 'medium',
  official_contacts       JSONB NOT NULL DEFAULT '[]'::jsonb,
  report_settings         JSONB NOT NULL DEFAULT '{}'::jsonb,
  config                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by              INTEGER REFERENCES users (id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 7) POI
-- ---------------------------------------------------------------------------
CREATE TABLE pois (
  id                              SERIAL PRIMARY KEY,
  name                            TEXT NOT NULL,
  real_name                       TEXT NOT NULL DEFAULT '',
  alias_names                     TEXT[] NOT NULL DEFAULT '{}',
  mobile_numbers                  TEXT[] NOT NULL DEFAULT '{}',
  email_ids                       TEXT[] NOT NULL DEFAULT '{}',
  last_used_ip                    TEXT NOT NULL DEFAULT '',
  software_hardware_identifiers   TEXT NOT NULL DEFAULT '',
  current_address                 TEXT NOT NULL DEFAULT '',
  ps_limits                       TEXT NOT NULL DEFAULT '',
  district_commisionerate         TEXT NOT NULL DEFAULT '',
  linked_incidents                TEXT NOT NULL DEFAULT '',
  whatsapp_numbers                TEXT[] NOT NULL DEFAULT '{}',
  fir_no                          TEXT NOT NULL DEFAULT '',
  brief_summary                   TEXT NOT NULL DEFAULT '',
  escalated_to_intermediaries_count INTEGER NOT NULL DEFAULT 0,
  profile_image                   TEXT NOT NULL DEFAULT '',
  status                          poi_status_enum NOT NULL DEFAULT 'active',
  created_by                      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  previously_deleted_profiles     JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_fields                   JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE poi_social_accounts (
  id                        SERIAL PRIMARY KEY,
  poi_id                    INTEGER NOT NULL REFERENCES pois (id) ON DELETE CASCADE,
  platform                  poi_social_platform_enum NOT NULL,
  source_id                 INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  platform_user_id          TEXT NOT NULL DEFAULT '',
  handle                    TEXT,
  previous_handles          TEXT[] NOT NULL DEFAULT '{}',
  profile_image             TEXT,
  display_name              TEXT,
  display_name_normalized   TEXT NOT NULL DEFAULT '',
  follower_count            TEXT NOT NULL DEFAULT '',
  created_date              TEXT NOT NULL DEFAULT '',
  category                  TEXT NOT NULL DEFAULT 'others',
  priority                  TEXT NOT NULL DEFAULT 'medium',
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  linked_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE poi_fir_details (
  id                        SERIAL PRIMARY KEY,
  poi_id                    INTEGER NOT NULL REFERENCES pois (id) ON DELETE CASCADE,
  fir_no                    TEXT NOT NULL DEFAULT '',
  ps_limits                 TEXT NOT NULL DEFAULT '',
  district_commisionerate   TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- 8) Workflows (grievance classifications)
-- ---------------------------------------------------------------------------
CREATE TABLE criticism_contacts (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT,
  department    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE criticism_reports (
  id                SERIAL PRIMARY KEY,
  unique_code       TEXT UNIQUE,
  grievance_id      BIGINT NOT NULL REFERENCES grievances (id) ON DELETE CASCADE,
  platform          grievance_platform_enum NOT NULL DEFAULT 'x',
  profile_id        TEXT,
  profile_link      TEXT,
  post_link         TEXT,
  post_date         TIMESTAMPTZ,
  post_description  TEXT,
  category          TEXT NOT NULL DEFAULT 'Others',
  remarks           TEXT,
  message           TEXT,
  created_by        INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by         JSONB,
  engagement        JSONB,
  informed_to       JSONB,
  media_urls        JSONB NOT NULL DEFAULT '[]'::jsonb,
  media_s3_urls     JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE suggestion_reports (
  id                SERIAL PRIMARY KEY,
  unique_code       TEXT UNIQUE,
  grievance_id      BIGINT NOT NULL REFERENCES grievances (id) ON DELETE CASCADE,
  platform          grievance_platform_enum NOT NULL DEFAULT 'x',
  category          TEXT,
  remarks           TEXT,
  message           TEXT,
  created_by        INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE query_reports (
  id                SERIAL PRIMARY KEY,
  unique_code       TEXT UNIQUE,
  grievance_id      BIGINT NOT NULL REFERENCES grievances (id) ON DELETE CASCADE,
  platform          grievance_platform_enum NOT NULL DEFAULT 'x',
  category          TEXT,
  remarks           TEXT,
  message           TEXT,
  created_by        INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE grievance_workflow_reports (
  id                SERIAL PRIMARY KEY,
  unique_code       TEXT UNIQUE,
  grievance_id      BIGINT NOT NULL REFERENCES grievances (id) ON DELETE CASCADE,
  platform          grievance_platform_enum NOT NULL DEFAULT 'x',
  status            TEXT,
  category          TEXT,
  created_by        INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 9) Reports / ops
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id                  SERIAL PRIMARY KEY,
  serial_number       TEXT NOT NULL UNIQUE,
  alert_id            BIGINT NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
  title               TEXT NOT NULL DEFAULT 'NOTICE: U/Sec:69(A) & 79(3) Information Technology Amendment Act 2008 and 94 BNSS',
  content_summary     TEXT,
  platform            source_platform_enum NOT NULL,
  pdf_url             TEXT,
  status              report_status_enum NOT NULL DEFAULT 'sent_to_intermediary',
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closing_remarks     TEXT NOT NULL DEFAULT '',
  target_user_details JSONB,
  media_links         JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_sections      JSONB NOT NULL DEFAULT '[]'::jsonb,
  violated_policies   JSONB NOT NULL DEFAULT '[]'::jsonb,
  edited_content      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE dial100_incidents (
  id                                              SERIAL PRIMARY KEY,
  incident_date                                   DATE NOT NULL,
  category                                        TEXT NOT NULL,
  sl_no                                           INTEGER NOT NULL DEFAULT 0,
  incident_details                                TEXT NOT NULL DEFAULT '',
  incident_category                               TEXT NOT NULL DEFAULT '',
  location                                        TEXT NOT NULL DEFAULT '',
  date_time                                       TIMESTAMPTZ,
  ps_jurisdiction                                 TEXT NOT NULL DEFAULT '',
  zone_jurisdiction                               TEXT NOT NULL DEFAULT '',
  caller_name                                     TEXT NOT NULL DEFAULT '',
  caller_number                                   TEXT NOT NULL DEFAULT '',
  ps_type_of_vehicle                              TEXT NOT NULL DEFAULT '',
  pc_bc                                           TEXT NOT NULL DEFAULT '',
  assigned_to                                     TEXT NOT NULL DEFAULT '',
  assigned_time                                   TIMESTAMPTZ,
  received_time                                   TIMESTAMPTZ,
  accepted_time                                   TIMESTAMPTZ,
  reached_time                                    TIMESTAMPTZ,
  response_time_for_accepting_call                INTEGER NOT NULL DEFAULT 0,
  response_time_acceptance_to_vehicle_reached_mins INTEGER NOT NULL DEFAULT 0,
  response_time_assigned_to_vehicle_reached       INTEGER NOT NULL DEFAULT 0,
  pc_remarks                                      TEXT NOT NULL DEFAULT '',
  sho_remarks                                     TEXT NOT NULL DEFAULT '',
  remarks                                         TEXT NOT NULL DEFAULT '',
  status                                          TEXT NOT NULL DEFAULT 'Pending',
  priority                                        TEXT NOT NULL DEFAULT 'Normal',
  created_by                                      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at                                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  media_files                                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload                                         JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT dial100_date_category_sl_uq UNIQUE (incident_date, category, sl_no)
);

CREATE TABLE daily_programmes (
  id                  SERIAL PRIMARY KEY,
  programme_date      DATE NOT NULL,
  category            daily_programme_category_enum NOT NULL,
  category_label      TEXT NOT NULL DEFAULT '',
  sl_no               INTEGER NOT NULL DEFAULT 1,
  zone                TEXT NOT NULL DEFAULT '',
  program_name        TEXT NOT NULL DEFAULT '',
  location            TEXT NOT NULL DEFAULT '',
  organizer           TEXT NOT NULL DEFAULT '',
  expected_members    INTEGER NOT NULL DEFAULT 0,
  programme_time      TEXT NOT NULL DEFAULT '',
  gist                TEXT NOT NULL DEFAULT '',
  permission          daily_programme_permission_enum NOT NULL DEFAULT 'By Information',
  comments            TEXT NOT NULL DEFAULT 'Required L&O and Traffic BB',
  is_high_priority    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by          INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT daily_programmes_date_category_sl_uq UNIQUE (programme_date, category, sl_no)
);

CREATE TABLE periscope_uploads (
  id                  SERIAL PRIMARY KEY,
  daily_programme_id  INTEGER REFERENCES daily_programmes (id) ON DELETE SET NULL,
  file_name           TEXT,
  file_url            TEXT,
  uploaded_by         INTEGER REFERENCES users (id) ON DELETE SET NULL,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta                JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE soceye_report_snapshots (
  id            SERIAL PRIMARY KEY,
  window_hours  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  payload       JSONB NOT NULL
);

CREATE TABLE comprehensive_reports (
  id            SERIAL PRIMARY KEY,
  start_date    TIMESTAMPTZ,
  end_date      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  payload       JSONB NOT NULL
);

CREATE TABLE daily_intelligence_reports (
  id            SERIAL PRIMARY KEY,
  report_date   DATE NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  payload       JSONB NOT NULL
);

-- ---------------------------------------------------------------------------
-- 10) Settings / keywords / policies
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  id                          SERIAL PRIMARY KEY,
  settings_key                TEXT NOT NULL UNIQUE DEFAULT 'global_settings',
  theme_color                 TEXT NOT NULL DEFAULT '#1e3a8a',
  risk_threshold_high         INTEGER NOT NULL DEFAULT 70,
  risk_threshold_medium       INTEGER NOT NULL DEFAULT 40,
  monitoring_interval_minutes INTEGER NOT NULL DEFAULT 5,
  enable_email_alerts         BOOLEAN NOT NULL DEFAULT TRUE,
  velocity_alerts_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  alert_for_every_post        BOOLEAN NOT NULL DEFAULT FALSE,
  alert_emails                TEXT[] NOT NULL DEFAULT '{}',
  youtube_api_key             TEXT,
  x_bearer_token              TEXT,
  facebook_access_token       TEXT,
  rapidapi_key                TEXT,
  rapidapi_instagram_key      TEXT,
  rapidapi_instagram_host     TEXT,
  api_config                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  extra                       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE keywords (
  id            SERIAL PRIMARY KEY,
  keyword       TEXT NOT NULL UNIQUE,
  category      keyword_category_enum NOT NULL,
  language      keyword_language_enum NOT NULL DEFAULT 'en',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  weight        INTEGER NOT NULL DEFAULT 50,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alert_thresholds (
  id                    SERIAL PRIMARY KEY,
  platform              source_platform_enum NOT NULL UNIQUE,
  low_threshold         INTEGER NOT NULL DEFAULT 100,
  medium_threshold      INTEGER NOT NULL DEFAULT 500,
  high_threshold        INTEGER NOT NULL DEFAULT 1000,
  time_window_minutes   INTEGER NOT NULL DEFAULT 60,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  config                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE templates (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  platform      source_platform_enum,
  body          TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policy_mappings (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  mapping       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE legal_sections (
  id              SERIAL PRIMARY KEY,
  act             TEXT NOT NULL DEFAULT 'BNS 2023',
  section         TEXT NOT NULL UNIQUE,
  description     TEXT NOT NULL,
  keywords        TEXT[] NOT NULL DEFAULT '{}',
  mapped_intent   TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE platform_policies (
  id              SERIAL PRIMARY KEY,
  platform        TEXT NOT NULL,
  policy_name     TEXT NOT NULL,
  policy_id       TEXT NOT NULL UNIQUE,
  description     TEXT NOT NULL,
  keywords        TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 11) Aux / secondary
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE counters (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  seq           BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE search_history (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  query         TEXT NOT NULL,
  platform      TEXT,
  results_text  TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE instagram_stories (
  id                  BIGSERIAL PRIMARY KEY,
  source_id           INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  story_pk            TEXT NOT NULL,
  author              TEXT NOT NULL,
  author_handle       TEXT NOT NULL,
  author_avatar       TEXT,
  media_type          story_media_type_enum NOT NULL DEFAULT 'image',
  original_url        TEXT NOT NULL,
  s3_url              TEXT,
  s3_key              TEXT,
  published_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  is_expired          BOOLEAN NOT NULL DEFAULT FALSE,
  risk_score          INTEGER NOT NULL DEFAULT 0,
  risk_level          risk_level_enum NOT NULL DEFAULT 'low',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  media               JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_data            JSONB,
  CONSTRAINT instagram_stories_story_pk_uq UNIQUE (story_pk)
);

CREATE TABLE comments (
  id            BIGSERIAL PRIMARY KEY,
  content_id    BIGINT NOT NULL REFERENCES contents (id) ON DELETE CASCADE,
  platform      source_platform_enum NOT NULL DEFAULT 'youtube',
  comment_id    TEXT NOT NULL,
  author        TEXT,
  author_handle TEXT,
  text          TEXT,
  published_at  TIMESTAMPTZ,
  risk_score    INTEGER NOT NULL DEFAULT 0,
  risk_level    risk_level_enum NOT NULL DEFAULT 'low',
  threat_score  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data      JSONB,
  CONSTRAINT comments_platform_comment_id_uq UNIQUE (platform, comment_id)
);

CREATE TABLE youtube_transcripts (
  id                  BIGSERIAL PRIMARY KEY,
  transcript_id       TEXT NOT NULL,
  platform            TEXT NOT NULL DEFAULT 'youtube',
  video_id            TEXT NOT NULL,
  youtube_url         TEXT NOT NULL,
  title               TEXT,
  duration_seconds    INTEGER,
  language            TEXT,
  transcript          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta                JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT youtube_transcripts_video_id_uq UNIQUE (video_id)
);

CREATE TABLE retweet_relationships (
  id                  BIGSERIAL PRIMARY KEY,
  content_id          BIGINT REFERENCES contents (id) ON DELETE CASCADE,
  original_tweet_id   TEXT,
  retweeter_handle    TEXT,
  retweeter_user_id   TEXT,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta                JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE engager_analyses (
  id                  BIGSERIAL PRIMARY KEY,
  content_id          BIGINT REFERENCES contents (id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'pending',
  error               TEXT,
  analyzed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE ongoing_events (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  start_date    TIMESTAMPTZ,
  end_date      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Engine-mode ingest queue only (USE_ENGINE=true)
CREATE TABLE temp_content (
  id                    BIGSERIAL PRIMARY KEY,
  tenant_name           TEXT NOT NULL,
  module                temp_module_enum NOT NULL,
  platform              source_platform_enum NOT NULL,
  source_id             INTEGER REFERENCES sources (id) ON DELETE SET NULL,
  source_identifier     TEXT,
  source_category       TEXT,
  source_display_name   TEXT,
  event_id              INTEGER REFERENCES events (id) ON DELETE SET NULL,
  event_name            TEXT,
  event_keywords        TEXT[] NOT NULL DEFAULT '{}',
  raw_data              JSONB NOT NULL,
  status                temp_status_enum NOT NULL DEFAULT 'pending',
  attempts              INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at          TIMESTAMPTZ
);

-- Legacy Puppeteer scraper accounts (optional)
CREATE TABLE twitter_accounts (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password      TEXT NOT NULL,
  email         TEXT,
  cookies       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        twitter_account_status_enum NOT NULL DEFAULT 'active',
  last_used     TIMESTAMPTZ,
  daily_stats   JSONB NOT NULL DEFAULT '{}'::jsonb,
  proxy         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 12) Indexes (hot path)
-- ---------------------------------------------------------------------------

-- sources
CREATE INDEX idx_sources_platform_active ON sources (platform, is_active);
CREATE INDEX idx_sources_category ON sources (category);
CREATE INDEX idx_sources_active_created ON sources (is_active, created_at DESC);
CREATE INDEX idx_sources_relevance_score ON sources (relevance_score DESC NULLS LAST);
CREATE INDEX idx_sources_display_name_normalized ON sources (display_name_normalized);
CREATE INDEX idx_sources_platform_user_id ON sources (platform, platform_user_id);

-- contents
CREATE INDEX idx_contents_source_published ON contents (source_id, published_at DESC);
CREATE INDEX idx_contents_platform_source_published ON contents (platform, source_id, published_at DESC);
CREATE INDEX idx_contents_platform_risk ON contents (platform, risk_level);
CREATE INDEX idx_contents_source_risk ON contents (source_id, risk_level);
CREATE INDEX idx_contents_published ON contents (published_at DESC);
CREATE INDEX idx_contents_deleted ON contents (is_deleted) WHERE is_deleted = TRUE;
CREATE INDEX idx_contents_relevance_priority_score ON contents (relevance_priority, relevance_score DESC NULLS LAST);
CREATE INDEX idx_contents_content_id ON contents (content_id);

-- content <-> events
CREATE INDEX idx_content_event_links_event ON content_event_links (event_id, content_id);

-- analyses
CREATE INDEX idx_analyses_analyzed_at ON analyses (analyzed_at DESC);

-- alerts
CREATE INDEX idx_alerts_status_published ON alerts (status, content_published_at DESC);
CREATE INDEX idx_alerts_risk_published ON alerts (risk_level, content_published_at DESC);
CREATE INDEX idx_alerts_platform_published ON alerts (platform, content_published_at DESC);
CREATE INDEX idx_alerts_status_platform_published ON alerts (status, platform, content_published_at DESC);
CREATE INDEX idx_alerts_status_type_published ON alerts (status, alert_type, content_published_at DESC);
CREATE INDEX idx_alerts_virality_published ON alerts (virality_level, content_published_at DESC);
CREATE INDEX idx_alerts_content_id ON alerts (content_id);
CREATE INDEX idx_alerts_source_id ON alerts (source_id);
CREATE INDEX idx_alerts_status_created ON alerts (status, created_at DESC);
CREATE INDEX idx_alerts_matched_keywords_gin ON alerts USING GIN (matched_keywords_normalized);

-- alert status history
CREATE INDEX idx_alert_status_history_alert ON alert_status_history (alert_id, at DESC);
CREATE INDEX idx_alert_status_history_at_to ON alert_status_history (at DESC, to_status);

-- events / master calendar
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_event_keywords_event ON event_keywords (event_id);
CREATE INDEX idx_master_calendar_recurring_sl ON master_calendar_events (is_recurring, sl_no);

-- grievances
CREATE INDEX idx_grievances_source ON grievances (grievance_source_id, created_at DESC);
CREATE INDEX idx_grievances_platform_workflow ON grievances (platform, workflow_status, post_date DESC);
CREATE INDEX idx_grievances_workflow_post ON grievances (workflow_status, post_date DESC);
CREATE INDEX idx_grievances_tagged ON grievances (tagged_account_normalized, post_date DESC);
CREATE INDEX idx_grievances_classification ON grievances (is_active, classification, post_date DESC);
CREATE INDEX idx_grievances_active_workflow ON grievances (is_active, workflow_status, post_date DESC);
CREATE INDEX idx_grievance_sources_active ON grievance_sources (platform, is_active);

-- dial100 / daily programmes
CREATE INDEX idx_dial100_date_category ON dial100_incidents (incident_date, category);
CREATE INDEX idx_daily_programmes_date_category ON daily_programmes (programme_date, category);

-- poi
CREATE INDEX idx_pois_status ON pois (status);
CREATE INDEX idx_poi_social_poi ON poi_social_accounts (poi_id);
CREATE INDEX idx_poi_social_source ON poi_social_accounts (source_id);
CREATE INDEX idx_poi_social_handle ON poi_social_accounts (platform, handle);

-- workflows
CREATE INDEX idx_criticism_reports_grievance ON criticism_reports (grievance_id);
CREATE INDEX idx_suggestion_reports_grievance ON suggestion_reports (grievance_id);
CREATE INDEX idx_query_reports_grievance ON query_reports (grievance_id);
CREATE INDEX idx_grievance_workflow_reports_grievance ON grievance_workflow_reports (grievance_id);

-- reports
CREATE INDEX idx_reports_alert ON reports (alert_id);
CREATE INDEX idx_reports_status_generated ON reports (status, generated_at DESC);
CREATE INDEX idx_reports_platform_status ON reports (platform, status, generated_at DESC);

-- audit / search
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_search_history_user ON search_history (user_id, created_at DESC);

-- stories / comments
CREATE INDEX idx_instagram_stories_source ON instagram_stories (source_id, published_at DESC);
CREATE INDEX idx_comments_content ON comments (content_id);

-- temp queue
CREATE INDEX idx_temp_content_tenant_status ON temp_content (tenant_name, status, created_at);
CREATE INDEX idx_temp_content_status ON temp_content (status, created_at);

-- retweet / engager
CREATE INDEX idx_retweet_relationships_content ON retweet_relationships (content_id);
CREATE INDEX idx_engager_analyses_status ON engager_analyses (status, analyzed_at);

COMMIT;

-- =============================================================================
-- End of schema
-- =============================================================================
