require('dotenv').config();
const axios = require('axios');
const { categorizeText } = require('./llmService');
const { getEngineName } = require('./sentimentEngineService');
const customSentimentService = require('./customSentimentService');
const intelligenceClient = require('./intelligenceClientService');
const mappingService = require('./mappingService');
const LegalSection = require('../models/LegalSection');
const PlatformPolicy = require('../models/PlatformPolicy');
const { enqueueForensicTask } = require('./forensicQueueService');

const SHADOW_SAMPLE_RATE = Math.max(
  0,
  Math.min(1, Number(process.env.INTELLIGENCE_SHADOW_SAMPLE_RATE || 0))
);

const ANALYSIS_CACHE_TTL_MS = Math.max(60000, Number(process.env.ANALYSIS_CACHE_TTL_MS || 30 * 60 * 1000));
const ANALYSIS_CACHE_MAX_ITEMS = Math.max(100, Number(process.env.ANALYSIS_CACHE_MAX_ITEMS || 5000));
const analysisCache = new Map();

const normalizeAnalysisText = (value) => {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const getCachedAnalysis = (text) => {
  const key = normalizeAnalysisText(text);
  if (!key) return null;
  const cached = analysisCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    analysisCache.delete(key);
    return null;
  }
  return cached.value;
};

const setCachedAnalysis = (text, value) => {
  const key = normalizeAnalysisText(text);
  if (!key || !value) return;

  if (analysisCache.size >= ANALYSIS_CACHE_MAX_ITEMS) {
    const firstKey = analysisCache.keys().next().value;
    if (firstKey) analysisCache.delete(firstKey);
  }

  analysisCache.set(key, {
    value,
    expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS
  });
};

/**
 * Analysis Pipeline (V7.0)
 * Pass A: Intelligence engine
 *   INTELLIGENCE_ENGINE=SENTIMENT_SERVICE (default) → one call to
 *     social_media_sentiment_analysis POST /analyze/intelligence
 *     (IndicTrans2 + Cardiff sentiment + Ollama category/intent/risk)
 *   INTELLIGENCE_ENGINE=LOCAL_OLLAMA → legacy llmService.categorizeText (+ optional CUSTOM sentiment)
 *   INTELLIGENCE_ENGINE=SHADOW → LOCAL_OLLAMA persisted; sample also hits sentiment-api (log only)
 * Pass B: Deterministic Mapping Engine for Legal & Policy Mapping
 * Pass D: Standalone Deepfake Forensics (S3-First, Async)
 */

async function runPassA(text, log) {
  const mode = intelligenceClient.getEngineMode();

  if (mode === 'SENTIMENT_SERVICE') {
    log('Running Pass A (sentiment-api /analyze/intelligence)...');
    const result = await intelligenceClient.analyzeText(text, { lane: 'bulk' });
    return { llmResult: result, sentimentFromIntel: true, mode };
  }

  // LOCAL_OLLAMA or SHADOW — authoritative path is still local Ollama (+ optional CUSTOM).
  log(`Running Pass A (LOCAL_OLLAMA${mode === 'SHADOW' ? '+SHADOW' : ''})...`);
  let llmResult = await categorizeText(text);

  if (mode === 'SHADOW' && llmResult && Math.random() < SHADOW_SAMPLE_RATE) {
    // Fire-and-forget comparison; never affects the persisted path.
    Promise.resolve()
      .then(() => intelligenceClient.analyzeText(text, { lane: 'bulk' }))
      .then((candidate) => {
        console.log(JSON.stringify({
          type: 'intelligence_shadow',
          baseline: {
            category: llmResult.category,
            intent: llmResult.intent,
            sentiment: llmResult.sentiment,
            risk_score: llmResult.risk_score
          },
          candidate: candidate
            ? {
                category: candidate.category,
                intent: candidate.intent,
                sentiment: candidate.sentiment,
                risk_score: candidate.risk_score,
                source: candidate.source
              }
            : null
        }));
      })
      .catch((err) => console.warn(`[AnalysisService] shadow failed: ${err.message}`));
  }

  return { llmResult, sentimentFromIntel: false, mode };
}

