const conversation = require('./conversation.service');
const { retrieveChunks, looksLikeCountQuestion, countPostsInRange, countAlertsInRange } = require('./retrieval.service');
const { buildMessages } = require('./context-builder.service');
const { complete, completeStream, getLLMConfig } = require('./llm.service');
const { enrichSources, sourceHref } = require('./source-formatter.service');

/** Simple per-user rate limit for send. */
const sendBuckets = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

function assertRateLimit(userId) {
  const now = Date.now();
  let b = sendBuckets.get(userId);
  if (!b || now - b.start > RATE_WINDOW_MS) {
    b = { start: now, count: 0 };
    sendBuckets.set(userId, b);
  }
  b.count += 1;
  if (b.count > RATE_MAX) {
    const err = new Error('Too many chat requests. Please wait a minute.');
    err.status = 429;
    throw err;
  }
}

function extractKeyword(question) {
  const q = String(question || '');
  // crude keyword for hybrid: quoted phrase or notable tokens
  const quoted = q.match(/"([^"]{2,80})"/);
  if (quoted) return quoted[1];
  const stop = new Set(['what', 'which', 'when', 'where', 'show', 'find', 'about', 'related', 'the', 'and', 'for', 'from', 'this', 'that', 'with', 'have', 'were', 'been', 'into', 'over', 'last', 'month', 'week', 'days', 'how', 'many', 'please', 'give', 'summary', 'summarize', 'today', 'yesterday', 'total', 'posts', 'alerts', 'count', 'number']);
  const tokens = q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t));
  return tokens.slice(0, 3).join(' ') || null;
}

/** Greetings / small-talk — skip retrieval and sources. */
function isChitchat(question) {
  const q = String(question || '').trim().toLowerCase();
  if (!q || q.length > 80) return false;
  return /^(hi|hello|hey|yo|thanks|thank you|ok|okay|good morning|good evening|good afternoon|namaste|hola)[\s!.?]*$/i.test(
    q
  );
}

/** Infer relative date filters from phrasing when UI dates are empty. */
function applyRelativeDates(question, filters) {
  const out = { ...filters };
  if (out.dateFrom || out.dateTo) return out;
  const q = String(question || '').toLowerCase();
  const now = new Date();
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.toISOString();
  };
  const endOfDay = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x.toISOString();
  };
  if (/\btoday\b/.test(q)) {
    out.dateFrom = startOfDay(now);
    out.dateTo = endOfDay(now);
  } else if (/\byesterday\b/.test(q)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    out.dateFrom = startOfDay(y);
    out.dateTo = endOfDay(y);
  } else if (/\blast\s*7\s*days\b|\bpast\s*week\b|\blast\s*week\b/.test(q)) {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    out.dateFrom = startOfDay(from);
    out.dateTo = endOfDay(now);
  }
  return out;
}

