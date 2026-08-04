/**
 * Sentiment Engine — pluggable front door over multiple sentiment providers.
 *
 * Primary intelligence path for SOCEYE ingest is now controlled by
 * INTELLIGENCE_ENGINE (see intelligenceClientService.js / analysisService.js):
 *   SENTIMENT_SERVICE → POST /analyze/intelligence (sentiment + category/intent/risk)
 *   LOCAL_OLLAMA      → llmService.categorizeText (+ optional SENTIMENT_ANALYSIS=CUSTOM)
 *
 * This module remains for callers that only need a sentiment label, and for the
 * LOCAL_OLLAMA rollback path inside analysisService:
 *   SENTIMENT_ANALYSIS=LLM     -> categorizeText sentiment field
 *   SENTIMENT_ANALYSIS=CUSTOM  -> social_media_sentiment_analysis POST /analyze
 */
const { categorizeText } = require('./llmService');
const customSentimentService = require('./customSentimentService');

async function analyzeWithLLM(text, options = {}) {
  const result = await categorizeText(text, options);
  if (!result) {
    return {
      sentiment: 'neutral',
      confidence: null,
      provider: 'llm',
      model: process.env.OLLAMA_MODEL || 'llama3.1:latest',
      error: 'LLM analysis unavailable'
    };
  }
  return {
    sentiment: result.sentiment,
    // The LLM returns a label only, no calibrated probability — reporting a
    // fabricated number would be worse than admitting we don't have one.
    confidence: null,
    provider: 'llm',
    model: process.env.OLLAMA_MODEL || 'llama3.1:latest',
    details: {
      category: result.category,
      intent: result.intent,
      risk_score: result.risk_score,
      reasoning: result.reasoning
    }
  };
}

const ENGINES = {
  LLM: analyzeWithLLM,
  CUSTOM: customSentimentService.analyzeSentiment
};

function getEngineName() {
  const key = String(process.env.SENTIMENT_ANALYSIS || 'LLM').trim().toUpperCase();
  return ENGINES[key] ? key : 'LLM';
}

/**
 * Analyze sentiment using whichever engine SENTIMENT_ANALYSIS selects.
 * Returns { sentiment: 'positive'|'neutral'|'negative', confidence, provider, model, details? }
 */
async function analyzeSentiment(text, options = {}) {
  const engine = ENGINES[getEngineName()];
  return engine(text, options);
}

module.exports = {
  analyzeSentiment,
  getEngineName,
  ENGINES
};
