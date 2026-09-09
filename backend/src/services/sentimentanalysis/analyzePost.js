const prisma = require('../../../prisma/client');
const { getSettingsDoc } = require('../../modules/settings/settings.service');
const intelligenceClient = require('../../modules/intelligence/intelligence.client.service');
const mappingService = require('../../modules/settings/mapping.service');
const { createAlertFromCatalogPost } = require('../../modules/alerts');

const MAX_ATTEMPTS = Math.max(1, Number(process.env.SENTIMENT_MAX_ATTEMPTS) || 5);

const matchKeywords = async (text) => {
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
    console.error('[sentimentanalysis] keyword match failed:', err.message);
  }
  return matched;
};

const loadRiskThresholds = async () => {
  try {
    const settings = await getSettingsDoc();
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

const persistAlert = async (post, analysis_result) => {
  let alertInfo = null;
  try {
    alertInfo = await createAlertFromCatalogPost(
      { ...post, id: String(post.id) },
      analysis_result
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
      `[sentimentanalysis] alert create failed for post ${post.id}:`,
      alertErr.message
    );
  }
  return alertInfo;
};

/**
 * Run sentiment/intelligence on one catalog post and persist analysis_result.
 * Keywords enrich a successful ML result; they do not replace ML when it fails.
 * @param {string|bigint|number} postId
 */
const analyzePost = async (postId) => {
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

  const post = await prisma.social_media_posts.findUnique({
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

  const text = String(post.text || '').trim();
  if (text.length < 3) {
    await prisma.social_media_posts.update({
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

  const matchedKeywords = await matchKeywords(text);
  const { high, medium } = await loadRiskThresholds();

  let intel = null;
  try {
    // Sentiment API only: POST /analyze/intelligence (via intelligenceClient)
    intel = await intelligenceClient.analyzeText(text, { lane: 'bulk' });
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

  const platform =
    post.account?.platforms?.slug ||
    post.platform ||
    'x';

  // Attach Policy Manager legal + platform rules (infer category if ML left it blank)
  let mapping = { category_id: null, legal_sections: [], platform_policies: [], triggered_keywords: [] };
  try {
    await mappingService.waitForLoad(5000);
    mapping = mappingService.resolveForAnalysis({
      category: intel.category,
      text,
      platform,
      country: 'IN',
    });
  } catch (mapErr) {
    console.error('[sentimentanalysis] policy mapping failed:', mapErr.message);
  }

  const resolvedCategory = mapping.category_id || intel.category || null;

  const analysis_result = {
    sentiment: intel.sentiment || 'neutral',
    sentiment_confidence: intel.sentiment_confidence ?? null,
    risk_score: riskScore,
    risk_level: riskLevel,
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

  const alertInfo = await persistAlert(post, analysis_result);

  return {
    ok: true,
    postId: String(id),
    risk_level: riskLevel,
    risk_score: riskScore,
    sentiment: analysis_result.sentiment,
    alert: alertInfo,
  };
};

module.exports = { analyzePost, matchKeywords, scoreToLevel };
