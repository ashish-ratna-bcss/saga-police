const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');
const { getSettingsDoc } = require('../../modules/settings/settings.service');
const intelligenceClient = require('../../modules/intelligence/intelligence.client.service');
const mappingService = require('../../modules/settings/mapping.service');
const { createAlertFromCatalogPost } = require('../../modules/alerts');
const { resolveTenantName } = require('../../lib/tenantDatabase.service');
const { extractOcr } = require('./extractOcr');

const MAX_ATTEMPTS = Math.max(1, Number(process.env.SENTIMENT_MAX_ATTEMPTS) || 5);

/**
 * Determines whether a post has image media suitable for OCR.
 */
function extractFirstImageUrl(post) {
  if (!post) return null;

  // 1. Check media_urls for image extensions or known image CDNs
  if (Array.isArray(post.media_urls) && post.media_urls.length > 0) {
    const candidate = post.media_urls.find((u) => {
      const url = String(u || '').toLowerCase();
      // Skip direct video streams
      if (/\.(mp4|m4v|mov|webm|avi|mkv)(\?.*)?$/i.test(url) || url.includes('.m3u8')) {
        return false;
      }
      return true;
    });
    if (candidate) return candidate;
  }

  // 2. Check raw_data (Twitter photos, Amplify video thumb, FB pictures, etc.)
  const raw = post.raw_data || {};
  if (Array.isArray(raw.photos) && raw.photos[0]?.url) return raw.photos[0].url;
  if (raw.thumbnail && typeof raw.thumbnail === 'string') return raw.thumbnail;
  if (raw.full_picture && typeof raw.full_picture === 'string') return raw.full_picture;
  if (raw.picture && typeof raw.picture === 'string') return raw.picture;
  if (raw.image && typeof raw.image === 'string') return raw.image;
  if (raw.video_thumbnail && typeof raw.video_thumbnail === 'string') return raw.video_thumbnail;

  // Twitter legacy extended_entities media
  const twMedia = raw.legacy?.extended_entities?.media || raw.extended_entities?.media;
  if (Array.isArray(twMedia) && twMedia.length > 0) {
    const m = twMedia[0];
    if (m?.media_url_https) return m.media_url_https;
    if (m?.media_url) return m.media_url;
  }

  return null;
}

function hasImageMedia(post) {
  const imageUrl = extractFirstImageUrl(post);
  return Boolean(imageUrl);
}

const matchKeywords = async (text, { db } = {}) => {
  const prisma = dbOf(db);
  const matched = [];
  try {
    const keywords = await prisma.keywords.findMany({
      select: { keyword: true },
      take: 2000,
    });
    const hay = String(text || '').toLowerCase();
    for (const k of keywords) {
      const needle = String(k.keyword || '').toLowerCase().trim();
      if (!needle) continue;
      if (hay.includes(needle)) {
        matched.push({
          keyword: k.keyword,
          weight: 50,
          category: 'other',
        });
      }
    }
  } catch (err) {
    console.error('[media_post_analysis] keyword match failed:', err.message);
  }
  return matched;
};

const loadRiskThresholds = async ({ db } = {}) => {
  try {
    const settings = await getSettingsDoc({ db });
    return {
      high: settings?.high_risk_threshold ?? settings?.risk_threshold_high ?? 70,
      medium: settings?.medium_risk_threshold ?? settings?.risk_threshold_medium ?? 40,
    };
  } catch (_) {
    return { high: 70, medium: 40 };
  }
};

const scoreToLevel = (score, high, medium) => {
  if (score >= high) return 'high';
  if (score >= medium) return 'medium';
  return 'low';
};

