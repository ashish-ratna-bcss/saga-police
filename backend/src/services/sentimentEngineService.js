/**
 * Sentiment Engine — pluggable front door over multiple sentiment providers.
 *
 * SENTIMENT_ANALYSIS=LLM     -> existing production LLM pipeline (categorizeText), unchanged.
 * SENTIMENT_ANALYSIS=CUSTOM  -> social_media_sentiment_analysis (IndicTrans2 + Cardiff RoBERTa),
 *                                see customSentimentService.js.
 *
 * This module does NOT replace or call into analysisService.analyzeContent() /
 * investigationAnalysisService.js / monitorService.js — those keep using
 * llmService.categorizeText() directly, exactly as before. This is a new,
 * parallel entry point for callers that just want a sentiment label.
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
