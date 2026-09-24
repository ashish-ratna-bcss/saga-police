const axios = require('axios');
const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');
const {
  buildSystemPrompt, buildUserContext, RETRY_MESSAGE, parseLLMReport, reportToMarkdown,
  BATCH_SYSTEM, buildBatchUserContext, parseBatchNotes, buildReducerSystemPrompt, buildReducerUserContext,
  estimateTokens, truncateToTokens, makeBatches, reducerToReport,
} = require('./eventSummary.prompt');
const {
  TARGET_ENTITIES,
  parseSentiment,
  classifyEventRelevance,
  classifyTargetEntity,
  getSentimentTargetSemantics,
  evaluateThreatRisk,
  calculateReconciledPercentages,
} = require('../../modules/events/eventTelemetry.service');

const getLLMConfig = () => {
  let baseUrl = (process.env.LLM_BASE_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl && process.env.OLLAMA_BASE_URL) {
    baseUrl = `${process.env.OLLAMA_BASE_URL.trim().replace(/\/$/, '')}/v1`;
  }
  const apiKey = (process.env.LLM_API_KEY || 'ollama').trim();
  const model = (process.env.LLM_MODEL || 'qwen3-14b').trim();
  const timeoutMs = Math.max(
    30000,
    Number(process.env.LLM_SUMMARY_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 180000)
  );
  const maxTokens = Math.min(
    4000,
    Math.max(1500, Number(process.env.LLM_SUMMARY_MAX_TOKENS || 3000))
  );

  if (!baseUrl) {
    const err = new Error('LLM_BASE_URL is not configured in environment (.env).');
    err.status = 500;
    throw err;
  }

  // Total context window of the model (input + output tokens). Override with LLM_CONTEXT_WINDOW if your model differs.
  const contextWindow = Math.max(4096, Number(process.env.LLM_CONTEXT_WINDOW || 16384));

  // Upper limit for the prompt itself. Override with LLM_MAX_INPUT_TOKENS if desired.
  const maxInputTokens = Math.max(2000, Number(process.env.LLM_MAX_INPUT_TOKENS || 12000));

  return { baseUrl, apiKey, model, timeoutMs, maxTokens, contextWindow, maxInputTokens };
};

/**
 * Safely parse numeric engagement from engagement JSON.
 */
const getEngagementTotal = (eng) => {
  if (!eng || typeof eng !== 'object') return 0;
  const likes = Number(eng.likes || eng.like_count || eng.favorite_count || 0) || 0;
  const reposts = Number(eng.retweets || eng.reposts || eng.shares || eng.share_count || 0) || 0;
  const comments = Number(eng.replies || eng.comments || eng.comment_count || 0) || 0;
  const views = Number(eng.views || eng.view_count || 0) || 0;
  return likes + reposts + comments + Math.floor(views / 10);
};

/** Serialize a stored summary row into the same shape the LLM generator returns. */
const serializeStoredSummary = (row) => ({
  ok: true,
  cached: true,
  event: row.event_snapshot || {},
  summary: row.summary_markdown,
  summary_source: row.summary_source,
  summary_truncated: row.summary_truncated,
  llm_finish_reason: row.llm_finish_reason,
  llm_error: row.llm_error,
  stats: row.stats || {},
  evidence_traceability: row.evidence_traceability || [],
  model: row.model,
  generated_at: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
  has_pdf: Boolean(row.pdf_base64),
  generated_by: { id: row.generated_by_id ?? null, name: row.generated_by_name || null },
});

/**
 * Ensures a string is safe UTF-8 without unpaired surrogate pairs, null bytes,
 * or broken escape sequences that crash tokenizers or PostgreSQL JSON serializers.
 */
const cleanSafeUtf8 = (val, maxLen = 0) => {
  if (val === null || val === undefined) return '';
  let s = String(val);
  if (typeof s.toWellFormed === 'function') {
    s = s.toWellFormed();
  } else {
    s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  }
  // Strip null bytes and non-printable control characters
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  s = s.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (maxLen > 0 && s.length > maxLen) {
    s = s.slice(0, maxLen);
    if (/[\uD800-\uDBFF]$/.test(s)) {
      s = s.slice(0, -1);
    }
  }
  // Strip dangling backslash and broken hex/unicode escapes
  s = s.replace(/\\x[0-9a-fA-F]{0,1}$/g, '').replace(/\\u[0-9a-fA-F]{0,3}$/g, '').replace(/\\+$/, '').trim();
  return s;
};

