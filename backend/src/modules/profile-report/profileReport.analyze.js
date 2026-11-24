/**
 * Tools → Profile Report: analyse every collected post, one by one, in a queue.
 *
 *   1. Image OCR / description for posts with a picture (video posts use their preview still frame).
 *   2. Sentiment, risk, stance, category, translation: the same Sentiment API monitoring uses (bulk lane),
 *      given the post text plus the text read from its image.
 *
 * Same steps as monitoring's media analysis, but written to this module's own table and with no alerts raised.
 * The queue is separate from monitoring's, so a profile with thousands of old posts can never hold up live alerts.
 * Newest posts are analysed first. Full video analysis (minutes per clip) is off unless PROFILE_REPORT_VIDEO_ANALYSIS=1.
 */
const logger = require('../../lib/logger');
const { createAnalysisQueue } = require('../../services/analysisFairQueue');
const { getTenantPrisma, resolveTenantName } = require('../../lib/tenantDatabase.service');
const intelligenceClient = require('../intelligence/intelligence.client.service');
const mappingService = require('../settings/mapping.service');
const { extractOcr, extractVideo } = require('../../services/media_post_analysis/extractOcr');
const media = require('../../services/media_post_analysis/analyzeMediaPost');
const store = require('./profileReport.store');
const { json, cleanDeep } = require('./profileReport.util');

const BATCH = Math.max(5, Number(process.env.PROFILE_REPORT_ANALYSIS_BATCH) || 25);
/** Most posts of one tenant analysed at the same time, across all API processes. */
const PARALLEL = Math.max(1, Number(process.env.PROFILE_REPORT_ANALYSIS_PARALLEL) || 2);
const VIDEO_ANALYSIS = process.env.PROFILE_REPORT_VIDEO_ANALYSIS === '1';
/**
 * A post stays 'processing' only while some process shows life: analysis refreshes claimed_at before each step, and the
 * longest single step is bounded (OCR budget below, sentiment client 3 min), so a process that died (a restart in the
 * middle of a post) hands its post back within minutes instead of a quarter of an hour.
 */
const STALE_PROCESSING_MINUTES = 4;
/** Image reads that failed because the service was busy or the connection dropped are tried again this many times before the post is analysed on its text alone. */
const OCR_TRANSIENT_RETRIES = 2;
const limits = {
  /** The shared OCR client has no timeout of its own (a hung service would hold a post for ever), so this module sets one. */
  ocrBudgetMs: Math.max(20000, Number(process.env.PROFILE_REPORT_OCR_BUDGET_MS) || 150000),
  videoBudgetMs: 300000,
  /** Posts that take longer than this are named in the log, with the step that was slow. */
  slowMs: 60000,
};

const queue = createAnalysisQueue({
  concurrency: Math.max(1, Number(process.env.PROFILE_REPORT_ANALYSIS_CONCURRENCY) || 1),
  maxQueue: Math.max(50, Number(process.env.PROFILE_REPORT_ANALYSIS_MAX_QUEUE) || 500),
  logPrefix: 'profile_report/queue',
});

