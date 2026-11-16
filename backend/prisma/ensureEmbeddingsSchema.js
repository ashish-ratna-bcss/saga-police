/**
 * Per-tenant AI embeddings schema — fixed production shape (do not split per ops table).
 *
 *   embeddings.documents  — 1 row per source record (posts, alerts, news, …)
 *   embeddings.chunks     — N vectors per document (long text → many chunks)
 *   embeddings.jobs       — async upsert / delete / reindex queue
 *
 * DB-level automation: AFTER INSERT/UPDATE/DELETE triggers on whitelisted content
 * tables only enqueue rows into embeddings.jobs (never call embedding APIs from Postgres).
 * A worker must process jobs → documents/chunks.
 *
 * Created on tenant provision and whenever ensureOpsSchema runs.
 * Vector width: EMBEDDING_DIMENSIONS (default 1536). Set before first create;
 * changing later needs a deliberate reindex migration (column is fixed-width).
 *
 * Requires pgvector (extension "vector") on the Postgres instance.
 */

const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/** Content tables that feed AI search — not config/meta tables. */
const EMBEDDING_SOURCE_TRIGGERS = [
  { table: 'social_media_posts', pk: 'id' },
  { table: 'social_media_alerts', pk: 'id' },
  { table: 'social_media_grievances', pk: 'id' },
  { table: 'social_media_grievance_reports', pk: 'id' },
  { table: 'social_media_events', pk: 'id' },
  { table: 'social_media_event_summaries', pk: 'id' },
  { table: 'social_media_periscope_reports', pk: 'id' },
  { table: 'news_articles', pk: 'article_id' },
];

const { withTenantSchemaLockRetry } = require('./schemaLock');

const embeddingDimensions = () => {
  const n = Number.parseInt(String(process.env.EMBEDDING_DIMENSIONS || ''), 10);
  if (Number.isFinite(n) && n >= 32 && n <= 8192) return n;
  return DEFAULT_EMBEDDING_DIMENSIONS;
};

/**
 * Thin DB triggers + enqueue helpers. Idempotent.
 * @param {import('@prisma/client').PrismaClient | import('../src/generated/tenant-client').PrismaClient} prisma
 */