/** Same as cleanSafeUtf8 but keeps line breaks (used for whole prompts, where each post / stat sits on its own line). */
const cleanSafeUtf8Lines = (val) => String(val ?? '').split('\n').map((line) => cleanSafeUtf8(line)).join('\n');

/** Deeply sanitize object properties before saving into Prisma/PostgreSQL JSON fields */
const sanitizeForPostgresJson = (val) => {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return cleanSafeUtf8(val);
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeForPostgresJson);
  }
  if (val instanceof Date) {
    return val;
  }
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[cleanSafeUtf8(k)] = sanitizeForPostgresJson(v);
    }
    return out;
  }
  return val;
};

/** Current media count + max id for an event, used to detect drift against a cached summary. */
const getEventMediaCursor = async (prisma, numericId) => {
  const [{ _count, _max }] = await Promise.all([
    prisma.social_media_event_media.aggregate({
      where: { event_id: numericId },
      _count: { id: true },
      _max: { id: true },
    }),
  ]);
  return {
    count: _count.id || 0,
    maxId: _max.id != null ? _max.id : null,
  };
};

/**
 * Return the cached summary for an event, if one exists, along with a staleness flag
 * (true when posts have been ingested since the summary was generated). Does NOT call the LLM.
 */
const getCachedEventSummary = async (eventId, { db } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(eventId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const err = new Error('Invalid event ID');
    err.status = 400;
    throw err;
  }

  const row = await prisma.social_media_event_summaries.findUnique({
    where: { event_id: numericId },
  });
  if (!row) return null;

  const cursor = await getEventMediaCursor(prisma, numericId);
  const storedMaxId = row.last_media_id != null ? BigInt(row.last_media_id) : null;
  const currentMaxId = cursor.maxId != null ? BigInt(cursor.maxId) : null;
  const isStale =
    cursor.count !== row.posts_snapshot_count ||
    (currentMaxId != null && (storedMaxId == null || currentMaxId > storedMaxId));

  return {
    ...serializeStoredSummary(row),
    is_stale: isStale,
    new_posts_count: Math.max(0, cursor.count - row.posts_snapshot_count),
  };
};

/** Persist a freshly-generated summary result, upserted one-per-event. */
const persistEventSummary = async (prisma, numericId, result, cursor) => {
  const data = sanitizeForPostgresJson({
    summary_markdown: result.summary,
    summary_source: result.summary_source,
    llm_finish_reason: result.llm_finish_reason,
    summary_truncated: Boolean(result.summary_truncated),
    llm_error: result.llm_error,
    model: result.model,
    stats: result.stats,
    evidence_traceability: result.evidence_traceability,
    event_snapshot: result.event,
    posts_snapshot_count: cursor.count,
    last_media_id: cursor.maxId,
    generated_by_id: result.generated_by?.id ?? null,
    generated_by_name: result.generated_by?.name ?? null,
    generated_at: new Date(result.generated_at),
  });

  await prisma.social_media_event_summaries.upsert({
    where: { event_id: numericId },
    create: { event_id: numericId, ...data },
    update: data,
  });
};

/** Save a client-generated PDF (base64) against the cached summary row for an event. */
const saveEventSummaryPdf = async (eventId, pdfBase64, { db } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(eventId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const err = new Error('Invalid event ID');
    err.status = 400;
    throw err;
  }
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    const err = new Error('pdfBase64 is required');
    err.status = 400;
    throw err;
  }

  try {
    await prisma.social_media_event_summaries.update({
      where: { event_id: numericId },
      data: { pdf_base64: pdfBase64 },
    });
  } catch (err) {
    if (err.code === 'P2025') {
      const notFound = new Error('No cached summary exists for this event yet');
      notFound.status = 404;
      throw notFound;
    }
    throw err;
  }
  return { ok: true };
};

/**
 * Groups the per-post batch notes by topic label and pulls out claims, shifts and hashtags for the final call.
 * Small clusters beyond the 25 largest are merged into "Other topics" so the final prompt stays small.
 */