const busyError = (err) => err?.backpressure || err?.status === 429 || /429|gate full|backpressure/i.test(err?.message || '');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for a promise at most this long. The work behind it cannot be cancelled, but this post stops waiting for it. */
const withBudget = (promise, ms, what) => {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${what} took longer than ${Math.round(ms / 1000)}s`), { code: 'BUDGET' })), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
};

/** Show life: this post is being worked on right now. */
const heartbeat = (prisma, id) =>
  store.exec(prisma, `UPDATE profile_report_posts SET claimed_at = NOW() WHERE id = $1::bigint AND analysis_status = 'processing'`, id);

const TRANSIENT_IMAGE_ERROR = /socket hang up|ECONN\w*|ETIMEDOUT|EAI_AGAIN|time[d ]?-?out|took longer than|HTTP 5\d\d|\b429\b|\b50[234]\b/i;
/** A failure that says nothing about the picture itself: the reader was busy, down, or too slow. Worth another try later. */
const isTransientImageFailure = (res) => !res.nonRetryable && TRANSIENT_IMAGE_ERROR.test(String(res.error || ''));

/**
 * Claim one waiting post. The OCR and sentiment services are shared with live monitoring, so this module never
 * has more than PARALLEL posts of one tenant in analysis at once, however many API processes are running.
 */
const claim = async (prisma, id) => {
  const rows = await store.q(
    prisma,
    `UPDATE profile_report_posts SET analysis_status = 'processing', claimed_at = NOW(), analysis_error = NULL
      WHERE id = $1::bigint AND analysis_status = 'pending'
        AND (SELECT COUNT(*) FROM profile_report_posts WHERE analysis_status = 'processing') < $2
      RETURNING id, platform, text, media_type, media_urls, raw_data, image_analysis, analysis_attempts`,
    id, PARALLEL
  );
  return rows[0] || null;
};

/** Hand a post back. With `cooldown` it is not picked up again for a minute (the service it needs is busy; do not hammer it). */
const release = (prisma, id, { attempts, giveUp, message, cooldown = false }) =>
  store.exec(
    prisma,
    `UPDATE profile_report_posts
        SET analysis_status = $2, analysis_error = $3, analysis_attempts = $4, claimed_at = ${cooldown ? 'NOW()' : 'NULL'}
      WHERE id = $1::bigint`,
    id, giveUp ? 'failed' : 'pending', message, attempts
  );

/** Why a post could not be claimed: another process has it, or this tenant's allowance of parallel analyses is in use. */
const whyNotClaimed = async (prisma) => {
  const [{ n } = { n: 0 }] = await store.q(prisma, `SELECT COUNT(*)::int AS n FROM profile_report_posts WHERE analysis_status = 'processing'`);
  return n >= PARALLEL ? 'tenant_busy' : 'not_claimable';
};

/**
 * Step 1: text from the post's picture (or, if enabled, its video). Never fails the post.
 * @returns {{ ocr: object|null, retryLater: boolean, ms: number }} retryLater: the reader was busy or dropped the connection
 */
const enrichMedia = async (prisma, post, dbName) => {
  if (media.hasMediaAnalysis(post.image_analysis)) return { ocr: post.image_analysis, retryLater: false, ms: 0 };
  const id = String(post.id);
  const t0 = Date.now();
  const saveMarker = (data) => store.exec(prisma, `UPDATE profile_report_posts SET image_analysis = $2::jsonb WHERE id = $1::bigint`, id, json(data, {}));

  if (VIDEO_ANALYSIS) {
    const videoUrl = media.extractFirstVideoUrl(post);
    if (videoUrl) {
      await heartbeat(prisma, id);
      let res;
      try { res = await withBudget(extractVideo(videoUrl, { postId: id, tenantKey: dbName }), limits.videoBudgetMs, 'Video analysis'); } catch (err) { res = { success: false, error: err.message }; }
      const data = res.success && res.data ? { media_type: 'video', ...res.data } : { error: res.error, failed: true, media_type: 'video' };
      await saveMarker(data);
      return { ocr: data.failed ? null : data, retryLater: false, ms: Date.now() - t0 };
    }
  }

  const imageUrl = media.extractFirstImageUrl(post);
  if (!imageUrl) return { ocr: null, retryLater: false, ms: 0 };
  await heartbeat(prisma, id);
  let res;
  try {
    res = await withBudget(extractOcr(imageUrl, { postId: id, tenantKey: dbName }), limits.ocrBudgetMs, 'The image reader');
  } catch (err) {
    res = { success: false, error: err.message, attempts: 1 };
  }
  const ms = Date.now() - t0;
  if (res.success && res.data) {
    await saveMarker(res.data);
    return { ocr: res.data, retryLater: false, ms };
  }
  // Busy or unreachable reader: try this post again shortly (a few times) instead of losing its image text for good.
  if (isTransientImageFailure(res) && (Number(post.analysis_attempts) || 0) < OCR_TRANSIENT_RETRIES) {
    return { ocr: null, retryLater: true, ms };
  }
  logger.warn(`[ProfileReport] image text not read for post ${id}: ${String(res.error || '').slice(0, 160)}`);
  await saveMarker({ error: res.error, failed: true, attempts: res.attempts });
  return { ocr: null, retryLater: false, ms };
};

/**
 * Analyse one stored post. Safe to call from any process: the claim is atomic, a post another process
 * already took is skipped.
 */
const analyzePost = async (postId, { prisma, dbName = null } = {}) => {
  const post = await claim(prisma, String(postId));
  if (!post) return { ok: false, skipped: true, reason: await whyNotClaimed(prisma) };
  const id = String(post.id);
  const t0 = Date.now();

  try {
    const { ocr, retryLater, ms: imageMs } = await enrichMedia(prisma, post, dbName);
    if (retryLater) {
      await release(prisma, id, { attempts: (Number(post.analysis_attempts) || 0) + 1, giveUp: false, message: 'The image reader was busy; trying again shortly.', cooldown: true });
      return { ok: false, retry: true, reason: 'image_reader_busy' };
    }
    const postText = String(post.text || '').trim();
    const mediaText = store.imageTextOf(ocr);
    const text = postText || mediaText;

    if (postText.length < 3 && mediaText.length < 3) {
      await store.exec(
        prisma,
        `UPDATE profile_report_posts
            SET analysis_status = 'skipped', analysis_result = $2::jsonb, analysis_error = NULL, analyzed_at = NOW(),
                analysis_attempts = analysis_attempts + 1, claimed_at = NULL
          WHERE id = $1::bigint`,
        id, json({ skipped: true, reason: 'empty_text', ocr }, {})
      );
      return { ok: true, skipped: true, reason: 'empty_text' };
    }

    await heartbeat(prisma, id);
    const matchedKeywords = await media.matchKeywords(text, { db: prisma });
    const { high, medium } = await media.loadRiskThresholds({ db: prisma });
    const tenantName = await resolveTenantName(dbName).catch(() => null);

    let preMapping = { category_id: null, legal_sections: [], platform_policies: [], triggered_keywords: [] };
    try {
      await mappingService.waitForLoad(5000);
      preMapping = mappingService.resolveForAnalysis({
        category: mappingService.inferCategoryFromText(text), text, platform: post.platform, country: 'IN',
      });
    } catch (e) { /* policy mapping is optional */ }

    const intel = await intelligenceClient.analyzeText(text, {
      lane: 'bulk', tenantName, tenantKey: dbName, imageAnalysis: ocr, keywords: matchedKeywords, policy: preMapping,
    });
    if (!intel) throw Object.assign(new Error('intelligence returned null'), { retryable: true });

    const riskScore = Math.max(0, Math.min(100, Number(intel.risk_score) || 0));
    let mapping = preMapping;
    try {
      mapping = mappingService.resolveForAnalysis({ category: intel.category, text, platform: post.platform, country: 'IN' });
    } catch (e) { /* keep the pre-mapping */ }
    const category = mapping.category_id || intel.category || null;

    const result = {
      sentiment: intel.sentiment || 'neutral',
      sentiment_confidence: intel.sentiment_confidence ?? null,
      risk_score: riskScore,
      risk_level: media.scoreToLevel(riskScore, high, medium),
      stance: intel.stance ?? null,
      stance_confidence: intel.stance_confidence ?? null,
      tenant_name: tenantName || null,
      category,
      intent: intel.intent || category || null,
      reasoning: intel.reasoning || null,
      summary: intel.summary || null,
      recommended_action: intel.recommended_action || null,
      signals: intel.signals || [],
      keyword_context: intel.keyword_context || [],
      matched_keywords: matchedKeywords,
      legal_sections: mapping.legal_sections || [],
      violated_policies: mapping.platform_policies || [],
      policy_triggered_keywords: mapping.triggered_keywords || [],
      language: intel.language || null,
      english_text: intel.english_text || null,
      was_translated: Boolean(intel.was_translated),
      source: intel.source || 'sentiment-api',
      model: intel.model || null,
      thresholds: { high, medium },
      analyzed_via: 'analyze/intelligence',
      ocr,
    };
    await store.exec(
      prisma,
      `UPDATE profile_report_posts
          SET analysis_status = 'done', analysis_result = $2::jsonb, analysis_error = NULL, analyzed_at = NOW(),
              analysis_attempts = analysis_attempts + 1, claimed_at = NULL
        WHERE id = $1::bigint`,
      id, json(result, {})
    );
    const total = Date.now() - t0;
    if (total > limits.slowMs) {
      logger.warn(`[ProfileReport] slow analysis post=${id} ${post.platform} took ${Math.round(total / 1000)}s (image ${Math.round(imageMs / 1000)}s, tone and risk ${Math.round((total - imageMs) / 1000)}s)`);
    }
    return { ok: true, postId: id, risk_level: result.risk_level, sentiment: result.sentiment, ms: total };
  } catch (err) {
    const attempts = (Number(post.analysis_attempts) || 0) + (busyError(err) ? 0 : 1);
    const giveUp = !busyError(err) && attempts >= media.MAX_ATTEMPTS;
    logger.warn(`[ProfileReport] analysis post=${id} ${giveUp ? 'gave up' : 'will retry'}: ${err.message}`);
    await release(prisma, id, { attempts, giveUp, cooldown: Boolean(busyError(err)), message: cleanDeep(String(err.message || 'analysis failed')).slice(0, 300) });
    return { ok: false, error: err.message, retry: !giveUp };
  }
};

const refilling = new Set();
/** The next waiting posts are queued the moment the queue runs dry, instead of at the next poll (up to 15 s later). */
const refill = (prisma, dbName) => {
  if (refilling.has(dbName)) return;
  refilling.add(dbName);
  // eslint-disable-next-line no-use-before-define
  enqueuePending(prisma, dbName).catch(() => {}).finally(() => refilling.delete(dbName));
};

queue.setProcessor(async (job) => {
  const prisma = getTenantPrisma(job.dbName);
  if (!prisma) return;
  const res = await analyzePost(job.postId, { prisma, dbName: job.dbName });
  // This tenant's allowance of parallel analyses is in use by other processes: wait a moment rather than spin on claims.
  if (res && res.reason === 'tenant_busy') await sleep(3000);
  if (queue.getStats().queued === 0) refill(prisma, job.dbName);
});

/** Poller entry for one tenant: free posts left 'processing' by a dead process, then queue the newest waiting posts. */
const enqueuePending = async (prisma, dbName) => {
  await store.exec(
    prisma,
    `UPDATE profile_report_posts SET analysis_status = 'pending', claimed_at = NULL
      WHERE analysis_status = 'processing' AND claimed_at < NOW() - INTERVAL '${STALE_PROCESSING_MINUTES} minutes'`
  );
  if (queue.getStats().queued >= BATCH) return 0;
  const [{ n } = { n: 0 }] = await store.q(prisma, `SELECT COUNT(*)::int AS n FROM profile_report_posts WHERE analysis_status = 'processing'`);
  if (n >= PARALLEL) return 0;
  const rows = await store.q(
    prisma,
    `SELECT p.id::text AS id, p.posted_at, p.fetched_at
       FROM profile_report_posts p JOIN profile_report_accounts a ON a.id = p.account_id AND a.is_draft = FALSE
      WHERE p.analysis_status = 'pending'
        AND (p.claimed_at IS NULL OR p.claimed_at < NOW() - INTERVAL '60 seconds')
      ORDER BY p.posted_at DESC NULLS LAST, p.id DESC
      LIMIT $1`,
    BATCH
  );
  let added = 0;
  for (const r of rows) {
    if (queue.enqueue({ postId: r.id, dbName, kind: 'catalog', postedAt: r.posted_at, fetchedAt: r.fetched_at })) added += 1;
  }
  return added;
};

module.exports = { analyzePost, enqueuePending, getQueueStats: queue.getStats, __test: { queue, enrichMedia, limits, isTransientImageFailure, STALE_PROCESSING_MINUTES } };
