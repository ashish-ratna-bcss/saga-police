/**
 * Idempotent chatbot_* tables on the tenant DB.
 * Separate from embeddings.* — do not mix with the embedding pipeline.
 */

async function ensureChatbotSchema(prisma) {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chatbot_conversations (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     INTEGER NOT NULL,
      title       TEXT NOT NULL DEFAULT 'New chat',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS chatbot_conversations_user_updated_idx
      ON chatbot_conversations (user_id, updated_at DESC)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chatbot_messages (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id  UUID NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
      role             TEXT NOT NULL,
      content          TEXT NOT NULL DEFAULT '',
      model_name       TEXT NULL,
      token_usage      JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chatbot_messages_role_chk CHECK (role IN ('user', 'assistant', 'system'))
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS chatbot_messages_conversation_created_idx
      ON chatbot_messages (conversation_id, created_at ASC)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chatbot_message_sources (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id        UUID NOT NULL REFERENCES chatbot_messages(id) ON DELETE CASCADE,
      chunk_id          UUID NULL,
      source_table      TEXT NOT NULL,
      source_id         TEXT NOT NULL,
      similarity_score  DOUBLE PRECISION NULL,
      excerpt           TEXT NULL,
      metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS chatbot_message_sources_message_idx
      ON chatbot_message_sources (message_id)
  `);
}

module.exports = { ensureChatbotSchema };