const buildBatchDigest = (notesMap, analysed) => {
  const numOf = (x) => Number((String(x.citationTag).match(/\d+/) || [])[0]);
  const byNo = new Map(analysed.map((x) => [numOf(x), x]));
  const clustersByLabel = new Map();
  const claims = [];
  const shifts = [];
  const hashtagCounts = new Map();

  for (const [numStr, note] of Object.entries(notesMap)) {
    const n = Number(numStr);
    const snippet = byNo.get(n);
    if (!snippet) continue;
    const label = note.narrative || 'General updates';
    const key = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();   // "Police Exam" and "police exam" are one topic
    if (!clustersByLabel.has(key)) {
      clustersByLabel.set(key, { label, posts: [], sentiment: { positive: 0, neutral: 0, negative: 0 }, platforms: {}, examples: [] });
    }
    const c = clustersByLabel.get(key);
    c.posts.push(n);
    c.sentiment[snippet.sentiment || 'neutral'] = (c.sentiment[snippet.sentiment || 'neutral'] || 0) + 1;
    c.platforms[snippet.platform || 'x'] = (c.platforms[snippet.platform || 'x'] || 0) + 1;
    if (c.examples.length < 3) c.examples.push({ n, gist: note.gist || truncateToTokens(snippet.text, 45) });
    if (note.claim) claims.push({ n, claim: note.claim });
    if (note.shift) shifts.push({ n, shift: note.shift });
    (String(snippet.text || '').match(/#[\p{L}\p{N}_]+/gu) || []).forEach((t) => {
      const tag = t.toLowerCase();
      hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
    });
  }

  let clusters = Array.from(clustersByLabel.values()).sort((a, b) => b.posts.length - a.posts.length);
  if (clusters.length > 25) {
    const rest = clusters.slice(25);
    const merged = { label: 'Other topics', posts: [], sentiment: { positive: 0, neutral: 0, negative: 0 }, platforms: {}, examples: [] };
    rest.forEach((c) => {
      merged.posts.push(...c.posts);
      Object.entries(c.sentiment).forEach(([k, v]) => { merged.sentiment[k] += v; });
      Object.entries(c.platforms).forEach(([k, v]) => { merged.platforms[k] = (merged.platforms[k] || 0) + v; });
      if (merged.examples.length < 3) merged.examples.push(...c.examples.slice(0, 1));
    });
    clusters = [...clusters.slice(0, 25), merged];
  }
  return {
    total: Object.keys(notesMap).length,
    clusters,
    claims: claims.slice(0, 12),
    shifts: shifts.slice(0, 8),
    hashtags: Array.from(hashtagCounts.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 12),
  };
};

/**
 * Generate comprehensive AI Executive Summary for an event using telemetry and LLM.
 * Fetches and analyzes ALL rows (N rows) for the event from the database.
 * Result is cached (upserted) into social_media_event_summaries for instant re-open.
 *
 * @param {number|string} eventId
 * @param {object} [options]
 * @param {object} [options.generatedBy] - { id, name } of the user who triggered generation
 */
