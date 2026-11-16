const conversation = require('./conversation.service');
const {
  retrieveChunks,
  looksLikeCountQuestion,
  countPostsInRange,
  countAlertsInRange,
} = require('./retrieval.service');
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
  const quoted = q.match(/"([^"]{2,80})"/);
  if (quoted) return quoted[1];
  const stop = new Set([
    'what', 'which', 'when', 'where', 'show', 'find', 'about', 'related', 'the', 'and', 'for',
    'from', 'this', 'that', 'with', 'have', 'were', 'been', 'into', 'over', 'last', 'month',
    'week', 'days', 'how', 'many', 'please', 'give', 'summary', 'summarize', 'today',
    'yesterday', 'total', 'posts', 'alerts', 'count', 'number', 'high', 'low', 'medium',
  ]);
  const tokens = q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t));
  return tokens.slice(0, 3).join(' ') || null;
}

function isChitchat(question) {
  const q = String(question || '').trim().toLowerCase();
  if (!q || q.length > 80) return false;
  return /^(hi|hello|hey|yo|thanks|thank you|ok|okay|good morning|good evening|good afternoon|namaste|hola)[\s!.?]*$/i.test(
    q
  );
}

function isMetaOrErrorPaste(question) {
  return /prisma\.\$|executeRawUnsafe|invalid input syntax for type uuid|P2024|Timed out fetching a new connection|connection pool|Raw query failed|stack trace|TypeError:|ReferenceError:/i.test(
    String(question || '')
  );
}

/** Soft date filters from phrasing when UI dates are empty — still one retrieval path. */
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

function summarizeAnswer(answer, sourceCount) {
  let text = String(answer || '')
    .replace(/```html[\s\S]*?```/gi, '')
    .replace(/```ui[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
  if (!text) {
    return sourceCount
      ? `Here ${sourceCount === 1 ? 'is' : 'are'} ${sourceCount} result${sourceCount === 1 ? '' : 's'}.`
      : '';
  }
  if (sourceCount > 0) {
    const firstPara = text.split(/\n\s*\n/)[0] || text;
    text = firstPara
      .split('\n')
      .filter((line) => !/^\s*(\*\*|[-*]|\d+\.)/.test(line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 220) {
      const m = text.slice(0, 220).match(/^[\s\S]{20,200}?[.!?](?=\s|$)/);
      text = (m ? m[0] : text.slice(0, 180)).trim();
      if (!/[.!?]$/.test(text)) text = `${text}…`;
    }
  }
  return text.slice(0, 400);
}

async function buildAnalytics(prisma, question, filters) {
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
    return {
      posts,
      alerts,
      note: `social_media_posts matching filters: ${posts}; social_media_alerts in range: ${alerts}.`,
    };
  } catch {
    return null;
  }
}

function buildView(question, sources, analytics) {
  if (analytics && looksLikeCountQuestion(question)) {
    return {
      layout: 'stats',
      title: 'Counts',
      stats: [
        { label: 'Posts', value: analytics.posts },
        { label: 'Alerts', value: analytics.alerts },
      ],
    };
  }
  if (sources?.length) {
    return { layout: 'cards', title: 'Matching records', items: sources };
  }
  return { layout: 'text' };
}

async function runRagTurn(prisma, question, filters, prior, opts = {}) {
  const chitchat = isChitchat(question);
  const metaPaste = isMetaOrErrorPaste(question);
  const countOnly = looksLikeCountQuestion(question);

  let chunks = [];
  if (!chitchat && !metaPaste && !countOnly) {
    try {
      chunks = await retrieveChunks(prisma, question, filters);
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
        excerpt: c.excerpt || String(c.content || '').slice(0, 400),
        metadata: c.metadata || {},
      }));
    } catch {
      /* keep raw */
    }
  }

  const analytics = chitchat || metaPaste ? null : await buildAnalytics(prisma, question, filters);
  const messages = buildMessages(question, chunks, prior, {
    analyticsNote: analytics?.note || null,
  });

  let llmResult;
  if (typeof opts.onDelta === 'function') {
    llmResult = await completeStream(messages, opts.onDelta);
  } else {
    llmResult = await complete(messages);
  }

  const rawAnswer =
    llmResult.content ||
    (chunks.length
      ? 'I found related records but could not generate a summary. Please try again.'
      : chitchat
        ? 'Hello! How can I help you with your records today?'
        : metaPaste
          ? 'That looks like a system error paste, not a data question. Ask about your records (posts, alerts, events).'
          : 'I could not find relevant records in this tenant database for that question.');

  let modelName = llmResult.model;
  try {
    modelName = modelName || getLLMConfig().model;
  } catch {
    /* ignore */
  }

  let sourcesForStore = [];
  if (!chitchat && !metaPaste && chunks.length) {
    const mapped = mapSources(chunks);
    const cited = filterCitedSources(rawAnswer, mapped);
    sourcesForStore = cited.length ? cited : mapped;
  }

  const answer = summarizeAnswer(rawAnswer, sourcesForStore.length);
  const view = buildView(question, sourcesForStore, analytics);

  return {
    answer,
    modelName,
    usage: llmResult.usage || {},
    sourcesForStore,
    view,
  };
}

/**
 * Full RAG turn: persist user msg, retrieve, LLM, persist assistant + sources.
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

  const filters = applyRelativeDates(content, {
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

  if (!conv.title || conv.title === 'New chat') {
    await conversation.renameConversation(prisma, userId, conversationId, content.slice(0, 80));
  }

  const history = await conversation.recentTurns(prisma, conversationId, 8);
  const prior = history.slice(0, -1);

  const { answer, modelName, usage, sourcesForStore, view } = await runRagTurn(
    prisma,
    content,
    filters,
    prior,
    opts
  );

  const assistantMsg = await conversation.addMessage(prisma, conversationId, {
    role: 'assistant',
    content: answer,
    modelName,
    tokenUsage: { ...usage, view },
  });

  if (sourcesForStore.length) {
    await conversation.addMessageSources(prisma, assistantMsg.id, sourcesForStore);
  }

  return {
    userMessage: userMsg,
    assistantMessage: { ...assistantMsg, sources: sourcesForStore, view },
    sources: sourcesForStore,
    view,
  };
}

async function regenerate(prisma, userId, conversationId, messageId, opts = {}) {
  const msg = await conversation.getMessageForUser(prisma, userId, conversationId, messageId);
  if (!msg || msg.role !== 'assistant') {
    const err = new Error('Assistant message not found');
    err.status = 404;
    throw err;
  }

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
  assertRateLimit(userId);

  const filters = applyRelativeDates(userContent, {
    keyword: extractKeyword(userContent),
  });
  const history = await conversation.recentTurns(prisma, conversationId, 8);

  const { answer, modelName, usage, sourcesForStore, view } = await runRagTurn(
    prisma,
    userContent,
    filters,
    history,
    opts
  );

  const assistantMsg = await conversation.addMessage(prisma, conversationId, {
    role: 'assistant',
    content: answer,
    modelName,
    tokenUsage: { ...usage, view },
  });
  if (sourcesForStore.length) {
    await conversation.addMessageSources(prisma, assistantMsg.id, sourcesForStore);
  }

  return {
    assistantMessage: { ...assistantMsg, sources: sourcesForStore, view },
    sources: sourcesForStore,
    view,
  };
}

module.exports = {
  sendMessage,
  regenerate,
  assertRateLimit,
  isChitchat,
  filterCitedSources,
  applyRelativeDates,
  summarizeAnswer,
  buildView,
};