const persistAlert = async (post, analysis_result, { db } = {}) => {
  const prisma = dbOf(db);
  let alertInfo = null;
  try {
    alertInfo = await createAlertFromCatalogPost(
      { ...post, id: String(post.id) },
      analysis_result,
      { db }
    );
    if (alertInfo?.alert?.id) {
      analysis_result.alert_id = String(alertInfo.alert.id);
      analysis_result.alert_created = Boolean(alertInfo.created);
      analysis_result.alert_store = 'postgres';
      await prisma.social_media_posts.update({
        where: { id: post.id },
        data: { analysis_result },
      });
    }
  } catch (alertErr) {
    console.error(
      `[media_post_analysis] alert create failed for post ${post.id}:`,
      alertErr.message
    );
  }
  return alertInfo;
};

/**
 * Runs the end-to-end media post analysis pipeline:
 * 1. Checks if image post -> extracts text via OCR with retries -> updates DB table
 * 2. If video or text-only -> skips OCR directly
 * 3. Runs Sentiment & Risk Analysis with full text + OCR metadata attached
 * 4. Persists analysis_result, triggers keyword alerts, marks 'done'
 *
 * @param {string|bigint|number} postId
 * @param {{ db?: object, dbName?: string|null }} [options]
 */
const analyzeMediaPost = async (postId, { db, dbName } = {}) => {
  const prisma = dbOf(db);
  const id = BigInt(postId);

  const claimed = await prisma.social_media_posts.updateMany({
    where: {
      id,
      analysis_status: { in: ['pending', 'failed'] },
    },
    data: {
      analysis_status: 'processing',
      analysis_error: null,
    },
  });

  if (claimed.count === 0) {
    return { ok: false, skipped: true, reason: 'not_claimable' };
  }

  let post = await prisma.social_media_posts.findUnique({
    where: { id },
    include: {
      account: {
        include: {
          profile: { select: { id: true, display_name: true } },
          platforms: { select: { slug: true, name: true } },
        },
      },
    },
  });

  if (!post) {
    return { ok: false, skipped: true, reason: 'not_found' };
  }

  // ── STEP 1: CONDITIONAL OCR EXTRACTION ──
  let ocrData = post.image_analysis?.full_text ? post.image_analysis : (post.raw_data?.ocr || null);
  const shouldRunOcr = hasImageMedia(post) && (!ocrData || !ocrData.full_text);

  if (shouldRunOcr) {
    const imageUrl = extractFirstImageUrl(post);

    if (imageUrl) {
      logger.info(`[media_post_analysis] Running OCR extraction for post ${id}`);
      const ocrResult = await extractOcr(imageUrl, { postId: String(id) });

      if (ocrResult.success && ocrResult.data) {
        ocrData = ocrResult.data;
        const imageText = ocrData.full_text || '';

        let updatedText = post.text || '';
        if (imageText && !updatedText.includes(imageText)) {
          updatedText = [updatedText, imageText]
            .filter(Boolean)
            .join('\n\n[Image text]\n');
        }

        // Persist directly into dedicated image_analysis column
        await prisma.social_media_posts.update({
          where: { id },
          data: {
            text: updatedText,
            image_analysis: ocrData,
          },
        });

        // Update local object
        post.text = updatedText;
        post.image_analysis = ocrData;
        logger.info(`[media_post_analysis] OCR extracted successfully for post ${id} (${imageText.length} chars)`);
      } else {
        logger.warn(`[media_post_analysis] OCR failed for post ${id}: ${ocrResult.error}`);
        const failedAnalysis = { error: ocrResult.error, failed: true, attempts: ocrResult.attempts };
        await prisma.social_media_posts.update({
          where: { id },
          data: { image_analysis: failedAnalysis },
        });
        post.image_analysis = failedAnalysis;
      }
    }
  } else if (!hasImageMedia(post)) {
    logger.debug(`[media_post_analysis] Post ${id} is video or text-only; skipping OCR step.`);
  }

  // ── STEP 2: SENTIMENT & INTELLIGENCE ANALYSIS ──
  const text = String(post.text || '').trim();
  if (text.length < 3) {
    await prisma.social_media_posts.update({
      where: { id },
      data: {
        analysis_status: 'skipped',
        analysis_error: 'text too short or empty',
        analyzed_at: new Date(),
        analysis_result: { skipped: true, reason: 'empty_text', ocr: ocrData },
        analysis_attempts: { increment: 1 },
      },
    });
    return { ok: true, skipped: true, reason: 'empty_text' };
  }

  const matchedKeywords = await matchKeywords(text, { db });
  const { high, medium } = await loadRiskThresholds({ db });
  const tenantName = await resolveTenantName(dbName).catch(() => null);

  const platform =
    post.account?.platforms?.slug ||
    post.platform ||
    'x';

  let preMapping = { category_id: null, legal_sections: [], platform_policies: [], triggered_keywords: [] };
  try {
    await mappingService.waitForLoad(5000);
    const inferredCategory = mappingService.inferCategoryFromText(text);
    preMapping = mappingService.resolveForAnalysis({
      category: inferredCategory,
      text,
      platform,
      country: 'IN',
    });
  } catch (mapErr) {
    console.error('[media_post_analysis] pre-mapping failed:', mapErr.message);
  }

  let intel = null;
  try {
    // Send text with attached image analysis / OCR metadata
    intel = await intelligenceClient.analyzeText(text, {
      lane: 'bulk',
      tenantName,
      tenantKey: dbName,
      imageAnalysis: ocrData,
      keywords: matchedKeywords,
      policy: preMapping,
    });
  } catch (err) {
    const attempts = (post.analysis_attempts || 0) + 1;
    const isBusy =
      err.backpressure ||
      err.status === 429 ||
      /429|gate full|backpressure/i.test(err.message || '');
    const giveUp = !isBusy && attempts >= MAX_ATTEMPTS;

    await prisma.social_media_posts.update({
      where: { id },
      data: {
        analysis_status: giveUp ? 'failed' : 'pending',
        analysis_error: err.message || 'intelligence call failed',
        analysis_attempts: isBusy ? post.analysis_attempts || 0 : { increment: 1 },
      },
    });
    return { ok: false, error: err.message, retry: !giveUp };
  }

  if (!intel) {
    const attempts = (post.analysis_attempts || 0) + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await prisma.social_media_posts.update({
      where: { id },
      data: {
        analysis_status: giveUp ? 'failed' : 'pending',
        analysis_error: 'intelligence returned null (will retry)',
        analysis_attempts: { increment: 1 },
      },
    });
    return { ok: false, error: 'null_result', retry: !giveUp };
  }

  const riskScore = Math.max(0, Math.min(100, Number(intel.risk_score) || 0));
  const riskLevel = scoreToLevel(riskScore, high, medium);

  let mapping = preMapping;
  try {
    await mappingService.waitForLoad(5000);
    mapping = mappingService.resolveForAnalysis({
      category: intel.category,
      text,
      platform,
      country: 'IN',
    });
  } catch (mapErr) {
    console.error('[media_post_analysis] policy mapping failed:', mapErr.message);
  }

  const resolvedCategory = mapping.category_id || intel.category || null;

  const analysis_result = {
    sentiment: intel.sentiment || 'neutral',
    sentiment_confidence: intel.sentiment_confidence ?? null,
    risk_score: riskScore,
    risk_level: riskLevel,
    stance: intel.stance ?? null,
    stance_confidence: intel.stance_confidence ?? null,
    tenant_name: tenantName || null,
    category: resolvedCategory,
    intent: intel.intent || resolvedCategory || null,
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
    ocr: ocrData,
  };

  await prisma.social_media_posts.update({
    where: { id },
    data: {
      analysis_status: 'done',
      analysis_result,
      analysis_error: null,
      analyzed_at: new Date(),
      analysis_attempts: { increment: 1 },
    },
  });

  const alertInfo = await persistAlert(post, analysis_result, { db });

  return {
    ok: true,
    postId: String(id),
    risk_level: riskLevel,
    risk_score: riskScore,
    sentiment: analysis_result.sentiment,
    ocr_extracted: Boolean(ocrData?.full_text),
    alert: alertInfo,
  };
};

module.exports = { analyzeMediaPost };