async function ensureEmbeddingsTriggers(prisma) {
  // Drop volatile / high-churn keys so like-count updates do not spam the job queue.
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION embeddings.row_fingerprint(r jsonb)
    RETURNS jsonb
    LANGUAGE sql
    IMMUTABLE
    AS $fn$
      SELECT r
        - 'engagement'
        - 'updated_at'
        - 'created_at'
        - 'analysis_status'
        - 'sentiment'
        - 'status_history'
        - 'seen_count'
        - 'last_seen_at'
        - 'detected_at'
        - 'first_seen_at'
        - 'posted_at'
        - 'shared_at'
        - 'action_taken_at'
        - 'closed_at'
        - 'escalated_at'
        - 'pdf_base64'
        - 'meta'
    $fn$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION embeddings.enqueue_job(
      p_source_table text,
      p_source_id text,
      p_op text
    ) RETURNS void
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF p_source_id IS NULL OR btrim(p_source_id) = '' THEN
        RETURN;
      END IF;

      IF p_op = 'delete' THEN
        UPDATE embeddings.jobs
           SET status = 'done',
               processed_at = NOW(),
               last_error = 'superseded by delete'
         WHERE source_table = p_source_table
           AND source_id = p_source_id
           AND status = 'pending'
           AND op IN ('upsert', 'reindex');
      END IF;

      INSERT INTO embeddings.jobs (source_table, source_id, op)
      VALUES (p_source_table, p_source_id, p_op)
      ON CONFLICT (source_table, source_id, op) WHERE (status = 'pending')
      DO NOTHING;
    END;
    $fn$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION embeddings.trg_enqueue()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    DECLARE
      pk_col text := COALESCE(NULLIF(TG_ARGV[0], ''), 'id');
      sid text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        EXECUTE format('SELECT ($1).%I::text', pk_col) INTO sid USING OLD;
        PERFORM embeddings.enqueue_job(TG_TABLE_NAME, sid, 'delete');
        RETURN OLD;
      END IF;

      EXECUTE format('SELECT ($1).%I::text', pk_col) INTO sid USING NEW;

      IF TG_OP = 'UPDATE'
         AND embeddings.row_fingerprint(to_jsonb(OLD))
           = embeddings.row_fingerprint(to_jsonb(NEW)) THEN
        RETURN NEW;
      END IF;

      PERFORM embeddings.enqueue_job(TG_TABLE_NAME, sid, 'upsert');
      RETURN NEW;
    END;
    $fn$
  `);

  // Partial unique index enables ON CONFLICT coalescing of pending jobs.
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS embeddings_jobs_pending_uniq
      ON embeddings.jobs (source_table, source_id, op)
      WHERE status = 'pending'
  `);

  for (const { table, pk } of EMBEDDING_SOURCE_TRIGGERS) {
    // Whitelist-only names — never interpolate user input here.
    const exists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '${table}'
      ) AS ok
    `);
    if (!exists[0]?.ok) continue;

    const triggerName = `embeddings_enqueue_${table}`;
    // Create only if missing — avoids DROP/CREATE races across API workers.
    await prisma.$executeRawUnsafe(`
      DO $trig$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = '${triggerName}' AND NOT tgisinternal
        ) THEN
          CREATE TRIGGER ${triggerName}
            AFTER INSERT OR UPDATE OR DELETE ON public.${table}
            FOR EACH ROW
            EXECUTE FUNCTION embeddings.trg_enqueue('${pk}');
        END IF;
      END
      $trig$;
    `);
  }
}

/**
 * @param {import('@prisma/client').PrismaClient | import('../src/generated/tenant-client').PrismaClient} prisma
 * @param {{ locked?: boolean }} [opts]
 */
async function ensureEmbeddingsSchema(prisma, opts = {}) {
  if (!opts.locked) {
    return withTenantSchemaLockRetry(prisma, () =>
      ensureEmbeddingsSchema(prisma, { locked: true })
    );
  }

  const dims = embeddingDimensions();

  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS embeddings`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS embeddings.documents (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_table    TEXT NOT NULL,
      source_id       TEXT NOT NULL,
      content_hash    TEXT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      chunk_count     INTEGER NOT NULL DEFAULT 0,
      token_estimate  INTEGER NULL,
      metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
      model           TEXT NULL,
      indexed_at      TIMESTAMPTZ NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT embeddings_documents_source_uniq UNIQUE (source_table, source_id),
      CONSTRAINT embeddings_documents_status_chk CHECK (
        status IN ('pending', 'active', 'deleted', 'error')
      )
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_documents_status_idx
      ON embeddings.documents (status)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_documents_source_table_idx
      ON embeddings.documents (source_table)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_documents_metadata_gin
      ON embeddings.documents USING GIN (metadata)
  `);

  // Fixed-width vector column — create only when missing so we never silently
  // rewrite an existing production column with a different dimension.
  const chunkTable = await prisma.$queryRawUnsafe(`
    SELECT to_regclass('embeddings.chunks')::text AS reg
  `);
  if (!chunkTable[0]?.reg) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE embeddings.chunks (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id     UUID NOT NULL REFERENCES embeddings.documents(id) ON DELETE CASCADE,
        source_table    TEXT NOT NULL,
        source_id       TEXT NOT NULL,
        chunk_index     INTEGER NOT NULL DEFAULT 0,
        content         TEXT NOT NULL DEFAULT '',
        content_hash    TEXT NULL,
        embedding       vector(${dims}) NOT NULL,
        token_count     INTEGER NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT embeddings_chunks_doc_idx_uniq UNIQUE (document_id, chunk_index),
        CONSTRAINT embeddings_chunks_index_chk CHECK (chunk_index >= 0)
      )
    `);
  } else {
    const dimRow = await prisma.$queryRawUnsafe(`
      SELECT format_type(a.atttypid, a.atttypmod) AS typ
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'embeddings'
        AND c.relname = 'chunks'
        AND a.attname = 'embedding'
        AND a.attnum > 0
        AND NOT a.attisdropped
      LIMIT 1
    `);
    const typ = String(dimRow[0]?.typ || '');
    const match = typ.match(/vector\((\d+)\)/i);
    const existingDims = match ? Number(match[1]) : null;
    if (existingDims && existingDims !== dims) {
      console.warn(
        `[embeddings] embeddings.chunks.embedding is ${typ} but EMBEDDING_DIMENSIONS=${dims}. ` +
          `Leaving column unchanged — run a reindex migration to change width.`
      );
    }
  }

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_chunks_document_id_idx
      ON embeddings.chunks (document_id)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_chunks_source_idx
      ON embeddings.chunks (source_table, source_id)
  `);

  // ANN index — cosine distance (most embedding models). IF NOT EXISTS keeps restarts cheap.
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_chunks_embedding_hnsw
      ON embeddings.chunks
      USING hnsw (embedding vector_cosine_ops)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS embeddings.jobs (
      id              BIGSERIAL PRIMARY KEY,
      source_table    TEXT NOT NULL,
      source_id       TEXT NOT NULL,
      op              TEXT NOT NULL,
      priority        INTEGER NOT NULL DEFAULT 100,
      status          TEXT NOT NULL DEFAULT 'pending',
      attempts        INTEGER NOT NULL DEFAULT 0,
      max_attempts    INTEGER NOT NULL DEFAULT 8,
      run_after       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error      TEXT NULL,
      payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at    TIMESTAMPTZ NULL,
      CONSTRAINT embeddings_jobs_op_chk CHECK (
        op IN ('upsert', 'delete', 'reindex')
      ),
      CONSTRAINT embeddings_jobs_status_chk CHECK (
        status IN ('pending', 'running', 'done', 'dead')
      )
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_jobs_claim_idx
      ON embeddings.jobs (status, run_after, priority, id)
      WHERE status IN ('pending', 'running')
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS embeddings_jobs_source_idx
      ON embeddings.jobs (source_table, source_id)
  `);

  await ensureEmbeddingsTriggers(prisma);

  return {
    schema: 'embeddings',
    dimensions: dims,
    triggerTables: EMBEDDING_SOURCE_TRIGGERS.map((t) => t.table),
  };
}

module.exports = {
  ensureEmbeddingsSchema,
  ensureEmbeddingsTriggers,
  embeddingDimensions,
  DEFAULT_EMBEDDING_DIMENSIONS,
  EMBEDDING_SOURCE_TRIGGERS,
};
