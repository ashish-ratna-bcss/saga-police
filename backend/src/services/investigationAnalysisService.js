/**
 * Investigation Analysis Service
 * ================================
 * Own fast lane (never blocked by bulk ingest) but identical analysis steps:
 *   Layer 1 → Keyword matching (from Keyword collection, same as performFullAnalysis)
 *   Layer 2 → Intelligence engine
 *              SENTIMENT_SERVICE → sentiment-api interactive lane
 *              LOCAL_OLLAMA     → direct Ollama (legacy classifyDirect)
 *   Layer 3 → All-platform mapping (same resolveMapping across x/youtube/facebook/instagram)
 *   Layer 4 → Hybrid merge (keyword weight overrides LLM score if higher)
 *   Risk level derived from Settings thresholds (same as performFullAnalysis)
 */
const axios = require('axios');
const { buildPromptPrefix, extractJSON } = require('./llmService');
const intelligenceClient = require('./intelligenceClientService');
const mappingService = require('./mappingService');
const Keyword = require('../models/Keyword');
const Settings = require('../models/Settings');

const MIN_TEXT_LENGTH = 3;
const MAX_TEXT_LENGTH = Math.max(800, Number(process.env.OLLAMA_MAX_TEXT_LENGTH || 2500));

/**
 * Direct Ollama call — rollback path when INTELLIGENCE_ENGINE=LOCAL_OLLAMA.
 * Does NOT enter the shared LLM queue.
 */