/** Keep only chunks the model actually cited as [n]. */
function filterCitedSources(answer, enriched) {
  const cites = new Set(
    [...String(answer || '').matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
  );
  if (!cites.size) return [];
  return (enriched || []).filter((_, i) => cites.has(i + 1));
}

function mapSources(enriched) {
  return (enriched || []).map((s) => ({
    ...s,
    metadata: {
      ...s.metadata,
      href: sourceHref(s.source_table, s.source_id),
    },
  }));
}

async function buildAnalyticsNote(prisma, question, filters) {
  if (!looksLikeCountQuestion(question)) return null;
  try {
    const posts = await countPostsInRange(prisma, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      keyword: extractKeyword(question),
    });
    const alerts = await countAlertsInRange(prisma, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
    return `social_media_posts matching filters: ${posts}; social_media_alerts in range: ${alerts}.`;
  } catch {
    return null;
  }
}

/**
 * Full RAG turn: persist user msg, retrieve, LLM, persist assistant + sources.
 * @param {object} opts
 * @param {(delta: string) => void} [opts.onDelta]
 */
async function sendMessage(prisma, userId, conversationId, body, opts = {}) {
  assertRateLimit(userId);

  const content = String(body.content || body.message || '').trim();
  if (!content) {
    const err = new Error('Message content is required');
    err.status = 400;
    throw err;
  }
  if (content.length > 8000) {
    const err = new Error('Message too long');
    err.status = 400;
    throw err;
  }

  const conv = await conversation.getConversationForUser(prisma, userId, conversationId);
  if (!conv) {
    const err = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }

  let filters = applyRelativeDates(content, {
    topK: body.topK,
    dateFrom: body.dateFrom || null,
    dateTo: body.dateTo || null,
    sourceTables: body.sourceTables || null,
    keyword: body.keyword || extractKeyword(content),
  });

  const userMsg = await conversation.addMessage(prisma, conversationId, {
    role: 'user',
    content,
  });

  // Auto-title from first user message
  if (!conv.title || conv.title === 'New chat') {
    await conversation.renameConversation(
      prisma,
      userId,
      conversationId,
      content.slice(0, 80)
    );
  }

  const history = await conversation.recentTurns(prisma, conversationId, 8);
  // history includes the user message we just added — drop last for builder (we pass question separately)
  const prior = history.slice(0, -1);

  const chitchat = isChitchat(content);
  const countOnly = looksLikeCountQuestion(content);

  let chunks = [];
  if (!chitchat && !countOnly) {
    try {
      chunks = await retrieveChunks(prisma, content, filters);
    } catch {
      chunks = [];
    }
  }
  if (chunks.length) {
    try {
      chunks = await enrichSources(prisma, chunks);
      chunks = chunks.map((c) => ({
        ...c,
        content: c.excerpt || c.content,
        metadata: c.metadata || {},
      }));
    } catch {
      /* keep raw chunks */
    }
  }

  const analyticsNote = chitchat
    ? null
    : await buildAnalyticsNote(prisma, content, filters);
  const messages = buildMessages(content, chunks, prior, { analyticsNote });

  let llmResult;
  if (typeof opts.onDelta === 'function') {
    llmResult = await completeStream(messages, opts.onDelta);
  } else {
    llmResult = await complete(messages);
  }

  const answer =
    llmResult.content ||
    (chunks.length
      ? 'I found related records but could not generate a summary. Please try again.'
      : chitchat
        ? 'Hello! How can I help you with your records today?'
        : 'I could not find relevant records in this tenant database for that question.');

  let modelName = llmResult.model;
  try {
    modelName = modelName || getLLMConfig().model;
  } catch {
    /* ignore */
  }

  const assistantMsg = await conversation.addMessage(prisma, conversationId, {
    role: 'assistant',
    content: answer,
    modelName,
    tokenUsage: llmResult.usage || {},
  });

  let sourcesForStore = [];
  if (!chitchat && chunks.length) {
    sourcesForStore = filterCitedSources(answer, mapSources(chunks));
    if (sourcesForStore.length) {
      await conversation.addMessageSources(prisma, assistantMsg.id, sourcesForStore);
    }
  }

  return {
    userMessage: userMsg,
    assistantMessage: { ...assistantMsg, sources: sourcesForStore },
    sources: sourcesForStore,
  };
}

async function regenerate(prisma, userId, conversationId, messageId, opts = {}) {
  const msg = await conversation.getMessageForUser(prisma, userId, conversationId, messageId);
  if (!msg || msg.role !== 'assistant') {
    const err = new Error('Assistant message not found');
    err.status = 404;
    throw err;
  }

  // Find preceding user message
  const listed = await conversation.listMessages(prisma, userId, conversationId);
  const msgs = listed?.messages || [];
  const idx = msgs.findIndex((m) => String(m.id) === String(messageId));
  let userContent = '';
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (msgs[i].role === 'user') {
      userContent = msgs[i].content;
      break;
    }
  }
  if (!userContent) {
    const err = new Error('No prior user message to regenerate from');
    err.status = 400;
    throw err;
  }

  await conversation.deleteMessage(prisma, messageId);

  // Re-run without duplicating the user message: temporarily add then... better path:
  // call send internals with skipUserPersist — for simplicity, delete last user too if consecutive, then resend.
  // Simpler: invoke retrieval+LLM and insert only assistant (reuse last user text).
  assertRateLimit(userId);
  const filters = applyRelativeDates(userContent, {
    keyword: extractKeyword(userContent),
  });
  const history = await conversation.recentTurns(prisma, conversationId, 8);
  const chitchat = isChitchat(userContent);
  const countOnly = looksLikeCountQuestion(userContent);
  let chunks = [];
  if (!chitchat && !countOnly) {
    try {
      chunks = await retrieveChunks(prisma, userContent, filters);
    } catch {
      chunks = [];
    }
  }
  if (chunks.length) {
    try {
      chunks = await enrichSources(prisma, chunks);
      chunks = chunks.map((c) => ({
        ...c,
        content: c.excerpt || c.content,
        metadata: c.metadata || {},
      }));
    } catch {
      /* keep raw */
    }
  }
  const analyticsNote = chitchat
    ? null
    : await buildAnalyticsNote(prisma, userContent, filters);
  const messages = buildMessages(userContent, chunks, history, { analyticsNote });

  let llmResult;
  if (typeof opts.onDelta === 'function') {
    llmResult = await completeStream(messages, opts.onDelta);
  } else {
    llmResult = await complete(messages);
  }

  const answer = llmResult.content || 'Could not regenerate a response.';
  let modelName = llmResult.model;
  try {
    modelName = modelName || getLLMConfig().model;
  } catch {
    /* ignore */
  }

  const assistantMsg = await conversation.addMessage(prisma, conversationId, {
    role: 'assistant',
    content: answer,
    modelName,
    tokenUsage: llmResult.usage || {},
  });
  let sourcesForStore = [];
  if (!chitchat && chunks.length) {
    sourcesForStore = filterCitedSources(answer, mapSources(chunks));
    if (sourcesForStore.length) {
      await conversation.addMessageSources(prisma, assistantMsg.id, sourcesForStore);
    }
  }

  return {
    assistantMessage: { ...assistantMsg, sources: sourcesForStore },
    sources: sourcesForStore,
  };
}

module.exports = {
  sendMessage,
  regenerate,
  assertRateLimit,
  isChitchat,
  filterCitedSources,
  applyRelativeDates,
};
