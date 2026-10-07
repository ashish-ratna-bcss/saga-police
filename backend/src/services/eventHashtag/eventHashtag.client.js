const axios = require('axios');

const BASE_URL = String(process.env.EVENT_HASHTAG_GENERATOR_URL || 'http://127.0.0.1:2001').replace(
  /\/+$/,
  ''
);
const TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.EVENT_HASHTAG_GENERATOR_TIMEOUT_MS) || 120_000
);

const client = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  validateStatus: () => true,
});

const pickBody = (payload = {}) => {
  const event = String(payload.event ?? payload.name ?? '').trim();
  const location = String(payload.location ?? '').trim();
  const description = String(payload.description ?? '').trim();
  const body = { event, location, description };
  if (payload.include_social != null) body.include_social = Boolean(payload.include_social);
  if (payload.search_engine != null) body.search_engine = String(payload.search_engine);
  if (payload.max_keywords != null) body.max_keywords = Number(payload.max_keywords);
  if (payload.max_hashtags != null) body.max_hashtags = Number(payload.max_hashtags);
  return body;
};

const assertRequired = (body) => {
  const missing = [];
  if (!body.event) missing.push('event');
  if (!body.location) missing.push('location');
  if (!body.description) missing.push('description');
  if (!missing.length) return null;
  if (missing.length === 3) return 'Please enter an event, location, and description.';
  if (missing.length === 2) return `Please enter a ${missing[0]} and a ${missing[1]}.`;
  return `Please enter a ${missing[0]}.`;
};

const forwardError = (res) => {
  const detail =
    (typeof res.data === 'object' && res.data && (res.data.detail || res.data.message || res.data.error)) ||
    (typeof res.data === 'string' ? res.data : null) ||
    `Hashtag generator returned HTTP ${res.status}`;
  const err = new Error(String(detail));
  err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
  throw err;
};

/** GET /health */
const health = async () => {
  let res;
  try {
    res = await client.get('/health', { timeout: 10_000 });
  } catch (e) {
    const err = new Error(e.message || 'Hashtag generator unreachable');
    err.status = 502;
    throw err;
  }
  if (res.status >= 400) forwardError(res);
  return res.data;
};

const { curateEventTermsWithLLM } = require('./eventHashtag.curator');

/**
 * POST /event-terms — hashtags + keywords for event Keywords field.
 * Candidate terms are automatically curated and verified via LLM.
 */
const generateEventTerms = async (payload) => {
  const body = pickBody(payload);
  const validation = assertRequired(body);
  if (validation) {
    const err = new Error(validation);
    err.status = 400;
    throw err;
  }
  let res;
  try {
    res = await client.post('/event-terms', body);
  } catch (e) {
    const err = new Error(e.message || 'Event terms generator unreachable');
    err.status = 502;
    throw err;
  }
  if (res.status >= 400) forwardError(res);
  
  const rawTerms = {
    hashtags: Array.isArray(res.data?.hashtags) ? res.data.hashtags : [],
    keywords: Array.isArray(res.data?.keywords) ? res.data.keywords : [],
  };

  // Pass candidate terms and event details to LLM for expert verification & sanitization
  const curated = await curateEventTermsWithLLM(body, rawTerms);
  return curated;
};

module.exports = {
  BASE_URL,
  health,
  generateEventTerms,
  /** @deprecated alias — use generateEventTerms */
  generateHashtags: generateEventTerms,
};
