const axios = require("axios");
const mappingService = require("./mappingService");
const logger = require('../utils/logger');

/**
 * Ollama LLM-Centric Analysis (V6.0)
 * Single LLM call for: category, intent, sentiment, risk_score (0-100), reasoning.
 * risk_level is derived from settings thresholds, NOT by LLM.
 * Uses qwen2.5:14b for multilingual Indian content moderation.
 * 
 * Includes concurrency queue: Ollama processes 1 request at a time,
 * so we serialize all LLM calls to avoid timeouts under load.
 */

// --- Constants ---
const MAX_TEXT_LENGTH = Math.max(800, Number(process.env.OLLAMA_MAX_TEXT_LENGTH || 2500)); // Lower default for faster inference
const MIN_TEXT_LENGTH = 3;   // Skip trivially short text
const DEFAULT_MAX_QUEUE_SIZE = 200;
const DEFAULT_QUEUE_WAIT_MS = Math.max(0, Number(process.env.OLLAMA_QUEUE_WAIT_MS || 0)); // 0 => no queue timeout (no-loss mode)
const DEFAULT_LLM_CONCURRENCY = Math.max(1, Number(process.env.OLLAMA_CONCURRENCY || 3));
const DEFAULT_FAST_FAIL_THRESHOLD = Math.max(3, Number(process.env.OLLAMA_FAST_FAIL_QUEUE_THRESHOLD || 8));
const DEFAULT_TIMEOUT_CAP_MS = Math.max(5000, Number(process.env.OLLAMA_TIMEOUT_CAP_MS || 45000));
const DEFAULT_ALLOW_FAST_FAIL = String(process.env.OLLAMA_ALLOW_FAST_FAIL || 'false').toLowerCase() === 'true';

// --- LLM Request Queue (serialize to avoid Ollama overload) ---
const llmQueue = [];
let llmActiveWorkers = 0;
let llmStats = { queued: 0, completed: 0, failed: 0, dropped: 0 };

let promptCache = {
  key: null,
  promptPrefix: null,
  categoryCount: 0
};

const getTargetConcurrency = () => Math.max(1, Number(process.env.OLLAMA_CONCURRENCY || DEFAULT_LLM_CONCURRENCY));
const getMaxQueueSize = () => {
  const parsed = Number(process.env.OLLAMA_MAX_QUEUE_SIZE ?? DEFAULT_MAX_QUEUE_SIZE);
  if (!Number.isFinite(parsed) || parsed <= 0) return Infinity;
  return Math.max(1, Math.floor(parsed));
};

function enqueueLLMRequest(fn, options = {}) {
  return new Promise((resolve, reject) => {
    const allowFastFail = options.allowFastFail === true;
    if (allowFastFail) {
      const fastFailThreshold = Math.max(1, Number(options.fastFailQueueThreshold || process.env.OLLAMA_FAST_FAIL_QUEUE_THRESHOLD || DEFAULT_FAST_FAIL_THRESHOLD));
      const totalInFlight = llmQueue.length + llmActiveWorkers;
      if (totalInFlight >= fastFailThreshold) {
        llmStats.failed++;
        reject(new Error(`LLM fast-fail: in-flight ${totalInFlight} >= threshold ${fastFailThreshold}`));
        return;
      }
    }

    const maxQueueSize = getMaxQueueSize();
    if (Number.isFinite(maxQueueSize) && llmQueue.length >= maxQueueSize) {
      llmStats.dropped++;
      logger.info(`[LLM Queue] FULL (${maxQueueSize}). Dropping request. Total dropped: ${llmStats.dropped}`);
      reject(new Error('LLM queue full — request dropped'));
      return;
    }
    const queueWaitMs = Math.max(0, Number(options.queueWaitMs ?? DEFAULT_QUEUE_WAIT_MS));
    llmQueue.push({ fn, resolve, reject, enqueuedAt: Date.now(), queueWaitMs });
    llmStats.queued++;
    if (llmQueue.length > 1) {
      logger.error(`[LLM Queue] ${llmQueue.length} requests queued (${llmStats.completed} completed, ${llmStats.failed} failed)`);
    }
    pumpLLMWorkers();
  });
}

