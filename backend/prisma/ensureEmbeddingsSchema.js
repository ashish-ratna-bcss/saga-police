/**
 * Per-tenant AI embeddings schema — fixed production shape (do not split per ops table).
 *
 *   embeddings.documents  — 1 row per source record (posts, alerts, news, …)
 *   embeddings.chunks     — N vectors per document (long text → many chunks)
 *   embeddings.jobs       — async upsert / delete / reindex queue
 *
 * Created on tenant provision and whenever ensureOpsSchema runs.
 * Vector width: EMBEDDING_DIMENSIONS (default 1536). Set before first create;
 * changing later needs a deliberate reindex migration (column is fixed-width).
 *
 * Requires pgvector (extension "vector") on the Postgres instance.
 */

const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

const embeddingDimensions = () => {
  const n = Number.parseInt(String(process.env.EMBEDDING_DIMENSIONS || ''), 10);
  if (Number.isFinite(n) && n >= 32 && n <= 8192) return n;
  return DEFAULT_EMBEDDING_DIMENSIONS;
};

/**
 * @param {import('@prisma/client').PrismaClient | import('../src/generated/tenant-client').PrismaClient} prisma
 */
async function ensureEmbeddingsSchema(prisma) {
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

  return { schema: 'embeddings', dimensions: dims };
}

module.exports = {
  ensureEmbeddingsSchema,
  embeddingDimensions,
  DEFAULT_EMBEDDING_DIMENSIONS,
};
