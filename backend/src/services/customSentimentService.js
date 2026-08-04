/**
 * Client for the social_media_sentiment_analysis FastAPI service:
 *   IndicTrans2 (AI4Bharat) -> Cardiff Twitter RoBERTa -> Positive/Neutral/Negative
 *
 * Run the service separately (see social_media_sentiment_analysis/api_server.py),
 * point CUSTOM_SENTIMENT_URL at it. Never throws — mirrors the LLM engine's
 * "return neutral + error, don't crash the caller" fallback behavior.
 *
 * Requests are serialized through a small concurrency-limited queue, same
 * pattern as llmService.js's Ollama queue and for the same reason: the
 * Python service runs on one GPU. Without this, bulk ingest fires dozens of
 * concurrent HTTP calls at it, the GPU serializes them anyway, and requests
 * pile up past the axios timeout (observed: 55 concurrent calls -> 12-30s
 * per request instead of tens of ms).
 */
const axios = require('axios');

const CUSTOM_SENTIMENT_URL = (process.env.CUSTOM_SENTIMENT_URL || 'http://127.0.0.1:8003').replace(/\/$/, '');
const MODEL_NAME = 'indictrans2+cardiff-twitter-roberta';

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_QUEUE_SIZE = 200;

const queue = [];
let activeWorkers = 0;
const stats = { queued: 0, completed: 0, failed: 0, dropped: 0 };

const getTargetConcurrency = () => Math.max(1, Number(process.env.CUSTOM_SENTIMENT_CONCURRENCY || DEFAULT_CONCURRENCY));
const getMaxQueueSize = () => Math.max(1, Number(process.env.CUSTOM_SENTIMENT_MAX_QUEUE_SIZE || DEFAULT_MAX_QUEUE_SIZE));

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    if (queue.length >= getMaxQueueSize()) {
      stats.dropped++;
      reject(new Error(`custom sentiment queue full (${getMaxQueueSize()})`));
      return;
    }
    queue.push({ fn, resolve, reject });
    stats.queued++;
    if (queue.length > 1) {
      (() => {})(`[CustomSentiment Queue] ${queue.length} requests queued (${stats.completed} completed, ${stats.failed} failed)`);
    }
    pumpWorkers();
  });
}

async function runWorker() {
  const item = queue.shift();
  if (!item) return;

  activeWorkers++;
  try {
    const result = await item.fn();
    stats.completed++;
    item.resolve(result);
  } catch (err) {
    stats.failed++;
    item.reject(err);
  } finally {
    activeWorkers--;
    pumpWorkers();
  }
}

function pumpWorkers() {
  const target = getTargetConcurrency();
  while (activeWorkers < target && queue.length > 0) {
    runWorker();
  }
}

async function requestSentiment(text) {
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
      was_transliterated: item.was_transliterated,
      translation_time_ms: item.translation_time_ms,
      sentiment_time_ms: item.sentiment_time_ms,
      total_time_ms: item.total_time_ms
    }
  };
}

async function analyzeSentiment(text) {
  if (!text || !String(text).trim()) {
    return { sentiment: 'neutral', confidence: 0, provider: 'custom', model: MODEL_NAME };
  }

  try {
    return await enqueue(() => requestSentiment(text));
  } catch (err) {
    const detail = err?.response?.data?.detail || err?.message || 'custom sentiment request failed';
    (() => {})(`[CustomSentiment] ${detail}`);
    return { sentiment: 'neutral', confidence: 0, provider: 'custom', model: MODEL_NAME, error: detail };
  }
}

module.exports = {
  analyzeSentiment,
  CUSTOM_SENTIMENT_URL,
  getQueueStats: () => ({ ...stats, pending: queue.length, activeWorkers, targetConcurrency: getTargetConcurrency() })
};