function takeNextQueueItem() {
  while (llmQueue.length > 0) {
    const item = llmQueue.shift();
    const waitedMs = Date.now() - item.enqueuedAt;
    if (item.queueWaitMs > 0 && waitedMs > item.queueWaitMs) {
      llmStats.failed++;
      item.reject(new Error(`LLM queue wait timeout (${waitedMs}ms > ${item.queueWaitMs}ms)`));
      continue;
    }
    return item;
  }
  return null;
}

async function runLLMWorker() {
  const item = takeNextQueueItem();
  if (!item) return;

  llmActiveWorkers++;
  try {
    const result = await item.fn();
    llmStats.completed++;
    item.resolve(result);
  } catch (err) {
    llmStats.failed++;
    item.reject(err);
  } finally {
    llmActiveWorkers--;
    setTimeout(() => pumpLLMWorkers(), 20);
  }
}

function pumpLLMWorkers() {
  const targetConcurrency = getTargetConcurrency();
  while (llmActiveWorkers < targetConcurrency && llmQueue.length > 0) {
    runLLMWorker();
  }
}

function buildPromptPrefix() {
  const categories = mappingService.mappingData.category_mappings || [];
  const categoryIds = categories.map(c => String(c.category_id || '').trim()).filter(Boolean);
  const cacheKey = categoryIds.join('|');

  if (promptCache.key === cacheKey && promptCache.promptPrefix) {
    return {
      promptPrefix: promptCache.promptPrefix,
      categoryCount: promptCache.categoryCount
    };
  }

  const categoryListStr = categories.map(c => `- ${c.category_id}`).join('\n');
  const promptPrefix = `
You are a multilingual Indian social-media risk classifier.
Return only strict JSON with keys: category, intent, sentiment, risk_score, reasoning.

Allowed categories:
${categoryListStr}

Rules:
- Pick exactly one category from allowed list (use Normal for harmless/neutral content).
- sentiment must be one of: positive, neutral, negative.
- risk_score must be integer 0-100.
- intent must be short (2-8 words).
- reasoning must be concise (1-2 lines) explaining risk/target/context.
- Handle transliterated Indian language correctly.
`;

  promptCache = {
    key: cacheKey,
    promptPrefix,
    categoryCount: categories.length
  };

  return {
    promptPrefix,
    categoryCount: categories.length
  };
}