const triggerForensicAnalysis = async (content, analysisId) => {
  const log = (msg) => console.log(`[ForensicQueue] ${msg}`);
  const mlServiceUrl = process.env.DEEPFAKE_ML_URL || 'http://localhost:8001';

  // Queue background alert-batch forensics at normal priority.
  return enqueueForensicTask(async () => {
    try {
      log(`Starting alert-batch analysis: ${analysisId}`);
      let mediaItems = content.media || [];

      // Fallback: If no media items but platform is YouTube/Facebook, use content_url
      if (mediaItems.length === 0 && (content.platform === 'youtube' || content.platform === 'facebook')) {
        const url = content.content_url || content.url;
        if (url) {
          mediaItems = [{ url, type: 'video' }];
        }
      }

      if (mediaItems.length === 0) return null;

      // Prioritize S3 URLs if archived, fallback to platform URL
      const payload = {
        media_items: mediaItems.map(m => ({
          url: m.s3_url || m.video_url || m.url,
          type: m.type === 'video' ? 'video' : 'image'
        })),
        include_previews: false
      };

      log(`Triggering batch forensics for ${payload.media_items.length} items (Analysis: ${analysisId})`);

      const response = await axios.post(`${mlServiceUrl}/detect/batch`, payload, {
        timeout: 300000,
        headers: { 'x-api-key': process.env.GATEWAY_API_KEY || '' }
      });
      log(`Alert-batch complete: ${analysisId}`);
      return response.data.results || null;

    } catch (err) {
      log(`Alert-batch failed for ${analysisId}: ${err.message}`);
      return null;
    }
  }, { priority: 'normal', label: `alert-batch:${analysisId}` });
};

