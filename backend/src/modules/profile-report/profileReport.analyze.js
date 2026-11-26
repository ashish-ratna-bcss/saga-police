/**
 * Tools → Profile Report: analyse every collected post, one by one, in a queue.
 *
 *   1. Media: a post with a video file gets the same video reading Alerts give it (what it shows, the text on screen, how long it
 *      is; see profileReport.video.js). Otherwise image OCR / description for a post with a picture. A video the reader cannot
 *      open falls back to its still frame, if it has one, and then to the caption alone.
 *   2. Sentiment, risk, stance, category, translation: the same Sentiment API monitoring uses (bulk lane),
 *      given the post text plus the text read from its image or video.
 *
 * Same steps as monitoring's media analysis, but written to this module's own table and with no alerts raised.
 * The queue is separate from monitoring's, so a profile with thousands of old posts can never hold up live alerts.
 * Newest posts are analysed first. Reading videos can be switched off with PROFILE_REPORT_VIDEO_ANALYSIS=0.
 */
const logger = require('../../lib/logger');
const { createAnalysisQueue } = require('../../services/analysisFairQueue');
const { getTenantPrisma, resolveTenantName } = require('../../lib/tenantDatabase.service');
const intelligenceClient = require('../intelligence/intelligence.client.service');
const mappingService = require('../settings/mapping.service');
const { extractOcr, extractVideo } = require('../../services/media_post_analysis/extractOcr');
const media = require('../../services/media_post_analysis/analyzeMediaPost');
const { cleanTranslation, sceneOf, signalsOf } = require('../../services/media_post_analysis/imageText');
const vision = require('./profileReport.vision');
const reader = require('./profileReport.reading');
const clip = require('./profileReport.video');
const frames = require('./profileReport.videoFrames');
const store = require('./profileReport.store');
const { json, cleanDeep } = require('./profileReport.util');

const BATCH = Math.max(5, Number(process.env.PROFILE_REPORT_ANALYSIS_BATCH) || 25);
/** Most posts of one tenant analysed at the same time, across all API processes. */
const PARALLEL = Math.max(1, Number(process.env.PROFILE_REPORT_ANALYSIS_PARALLEL) || 2);
/**
 * A post stays 'processing' only while some process shows life: analysis refreshes claimed_at before each step, and the
 * longest single step is bounded (OCR budget below, sentiment client 3 min), so a process that died (a restart in the
 * middle of a post) hands its post back within minutes instead of a quarter of an hour.
 */
