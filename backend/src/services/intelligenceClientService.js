/**
 * Client for social_media_sentiment_analysis Stage 3 intelligence:
 *   POST {INTELLIGENCE_SERVICE_URL}/analyze/intelligence
 *
 * One call returns Cardiff sentiment (via the deterministic pipeline) plus
 * Ollama category / intent / risk_score / reasoning / summary / action —
 * constrained by a PolicyMapping-derived policy_pack so Pass B still resolves.
 *
 * Failure semantics mirror llmService.categorizeText:
 *   source === "error" | HTTP failure | empty → return null
 *   source === "provider" | "triage"          → success object
 *
 * Two independent concurrency pools (bulk vs interactive) so investigation
 * is never queued behind ingest.
 */
const axios = require('axios');
const crypto = require('crypto');
const mappingService = require('./mappingService');

const SERVICE_URL = (
  process.env.INTELLIGENCE_SERVICE_URL ||
  process.env.CUSTOM_SENTIMENT_URL ||
  'http://127.0.0.1:8003'
).replace(/\/$/, '');

const INTENT_MODE = String(process.env.INTELLIGENCE_INTENT_MODE || 'free').toLowerCase() === 'enum'
  ? 'enum'
  : 'free';

const MAX_TEXT_CHARS = Math.max(800, Number(process.env.INTELLIGENCE_MAX_TEXT_CHARS || 4500));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.INTELLIGENCE_MAX_ATTEMPTS || 2));

const LANES = {
  bulk: {
    concurrency: Math.max(1, Number(process.env.INTELLIGENCE_BULK_CONCURRENCY || 2)),
    timeoutMs: Math.max(10000, Number(process.env.INTELLIGENCE_TIMEOUT_MS || 180000)),
    maxQueue: Math.max(1, Number(process.env.INTELLIGENCE_BULK_MAX_QUEUE || 200))
  },
  interactive: {
    concurrency: Math.max(1, Number(process.env.INTELLIGENCE_INTERACTIVE_CONCURRENCY || 1)),
    timeoutMs: Math.max(10000, Number(process.env.INTELLIGENCE_INTERACTIVE_TIMEOUT_MS || 100000)),
    maxQueue: Math.max(1, Number(process.env.INTELLIGENCE_INTERACTIVE_MAX_QUEUE || 50))
  }
};

function createLane(name, cfg) {
  const queue = [];
  let activeWorkers = 0;
  const stats = { queued: 0, completed: 0, failed: 0, dropped: 0 };

  const pump = () => {
    while (activeWorkers < cfg.concurrency && queue.length > 0) {
      const item = queue.shift();
      activeWorkers++;
      Promise.resolve()
        .then(item.fn)
        .then((result) => {
          stats.completed++;
          item.resolve(result);
        })
        .catch((err) => {
          stats.failed++;
          item.reject(err);
        })
        .finally(() => {
          activeWorkers--;
          pump();
        });
    }
  };

  const enqueue = (fn) => new Promise((resolve, reject) => {
    if (queue.length >= cfg.maxQueue) {
      stats.dropped++;
      reject(new Error(`intelligence ${name} queue full (${cfg.maxQueue})`));
      return;
    }
    queue.push({ fn, resolve, reject });
    stats.queued++;
    if (queue.length > 1) {
      console.log(
        `[Intelligence/${name}] ${queue.length} queued ` +
        `(${stats.completed} ok, ${stats.failed} fail)`
      );
    }
    pump();
  });

  return {
    enqueue,
    timeoutMs: cfg.timeoutMs,
    getStats: () => ({
      ...stats,
      pending: queue.length,
      activeWorkers,
      targetConcurrency: cfg.concurrency,
      maxQueue: cfg.maxQueue
    })
  };
}

const lanes = {
  bulk: createLane('bulk', LANES.bulk),
  interactive: createLane('interactive', LANES.interactive)
};

let packCache = { fingerprint: null, pack: null };

function buildPolicyPack() {
  const categories = (mappingService.mappingData.category_mappings || [])
    .map((m) => ({
      id: String(m.category_id || '').trim(),
      definition: String(m.definition || '').slice(0, 500),
      severity: String(m.severity_level || ''),
      keywords: Array.isArray(m.keywords) ? m.keywords.slice(0, 40).map(String) : []
    }))
    .filter((c) => c.id);

  if (categories.length === 0) {
    throw new Error('No PolicyMapping categories loaded — cannot build policy_pack');
  }

  const hasNormal = categories.some((c) => c.id === 'Normal');
  if (!hasNormal) {
    categories.push({
      id: 'Normal',
      definition: 'Harmless or neutral content. Use when nothing else applies.',
      severity: 'Low',
      keywords: []
    });
  }

  const canonical = JSON.stringify({
    unknown_label: 'Normal',
    intent_mode: INTENT_MODE,
    categories: categories.map((c) => ({
      id: c.id,
      definition: c.definition,
      severity: c.severity,
      keywords: c.keywords
    }))
  });
  const fingerprint = `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;

  if (packCache.fingerprint === fingerprint && packCache.pack) {
    return packCache.pack;
  }

  const pack = {
    name: 'sockeye-policy-mapping',
    version: new Date().toISOString(),
    fingerprint,
    unknown_label: 'Normal',
    categories
  };
  packCache = { fingerprint, pack };
  return pack;
}

function truncateText(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.length <= MAX_TEXT_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_TEXT_CHARS)}\n[...content truncated for analysis]`;
}