/**
 * Extracts valid JSON from LLM response that may contain markdown fences or surrounding text.
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Try direct parse first
  try { return JSON.parse(raw); } catch (_) {}

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }

  // Find first { ... last } in the string
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.substring(firstBrace, lastBrace + 1)); } catch (_) {}
  }

  return null;
}

async function categorizeText(text, options = {}) {

  // 0. Input validation
  if (!text || typeof text !== 'string') {
    logger.info('[LLM] Skipped: text is null/undefined/non-string');
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_LENGTH) {
    logger.info(`[LLM] Skipped: text too short (${trimmed.length} chars)`);
    return null;
  }

  // Truncate very long text to prevent Ollama OOM/timeouts
  const analysisText = trimmed.length > MAX_TEXT_LENGTH
    ? trimmed.substring(0, MAX_TEXT_LENGTH) + '\n[...content truncated for analysis]'
    : trimmed;

  // 1. Ensure Mapping Data is loaded (avoid empty categorization lists)
  await mappingService.waitForLoad();

  // 2. Resolve Provider Configuration
  const config = {
    baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: options.model || process.env.OLLAMA_MODEL || "llama3.1:latest",
    timeoutMs: Math.min(
      Math.max(5000, Number(options.timeoutMs || process.env.OLLAMA_TIMEOUT_MS || 20000)),
      Math.max(3000, Number(options.timeoutCapMs || process.env.OLLAMA_TIMEOUT_CAP_MS || DEFAULT_TIMEOUT_CAP_MS))
    ),
    maxAttempts: Math.max(1, Number(options.maxAttempts || process.env.OLLAMA_MAX_ATTEMPTS || 3)),
    queueWaitMs: Math.max(0, Number(options.queueWaitMs ?? process.env.OLLAMA_QUEUE_WAIT_MS ?? DEFAULT_QUEUE_WAIT_MS)),
    allowFastFail: options.allowFastFail === true || DEFAULT_ALLOW_FAST_FAIL,
    fastFailQueueThreshold: Math.max(1, Number(options.fastFailQueueThreshold || process.env.OLLAMA_FAST_FAIL_QUEUE_THRESHOLD || DEFAULT_FAST_FAIL_THRESHOLD))
  };

  // Dynamic Prompt Construction
  const { promptPrefix, categoryCount } = buildPromptPrefix();
  logger.info(`[LLM] Constructing prompt with ${categoryCount} allowed categories.`);
  const prompt = `${promptPrefix}

────────────────────────
TEXT TO ANALYZE:
<<<
${analysisText}
>>>
`;

  try {
    let result;
    let lastError;

    // All LLM calls go through the queue (1 at a time for Ollama)
    result = await enqueueLLMRequest(async () => {
      for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
          const response = await axios.post(`${config.baseURL}/api/generate`, {
            model: config.model,
            prompt,
            stream: false,
            format: "json",
            options: {
              temperature: 0,
              num_predict: Math.max(120, Number(process.env.OLLAMA_MAX_OUTPUT_TOKENS || 240))
            }
          }, {
            timeout: config.timeoutMs,
            headers: { 'x-api-key': process.env.GATEWAY_API_KEY || '' }
          });

          const raw = response.data?.response || response.data?.message?.content;
          if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
            throw new Error('Ollama returned empty response content');
          }
          const parsed = extractJSON(raw);
          if (!parsed) {
            logger.error(`[LLM] Failed to parse JSON from response (length=${raw.length}): ${raw.substring(0, 200)}`);
            throw new Error('LLM response is not valid JSON');
          }
          return parsed;
        } catch (err) {
          lastError = err;
          const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
          const isOverloaded = err.response?.status === 503 || err.response?.status === 429;
          logger.error(`[LLM] Attempt ${attempt}/${config.maxAttempts} failed: ${err.message}${isTimeout ? ' (TIMEOUT)' : ''}${isOverloaded ? ' (OVERLOADED)' : ''}`);
          if (attempt < config.maxAttempts) {
            const delay = isOverloaded ? 2000 * attempt : 1000 * attempt;
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      throw lastError || new Error(`All ${config.maxAttempts} LLM attempts failed`);
    }, {
      queueWaitMs: config.queueWaitMs,
      allowFastFail: config.allowFastFail,
      fastFailQueueThreshold: config.fastFailQueueThreshold
    });

    if (!result) {
      throw new Error('LLM returned empty result');
    }

    // --- CATEGORY VALIDATION ---
    const availableCategories = (mappingService.mappingData.category_mappings || []).map(c => c.category_id);
    let finalCategory = result.category;

    logger.info(`[LLM] Raw Category: "${finalCategory}"`);

    if (!availableCategories.includes(finalCategory)) {
      // Try strict case-insensitive match (trim + case)
      const exactMatch = availableCategories.find(c =>
        String(c).trim().toLowerCase() === String(finalCategory).trim().toLowerCase()
      );

      if (exactMatch) {
        finalCategory = exactMatch;
      } else {
        logger.info(`[LLM] INVALID CATEGORY: "${finalCategory}". Fallback to 'Normal'.`);
        finalCategory = 'Normal';
      }
    }

    // --- SENTIMENT VALIDATION ---
    const validSentiments = ['positive', 'neutral', 'negative'];
    let finalSentiment = String(result.sentiment || 'neutral').toLowerCase().trim();
    if (!validSentiments.includes(finalSentiment)) finalSentiment = 'neutral';

    // --- RISK SCORE VALIDATION ---
    let finalRiskScore = parseInt(result.risk_score, 10);
    if (isNaN(finalRiskScore) || finalRiskScore < 0) finalRiskScore = 0;
    if (finalRiskScore > 100) finalRiskScore = 100;

    logger.info(`[LLM] Result: cat=${finalCategory}, sentiment=${finalSentiment}, risk_score=${finalRiskScore}, intent="${(result.intent || '').substring(0, 50)}"`);

    return {
      category: finalCategory,
      intent: result.intent || finalCategory,
      sentiment: finalSentiment,
      risk_score: finalRiskScore,
      reasoning: result.reasoning || ""
    };
  } catch (err) {
    logger.error(`[LLM] [ollama] Analysis Failed:`, err.message);

    return null;
  }
}

// Hyderabad / Telangana relevance check via Ollama. Used by the event
// monitor + sweeper to drop posts that aren't about the state. Returns
// { is_telangana_related: bool, confidence: 0-100, reasoning: string,
//   model: string } on success, or null on any failure (caller should treat
// null as "pending — retry later", NOT as a rejection).
async function classifyTelanganaRelevance(text, options = {}) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;

  const analysisText = trimmed.length > MAX_TEXT_LENGTH
    ? trimmed.substring(0, MAX_TEXT_LENGTH) + '\n[...truncated]'
    : trimmed;

  const config = {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: options.model || process.env.OLLAMA_MODEL || 'llama3.1:latest',
    timeoutMs: Math.min(
      Math.max(5000, Number(options.timeoutMs || process.env.OLLAMA_TIMEOUT_MS || 20000)),
      Math.max(3000, Number(process.env.OLLAMA_TIMEOUT_CAP_MS || DEFAULT_TIMEOUT_CAP_MS))
    ),
    maxAttempts: Math.max(1, Number(options.maxAttempts || process.env.OLLAMA_MAX_ATTEMPTS || 2))
  };

  const prompt = `You are a strict location-relevance classifier for an Indian social-media monitoring system based in Hyderabad, Telangana.

Decide whether the post below is ABOUT Hyderabad city or the state of Telangana — its districts, neighbourhoods, government, politics, infrastructure, public grievances, events, or local news. Mentions of other Indian states or countries do NOT count unless Telangana is the explicit subject.

Return ONLY strict JSON:
{ "is_telangana_related": boolean, "confidence": 0-100 integer, "reasoning": "one short sentence" }

Rules:
- Telugu / Hindi / English / transliterated text are all valid input.
- A passing mention of Hyderabad in a global story (e.g. "from Hyderabad to Mumbai") is NOT enough — the post's primary subject must be local.
- Generic Indian politics / cricket / Bollywood with no Telangana angle: false.
- When unsure, set confidence below 60 and is_telangana_related: false.

POST:
<<<
${analysisText}
>>>`;

  try {
    const result = await enqueueLLMRequest(async () => {
      let lastError;
      for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
          const response = await axios.post(`${config.baseURL}/api/generate`, {
            model: config.model,
            prompt,
            stream: false,
            format: 'json',
            options: { temperature: 0, num_predict: 120 }
          }, {
            timeout: config.timeoutMs,
            headers: { 'x-api-key': process.env.GATEWAY_API_KEY || '' }
          });
          const raw = response.data?.response || response.data?.message?.content;
          if (!raw) throw new Error('empty response');
          const parsed = extractJSON(raw);
          if (!parsed) throw new Error('not json');
          return parsed;
        } catch (err) {
          lastError = err;
          if (attempt < config.maxAttempts) {
            const delay = err.response?.status === 503 || err.response?.status === 429 ? 2000 * attempt : 1000 * attempt;
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      throw lastError || new Error('classify_relevance failed');
    }, { queueWaitMs: 0, allowFastFail: false });

    if (!result || typeof result.is_telangana_related === 'undefined') return null;
    let confidence = parseInt(result.confidence, 10);
    if (isNaN(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(100, confidence));
    return {
      is_telangana_related: !!result.is_telangana_related,
      confidence,
      reasoning: String(result.reasoning || '').slice(0, 240),
      model: config.model
    };
  } catch (err) {
    logger.error(`[LLM][TS-relevance] failed: ${err.message}`);
    return null;
  }
}

module.exports = {
  categorizeText,
  classifyTelanganaRelevance,
  buildPromptPrefix,
  extractJSON,
  getLLMQueueStats: () => ({ ...llmStats, pending: llmQueue.length, busyWorkers: llmActiveWorkers, targetConcurrency: getTargetConcurrency(), maxQueueSize: getMaxQueueSize() }),
  MAX_QUEUE_SIZE: getMaxQueueSize()
};