const STALE_PROCESSING_MINUTES = 4;
/** Image reads that failed because the service was busy or the connection dropped are tried again this many times before the post is analysed on its text alone. */
const OCR_TRANSIENT_RETRIES = 2;
/** A video the reader was too busy or slow for is tried once more shortly, then the post is analysed on its caption (and tried again after hours). */
const VIDEO_TRANSIENT_RETRIES = 1;
const limits = {
  /** The shared OCR client has no timeout of its own (a hung service would hold a post for ever), so this module sets one. */
  ocrBudgetMs: Math.max(20000, Number(process.env.PROFILE_REPORT_OCR_BUDGET_MS) || 150000),
  /** The vision model answers in a second or two; this only stops a hung server from holding a post. */
  pictureBudgetMs: Math.max(15000, Number(process.env.PROFILE_REPORT_PICTURE_BUDGET_MS) || 100000),
  /** The report model reads one post in a few seconds; this only stops a hung server from holding a post. */
  readingBudgetMs: Math.max(15000, Number(process.env.PROFILE_REPORT_READING_BUDGET_MS) || 75000),
  /**
   * The reader downloads the clip itself and looks at about ten frames, so a clip takes seconds (a ten-minute one took 18 s). This
   * stays under STALE_PROCESSING_MINUTES, so a post still waiting on its video is never mistaken for one a dead process left behind.
   */
  videoBudgetMs: Math.max(30000, Math.min(200000, Number(process.env.PROFILE_REPORT_VIDEO_BUDGET_MS) || 180000)),
  /**
   * Downloading a clip, cutting up to 32 frames and describing each in turn takes one to two minutes (3.5 to 4 s a frame). The pass
   * stops describing 20 s before this, so a slow vision server still leaves a result; this only stops a hung step from holding a
   * post. Under STALE_PROCESSING_MINUTES.
   */
  framesBudgetMs: Math.max(60000, Math.min(230000, Number(process.env.PROFILE_REPORT_VIDEO_FRAMES_BUDGET_MS) || 200000)),
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
/** A picture that already has a reading: text on it, a description, or a summary (the reader sometimes gives only a summary). */
const alreadyRead = (img) => media.hasMediaAnalysis(img) || Boolean(img && typeof img === 'object' && !img.failed && img.summary);

/**
 * Every post with a picture ends up with a `picture` record: what the vision model saw, or a note on why there is none
 * ('no_image', 'video', 'image_unavailable', or a failure). That record is what stops a post being queued for a
 * description again and again.
 */

/**
 * Step 1: text from the post's picture (OCR), then what the picture shows (vision model). Never fails the post.
 * @returns {{ ocr: object|null, retryLater: boolean, ms: number }} retryLater: a service was busy or dropped the connection
 */
const enrichMedia = async (prisma, post, dbName) => {
  const id = String(post.id);
  const t0 = Date.now();
  const hasMedia = Array.isArray(post.media_urls) ? post.media_urls.length > 0 : Boolean(post.media_urls);
  const wantsPicture = vision.enabled() && hasMedia;
  // The note that the video could not be read (or was queued for reading) is never lost when a still frame's reading is saved after it:
  // it is what stops the post being queued for its video again and again.
  let videoNote = null;
  const saveMarker = (data) => store.exec(
    prisma,
    `UPDATE profile_report_posts SET image_analysis = $2::jsonb WHERE id = $1::bigint`,
    id, json(videoNote && !data.video && data.media_type !== 'video' ? { ...data, video: videoNote } : data, {})
  );
  const mergeMarker = (patch) => store.exec(prisma, `UPDATE profile_report_posts SET image_analysis = COALESCE(image_analysis, '{}'::jsonb) || $2::jsonb WHERE id = $1::bigint`, id, json(patch, {}));
  const skipPicture = async (why, reading) => {
    if (!wantsPicture || (reading && reading.picture)) return reading;
    const next = { ...(reading || {}), picture: { skipped: why } };
    await mergeMarker({ picture: next.picture });
    return next;
  };

  let reading = post.image_analysis && typeof post.image_analysis === 'object' && !Array.isArray(post.image_analysis) ? post.image_analysis : null;
  const imageUrl = media.extractFirstImageUrl(post);
  if (reading && reading.video && typeof reading.video === 'object') videoNote = reading.video;

  // A video file: the same reading Alerts give it. It replaces a still frame's reading (it says more), and when the reader cannot
  // open the video the post keeps whatever reading it had and goes on to its still frame, if there is one.
  const videoUrl = clip.enabled() ? media.extractFirstVideoUrl(post) : null;
  if (!videoUrl && clip.enabled() && videoNote && videoNote.queued) {
    // queued for its video, but there is no video file to read after all: say so, so the post is not queued again
    const note = clip.failureOf('No video file to read');
    videoNote = note;
    reading = { ...(reading && !reading.failed ? reading : {}), video: note };
    await mergeMarker({ video: note });
  }
  if (!videoUrl && frames.enabled() && clip.isVideoReading(reading) && reading.picture && reading.picture.queued) {
    // queued to be looked at frame by frame, but there is no video file after all: say so, so the post is not queued again
    const note = clip.framesFailureOf('No video file to look at');
    reading = { ...reading, picture: note };
    await mergeMarker({ picture: note });
  }
  // And, when ffmpeg is there, the video is also looked at frame by frame with the picture questions (what is IN it, and the alerts
  // a picture gets: weapon, crowd, fire ...): the reader alone called a rifle "a knife or cutting tool". The two run side by side.
  const needReader = Boolean(videoUrl) && clip.needsReading(reading);
  const needFrames = Boolean(videoUrl) && frames.enabled() && (needReader || clip.needsFrames(reading));
  let readerRes = null;
  let framesRes = null;
  if (needReader || needFrames) {
    await heartbeat(prisma, id);
    const beat = setInterval(() => { heartbeat(prisma, id).catch(() => {}); }, 60000);   // alive while the services work
    const settle = (promise) => promise.then((v) => v, (err) => ({ success: false, error: err.message }));
    try {
      [readerRes, framesRes] = await Promise.all([
        needReader
          ? settle(withBudget(extractVideo(videoUrl, { postId: id, tenantKey: dbName, timeoutMs: limits.videoBudgetMs - 5000, maxAttempts: 1 }), limits.videoBudgetMs, 'The video reader'))
          : null,
        needFrames ? settle(withBudget(frames.analyse(videoUrl, { postId: id, deadline: Date.now() + limits.framesBudgetMs - 20000 }), limits.framesBudgetMs, 'Looking at the video frame by frame')) : null,
      ]);
    } finally {
      clearInterval(beat);
    }
    const readerOk = Boolean(readerRes && readerRes.success && readerRes.data);
    const framesOk = Boolean(framesRes && framesRes.success && framesRes.data);
    const framesTried = Boolean(framesRes) && !framesRes.unavailable;   // a missing tool is not a failure of the video: it is left to be looked at later
    if (readerOk || framesOk || (!needReader && framesTried)) {
      // the video's reading: the reader's, or (when the reader could not open it) one made from the frames alone, or the one it already had
      const record = readerOk ? clip.recordOf(readerRes.data) : clip.isVideoReading(reading) ? { ...reading } : clip.recordOf({});
      if (needFrames && framesTried) {
        const lead = record.description || record.summary || '';
        record.picture = framesOk
          ? frames.summarise(framesRes.described, { total: framesRes.total, lead, animated: framesRes.animated === true })
          : clip.framesFailureOf(framesRes.error, { transient: !framesRes.nonRetryable });
        if (!framesOk) logger.warn(`[ProfileReport] video frames not looked at for post ${id}: ${String(framesRes.error || '').slice(0, 160)}`);
      }
      reading = record;
      await saveMarker(reading);
      return { ocr: reading, retryLater: false, ms: Date.now() - t0 };
    }
  }
  if (needReader) {
    // neither the reader nor the frames could open the video
    const transient = isTransientImageFailure(readerRes);
    if (transient && (Number(post.analysis_attempts) || 0) < VIDEO_TRANSIENT_RETRIES) {
      return { ocr: reading, retryLater: true, ms: Date.now() - t0 };
    }
    logger.warn(`[ProfileReport] video not read for post ${id}: ${String(readerRes.error || '').slice(0, 160)}`);
    const note = clip.failureOf(readerRes.error, { transient });
    videoNote = note;
    reading = { ...(reading && !reading.failed ? reading : {}), video: note };
    await mergeMarker({ video: note });
  }

  if (!alreadyRead(reading)) {
    if (!imageUrl) return { ocr: await skipPicture('no_image', reading), retryLater: false, ms: Date.now() - t0 };
    await heartbeat(prisma, id);
    let res;
    try {
      res = await withBudget(extractOcr(imageUrl, { postId: id, tenantKey: dbName }), limits.ocrBudgetMs, 'The image reader');
    } catch (err) {
      res = { success: false, error: err.message, attempts: 1 };
    }
    if (res.success && res.data) {
      reading = res.data;
      await saveMarker(reading);
    } else {
      // Busy or unreachable reader: try this post again shortly (a few times) instead of losing its image text for good.
      if (isTransientImageFailure(res) && (Number(post.analysis_attempts) || 0) < OCR_TRANSIENT_RETRIES) {
        return { ocr: null, retryLater: true, ms: Date.now() - t0 };
      }
      logger.warn(`[ProfileReport] image text not read for post ${id}: ${String(res.error || '').slice(0, 160)}`);
      await saveMarker({ error: res.error, failed: true, attempts: res.attempts, ...(wantsPicture ? { picture: { skipped: 'image_unavailable' } } : {}) });
      return { ocr: null, retryLater: false, ms: Date.now() - t0 };
    }
  }

  // Step 2: what the picture shows. Skipped for a picture that has a current record already, or that cannot be fetched.
  // A description made by an older version of the prompts is made again.
  if (!wantsPicture) return { ocr: reading, retryLater: false, ms: Date.now() - t0 };
  if (reading && reading.picture && !pictureIsStale(reading.picture)) return { ocr: reading, retryLater: false, ms: Date.now() - t0 };
  if (!imageUrl) return { ocr: await skipPicture('no_image', reading), retryLater: false, ms: Date.now() - t0 };
  await heartbeat(prisma, id);
  let seen;
  try {
    seen = await withBudget(vision.describePicture(imageUrl, { postId: id }), limits.pictureBudgetMs, 'The picture description');
  } catch (err) {
    seen = { success: false, error: err.message };
  }
  if (seen.success && seen.data) {
    reading = { ...(reading || {}), picture: seen.data };
    await mergeMarker({ picture: seen.data });
  } else if (isTransientImageFailure(seen) && (Number(post.analysis_attempts) || 0) < OCR_TRANSIENT_RETRIES) {
    return { ocr: reading, retryLater: true, ms: Date.now() - t0 };
  } else {
    logger.warn(`[ProfileReport] picture not described for post ${id}: ${String(seen.error || '').slice(0, 160)}`);
    // An older description is better than none: it is kept (marked as current so the post is not queued again for it).
    // Otherwise: a service that was only busy is asked again after a few hours; a picture it cannot describe is not.
    const older = reading && reading.picture && reading.picture.description ? reading.picture : null;
    const record = older
      ? { ...older, v: vision.PICTURE_VERSION, kept_old: true }
      : { failed: true, error: String(seen.error || '').slice(0, 160), ...(isTransientImageFailure(seen) ? { transient: true } : {}), at: new Date().toISOString() };
    reading = { ...(reading || {}), picture: record };
    await mergeMarker({ picture: record });
  }
  return { ocr: reading, retryLater: false, ms: Date.now() - t0 };
};

/** A description made by an older version of the prompts (records from before versions have no `v`). */
const pictureIsStale = (picture) => Boolean(picture && picture.source !== 'video' && picture.description && (Number(picture.v) || 1) < vision.PICTURE_VERSION);

/** The picture as one line for the model that reads the post in context: what it shows, then what stands out in it. */
const pictureLine = (reading) => {
  const scene = sceneOf(reading, 700);
  const signals = signalsOf(reading);
  return `${scene}${signals.length ? `${scene ? ' ' : ''}Notable: ${signals.join('; ')}.` : ''}`;
};

/** What the sentiment service is told about the picture: text on it, what it shows, and what stands out. Never the reader's timing statistics. */
const imageContext = (reading) => {
  if (!reading || typeof reading !== 'object') return null;
  const { picture, ...rest } = reading;
  const out = { ...rest };
  delete out.description;
  delete out.summary;
  delete out.video;   // this module's own note on a video it could not read: nothing the sentiment service needs
  delete out.at;
  if (typeof reading.summary === 'string' && reading.summary.trim()) out.summary = reading.summary.trim();
  const scene = sceneOf(reading, 600);
  const signals = signalsOf(reading);
  if (scene || signals.length) out.description = `${scene}${signals.length ? `${scene ? ' ' : ''}Notable in the ${clip.isVideoReading(reading) ? 'video' : 'picture'}: ${signals.join('; ')}.` : ''}`;
  if (picture && !picture.failed && picture.text_visible && !(Array.isArray(out.visible_text) && out.visible_text.length)) out.visible_text = [picture.text_visible];
  return Object.keys(out).length ? out : null;
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
      await release(prisma, id, { attempts: (Number(post.analysis_attempts) || 0) + 1, giveUp: false, message: 'The image and video reader was busy; trying again shortly.', cooldown: true });
      return { ok: false, retry: true, reason: 'image_reader_busy' };
    }
    const postText = String(post.text || '').trim();
    const mediaText = store.imageTextOf(ocr);
    const text = postText || mediaText;
    // where the analysed words came from, so a later change in how pictures are read can find the posts it affects
    const textSource = postText ? 'caption' : store.printedTextOf(ocr) ? 'image_text' : 'picture';

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
      lane: 'bulk', tenantName, tenantKey: dbName, imageAnalysis: imageContext(ocr), keywords: matchedKeywords, policy: preMapping,
    });
    if (!intel) throw Object.assign(new Error('intelligence returned null'), { retryable: true });

    const riskScore = Math.max(0, Math.min(100, Number(intel.risk_score) || 0));
    let mapping = preMapping;
    try {
      mapping = mappingService.resolveForAnalysis({ category: intel.category, text, platform: post.platform, country: 'IN' });
    } catch (e) { /* keep the pre-mapping */ }
    const category = mapping.category_id || intel.category || null;
    const riskLevel = media.scoreToLevel(riskScore, high, medium);

    // How the post is MEANT, read from the caption, the writing on the picture and the picture together (a joke, a quote,
    // a show of support ...). It may soften a "negative" to "neutral" for plain humour; it never changes risk.
    const classifierSentiment = intel.sentiment || 'neutral';
    let reading = null;
    if (reader.enabled()) {
      await heartbeat(prisma, id);
      const picture = ocr && ocr.picture && !ocr.picture.failed ? ocr.picture : null;
      let said;
      try {
        said = await withBudget(reader.readPost({
          caption: postText,
          printed: store.printedTextOf(ocr),
          picture: pictureLine(ocr),
          kind: clip.isVideoReading(ocr) ? 'video' : picture && picture.kind,
          alerts: picture ? picture.alerts : [],
          classifier: { sentiment: classifierSentiment, risk_level: riskLevel, category, summary: intel.summary },
        }), limits.readingBudgetMs, 'The post reading');
      } catch (err) {
        said = { success: false, error: err.message, transient: true };
      }
      if (said.success && said.data) {
        reading = said.data;
      } else {
        logger.warn(`[ProfileReport] post not read in context post=${id}: ${String(said.error || '').slice(0, 140)}`);
        // a model that was only busy is asked again after a few hours; one that gave no usable answer is not
        reading = { failed: true, v: reader.READING_VERSION, error: String(said.error || '').slice(0, 140), ...(said.transient ? { transient: true } : {}), at: new Date().toISOString() };
      }
    }

    const result = {
      sentiment: reader.finalSentiment(classifierSentiment, reading),
      sentiment_api: classifierSentiment,
      reading,
      sentiment_confidence: intel.sentiment_confidence ?? null,
      risk_score: riskScore,
      risk_level: riskLevel,
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
      // when the analysed words are the picture description (already English, written by us) there is no translation to show
      english_text: textSource === 'picture' ? null : cleanTranslation(intel.english_text),
      was_translated: Boolean(intel.was_translated),
      source: intel.source || 'sentiment-api',
      model: intel.model || null,
      thresholds: { high, medium },
      analyzed_via: 'analyze/intelligence',
      text_source: textSource,
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

module.exports = { analyzePost, enqueuePending, getQueueStats: queue.getStats, __test: { queue, enrichMedia, imageContext, limits, isTransientImageFailure, STALE_PROCESSING_MINUTES } };
