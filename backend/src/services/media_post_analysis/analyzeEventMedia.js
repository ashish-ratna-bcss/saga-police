const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');
const intelligenceClient = require('../../modules/intelligence/intelligence.client.service');
const mappingService = require('../../modules/settings/mapping.service');
const { getSettingsDoc } = require('../../modules/settings/settings.service');
const { resolveTenantName } = require('../../lib/tenantDatabase.service');
const { extractOcr } = require('./extractOcr');

const MAX_ATTEMPTS = Math.max(1, Number(process.env.SENTIMENT_MAX_ATTEMPTS) || 5);

function extractFirstImageUrl(mediaField) {
  if (!mediaField) return null;
  if (Array.isArray(mediaField)) {
    for (const item of mediaField) {
      if (typeof item === 'string' && !/\.(mp4|m4v|mov|webm|avi|mkv)(\?.*)?$/i.test(item) && !item.includes('.m3u8')) {
        return item;
      }
      if (typeof item === 'object' && item) {
        const url = item.preview_url || item.thumbnail || item.preview || item.image || item.url || item.src;
        if (url && !/\.(mp4|m4v|mov|webm|avi|mkv)(\?.*)?$/i.test(url) && !url.includes('.m3u8')) {
          return url;
        }
      }
    }
  }
  return null;
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
    console.error('[media_post_analysis/event] keyword match failed:', err.message);
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

/**
 * Run media analysis (OCR + Sentiment) on one event media row and persist analysis_result.
 * @param {string|bigint|number} mediaId
 * @param {{ db?: object, dbName?: string|null }} [options]
 */
const analyzeEventMedia = async (mediaId, { db, dbName } = {}) => {
  const prisma = dbOf(db);
  const id = BigInt(mediaId);

  const claimed = await prisma.social_media_event_media.updateMany({
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

  let row = await prisma.social_media_event_media.findUnique({ where: { id } });
  if (!row) {
    return { ok: false, skipped: true, reason: 'not_found' };
  }

  // ── STEP 1: OCR EXTRACTION IF IMAGE PRESENT ──
  let ocrData = row.image_analysis?.full_text ? row.image_analysis : (row.raw_data?.ocr || null);
  const imageUrl = !ocrData?.full_text ? extractFirstImageUrl(row.media) : null;

  if (imageUrl) {
    logger.info(`[media_post_analysis/event] Running OCR extraction for event media ${id}`);
    const ocrResult = await extractOcr(imageUrl, { postId: `event_${id}` });
    if (ocrResult.success && ocrResult.data) {
      ocrData = ocrResult.data;
      const imageText = ocrData.full_text || '';
      let updatedText = row.text || '';
      if (imageText && !updatedText.includes(imageText)) {
        updatedText = [updatedText, imageText].filter(Boolean).join('\n\n[Image text]\n');
      }

      await prisma.social_media_event_media.update({
        where: { id },
        data: {
          text: updatedText,
          image_analysis: ocrData,
        },
      });
      row.text = updatedText;
      row.image_analysis = ocrData;
    }
  }

  // ── STEP 2: SENTIMENT ANALYSIS ──
  const text = String(row.text || '').trim();
  if (text.length < 3) {
    await prisma.social_media_event_media.update({
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

  const platform = row.platform || 'x';

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
    console.error('[media_post_analysis/event] pre-mapping failed:', mapErr.message);
  }

  let intel = null;
  try {
    intel = await intelligenceClient.analyzeText(text, {
      lane: 'bulk',
      tenantName,
      tenantKey: dbName,
      imageAnalysis: ocrData,
      keywords: matchedKeywords,
      policy: preMapping,
    });
  } catch (err) {
    const attempts = (row.analysis_attempts || 0) + 1;
    const isBusy =
      err.backpressure ||
      err.status === 429 ||
      /429|gate full|backpressure/i.test(err.message || '');
    const giveUp = !isBusy && attempts >= MAX_ATTEMPTS;

    await prisma.social_media_event_media.update({
      where: { id },
      data: {
        analysis_status: giveUp ? 'failed' : 'pending',
        analysis_error: err.message || 'intelligence call failed',
        analysis_attempts: isBusy ? row.analysis_attempts || 0 : { increment: 1 },
      },
    });
    return { ok: false, error: err.message, retry: !giveUp };
  }

  if (!intel) {
    const attempts = (row.analysis_attempts || 0) + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    await prisma.social_media_event_media.update({
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

  let mapping = { category_id: null, legal_sections: [], platform_policies: [], triggered_keywords: [] };
  try {
    await mappingService.waitForLoad(5000);
    mapping = mappingService.resolveForAnalysis({
      category: intel.category,
      text,
      platform,
      country: 'IN',
    });
  } catch (_) {}

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

  await prisma.social_media_event_media.update({
    where: { id },
    data: {
      analysis_status: 'done',
      analysis_result,
      analysis_error: null,
      analyzed_at: new Date(),
      analysis_attempts: { increment: 1 },
    },
  });

  return {
    ok: true,
    mediaId: String(id),
    risk_level: riskLevel,
    risk_score: riskScore,
    sentiment: analysis_result.sentiment,
  };
};

module.exports = { analyzeEventMedia };