const classifyDirect = async (text) => {
  const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.1:latest';
  const timeoutMs = Math.max(5000, Number(process.env.OLLAMA_TIMEOUT_MS || 20000));
  const maxAttempts = Math.max(1, Number(process.env.OLLAMA_INVESTIGATION_ATTEMPTS || 3));
  const outputTokens = Math.max(120, Number(process.env.OLLAMA_MAX_OUTPUT_TOKENS || 240));

  await mappingService.waitForLoad();
  const { promptPrefix } = buildPromptPrefix();

  const prompt = `${promptPrefix}\n\n────────────────────────\nTEXT TO ANALYZE:\n<<<\n${text}\n>>>`;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(`${baseURL}/api/generate`, {
        model,
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0,
          num_predict: outputTokens
        }
      }, {
        timeout: timeoutMs,
        headers: { 'x-api-key': process.env.GATEWAY_API_KEY || '' }
      });

      const raw = response.data?.response || response.data?.message?.content;
      if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
        throw new Error('Ollama returned empty response');
      }
      const parsed = extractJSON(raw);
      if (!parsed) throw new Error('Invalid JSON from Ollama');

      const availableCategories = (mappingService.mappingData.category_mappings || []).map(c => c.category_id);
      let category = String(parsed.category || 'Normal').trim();
      if (!availableCategories.includes(category)) {
        const match = availableCategories.find(c => String(c).toLowerCase() === category.toLowerCase());
        category = match || 'Normal';
      }

      const validSentiments = ['positive', 'neutral', 'negative'];
      let sentiment = String(parsed.sentiment || 'neutral').toLowerCase().trim();
      if (!validSentiments.includes(sentiment)) sentiment = 'neutral';

      let riskScore = parseInt(parsed.risk_score, 10);
      if (isNaN(riskScore) || riskScore < 0) riskScore = 0;
      if (riskScore > 100) riskScore = 100;

      return {
        category,
        intent: parsed.intent || category,
        sentiment,
        risk_score: riskScore,
        reasoning: parsed.reasoning || ''
      };
    } catch (error) {
      lastError = error;
      const isOverloaded = error.response?.status === 503 || error.response?.status === 429;
      console.warn(`[Investigation-LLM] Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, (isOverloaded ? 2000 : 1000) * attempt));
      }
    }
  }
  console.error(`[Investigation-LLM] All ${maxAttempts} attempts failed: ${lastError?.message || ''}`);
  return null;
};

async function runLayer2(analysisText) {
  const mode = intelligenceClient.getEngineMode();
  if (mode === 'SENTIMENT_SERVICE') {
    console.log('[Investigation] Layer 2: sentiment-api interactive lane...');
    return intelligenceClient.analyzeText(analysisText, { lane: 'interactive' });
  }
  console.log(`[Investigation] Layer 2: Direct Ollama call (${mode})...`);
  return classifyDirect(analysisText);
}

const analyzeInvestigationText = async (text, options = {}) => {
  const input = String(text || '').trim();
  if (input.length < MIN_TEXT_LENGTH) {
    return {
      risk_level: 'low',
      risk_score: 0,
      intent: 'Normal',
      category: 'Normal',
      sentiment: 'neutral',
      reasons: ['No analyzable text found.'],
      highlights: [],
      violated_policies: [],
      legal_sections: [],
      explanation: 'No analyzable text found.',
      llm_analysis: null
    };
  }

  // ── Layer 1: Keyword Matching (same as performFullAnalysis) ──
  const matchedKeywords = [];
  let keywordRiskScore = 0;
  try {
    const keywords = await Keyword.find({ is_active: true }).lean();
    const normalize = (str) => String(str || '').toLowerCase().trim();
    const normalizedText = normalize(input);

    keywords.forEach(k => {
      if (!k.keyword) return;
      const kw = normalize(k.keyword);
      if (normalizedText.includes(kw)) {
        matchedKeywords.push({
          keyword: k.keyword,
          weight: k.weight || 50,
          category: k.category || 'other'
        });
        if ((k.weight || 50) > keywordRiskScore) {
          keywordRiskScore = k.weight || 50;
        }
      }
    });

    if (matchedKeywords.length > 0) {
      console.log(`[Investigation] Layer 1: Matched ${matchedKeywords.length} keywords (max weight: ${keywordRiskScore})`);
    }
  } catch (kwErr) {
    console.warn(`[Investigation] Keyword check failed: ${kwErr.message}`);
  }

  // ── Layer 2: Intelligence ──
  const analysisText = input.length > MAX_TEXT_LENGTH
    ? input.substring(0, MAX_TEXT_LENGTH) + '\n[...content truncated for analysis]'
    : input;

  const llmResult = await runLayer2(analysisText);

  if (!llmResult) {
    console.warn('[Investigation] Intelligence failed — using keyword-only fallback');
    const fallbackScore = keywordRiskScore > 0 ? keywordRiskScore : 0;
    return {
      risk_level: fallbackScore >= 70 ? 'high' : fallbackScore >= 40 ? 'medium' : 'low',
      risk_score: fallbackScore,
      intent: 'unknown',
      category: 'Normal',
      sentiment: 'neutral',
      reasons: ['LLM analysis unavailable.'],
      highlights: matchedKeywords.map(k => k.keyword),
      violated_policies: [],
      legal_sections: [],
      explanation: 'LLM analysis unavailable.',
      llm_analysis: null
    };
  }

  // ── Layer 3: All-platform mapping (same as analysisService.analyzeContent) ──
  await mappingService.waitForLoad();
  const supportedPlatforms = ['x', 'youtube', 'facebook', 'instagram'];
  let allViolatedPolicies = [];
  let aggregatedLegalSections = [];
  let aggregatedKeywords = [];
  const country = options.country || 'IN';

  supportedPlatforms.forEach(p => {
    const result = mappingService.resolveMapping(llmResult.category, analysisText, p, country);
    if (result.platform_policies && result.platform_policies.length > 0) {
      allViolatedPolicies.push(...result.platform_policies);
    }
    if (aggregatedLegalSections.length === 0) aggregatedLegalSections = result.legal_sections || [];
    if (aggregatedKeywords.length === 0) aggregatedKeywords = result.triggered_keywords || [];
  });

  const triggeredKeywords = [...aggregatedKeywords];

  // ── Layer 4: Hybrid Merge (keyword weight overrides LLM score if higher) ──
  if (matchedKeywords.length > 0) {
    const existingTriggers = new Set(triggeredKeywords);
    matchedKeywords.forEach(m => {
      if (!existingTriggers.has(m.keyword)) {
        triggeredKeywords.push(m.keyword);
      }
    });

    if (keywordRiskScore > llmResult.risk_score) {
      console.log(`[Investigation] Layer 4: Keyword weight (${keywordRiskScore}) overrides LLM score (${llmResult.risk_score})`);
      llmResult.risk_score = keywordRiskScore;
    }
  }

  // ── Derive risk_level from Settings thresholds (same as performFullAnalysis) ──
  let high = 70, medium = 40;
  try {
    const settings = await Settings.findOne().lean();
    if (settings) {
      high = settings.high_risk_threshold ?? settings.risk_threshold_high ?? 70;
      medium = settings.medium_risk_threshold ?? settings.risk_threshold_medium ?? 40;
    }
  } catch (_) { /* use defaults */ }

  const finalScore = llmResult.risk_score;
  let riskLevel;
  if (finalScore >= high) riskLevel = 'high';
  else if (finalScore >= medium) riskLevel = 'medium';
  else riskLevel = 'low';

  const reasons = [
    llmResult.reasoning || `Detected intent: ${llmResult.intent}`,
    `Risk Score: ${finalScore}%`,
    ...allViolatedPolicies.map(p => `Policy: ${p.policy_name}`),
    ...aggregatedLegalSections.map(l => `Legal: ${l.act} ${l.section}`)
  ].filter(Boolean);

  console.log(`[Investigation] Final: score=${finalScore}, level=${riskLevel}, cat=${llmResult.category}, keywords=${matchedKeywords.length}`);

  return {
    risk_level: riskLevel,
    risk_score: finalScore,
    intent: llmResult.intent,
    category: llmResult.category,
    sentiment: llmResult.sentiment,
    reasons,
    highlights: triggeredKeywords,
    violated_policies: allViolatedPolicies,
    legal_sections: aggregatedLegalSections,
    explanation: llmResult.reasoning || '',
    summary: llmResult.summary || '',
    recommended_action: llmResult.recommended_action || '',
    llm_analysis: {
      category: llmResult.category,
      intent: llmResult.intent,
      sentiment: llmResult.sentiment,
      reasoning: llmResult.reasoning || '',
      score: finalScore,
      summary: llmResult.summary || '',
      recommended_action: llmResult.recommended_action || '',
      evidence_confidence: llmResult.confidence || null,
      signals: Array.isArray(llmResult.signals) ? llmResult.signals : [],
      platform_policies_violated: allViolatedPolicies,
      bns_sections_violated: aggregatedLegalSections
    }
  };
};

module.exports = {
  analyzeInvestigationText
};
