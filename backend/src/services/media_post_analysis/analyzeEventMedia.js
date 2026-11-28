const dbOf = require('../../lib/dbOf');
const logger = require('../../lib/logger');
const intelligenceClient = require('../../modules/intelligence/intelligence.client.service');
const mappingService = require('../../modules/settings/mapping.service');
const { getSettingsDoc } = require('../../modules/settings/settings.service');
const { resolveTenantName } = require('../../lib/tenantDatabase.service');
const { extractOcr, extractVideo } = require('./extractOcr');
const { extractAudioTranscript } = require('./extractAudio');
const { mediaTextOf, transcriptOf } = require('./imageText');
const { keywordMatchesText } = require('../../modules/events/event.utils');

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

const VIDEO_URL_RE = /\.(mp4|m4v|mov|webm|avi|mkv)(\?.*)?$/i;
const IMAGE_URL_RE = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i;

/** Poster/thumbnail CDNs and image files — never feed these to Whisper/ffmpeg. */
const looksLikeImageUrl = (url) => {
  const u = String(url || '');
  if (!u) return false;
  if (IMAGE_URL_RE.test(u)) return true;
  if (/i\.ytimg\.com|img\.youtube\.com|(^|\/\/)ytimg\.com\//i.test(u)) return true;
  if (/maxresdefault|hqdefault|mqdefault|sddefault|hq720|default\.jpg/i.test(u)) return true;
  return false;
};

/**
 * Direct media file Whisper/ffmpeg can download. Not a YouTube/Facebook watch
 * page, and not a JPEG poster that catalog/YouTube mistakenly typed as video.
 */
const looksLikeDirectVideoFileUrl = (url) => {
  const u = String(url || '');
  if (!u || looksLikeImageUrl(u)) return false;
  if (/youtube\.com\/watch|youtu\.be\/|facebook\.com\/.+\/videos\//i.test(u)) return false;
  return (
    VIDEO_URL_RE.test(u) ||
    u.toLowerCase().includes('.m3u8') ||
    /video\.twimg\.com|(?:fbcdn\.net|cdninstagram\.com).*\/.+\.mp4/i.test(u)
  );
};

/**
 * Finds a real downloadable video file url in the event media field.
 * Do not trust type:"video" alone — YouTube catalog rows often store
 * i.ytimg.com posters with type video.
 */
function extractFirstVideoUrl(mediaField) {
  if (!mediaField || !Array.isArray(mediaField)) return null;
  for (const item of mediaField) {
    if (typeof item === 'string') {
      if (looksLikeDirectVideoFileUrl(item)) return item;
      continue;
    }
    if (typeof item === 'object' && item) {
      const url = item.video_url || item.url;
      if (url && looksLikeDirectVideoFileUrl(url)) return url;
    }
  }
  return null;
}

/** Already-analyzed check that works for either result shape (image OCR or video). */
function hasMediaAnalysis(imageAnalysis) {
  return Boolean(imageAnalysis?.full_text) || Boolean(imageAnalysis?.description);
}

function hasAudioTranscript(imageAnalysis) {
  const t = imageAnalysis?.transcript;
  if (!t || typeof t !== 'object') return false;
  if (t.pending || t.queued || t.transient) return false;
  if (typeof t.text === 'string') return true;
  if (t.failed) return true;
  return false;
}

/**
 * Keywords found in an event post.
 * - `event`: this event's own keywords (whole-word match). Shown as "Detected Keywords".
 * - `watchlist`: tenant-wide Settings keywords. Kept separately so they never
 *   appear as if they were part of this event.
 */
const matchKeywords = async (text, { db, eventId } = {}) => {
  const prisma = dbOf(db);
  const out = { event: [], watchlist: [] };
  const hit = (keyword) => ({ keyword, weight: 50, category: 'other' });
  try {
    if (eventId != null) {
      const ev = await prisma.social_media_events.findUnique({
        where: { id: Number(eventId) },
        select: { keywords: true },
      });
      const list = Array.isArray(ev?.keywords) ? ev.keywords : [];
      const seen = new Set();
      for (const k of list) {
        const kw = String(typeof k === 'string' ? k : k?.keyword || '').trim();
        if (!kw || seen.has(kw.toLowerCase())) continue;
        seen.add(kw.toLowerCase());
        if (keywordMatchesText(kw, text)) out.event.push(hit(kw));
      }
    }
    const keywords = await prisma.keywords.findMany({ select: { keyword: true }, take: 2000 });
    for (const k of keywords) {
      const kw = String(k.keyword || '').trim();
      if (kw && keywordMatchesText(kw, text)) out.watchlist.push(hit(kw));
    }
  } catch (err) {
    console.error('[media_post_analysis/event] keyword match failed:', err.message);
  }
  return out;
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

  // ── STEP 1: MEDIA ENRICHMENT (video analysis, else image OCR) ──
  let ocrData = hasMediaAnalysis(row.image_analysis) ? row.image_analysis : (row.raw_data?.ocr || null);
  const alreadyAnalyzed = hasMediaAnalysis(ocrData);
  const videoUrl = alreadyAnalyzed ? null : extractFirstVideoUrl(row.media);

  if (videoUrl) {
    logger.info(`[media_post_analysis/event] Running video analysis for event media ${id}`);
    const videoResult = await extractVideo(videoUrl, { postId: `event_${id}`, tenantKey: dbName });
    if (videoResult.success && videoResult.data) {
      ocrData = { media_type: 'video', ...videoResult.data };
      await prisma.social_media_event_media.update({
        where: { id },
        data: { image_analysis: ocrData },
      });
      row.image_analysis = ocrData;
    } else {
      logger.warn(`[media_post_analysis/event] Video analysis failed for event media ${id}: ${videoResult.error}`);
      const failedAnalysis = { error: videoResult.error, failed: true, attempts: videoResult.attempts, media_type: 'video' };
      await prisma.social_media_event_media.update({
        where: { id },
        data: { image_analysis: failedAnalysis },
      });
      row.image_analysis = failedAnalysis;
    }
  } else if (!alreadyAnalyzed) {
    const imageUrl = extractFirstImageUrl(row.media);

    if (imageUrl) {
      logger.info(`[media_post_analysis/event] Running OCR extraction for event media ${id}`);
      const ocrResult = await extractOcr(imageUrl, { postId: `event_${id}`, tenantKey: dbName });
      if (ocrResult.success && ocrResult.data) {
        ocrData = ocrResult.data;

        await prisma.social_media_event_media.update({
          where: { id },
          data: {
            image_analysis: ocrData,
          },
        });
        row.image_analysis = ocrData;
      }
    }
  }

  // ── STEP 1b: AUDIO TRANSCRIPTION (video speech → Whisper) ──
  // Same as video analysis: WAIT for audio before sentiment.
  const audioVideoUrl = extractFirstVideoUrl(row.media);
  if (audioVideoUrl && !hasAudioTranscript(ocrData)) {
    const base = ocrData && typeof ocrData === 'object' && !Array.isArray(ocrData)
      ? { ...ocrData }
      : { media_type: 'video' };

    ocrData = {
      ...base,
      media_type: base.media_type || 'video',
      transcript: {
        pending: true,
        queued: true,
        at: new Date().toISOString(),
      },
    };
    await prisma.social_media_event_media.update({
      where: { id },
      data: {
        image_analysis: ocrData,
        analysis_status: 'processing',
        analysis_error: 'waiting for audio transcription',
      },
    });
    row.image_analysis = ocrData;

    logger.info(`[media_post_analysis/event] Waiting for audio transcription for event media ${id}`);
    const audioResult = await extractAudioTranscript(audioVideoUrl, {
      postId: `event_${id}`,
    });

    if (audioResult.success && audioResult.data) {
      ocrData = {
        ...base,
        media_type: base.media_type || 'video',
        transcript: {
          text: audioResult.data.text || '',
          language: audioResult.data.language,
          language_probability: audioResult.data.language_probability,
          duration: audioResult.data.duration,
          segments: audioResult.data.segments,
          model: audioResult.data.model,
          device: audioResult.data.device,
        },
      };
      await prisma.social_media_event_media.update({
        where: { id },
        data: { image_analysis: ocrData, analysis_error: null },
      });
      row.image_analysis = ocrData;
    } else if (audioResult.transient) {
      logger.warn(
        `[media_post_analysis/event] Audio still waiting for event media ${id}: ${audioResult.error}`
      );
      ocrData = {
        ...base,
        media_type: base.media_type || 'video',
        transcript: {
          pending: true,
          queued: true,
          transient: true,
          error: audioResult.error,
          attempts: audioResult.attempts,
          at: new Date().toISOString(),
        },
      };
      await prisma.social_media_event_media.update({
        where: { id },
        data: {
          image_analysis: ocrData,
          analysis_status: 'pending',
          analysis_error: 'waiting for audio transcription',
        },
      });
      return { ok: false, error: audioResult.error, retry: true, reason: 'audio_waiting' };
    } else {
      logger.warn(`[media_post_analysis/event] Audio permanent failure for event media ${id}: ${audioResult.error}`);
      ocrData = {
        ...base,
        media_type: base.media_type || 'video',
        transcript: {
          failed: true,
          transient: false,
          error: audioResult.error,
          attempts: audioResult.attempts,
        },
      };
      await prisma.social_media_event_media.update({
        where: { id },
        data: { image_analysis: ocrData },
      });
      row.image_analysis = ocrData;
    }
  }

  // ── STEP 2: SENTIMENT ANALYSIS ──
  const rowText = String(row.text || '').trim();
  // Readable text even when the image reader answered with structured data (it used to become "[object Object]").
  const mediaText = mediaTextOf(ocrData);
  const speechText = transcriptOf(ocrData);
  const textForAnalysis = [rowText, mediaText, speechText].filter((t) => t.length >= 3).join('\n\n')
    || rowText
    || mediaText
    || speechText;

  if (rowText.length < 3 && mediaText.length < 3 && speechText.length < 3) {
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

  const keywordHits = await matchKeywords(textForAnalysis, { db, eventId: row.event_id });
  const matchedKeywords = keywordHits.event;
  const { high, medium } = await loadRiskThresholds({ db });
  const tenantName = await resolveTenantName(dbName).catch(() => null);

  const platform = row.platform || 'x';

  let preMapping = { category_id: null, legal_sections: [], platform_policies: [], triggered_keywords: [] };
  try {
    await mappingService.waitForLoad(5000);
    const inferredCategory = mappingService.inferCategoryFromText(textForAnalysis);
    preMapping = mappingService.resolveForAnalysis({
      category: inferredCategory,
      text: textForAnalysis,
      platform,
      country: 'IN',
    });
  } catch (mapErr) {
    console.error('[media_post_analysis/event] pre-mapping failed:', mapErr.message);
  }

  let intel = null;
  try {
    intel = await intelligenceClient.analyzeText(textForAnalysis, {
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
      text: textForAnalysis,
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
    watchlist_keywords: keywordHits.watchlist,
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
    ocr_extracted: Boolean(ocrData?.full_text),
    video_analyzed: Boolean(ocrData?.description),
  };
};

module.exports = { analyzeEventMedia };