function flattenResult(pipelineItem) {
  const intel = pipelineItem?.intelligence;
  if (!intel || typeof intel !== 'object') {
    return null;
  }

  // Critical: provider/service outage comes back as a well-formed record.
  // Treat it as categorizeText null so requireLLM retry still works.
  if (String(intel.source || '').toLowerCase() === 'error') {
    return null;
  }

  const sentiment = String(pipelineItem.sentiment || 'neutral').toLowerCase();
  const validSentiments = ['positive', 'neutral', 'negative'];
  const finalSentiment = validSentiments.includes(sentiment) ? sentiment : 'neutral';

  let riskScore = parseInt(intel.risk_score, 10);
  if (Number.isNaN(riskScore) || riskScore < 0) riskScore = 0;
  if (riskScore > 100) riskScore = 100;

  const category = String(intel.category || 'Normal').trim() || 'Normal';
  const intent = String(intel.intent || category).trim() || category;

  return {
    category,
    intent,
    sentiment: finalSentiment,
    risk_score: riskScore,
    reasoning: String(intel.reasoning || ''),
    summary: String(intel.summary || ''),
    recommended_action: String(intel.recommended_action || ''),
    signals: Array.isArray(intel.signals) ? intel.signals : [],
    confidence: String(intel.evidence_confidence || 'low'),
    source: String(intel.source || 'provider'),
    model: String(intel.model || ''),
    intent_label: String(intel.intent_label || ''),
    sentiment_confidence: typeof pipelineItem.confidence === 'number' ? pipelineItem.confidence : null,
    language: pipelineItem.language || null,
    english_text: pipelineItem.english_text || null,
    was_translated: Boolean(pipelineItem.was_translated),
    was_transliterated: Boolean(pipelineItem.was_transliterated),
    latency_ms: typeof intel.latency_ms === 'number' ? intel.latency_ms : null,
    policy_pack_fingerprint: intel.policy_pack_fingerprint || null,
    schema_enforced: intel.schema_enforced !== false
  };
}

async function requestIntelligence(text, { laneName, timeoutMs }) {
  await mappingService.waitForLoad();
  const pack = buildPolicyPack();
  const body = {
    texts: [truncateText(text)],
    policy_pack: pack,
    intent_mode: INTENT_MODE,
    timeout_s: Math.max(5, Math.min(600, Math.floor(timeoutMs / 1000) - 5))
  };

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await axios.post(
        `${SERVICE_URL}/analyze/intelligence`,
        body,
        {
          timeout: timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.GATEWAY_API_KEY || ''
          }
        }
      );
      const item = res.data?.results?.[0];
      const flat = flattenResult(item);
      if (!flat) {
        throw new Error(
          item?.intelligence?.source === 'error'
            ? `intelligence source=error: ${item?.intelligence?.reasoning || 'provider failed'}`
            : 'Empty or unusable intelligence response'
        );
      }
      return flat;
    } catch (err) {
      lastError = err;
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || 'request failed';
      const retryable = !status || status >= 500 || err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED';
      console.warn(
        `[Intelligence/${laneName}] attempt ${attempt}/${MAX_ATTEMPTS} failed` +
        `${status ? ` HTTP ${status}` : ''}: ${detail}`
      );
      if (!retryable || attempt >= MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  console.error(`[Intelligence/${laneName}] all attempts failed: ${lastError?.message || lastError}`);
  return null;
}

/**
 * Analyze text via the sentiment-api intelligence endpoint.
 * @param {string} text
 * @param {{ lane?: 'bulk'|'interactive' }} [options]
 * @returns {Promise<object|null>} flat result or null on failure
 */
async function analyzeText(text, options = {}) {
  if (!text || typeof text !== 'string') {
    console.warn('[Intelligence] Skipped: text is null/undefined/non-string');
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length < 3) {
    console.warn(`[Intelligence] Skipped: text too short (${trimmed.length} chars)`);
    return null;
  }

  const laneName = options.lane === 'interactive' ? 'interactive' : 'bulk';
  const lane = lanes[laneName];

  try {
    return await lane.enqueue(() =>
      requestIntelligence(trimmed, { laneName, timeoutMs: lane.timeoutMs })
    );
  } catch (err) {
    console.error(`[Intelligence/${laneName}] ${err.message}`);
    return null;
  }
}

function getEngineMode() {
  const raw = String(process.env.INTELLIGENCE_ENGINE || 'SENTIMENT_SERVICE').trim().toUpperCase();
  if (raw === 'LOCAL_OLLAMA' || raw === 'SHADOW' || raw === 'SENTIMENT_SERVICE') return raw;
  return 'SENTIMENT_SERVICE';
}

function usesSentimentService() {
  const mode = getEngineMode();
  return mode === 'SENTIMENT_SERVICE' || mode === 'SHADOW';
}

module.exports = {
  analyzeText,
  getEngineMode,
  usesSentimentService,
  buildPolicyPack,
  SERVICE_URL,
  getQueueStats: () => ({
    bulk: lanes.bulk.getStats(),
    interactive: lanes.interactive.getStats(),
    serviceUrl: SERVICE_URL,
    intentMode: INTENT_MODE,
    engine: getEngineMode()
  })
};
