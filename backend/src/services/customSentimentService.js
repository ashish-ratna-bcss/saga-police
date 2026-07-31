/**
 * Client for the social_media_sentiment_analysis FastAPI service:
 *   IndicTrans2 (AI4Bharat) -> Cardiff Twitter RoBERTa -> Positive/Neutral/Negative
 *
 * Run the service separately (see social_media_sentiment_analysis/service.py),
 * point CUSTOM_SENTIMENT_URL at it. Never throws — mirrors the LLM engine's
 * "return neutral + error, don't crash the caller" fallback behavior.
 */
const axios = require('axios');

const CUSTOM_SENTIMENT_URL = (process.env.CUSTOM_SENTIMENT_URL || 'http://127.0.0.1:8003').replace(/\/$/, '');
const MODEL_NAME = 'indictrans2+cardiff-twitter-roberta';

async function analyzeSentiment(text) {
  if (!text || !String(text).trim()) {
    return { sentiment: 'neutral', confidence: 0, provider: 'custom', model: MODEL_NAME };
  }

  try {
    const res = await axios.post(
      `${CUSTOM_SENTIMENT_URL}/analyze`,
      { texts: [String(text)] },
      {
        timeout: Number(process.env.CUSTOM_SENTIMENT_TIMEOUT_MS || 30000),
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.GATEWAY_API_KEY || '' }
      }
    );
    const item = res.data?.results?.[0];
    if (!item) {
      throw new Error('Empty response from custom sentiment service');
    }
    return {
      sentiment: String(item.sentiment || 'neutral').toLowerCase(),
      confidence: typeof item.confidence === 'number' ? item.confidence : null,
      provider: 'custom',
      model: MODEL_NAME,
      details: {
        language: item.language,
        english_text: item.english_text,
        was_translated: item.was_translated,
        translation_time_ms: item.translation_time_ms,
        sentiment_time_ms: item.sentiment_time_ms,
        total_time_ms: item.total_time_ms
      }
    };
  } catch (err) {
    const detail = err?.response?.data?.detail || err?.message || 'custom sentiment request failed';
    console.error(`[CustomSentiment] ${detail}`);
    return { sentiment: 'neutral', confidence: 0, provider: 'custom', model: MODEL_NAME, error: detail };
  }
}

module.exports = {
  analyzeSentiment,
  CUSTOM_SENTIMENT_URL
};
