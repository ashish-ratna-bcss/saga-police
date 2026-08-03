require('dotenv').config();
const axios = require('axios');
const { categorizeText } = require('./llmService');
const { getEngineName } = require('./sentimentEngineService');
const customSentimentService = require('./customSentimentService');
const mappingService = require('./mappingService');
const LegalSection = require('../models/LegalSection');
const PlatformPolicy = require('../models/PlatformPolicy');
const { enqueueForensicTask } = require('./forensicQueueService');

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
 * LLM-Centric Analysis Pipeline (V6.0)
 * Pass A: LLM (qwen2.5:14b) for Category, Intent, Sentiment, Risk Score, Risk Level
 * Pass B: Deterministic Mapping Engine for Legal & Policy Mapping
 * Pass C: (REMOVED — ML risk scoring replaced by LLM)
 * Pass D: Standalone Deepfake Forensics (S3-First, Async)
 */

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

    log(`Starting LLM-Centric analysis for: "${text.substring(0, 50)}..."`);

    // --- PASS A: LLM FULL ANALYSIS (Category + Intent + Sentiment + Risk) ---
    log("Running Pass A (LLM Full Analysis)...");
    let llmResult = await categorizeText(text);

    if (!llmResult) {
      if (options.requireLLM) {
        throw new Error('On-prem LLM timeout/overload or unavailable — item will be retried');
      }
      log("Pass A failed. Using fallback (Normal).");
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

    // Category/intent/risk_score always come from the LLM (Pass A above).
    // Sentiment alone is swappable via SENTIMENT_ANALYSIS — reuse llmResult.sentiment
    // when engine=LLM (no extra call), otherwise ask the CUSTOM engine directly.
    const sentimentEngine = getEngineName();
    let finalSentiment = llmResult.sentiment;
    let sentimentConfidence = null;
    let sentimentDetails = null;
    if (sentimentEngine === 'CUSTOM') {
      const customResult = await customSentimentService.analyzeSentiment(text);
      finalSentiment = customResult.sentiment;
      sentimentConfidence = customResult.confidence;
      sentimentDetails = customResult.details;
    }
    log(`Sentiment engine=${sentimentEngine} sentiment=${finalSentiment}` +
        (sentimentConfidence != null ? ` confidence=${sentimentConfidence}` : '') +
        (sentimentDetails ? ` lang=${sentimentDetails.language} translated=${sentimentDetails.was_translated} transliterated=${sentimentDetails.was_transliterated}` : ''));

    log(`LLM Result: cat=${llmResult.category}, intent="${llmResult.intent}", sentiment=${finalSentiment}, risk_score=${finalRiskScore}`);

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
      // Structure for ReasonModal
      llm_analysis: {
        category: llmResult.category,
        intent: llmResult.intent || llmResult.category,
        sentiment: finalSentiment,
        reasoning: llmResult.reasoning || '',
        score: finalRiskScore,
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