const { ensureChatbotSchema } = require('./ensureChatbotSchema');

const ensured = new WeakSet();

async function ready(prisma) {
  if (!prisma) {
    const err = new Error('Tenant database unavailable');
    err.status = 400;
    throw err;
  }
  if (!ensured.has(prisma)) {
    await ensureChatbotSchema(prisma);
    ensured.add(prisma);
  }
}

async function listConversations(prisma, userId) {
  await ready(prisma);
  return prisma.$queryRawUnsafe(
    `SELECT id, user_id, title, created_at, updated_at
     FROM chatbot_conversations
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 100`,
    userId
  );
}

async function createConversation(prisma, userId, title = 'New chat') {
  await ready(prisma);
  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO chatbot_conversations (user_id, title)
     VALUES ($1, $2)
     RETURNING id, user_id, title, created_at, updated_at`,
    userId,
    String(title || 'New chat').slice(0, 200)
  );
  return rows[0];
}

async function getConversationForUser(prisma, userId, conversationId) {
  await ready(prisma);
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, user_id, title, created_at, updated_at
     FROM chatbot_conversations
     WHERE id = $1::uuid AND user_id = $2
     LIMIT 1`,
    conversationId,
    userId
  );
  return rows[0] || null;
}

async function renameConversation(prisma, userId, conversationId, title) {
  const existing = await getConversationForUser(prisma, userId, conversationId);
  if (!existing) return null;
  const rows = await prisma.$queryRawUnsafe(
    `UPDATE chatbot_conversations
     SET title = $3, updated_at = NOW()
     WHERE id = $1::uuid AND user_id = $2
     RETURNING id, user_id, title, created_at, updated_at`,
    conversationId,
    userId,
    String(title || 'New chat').slice(0, 200)
  );
  return rows[0] || null;
}

async function deleteConversation(prisma, userId, conversationId) {
  const existing = await getConversationForUser(prisma, userId, conversationId);
  if (!existing) return false;
  await prisma.$executeRawUnsafe(
    `DELETE FROM chatbot_conversations WHERE id = $1::uuid AND user_id = $2`,
    conversationId,
    userId
  );
  return true;
}

async function listMessages(prisma, userId, conversationId) {
  const conv = await getConversationForUser(prisma, userId, conversationId);
  if (!conv) return null;
  const messages = await prisma.$queryRawUnsafe(
    `SELECT id, conversation_id, role, content, model_name, token_usage, created_at
     FROM chatbot_messages
     WHERE conversation_id = $1::uuid
     ORDER BY created_at ASC`,
    conversationId
  );
  const sources = await prisma.$queryRawUnsafe(
    `SELECT s.id, s.message_id, s.chunk_id, s.source_table, s.source_id,
            s.similarity_score, s.excerpt, s.metadata
     FROM chatbot_message_sources s
     JOIN chatbot_messages m ON m.id = s.message_id
     WHERE m.conversation_id = $1::uuid
     ORDER BY s.similarity_score ASC NULLS LAST`,
    conversationId
  );
  const byMsg = new Map();
  for (const s of sources) {
    const key = String(s.message_id);
    if (!byMsg.has(key)) byMsg.set(key, []);
    byMsg.get(key).push(s);
  }
  return {
    conversation: conv,
    messages: messages.map((m) => ({
      ...m,
      sources: byMsg.get(String(m.id)) || [],
    })),
  };
}

async function addMessage(prisma, conversationId, { role, content, modelName = null, tokenUsage = {} }) {
  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO chatbot_messages (conversation_id, role, content, model_name, token_usage)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
     RETURNING id, conversation_id, role, content, model_name, token_usage, created_at`,
    conversationId,
    role,
    content,
    modelName,
    JSON.stringify(tokenUsage || {})
  );
  await prisma.$executeRawUnsafe(
    `UPDATE chatbot_conversations SET updated_at = NOW() WHERE id = $1::uuid`,
    conversationId
  );
  return rows[0];
}

const isUuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || '')
  );

async function addMessageSources(prisma, messageId, sources = []) {
  for (const s of sources) {
    // Browse/latest rows may use synthetic ids like "latest-8042" — not UUIDs.
    const chunkId = isUuid(s.chunk_id) ? String(s.chunk_id) : null;
    await prisma.$executeRawUnsafe(
      `INSERT INTO chatbot_message_sources
         (message_id, chunk_id, source_table, source_id, similarity_score, excerpt, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)`,
      messageId,
      chunkId,
      s.source_table,
      String(s.source_id),
      s.similarity_score ?? null,
      s.excerpt || null,
      JSON.stringify(s.metadata || {})
    );
  }
}

async function getMessageForUser(prisma, userId, conversationId, messageId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT m.id, m.conversation_id, m.role, m.content, m.model_name, m.token_usage, m.created_at
     FROM chatbot_messages m
     JOIN chatbot_conversations c ON c.id = m.conversation_id
     WHERE m.id = $1::uuid
       AND m.conversation_id = $2::uuid
       AND c.user_id = $3
     LIMIT 1`,
    messageId,
    conversationId,
    userId
  );
  return rows[0] || null;
}

async function deleteMessage(prisma, messageId) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM chatbot_messages WHERE id = $1::uuid`,
    messageId
  );
}

async function recentTurns(prisma, conversationId, limit = 8) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT role, content FROM chatbot_messages
     WHERE conversation_id = $1::uuid AND role IN ('user', 'assistant')
     ORDER BY created_at DESC
     LIMIT $2`,
    conversationId,
    limit
  );
  return rows.reverse();
}

module.exports = {
  ensureChatbotSchema,
  listConversations,
  createConversation,
  getConversationForUser,
  renameConversation,
  deleteConversation,
  listMessages,
  addMessage,
  addMessageSources,
  getMessageForUser,
  deleteMessage,
  recentTurns,
};
