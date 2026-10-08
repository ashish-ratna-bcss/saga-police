require('dotenv').config();
const axios = require('axios');
const dbOf = require('../../lib/dbOf');
const { freshReview } = require('./reviewState');
const logger = require('../../lib/logger');
const {
  buildSystemPrompt, buildUserContext, RETRY_MESSAGE, parseLLMReport, reportToMarkdown,
  BATCH_SYSTEM, buildBatchUserContext, parseBatchNotes, buildReducerSystemPrompt, buildReducerUserContext,
  estimateTokens, truncateToTokens, makeBatches, reducerToReport, extractJson,
} = require('./eventSummary.prompt');
const eventConfig = require('../../modules/events/event.config');
const { cleanText } = require('./styleLint');
const { getTenantProfile } = require('../../modules/events/eventIntelligenceReport/tenantProfile');
const { resolvePlace } = require('./geo.service');
const { FACTS_SYSTEM, buildFactsUserContext, parseFacts, aggregateFacts, factsPackText } = require('./eventFacts');
const {
  TARGET_ENTITIES,
  parseSentiment,
  classifyEventRelevance,
  classifyTargetEntity,
  getSentimentTargetSemantics,
  evaluateThreatRisk,
  calculateReconciledPercentages,
} = require('../../modules/events/eventTelemetry.service');
const { postedAtRangeWhere, eventPublicationWindow } = require('../../modules/events/event.utils');
const { headquartersPromptLine, resolveHeadquarters, reportLanguageFor } = require('../../modules/events/eventIntelligenceReport/headquarters');

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
  // A new generation is a new draft; the previous version's approval history is kept.
  try {
    const prev = await prisma.social_media_event_summaries.findUnique({ where: { event_id: numericId }, select: { stats: true } });
    result.stats = { ...(result.stats || {}), review: freshReview(prev?.stats?.review, { preparedBy: result.generated_by?.name || '', preparedAt: result.generated_at }) };
  } catch (e) {
    result.stats = { ...(result.stats || {}), review: freshReview(null, { preparedBy: result.generated_by?.name || '', preparedAt: result.generated_at }) };
  }
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