const generateEventSummary = async (eventId, { db, generatedBy } = {}) => {
  const prisma = dbOf(db);
  const numericId = Number(eventId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    const err = new Error('Invalid event ID');
    err.status = 400;
    throw err;
  }

  // 1. Fetch Event details
  const event = await prisma.social_media_events.findUnique({
    where: { id: numericId },
  });
  if (!event) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  // Keywords list
  let keywordsList = [];
  try {
    if (Array.isArray(event.keywords)) {
      keywordsList = event.keywords.map((k) => (typeof k === 'string' ? k : k?.keyword)).filter(Boolean);
    }
  } catch {}

  // 2. Fetch ALL Event Media rows without arbitrary limit
  const mediaRows = await prisma.social_media_event_media.findMany({
    where: { event_id: numericId },
    select: {
      id: true,
      platform: true,
      text: true,
      author_name: true,
      author_handle: true,
      url: true,
      engagement: true,
      posted_at: true,
      fetched_at: true,
      analysis_result: true,
    },
    orderBy: [{ posted_at: 'desc' }, { id: 'desc' }],
    take: 5000,
  });

  const totalMediaCount = mediaRows.length;

  // 3. Compute telemetry aggregations across ALL N rows using unified logic
  const platformCounts = {};
  const overallSentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  const relevantSentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  const stanceCounts = { support: 0, oppose: 0, neutral: 0 };
  const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  const targetBreakdown = {
    [TARGET_ENTITIES.GOVERNMENT]: { total: 0, praise: 0, news: 0, criticism: 0 },
    [TARGET_ENTITIES.POLICE]: { total: 0, praise: 0, news: 0, criticism: 0 },
    [TARGET_ENTITIES.POLITICAL_LEADER]: { total: 0, praise: 0, news: 0, criticism: 0 },
    [TARGET_ENTITIES.ORGANIZATION]: { total: 0, praise: 0, news: 0, criticism: 0 },
    [TARGET_ENTITIES.OTHER]: { total: 0, praise: 0, news: 0, criticism: 0 },
  };

  let totalEngagement = {
    likes: 0,
    shares: 0,
    comments: 0,
    views: 0,
  };

  let earliestPost = null;
  let latestPost = null;
  let relevantPostsCount = 0;
  let unrelatedPostsCount = 0;
  let totalKeywordMentionsCount = 0;

  // Categorized candidates for prioritized LLM context inclusion
  const highRiskPosts = [];
  const highViralPosts = [];
  const criticismNegativePosts = [];
  const relevantPosts = [];
  const peripheralPosts = [];

  for (const m of mediaRows) {
    // Platform
    let p = String(m.platform || 'unknown').toLowerCase().trim();
    if (p === 'twitter') p = 'x';
    platformCounts[p] = (platformCounts[p] || 0) + 1;

    // Dates
    const postDt = m.posted_at ? new Date(m.posted_at) : (m.fetched_at ? new Date(m.fetched_at) : null);
    if (postDt && !isNaN(postDt.getTime())) {
      if (!earliestPost || postDt < earliestPost) earliestPost = postDt;
      if (!latestPost || postDt > latestPost) latestPost = postDt;
    }

    // Engagement totals
    const eng = m.engagement || {};
    totalEngagement.likes += Number(eng.likes || eng.like_count || 0) || 0;
    totalEngagement.shares += Number(eng.shares || eng.retweets || eng.share_count || 0) || 0;
    totalEngagement.comments += Number(eng.comments || eng.replies || eng.comment_count || 0) || 0;
    totalEngagement.views += Number(eng.views || eng.view_count || 0) || 0;

    // Unified sentiment and threat evaluation
    const analysis = m.analysis_result || {};
    const sent = parseSentiment(analysis.sentiment || analysis.label || 'neutral');
    overallSentimentCounts[sent] = (overallSentimentCounts[sent] || 0) + 1;

    // Stance
    const st = String(analysis.stance || 'neutral').toLowerCase();
    if (st.includes('support') || st.includes('pro') || st.includes('favour')) stanceCounts.support++;
    else if (st.includes('oppose') || st.includes('anti') || st.includes('against')) stanceCounts.oppose++;
    else stanceCounts.neutral++;

    // Strict Threat/Risk evaluation (Decoupled from criticism)
    const { riskLevel, riskScore, hasThreatVector } = evaluateThreatRisk(analysis, m.text || '');
    if (riskLevel === 'critical') riskCounts.critical++;
    else if (riskLevel === 'high') riskCounts.high++;
    else if (riskLevel === 'medium') riskCounts.medium++;
    else riskCounts.low++;

    // Event Relevance Classification
    const relevance = classifyEventRelevance(m.text || '', event.name, keywordsList);
    const targetEntity = classifyTargetEntity(m.text || '', m.author_name || m.author_handle || '', analysis);
    const targetSemantics = getSentimentTargetSemantics(sent);

    // Count keyword mentions per post
    const matchedKws = Array.isArray(analysis.matched_keywords) ? analysis.matched_keywords : [];
    if (matchedKws.length > 0) {
      totalKeywordMentionsCount += matchedKws.length;
    } else if (m.text) {
      // Check count against tracked keywords
      const textLower = m.text.toLowerCase();
      const kwHits = keywordsList.filter((k) => textLower.includes(String(k).toLowerCase())).length;
      totalKeywordMentionsCount += Math.max(1, kwHits);
    }

    if (relevance.isRelevant) {
      relevantPostsCount++;
      relevantSentimentCounts[sent] = (relevantSentimentCounts[sent] || 0) + 1;

      if (targetBreakdown[targetEntity]) {
        targetBreakdown[targetEntity].total++;
        if (sent === 'positive') targetBreakdown[targetEntity].praise++;
        else if (sent === 'negative') targetBreakdown[targetEntity].criticism++;
        else targetBreakdown[targetEntity].news++;
      }
    } else {
      unrelatedPostsCount++;
    }

    // Format post snippet cleanly (single-line, stripped excess whitespace, safe UTF-8)
    if (m.text && m.text.trim().length > 3) {
      const cleanText = cleanSafeUtf8(m.text, 180);

      const snippet = {
        id: String(m.id),
        platform: cleanSafeUtf8(p, 20),
        author: cleanSafeUtf8(m.author_name || m.author_handle || 'Unknown', 40),
        text: cleanText,
        sentiment: sent,
        target_entity: targetEntity,
        target_semantic: targetSemantics.label,
        risk_level: riskLevel,
        risk_score: riskScore,
        has_threat_vector: hasThreatVector,
        is_relevant: relevance.isRelevant,
        url: m.url || null,
        engagementScore: getEngagementTotal(m.engagement),
        postedAt: m.posted_at,
      };

      if (relevance.isRelevant) {
        if (hasThreatVector || riskLevel === 'critical' || riskLevel === 'high') {
          highRiskPosts.push(snippet);
        } else if (snippet.engagementScore > 30) {
          highViralPosts.push(snippet);
        } else if (sent === 'negative') {
          criticismNegativePosts.push(snippet);
        } else {
          relevantPosts.push(snippet);
        }
      } else {
        peripheralPosts.push(snippet);
      }
    }
  }

  // 4. Collect ALL posts in prioritized order (Critical/Threat -> Viral -> Criticism -> Other Relevant -> Peripheral)
  highViralPosts.sort((a, b) => b.engagementScore - a.engagementScore);
  const allSnippets = [];
  const seenIds = new Set();

  const addSnippet = (s) => {
    if (!s || seenIds.has(s.id)) return;
    seenIds.add(s.id);
    allSnippets.push(s);
  };

  highRiskPosts.forEach(addSnippet);
  highViralPosts.forEach(addSnippet);
  criticismNegativePosts.forEach(addSnippet);
  relevantPosts.forEach(addSnippet);
  peripheralPosts.forEach(addSnippet);

  // Index all posts with clear reference tags: [Post #1], [Post #2], ...
  const indexedSnippets = allSnippets.map((s, idx) => ({
    ...s,
    citationTag: `[Post #${idx + 1}]`,
  }));

  // Reconciled platform percentages (e.g. X: 77%, YouTube: 23%)
  const platformPercentages = calculateReconciledPercentages(platformCounts);

  // Reconciled sentiment percentages
  const activeSentiment = relevantPostsCount > 0 ? relevantSentimentCounts : overallSentimentCounts;
  const sentimentPercentages = calculateReconciledPercentages(activeSentiment);

  // 5. Prompt + answer contract live in ONE file: eventSummary.prompt.js
  const { baseUrl, apiKey, model, timeoutMs, maxTokens, contextWindow, maxInputTokens } = getLLMConfig();
  const promptCtx = {
    event, keywordsList, totalMediaCount, relevantPostsCount, unrelatedPostsCount, totalKeywordMentionsCount,
    earliestPost, latestPost, platformCounts, platformPercentages, activeSentiment, sentimentPercentages,
    targetBreakdown, riskCounts, totalEngagement, indexedSnippets,
  };

  // ---- Which posts the AI reads. Relevant posts only (unrelated noise stays in the statistics, not in the analysis),
  // in priority order: risk, reach, criticism, then the rest. Numbers #1..#n are the [Post #n] citation tags.
  const MAX_ANALYSED = Math.max(20, Number(process.env.LLM_MAX_ANALYSED_POSTS || 400));
  const relevantIndexed = indexedSnippets.filter((x) => x.is_relevant);
  const analysed = (relevantIndexed.length ? relevantIndexed : indexedSnippets).slice(0, MAX_ANALYSED);
  const postNo = (x) => Number((String(x.citationTag).match(/\d+/) || [])[0]);
  promptCtx.indexedSnippets = analysed;

  // ---- Token budget: input + output must fit the model's context window (e.g. 16384). Tokens are ESTIMATED per script
  // (Odia costs ~2 tokens per character, Hindi ~1); a flat chars-per-token guess overflowed the window by 5x.
  const SAFETY_MARGIN_TOKENS = 700;
  const REPORT_OUTPUT_TOKENS = Math.min(4500, maxTokens);   // the full report JSON
  const NOTES_OUTPUT_TOKENS = Math.min(2600, maxTokens);    // one batch of per-post notes
  const systemPrompt = cleanSafeUtf8Lines(buildSystemPrompt(promptCtx));
  const msgTokens = (messages) => messages.reduce((n, m) => n + estimateTokens(m.content) + 6, 0);
  const outputTokensFor = (messages, wanted) => Math.max(300, Math.min(wanted, contextWindow - msgTokens(messages) - SAFETY_MARGIN_TOKENS));
  const singleInputBudget = Math.min(contextWindow - REPORT_OUTPUT_TOKENS - SAFETY_MARGIN_TOKENS, maxInputTokens) - estimateTokens(systemPrompt);
  const llmUserContext = cleanSafeUtf8Lines(buildUserContext(promptCtx));
  const fitsOneCall = estimateTokens(llmUserContext) <= singleInputBudget;

  let summaryMarkdown = '';
  let summarySource = 'llm';
  let llmError = null;
  let summaryTruncated = false;
  let llmFinishReason = null;
  let structuredReport = null;
  let coverage = { analysed: analysed.length, noted: analysed.length, mode: 'single' };

  try {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // One HTTP call. Server errors (5xx / dropped connection) are retried twice; a 400 is retried once without the
    // Qwen3 "thinking off" option in case the server rejects it. Thinking is OFF: it would spend the output tokens.
    const callLLM = async (messages, wantedOutput) => {
      const clean = messages.map((m) => ({ role: cleanSafeUtf8(m.role || 'user'), content: cleanSafeUtf8Lines(m.content || '') }));
      const pauses = [3000, 8000];
      let thinkingOff = true;
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await axios.post(
            `${baseUrl}/chat/completions`,
            {
              model,
              messages: clean,
              max_tokens: outputTokensFor(clean, wantedOutput),
              temperature: 0.15,
              ...(thinkingOff ? { chat_template_kwargs: { enable_thinking: false } } : {}),
            },
            { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: timeoutMs }
          );
        } catch (err) {
          const status = err?.response?.status;
          if (status === 400 && thinkingOff) { thinkingOff = false; continue; }
          if ((!status || status >= 500) && attempt < pauses.length) {
            logger.warn(`[SummaryLLM] Model server error (${status || err.code}); retrying in ${pauses[attempt] / 1000}s`);
            await sleep(pauses[attempt]);
            continue;
          }
          throw err;
        }
      }
    };

    if (!fitsOneCall) {
      // ---- BIG EVENT: every analysed post is read, in token-sized batches, ONE AT A TIME (the GPU is small), then ONE final call.
      const numbered = analysed.map((x) => ({ n: postNo(x), platform: x.platform, author: x.author, sentiment: x.sentiment, text: x.text }));
      const batches = makeBatches(numbered);
      logger.info(`[SummaryLLM] ${analysed.length} posts -> ${batches.length} batches, then one final report call`);
      const notesMap = {};
      // One batch. If the reply is unusable (cut off / not JSON) the batch is retried once as two smaller halves.
      const readBatch = async (batch, canSplit) => {
        const validNumbers = new Set(batch.map((q) => q.n));
        try {
          const res = await callLLM([{ role: 'system', content: BATCH_SYSTEM }, { role: 'user', content: buildBatchUserContext(batch) }], NOTES_OUTPUT_TOKENS);
          const notes = parseBatchNotes(res.data?.choices?.[0]?.message?.content || '', validNumbers);
          if (notes) { Object.assign(notesMap, notes); return; }
          logger.warn(`[SummaryLLM] Batch reply unusable (${batch.length} posts, finish=${res.data?.choices?.[0]?.finish_reason})`);
        } catch (batchErr) {
          logger.warn(`[SummaryLLM] Batch failed (${batch.length} posts): ${batchErr.message}`);
        }
        if (canSplit && batch.length > 6) {
          const mid = Math.ceil(batch.length / 2);
          await readBatch(batch.slice(0, mid), false);
          await readBatch(batch.slice(mid), false);
        }
      };
      // Batches run ONE AT A TIME by default: the model server is shared with other apps (e.g. the sentiment API) and its GPU is small.
      // Raise LLM_BATCH_CONCURRENCY (e.g. 2) only if the server has spare capacity.
      const batchConcurrency = Math.max(1, Math.min(4, Number(process.env.LLM_BATCH_CONCURRENCY || 1)));
      let nextBatch = 0;
      await Promise.all(Array.from({ length: Math.min(batchConcurrency, batches.length) }, async () => {
        while (nextBatch < batches.length) { const mine = batches[nextBatch]; nextBatch += 1; await readBatch(mine, true); }
      }));
      if (!Object.keys(notesMap).length) throw new Error('No batch of posts could be analysed by the language model.');
      coverage = { analysed: analysed.length, noted: Object.keys(notesMap).length, mode: 'batched', batches: batches.length };

      const digest = buildBatchDigest(notesMap, analysed);
      const reducerMessages = [
        { role: 'system', content: buildReducerSystemPrompt(promptCtx) },
        { role: 'user', content: buildReducerUserContext(promptCtx, digest) },
      ];
      for (let attempt = 0; attempt < 2 && !structuredReport; attempt += 1) {
        const finalRes = await callLLM(reducerMessages, REPORT_OUTPUT_TOKENS);
        const choice = finalRes.data?.choices?.[0] || {};
        llmFinishReason = choice.finish_reason || null;
        const rawReport = choice.message?.content || '';
        structuredReport = reducerToReport(rawReport, digest, notesMap, analysed);
        if (!structuredReport) {
          logger.warn(`[SummaryLLM] Final reply was not the required JSON (attempt ${attempt + 1}, finish_reason=${llmFinishReason})`);
          reducerMessages.push({ role: 'assistant', content: rawReport }, { role: 'user', content: RETRY_MESSAGE });
        }
      }
      if (structuredReport) {
        // Measured narrative volumes over ALL analysed posts (not just the cited ones).
        const byNo = new Map(analysed.map((x) => [postNo(x), x]));
        structuredReport.narratives.forEach((n) => {
          const st = { total: n.posts.length, sentiment: { positive: 0, neutral: 0, negative: 0 }, platforms: {} };
          n.posts.forEach((no) => {
            const x = byNo.get(no);
            if (!x) return;
            st.sentiment[x.sentiment] = (st.sentiment[x.sentiment] || 0) + 1;
            st.platforms[x.platform] = (st.platforms[x.platform] || 0) + 1;
          });
          n.stats = st;
        });
      }
    } else {
      // ---- SMALL EVENT: every analysed post fits in one prompt.
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: llmUserContext },
      ];
      for (let attempt = 0; attempt < 2 && !structuredReport; attempt += 1) {
        const llmRes = await callLLM(messages, REPORT_OUTPUT_TOKENS);
        const choice = llmRes.data?.choices?.[0] || {};
        llmFinishReason = choice.finish_reason || null;
        const rawContent = choice.message?.content || '';
        structuredReport = parseLLMReport(rawContent, analysed);
        if (!structuredReport) {
          logger.warn(`[SummaryLLM] Reply was not the required JSON (attempt ${attempt + 1}, finish_reason=${llmFinishReason}, len=${rawContent.length})`);
          messages.push({ role: 'assistant', content: rawContent }, { role: 'user', content: RETRY_MESSAGE });
        }
      }
    }
    if (structuredReport) structuredReport.coverage = coverage;

    if (!structuredReport) throw new Error('The language model did not return the required JSON structure.');
    summaryMarkdown = reportToMarkdown(structuredReport, event.name);
    summaryTruncated = false;
  } catch (err) {
    summarySource = 'fallback';
    const body = err?.response?.data;
    const bodyText = typeof body === 'string' ? body.slice(0, 200) : '';
    llmError = err?.response?.data?.error?.message || err?.response?.data?.message || (err?.response?.status
      ? `LLM server returned HTTP ${err.response.status}${bodyText ? ` (${bodyText})` : ''}. The model server may be down or overloaded.`
      : err.message);
    logger.error(`[SummaryLLM] LLM completion failed: ${llmError}`);

    const topCitations = indexedSnippets.slice(0, 5).map((s) => `- ${s.citationTag} (${s.platform.toUpperCase()} @${s.author}): "${s.text.slice(0, 140)}..." [Target: ${s.target_entity} - ${s.target_semantic}]`).join('\n');

    summaryMarkdown = `# 📋 Event Summary: ${event.name}

### 📌 1. Situation & Event Scope
Monitoring analysis synthesized across **${totalMediaCount.toLocaleString('en-IN')} unique posts** for **${event.name}** (${event.location || 'General Region'}). Monitored channels include ${(event.platforms || []).join(', ') || 'social networks'}. Of the total posts, **${relevantPostsCount}** were classified as directly relevant to the event, while **${unrelatedPostsCount}** peripheral background posts were excluded from the event sentiment analysis.

### 🌐 2. Social Commentary & Target Sentiment
Analyzed social commentary toward key targets reflects:
- **Praise (Positive)**: **${activeSentiment.positive} posts** (${sentimentPercentages.positive}%) commend policy execution and official initiatives.
- **News / Updates (Neutral)**: **${activeSentiment.neutral} posts** (${sentimentPercentages.neutral}%) consist of factual developments, media reporting, and announcements.
- **Criticism (Negative feedback)**: **${activeSentiment.negative} posts** (${sentimentPercentages.negative}%) represent public feedback and policy critique, strictly decoupled from threat vectors.

### 📢 3. Key Narratives & Public Claims
Key discussions circulating across monitored feeds focus on event milestones, economic implications, and stakeholder statements.
${topCitations ? `\n**Sampled Evidence Citations:**\n${topCitations}\n` : ''}
*Total tracked keyword mentions across all terms: **${totalKeywordMentionsCount}** (posts frequently match multiple keywords).*

### ⚠️ 4. Threat & Public Order Risk Assessment
Public order evaluation indicates **${riskCounts.critical + riskCounts.high} critical/high threat signals** and **${riskCounts.medium} medium risk items**.
- **Important Distinction**: Negative sentiment (${activeSentiment.negative} posts) represents policy criticism and grievance feedback, and does not constitute an agitation or disruption signal.
- No organized bandhs, violent mobilization, or disruption vectors were identified within the monitored sample.

### 👥 5. Amplifiers & Key Vector Channels
Distribution of analyzed content by platform:
${Object.entries(platformCounts).map(([p, count]) => `- **${p.toUpperCase()}**: ${count} posts (${platformPercentages[p] || 0}%)`).join('\n')}

### 🎯 6. Recommended Operational Actions for Law Enforcement
1. **Targeted Verification**: Maintain priority monitoring over high-engagement channels to quickly verify speculative claims.
2. **Grievance Clarification**: Address constructive criticism regarding summit logistics or policies with prompt factual updates.
3. **Traceable Intelligence**: Ensure all operational situation reports continue to reference underlying post evidence citations.
`;
  }

  // Evidence register = the top 32 posts by priority (risk, reach, criticism) plus any other post the report cites.
  const EVIDENCE_SAMPLE = 32;
  const evidenceNumbers = new Set(analysed.slice(0, EVIDENCE_SAMPLE).map(postNo));
  if (structuredReport) {
    const { postNarrative, sourceTypes, ...citable } = structuredReport;
    (JSON.stringify(citable).match(/\[Post #(\d+)\]/g) || []).forEach((t) => evidenceNumbers.add(Number(t.replace(/\D/g, ''))));
    [...(structuredReport.claims || []), ...(structuredReport.actions || []), ...(structuredReport.emerging || [])].forEach((c) => (c.posts || []).slice(0, 3).forEach((n) => evidenceNumbers.add(n)));
    (structuredReport.changes || []).forEach((c) => evidenceNumbers.add(c.post));
  }
  const evidenceList = analysed.filter((x) => evidenceNumbers.has(postNo(x))).slice(0, 90);

  const result = {
    ok: true,
    event: {
      id: event.id,
      name: event.name,
      location: event.location,
      monitoring_status: event.monitoring_status,
      keywords: keywordsList,
      platforms: event.platforms,
      start_date: event.start_date,
      end_date: event.end_date,
    },
    summary: summaryMarkdown,
    summary_source: summarySource,
    summary_truncated: summaryTruncated,
    llm_finish_reason: llmFinishReason,
    llm_error: llmError,
    stats: {
      total_media_count: totalMediaCount,
      total_unique_posts: totalMediaCount,
      relevant_posts_count: relevantPostsCount,
      unrelated_posts_count: unrelatedPostsCount,
      total_keyword_mentions: totalKeywordMentionsCount,
      analyzed_sample_count: analysed.length,
      platform_counts: platformCounts,
      platform_percentages: platformPercentages,
      sentiment_counts: activeSentiment,
      sentiment_percentages: sentimentPercentages,
      target_classification: targetBreakdown,
      stance_counts: stanceCounts,
      risk_counts: riskCounts,
      total_engagement: totalEngagement,
      date_range: {
        start: earliestPost ? earliestPost.toISOString() : null,
        end: latestPost ? latestPost.toISOString() : null,
      },
    },
    evidence_traceability: evidenceList.map((s) => ({
      citationTag: s.citationTag,
      id: s.id,
      platform: s.platform,
      author: s.author,
      text: s.text,
      sentiment: s.sentiment,
      target_entity: s.target_entity,
      target_semantic: s.target_semantic,
      risk_level: s.risk_level,
      url: s.url,
    })),
    model,
    generated_at: new Date().toISOString(),
    generated_by: {
      id: generatedBy?.id ?? null,
      name: generatedBy?.name || generatedBy?.username || null,
    },
  };

  // The structured report (narratives, claims, findings...) came from the same LLM call; saved with the summary in stats JSON.
  if (structuredReport) result.stats.structured_report = structuredReport;

  // 6. Cache the result so re-opening the dialog is instant until new posts arrive.
  try {
    const cursor = await getEventMediaCursor(prisma, numericId);
    await persistEventSummary(prisma, numericId, result, cursor);
  } catch (persistErr) {
    logger.error(`[SummaryLLM] Failed to cache event summary: ${persistErr.message}`);
  }

  return result;
};

module.exports = {
  generateEventSummary,
  getCachedEventSummary,
  saveEventSummaryPdf,
  getLLMConfig,
  __test: { buildBatchDigest },
};