const analyzeContent = async (text, options = {}) => {
  const log = (msg) => console.log(`[AnalysisService] ${msg}`);

  if (!text || !text.trim()) {
    return {
      risk_level: 'low',
      risk_score: 0,
      explanation: 'No text provided.',
      sentiment: 'neutral',
      violated_policies: [],
      legal_sections: [],
      triggered_keywords: []
    };
  }

  try {
    const cached = getCachedAnalysis(text);
    if (cached) {
      return {
        ...cached,
        cached: true
      };
    }

    log(`Starting analysis for: "${text.substring(0, 50)}..."`);

    // --- PASS A: FULL INTELLIGENCE (Category + Intent + Sentiment + Risk) ---
    let { llmResult, sentimentFromIntel, mode } = await runPassA(text, log);

    if (!llmResult) {
      if (options.requireLLM) {
        throw new Error('On-prem LLM timeout/overload or unavailable — item will be retried');
      }
      log('Pass A failed. Using fallback (Normal).');
      llmResult = {
        category: 'Normal',
        intent: 'Normal',
        sentiment: 'neutral',
        risk_score: 0,
        risk_level: 'low',
        reasoning: 'Primary AI analysis unavailable. Defaulting to Normal category.'
      };
    }

    const finalRiskScore = llmResult.risk_score;

    // When Pass A used sentiment-api, Cardiff sentiment is already on llmResult —
    // do NOT make a second /analyze call. LOCAL_OLLAMA still honours SENTIMENT_ANALYSIS.
    let finalSentiment = llmResult.sentiment;
    let sentimentConfidence = llmResult.sentiment_confidence ?? null;
    let sentimentDetails = null;
    if (sentimentFromIntel) {
      sentimentDetails = {
        language: llmResult.language,
        english_text: llmResult.english_text,
        was_translated: llmResult.was_translated,
        was_transliterated: llmResult.was_transliterated,
        engine: 'sentiment-api',
        intelligence_source: llmResult.source,
        model: llmResult.model
      };
      log(
        `Pass A engine=${mode} sentiment=${finalSentiment}` +
        (sentimentConfidence != null ? ` confidence=${sentimentConfidence}` : '') +
        (sentimentDetails.language ? ` lang=${sentimentDetails.language}` : '') +
        (sentimentDetails.was_translated != null
          ? ` translated=${sentimentDetails.was_translated} transliterated=${sentimentDetails.was_transliterated}`
          : '')
      );
    } else {
      const sentimentEngine = getEngineName();
      if (sentimentEngine === 'CUSTOM') {
        const customResult = await customSentimentService.analyzeSentiment(text);
        finalSentiment = customResult.sentiment;
        sentimentConfidence = customResult.confidence;
        sentimentDetails = customResult.details;
      }
      log(
        `Sentiment engine=${sentimentEngine} sentiment=${finalSentiment}` +
        (sentimentConfidence != null ? ` confidence=${sentimentConfidence}` : '') +
        (sentimentDetails
          ? ` lang=${sentimentDetails.language} translated=${sentimentDetails.was_translated} transliterated=${sentimentDetails.was_transliterated}`
          : '')
      );
    }

    log(
      `Pass A result: cat=${llmResult.category}, intent="${llmResult.intent}", ` +
      `sentiment=${finalSentiment}, risk_score=${finalRiskScore}` +
      (llmResult.recommended_action ? `, action=${llmResult.recommended_action}` : '')
    );

    // --- PASS B: DETERMINISTIC MAPPING ENGINE ---
    log("Running Pass B (Deterministic Mapping Engine)...");

    // Check against ALL platforms for comprehensive policy analysis
    const supportedPlatforms = ['x', 'youtube', 'facebook', 'instagram'];
    let allViolatedPolicies = [];
    let aggregatedLegalSections = [];
    let aggregatedKeywords = [];

    supportedPlatforms.forEach(p => {
      const result = mappingService.resolveMapping(
        llmResult.category,
        text,
        p,
        options.country || 'IN'
      );
      if (result.platform_policies && result.platform_policies.length > 0) {
        allViolatedPolicies.push(...result.platform_policies);
      }
      if (aggregatedLegalSections.length === 0) aggregatedLegalSections = result.legal_sections || [];
      if (aggregatedKeywords.length === 0) aggregatedKeywords = result.triggered_keywords || [];
    });

    const mappingResult = {
      legal_sections: aggregatedLegalSections,
      platform_policies: allViolatedPolicies,
      triggered_keywords: aggregatedKeywords
    };

    // --- RESULT CONSOLIDATION (risk_level will be derived by performFullAnalysis from settings) ---
    const finalResult = {
      risk_score: finalRiskScore,
      primary_intent: llmResult.category,
      category: llmResult.category,
      intent: llmResult.intent || llmResult.category,
      violated_policies: mappingResult.platform_policies || [],
      legal_sections: mappingResult.legal_sections || [],
      triggered_keywords: mappingResult.triggered_keywords || [],
      sentiment: finalSentiment,
      explanation: llmResult.reasoning || '',
      highlights: mappingResult.triggered_keywords || [],
      summary: llmResult.summary || '',
      recommended_action: llmResult.recommended_action || '',
      evidence_confidence: llmResult.confidence || null,
      signals: Array.isArray(llmResult.signals) ? llmResult.signals : [],
      intelligence_source: llmResult.source || mode,
      intelligence_model: llmResult.model || null,
      sentiment_confidence: sentimentConfidence,
      // Structure for ReasonModal (existing keys preserved; extras additive)
      llm_analysis: {
        category: llmResult.category,
        intent: llmResult.intent || llmResult.category,
        sentiment: finalSentiment,
        reasoning: llmResult.reasoning || '',
        score: finalRiskScore,
        summary: llmResult.summary || '',
        recommended_action: llmResult.recommended_action || '',
        evidence_confidence: llmResult.confidence || null,
        signals: Array.isArray(llmResult.signals) ? llmResult.signals : [],
        platform_policies_violated: mappingResult.platform_policies || [],
        bns_sections_violated: mappingResult.legal_sections || []
      }
    };

    // 3. Final Metadata for UI
    finalResult.reasons = [
      finalResult.explanation,
      `Risk Score: ${finalRiskScore}%`,
      ...finalResult.violated_policies.map(p => `Policy: ${p.policy_name}`),
      ...finalResult.legal_sections.map(l => `Legal: ${l.act} ${l.section}`)
    ].filter(Boolean);

    // --- PASS D: STANDALONE FORENSICS (POST-SAVE TRIGGER) ---
    let forensicResults = null;
    if (!options.skipForensics && options.content && options.analysisId) {
      forensicResults = await triggerForensicAnalysis(options.content, options.analysisId);
    }

    finalResult.forensic_results = forensicResults;

    // Cache only the deterministic analysis payload (exclude content-specific forensic output).
    setCachedAnalysis(text, {
      ...finalResult,
      forensic_results: null
    });

    return finalResult;

  } catch (error) {
    log(`Critical Analysis Error: ${error.message}`);
    if (options.requireLLM) {
      throw error;
    }
    return {
      risk_level: 'low',
      risk_score: 0,
      explanation: `Analysis failed: ${error.message}`,
      sentiment: 'neutral',
      violated_policies: [],
      legal_sections: [],
      triggered_keywords: []
    };
  }
};

module.exports = {
  analyzeContent
};