function computeEffectiveDateWindow(event, timeframe = 'full', fromDate = null, toDate = null) {
  const eventWindow = eventPublicationWindow(event);
  const now = new Date();
  let start = null;
  let end = null;
  let label = 'Full Event Range';

  const tf = String(timeframe || 'full').toLowerCase();

  if (tf === 'daily') {
    // Current date (clamped to event dates if event is in the past/future)
    let targetDay = new Date(now);
    if (eventWindow.end && targetDay > eventWindow.end) {
      targetDay = new Date(eventWindow.end);
    }
    if (eventWindow.start && targetDay < eventWindow.start) {
      targetDay = new Date(eventWindow.start);
    }
    const y = targetDay.getFullYear();
    const m = String(targetDay.getMonth() + 1).padStart(2, '0');
    const d = String(targetDay.getDate()).padStart(2, '0');
    start = new Date(`${y}-${m}-${d}T00:00:00.000+05:30`);
    end = new Date(`${y}-${m}-${d}T23:59:59.999+05:30`);
    label = `Daily Report (${d}/${m}/${y})`;
  } else if (tf === 'weekly') {
    // Last 7 days
    let endAnchor = new Date(now);
    if (eventWindow.end && endAnchor > eventWindow.end) {
      endAnchor = new Date(eventWindow.end);
    }
    end = new Date(endAnchor.getTime());
    start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    label = 'Weekly Report (Last 7 Days)';
  } else if (tf === 'monthly') {
    // Current month (1st of month to end of month / now)
    const y = now.getFullYear();
    const m = now.getMonth();
    start = new Date(y, m, 1, 0, 0, 0);
    end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    label = `Monthly Report (${now.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
  } else if (tf === 'last_month') {
    // Previous month (1st to last day)
    const y = now.getFullYear();
    const m = now.getMonth() - 1;
    start = new Date(y, m, 1, 0, 0, 0);
    end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const lastMonthDate = new Date(y, m, 1);
    label = `Last Month Report (${lastMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
  } else if (tf === 'custom' && (fromDate || toDate)) {
    if (fromDate) start = new Date(fromDate);
    if (toDate) {
      const td = new Date(toDate);
      td.setHours(23, 59, 59, 999);
      end = td;
    }
    const fmt = (d) => d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    label = `Custom Range Report (${fmt(start)} – ${fmt(end)})`;
  } else {
    // Full event
    start = eventWindow.start;
    end = eventWindow.end;
    label = 'Full Event Duration Report';
  }

  // Intersect / Clamp with event publication window so no out-of-bounds queries happen
  if (eventWindow.start && eventWindow.end) {
    // If the entire requested window is after the event end date (e.g. Current Month for a past event)
    if (start && start > eventWindow.end) {
      start = eventWindow.start;
      end = eventWindow.end;
      label += ` (Clamped: ${eventWindow.start.toLocaleDateString('en-IN')} – ${eventWindow.end.toLocaleDateString('en-IN')})`;
    } else if (end && end < eventWindow.start) {
      start = eventWindow.start;
      end = eventWindow.end;
      label += ` (Clamped: ${eventWindow.start.toLocaleDateString('en-IN')} – ${eventWindow.end.toLocaleDateString('en-IN')})`;
    } else {
      if (eventWindow.start && (!start || start < eventWindow.start)) start = eventWindow.start;
      if (eventWindow.end && (!end || end > eventWindow.end)) end = eventWindow.end;
    }
  } else {
    if (eventWindow.start && (!start || start < eventWindow.start)) start = eventWindow.start;
    if (eventWindow.end && (!end || end > eventWindow.end)) end = eventWindow.end;
  }

  // Final sanity check: start cannot be after end
  if (start && end && start > end) {
    if (eventWindow.start && eventWindow.end) {
      start = eventWindow.start;
      end = eventWindow.end;
    } else {
      start = end;
    }
  }

  const rangeWhere = {};
  if (start && !isNaN(start.getTime())) rangeWhere.gte = start;
  if (end && !isNaN(end.getTime())) rangeWhere.lte = end;

  return {
    start,
    end,
    label,
    rangeWhere: Object.keys(rangeWhere).length > 0 ? rangeWhere : null,
  };
}

/**
 * Generate comprehensive AI Executive Summary for an event using telemetry and LLM.
 * Fetches and analyzes ALL rows (N rows) for the event from the database within the requested timeframe.
 * Result is cached (upserted) into social_media_event_summaries for instant re-open.
 *
 * @param {number|string} eventId
 * @param {object} [options]
 * @param {object} [options.generatedBy] - { id, name } of the user who triggered generation
 * @param {string} [options.timeframe] - 'daily' | 'weekly' | 'monthly' | 'last_month' | 'custom' | 'full'
 * @param {string} [options.fromDate] - Start date for custom range
 * @param {string} [options.toDate] - End date for custom range
 */
const generateEventSummary = async (
  eventId,
  { db, dbName = null, generatedBy, tenantName, timeframe = 'full', fromDate = null, toDate = null } = {}
) => {
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

  // 2. Fetch Event Media rows within effective date window (strictly clamped to event range)
  const { start: effectiveStart, end: effectiveEnd, label: timeframeLabel, rangeWhere: publicationRange } =
    computeEffectiveDateWindow(event, timeframe, fromDate, toDate);

  const rawMediaRows = await prisma.social_media_event_media.findMany({
    where: {
      event_id: numericId,
      ...(publicationRange ? { posted_at: publicationRange } : {}),
    },
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
    take: eventConfig.maxRowsScanned,   // same cap as the post list and dashboard, so all three show the same numbers
  });

  // One shared dataset: only posts about the event (own text or English translation), reposts merged.
  // Every count, table and evidence row below is built from these, so numbers agree everywhere.
  const dataset = await require('../../modules/events/event.report.data').buildEventDataset(prisma, event, rawMediaRows);
  const mediaRows = dataset.posts.map((p) => ({ ...p, engagement: p._engagement_merged }));
  const repostCountById = new Map(dataset.posts.map((p) => [String(p.id), p._repost_count]));
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
  let unrelatedPostsCount = dataset.excluded.irrelevant;
  let totalKeywordMentionsCount = 0;

  // Categorized candidates for prioritized LLM context inclusion
  const highRiskPosts = [];
  const highViralPosts = [];
  const criticismNegativePosts = [];
  const relevantPosts = [];
  const peripheralPosts = [];

  const relCtx = { genericTokens: await require('../../modules/events/event.corpus.service').getGenericTokens(prisma) };
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
    const relevance = { isRelevant: true, reason: 'event_dataset' }; // already filtered in buildEventDataset
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
        englishText: cleanSafeUtf8(String(analysis.english_text || ''), 220),
        sentiment: sent,
        target_entity: targetEntity,
        target_semantic: targetSemantics.label,
        risk_level: riskLevel,
        risk_score: riskScore,
        has_threat_vector: hasThreatVector,
        is_relevant: relevance.isRelevant,
        url: m.url || null,
        likes: Number(eng.likes || eng.like_count || eng.favorite_count || 0) || 0,
        shares: Number(eng.shares || eng.retweets || eng.reposts || eng.share_count || 0) || 0,
        comments: Number(eng.comments || eng.replies || eng.comment_count || 0) || 0,
        views: Number(eng.views || eng.view_count || 0) || 0,
        engagementScore: getEngagementTotal(m.engagement),
        postedAt: m.posted_at,
        repostCount: repostCountById.get(String(m.id)) || 1,
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

  // 4. Collect ALL posts in prioritized order (Critical/Threat -> Viral -> Criticism -> Other Relevant)
  // Drop peripheral/foreign noise unless total relevant posts is zero
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
  if (allSnippets.length === 0) {
    peripheralPosts.forEach(addSnippet);
  }

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
  const tenantProfile = await getTenantProfile(dbName);
  const headquarters = resolveHeadquarters(tenantName, tenantProfile);
  const promptCtx = {
    event, keywordsList, totalMediaCount, relevantPostsCount, unrelatedPostsCount, totalKeywordMentionsCount,
    earliestPost, latestPost, platformCounts, platformPercentages, activeSentiment, sentimentPercentages,
    targetBreakdown, riskCounts, totalEngagement, indexedSnippets,
    addresseeLine: headquartersPromptLine(headquarters),
    headquarters,
    reportLanguage: reportLanguageFor(tenantName, tenantProfile),
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

    // ---- FACTS PASS: real activity dates, organisers, places, calls to act and violence, read per post and checked in code.
    let facts = null;
    const factsMap = {};
    const byNoFacts = new Map(analysed.map((x) => [postNo(x), x]));
    const foldW = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
    const eventWords = foldW(event.location).split(' ').filter((w) => w.length > 2);
    const eventCountry = (() => {
      for (const part of String(event.location || '').split(/[,(]/).map((x) => x.replace(/[)]/g, '').trim()).filter(Boolean)) {
        const g = resolvePlace(part, '', '');
        if (g) return g.country;
      }
      return '';
    })();
    const insideRegion = (pl) => !eventWords.length || eventWords.some((w) => ` ${foldW(`${pl.name} ${pl.region}`)} `.includes(` ${w} `));
    const regionOf = (n) => {
      const pls = (factsMap[n]?.places || []);
      if (!pls.length) return 'unknown';
      return pls.some(insideRegion) ? 'in' : 'out';
    };
    // Builds the report facts from the per-post readings. `mediaNos` = posts the earlier per-post pass judged to come from news outlets.
    const finalizeFacts = (mediaNos = new Set()) => {
      if (!Object.keys(factsMap).length) return null;
      Object.entries(factsMap).forEach(([n, f]) => {
        if (mediaNos.has(Number(n))) f.role = 'media';
        // Real place data decides the region and country of each place; the model's label is only a hint for names GeoNames does not know.
        (f.places || []).forEach((pl) => {
          if (pl.verified) return;
          const g = resolvePlace(pl.name, pl.region, event.location);
          if (g) { pl.region = [g.kind === 'city' ? g.region : '', g.kind === 'country' ? g.name : g.country].filter(Boolean).join(', ') || g.label; pl.verified = true; pl.country = g.country; }
        });
      });
      const out = aggregateFacts(factsMap, byNoFacts, regionOf);
      out.read = Object.keys(factsMap).length;
      out.eventCountry = eventCountry;
      return out;
    };
    try {
      const factPosts = analysed.slice(0, Math.max(30, Number(process.env.LLM_MAX_FACT_POSTS || 200))).map((x) => ({ n: postNo(x), author: x.author, text: x.text, englishText: x.englishText, postedAt: x.postedAt }));
      const FACT_BATCH = 20;
      for (let i = 0; i < factPosts.length; i += FACT_BATCH) {
        const batch = factPosts.slice(i, i + FACT_BATCH);
        try {
          const res = await callLLM([{ role: 'system', content: FACTS_SYSTEM }, { role: 'user', content: buildFactsUserContext(batch) }], NOTES_OUTPUT_TOKENS);
          const parsed = parseFacts(res.data?.choices?.[0]?.message?.content || '', byNoFacts, extractJson);
          if (parsed) Object.assign(factsMap, parsed);
          else logger.warn(`[SummaryLLM] Facts reply unusable (${batch.length} posts, finish=${res.data?.choices?.[0]?.finish_reason})`);
        } catch (e) { logger.warn(`[SummaryLLM] Facts batch failed (${batch.length} posts): ${e.message}`); }
      }
      facts = finalizeFacts();
      if (facts) logger.info(`[SummaryLLM] Facts read for ${facts.read}/${factPosts.length} posts`);
      else logger.warn('[SummaryLLM] Facts pass produced nothing; the report will not list organisers, dates or places from the posts');
    } catch (e) { logger.warn(`[SummaryLLM] Facts pass skipped: ${e.message}`); }
    let factsPack = factsPackText(facts, new Date());
    let withFacts = (content) => (factsPack ? `${content}\n\nCONFIRMED FACTS (computed from the posts; use these dates, organisers and places exactly, do not contradict them):\n${factsPack}` : content);
    const refreshFacts = (mediaNos) => {   // once the per-post source types are known, news outlets stop counting as organisers or callers
      facts = finalizeFacts(mediaNos);
      factsPack = factsPackText(facts, new Date());
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

      refreshFacts(new Set(Object.entries(notesMap).filter(([, nt]) => nt.type === 'media').map(([n]) => Number(n))));
      const digest = buildBatchDigest(notesMap, analysed);
      const reducerMessages = [
        { role: 'system', content: buildReducerSystemPrompt(promptCtx) },
        { role: 'user', content: withFacts(buildReducerUserContext(promptCtx, digest)) },
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
        { role: 'user', content: withFacts(llmUserContext) },
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
    if (structuredReport) {
      // ---- PLAIN-LANGUAGE PASS: strip filler openers in code; ask the model once to rewrite what still reads stiffly.
      try {
        const slots = [];
        const grab = (obj, key) => { if (obj && typeof obj[key] === 'string' && obj[key]) slots.push([obj, key]); };
        ['bottomLine', 'situation', 'sentimentCommentary', 'publicOrder', 'platformsCommentary'].forEach((k) => grab(structuredReport, k));
        (structuredReport.keyFindings || []).forEach((x) => grab(x, 'detail'));
        (structuredReport.narratives || []).forEach((x) => { grab(x, 'discussed'); grab(x, 'tone'); grab(x, 'risk'); });
        (structuredReport.actions || []).forEach((x) => grab(x, 'detail'));
        (structuredReport.known || []).forEach((x) => grab(x, 'text'));
        (structuredReport.issueStrands || []).forEach((x) => { grab(x, 'demand'); grab(x, 'status'); });
        grab(structuredReport, 'issueLink');
        const stiff = [];
        const english = /^english$/i.test(promptCtx.reportLanguage || 'English');
        if (english) slots.forEach(([o, k]) => { const r = cleanText(o[k]); o[k] = r.text; if (r.needsRewrite) stiff.push([o, k]); });
        if (stiff.length) {
          const payload = {}; stiff.forEach(([o, k], i) => { payload[i] = o[k]; });
          const res = await callLLM([
            { role: 'system', content: `Rewrite each text in plain, direct ${promptCtx.reportLanguage || 'English'} as a careful officer would say it aloud. Short sentences (under 25 words). Keep every fact, number, name and [Post #n] tag exactly. Do not add anything. Return ONLY a JSON object with the same keys.` },
            { role: 'user', content: JSON.stringify(payload) },
          ], REPORT_OUTPUT_TOKENS);
          const out = extractJson(res.data?.choices?.[0]?.message?.content || '');
          stiff.forEach(([o, k], i) => {
            const t = out && typeof out[i] === 'string' ? out[i].trim() : '';
            const tags = (x) => (String(x).match(/\[Post #\d+\]/g) || []).sort().join();
            if (t && tags(t) === tags(o[k])) o[k] = t;   // accept only if no citation was lost or added
          });
        }
      } catch (e) { logger.warn(`[SummaryLLM] Plain-language pass skipped: ${e.message}`); }
      structuredReport.coverage = coverage;
      // The model's own per-post source types (news outlet or not) correct who counts as a caller or organiser.
      try {
        const mediaNos = new Set(Object.entries(structuredReport.sourceTypes || {}).filter(([, t]) => t === 'media').map(([n]) => Number(n)));
        if (mediaNos.size) refreshFacts(mediaNos);
      } catch (e) { /* keep the facts as they were */ }
      if (facts) {
        structuredReport.facts = facts;
        // Dates and organisers come from the posts' own content, checked in code: they replace the model's guesses.
        const today = new Date().toISOString().slice(0, 10);
        const cap = (t) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
        const sameCountry = (a) => {
          if (!a.place || !facts.eventCountry) return true;
          const g = resolvePlace(a.place, '', '');
          return !g || !g.country || g.country === facts.eventCountry;
        };
        const usable = facts.activities.filter(sameCountry);      // a gathering in another country is not this event's activity
        const inRegion = usable.filter((a) => !a.outside).slice(0, 6);
        const elsewhere = usable.filter((a) => a.outside).slice(0, 3);
        if (inRegion.length || elsewhere.length) {
          structuredReport.keyDates = [...inRegion, ...elsewhere].map((a) => ({
            date: a.date, type: a.date < today ? 'past' : 'upcoming',
            event: `${cap(a.kind)}${a.organiser ? ` called by ${a.organiser}` : ''}${a.place ? ` at ${a.place}` : ''}${a.outside ? ` (outside ${event.location || 'the event region'})` : ''}`,
            posts: a.posts,
            outside: Boolean(a.outside),
          }));
        }
      }
    }

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
Monitoring covers **${totalMediaCount.toLocaleString('en-IN')} posts about ${event.name}** (${event.location || 'General Region'}). Monitored channels include ${(event.platforms || []).join(', ') || 'social networks'}. ${unrelatedPostsCount} stored posts that are not about the event and ${dataset.excluded.duplicates} repeated copies were left out of the counts.

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
- Negative sentiment (${activeSentiment.negative} posts) is policy criticism unless the post itself calls a bandh, blockade, rally, or other disruption. Those calls are reported only when the post text contains them.

### 👥 5. Amplifiers & Key Vector Channels
Distribution of analyzed content by platform:
${Object.entries(platformCounts).map(([p, count]) => `- **${p.toUpperCase()}**: ${count} posts (${platformPercentages[p] || 0}%)`).join('\n')}

### 🎯 6. Recommended Operational Actions for Law Enforcement
1. **Targeted Verification**: Maintain priority monitoring over high-engagement channels to quickly verify speculative claims.
2. **Grievance Clarification**: Address constructive criticism regarding summit logistics or policies with prompt factual updates.
3. **Traceable Intelligence**: Ensure all operational situation reports continue to reference underlying post evidence citations.
`;
  }

  // Every analysed post is evidence. The brief tables quote them; the annex lists them.
  const evidenceList = analysed;

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
      timeframe,
      timeframe_label: timeframeLabel,
      from_date: fromDate,
      to_date: toDate,
      effective_start: effectiveStart ? effectiveStart.toISOString() : null,
      effective_end: effectiveEnd ? effectiveEnd.toISOString() : null,
      total_media_count: totalMediaCount,
      total_unique_posts: totalMediaCount,
      relevant_posts_count: relevantPostsCount,
      unrelated_posts_count: unrelatedPostsCount,
      duplicate_posts_merged: dataset.excluded.duplicates,
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
      is_relevant: s.is_relevant !== false,
      url: s.url,
      posted_at: s.postedAt || null,
      likes: s.likes || 0,
      shares: s.shares || 0,
      comments: s.comments || 0,
      views: s.views || 0,
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

const summaryJobs = new Map();

const summaryJobKey = (dbName, eventId, timeframe = 'full') => `${dbName || 'default'}:${Number(eventId)}:${timeframe}`;

const getSummaryJob = (dbName, eventId, timeframe = 'full') => summaryJobs.get(summaryJobKey(dbName, eventId, timeframe)) || null;

/**
 * Run summary generation off the HTTP request. Closing the dialog ends the
 * browser call; this job keeps going and is saved when it finishes.
 * A second click joins the job already running for that event.
 */
const startSummaryJob = ({ eventId, db, dbName, generatedBy, tenantName, timeframe = 'full', fromDate = null, toDate = null } = {}) => {
  const key = summaryJobKey(dbName, eventId, timeframe);
  const existing = summaryJobs.get(key);
  if (existing?.status === 'running') return existing;

  const job = {
    status: 'running',
    started_at: new Date().toISOString(),
    error: null,
    promise: null,
  };
  logger.info(`[SummaryLLM] regenerate started event=${eventId} timeframe=${timeframe} tenant=${tenantName || dbName || 'default'}`);
  const promise = generateEventSummary(eventId, { db, dbName, generatedBy, tenantName, timeframe, fromDate, toDate })
    .then((result) => {
      logger.info(`[SummaryLLM] regenerate finished event=${eventId} source=${result?.summary_source || 'unknown'}`);
      if (summaryJobs.get(key) === job) summaryJobs.delete(key);
      return result;
    })
    .catch((err) => {
      job.status = 'failed';
      job.error = err.message || 'Failed to generate event summary.';
      job.finished_at = new Date().toISOString();
      logger.error(`[SummaryLLM] background job failed event=${eventId}: ${job.error}`);
      throw err;
    });
  job.promise = promise;
  summaryJobs.set(key, job);
  return job;
};

module.exports = {
  generateEventSummary,
  getCachedEventSummary,
  saveEventSummaryPdf,
  getLLMConfig,
  getSummaryJob,
  startSummaryJob,
  __test: { buildBatchDigest },
};
