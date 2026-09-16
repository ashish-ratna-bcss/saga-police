const dbOf = require('../../lib/dbOf');
const intelligenceClient = require('../../modules/intelligence/intelligence.client.service');
const mappingService = require('../../modules/settings/mapping.service');
const { matchKeywords, scoreToLevel } = require('./analyzePost');
const { getSettingsDoc } = require('../../modules/settings/settings.service');
const { resolveTenantName } = require('../../lib/tenantDatabase.service');

const MAX_ATTEMPTS = Math.max(1, Number(process.env.SENTIMENT_MAX_ATTEMPTS) || 5);

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

/**
 * Run sentiment/intelligence on one event media row and persist analysis_result.
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

  const row = await prisma.social_media_event_media.findUnique({ where: { id } });
  if (!row) {
    return { ok: false, skipped: true, reason: 'not_found' };
  }

  const text = String(row.text || '').trim();
  if (text.length < 3) {
    await prisma.social_media_event_media.update({
      where: { id },
      data: {
        analysis_status: 'skipped',
        analysis_error: 'text too short or empty',
        analyzed_at: new Date(),
        analysis_result: { skipped: true, reason: 'empty_text' },
        analysis_attempts: { increment: 1 },
      },
    });
    return { ok: true, skipped: true, reason: 'empty_text' };
  }

  const matchedKeywords = await matchKeywords(text, { db });
  const { high, medium } = await loadRiskThresholds({ db });
  const tenantName = await resolveTenantName(dbName).catch(() => null);

  let intel = null;
  try {
    intel = await intelligenceClient.analyzeText(text, { lane: 'bulk', tenantName });
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
  const platform = row.platform || 'x';

  let mapping = { category_id: null, legal_sections: [], platform_policies: [], triggered_keywords: [] };
  try {
    await mappingService.waitForLoad(5000);
    mapping = mappingService.resolveForAnalysis({
      category: intel.category,
      text,
      platform,
      country: 'IN',
    });
  } catch (_) {
    /* optional */
  }

  const resolvedCategory = mapping.category_id || intel.category || null;

  const analysis_result = {
    sentiment: intel.sentiment || 'neutral',
    sentiment_confidence: intel.sentiment_confidence ?? null,
    risk_score: riskScore,
    risk_level: riskLevel,
    stance: intel.stance || null,
    stance_confidence: intel.stance_confidence || null,
    tenant_name: tenantName || null,
    category: resolvedCategory,
    intent: intel.intent || resolvedCategory || null,
    reasoning: intel.reasoning || null,
    summary: intel.summary || null,
    recommended_action: intel.recommended_action || null,
    signals: intel.signals || [],
    matched_keywords: matchedKeywords,
    legal_sections: mapping.legal_sections || [],
    violated_policies: mapping.platform_policies || [],
    language: intel.language || null,
    english_text: intel.english_text || null,
    was_translated: Boolean(intel.was_translated),
    source: intel.source || 'sentiment-api',
    model: intel.model || null,
    thresholds: { high, medium },
    analyzed_via: 'event-media/analyze/intelligence',
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
