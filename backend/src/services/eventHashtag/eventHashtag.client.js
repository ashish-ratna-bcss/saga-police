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
  // The form's language choice. 'en' (English) is not a generator code: the generator always writes English terms, so English is applied here
  // by script (see applyLanguageChoice). The generator needs at least one code, so an English-only choice is sent as 'en'
  // (it then falls back to the location's own language and the English-only filter below removes the rest).
  const chosen = (Array.isArray(payload.languages) ? payload.languages : [])
    .map((l) => String(l || '').trim().toLowerCase())
    .filter(Boolean);
  const chosenSet = new Set(chosen.length ? chosen : ['all']);
  const wantAll = chosenSet.has('all');
  const others = wantAll ? ['all'] : [...chosenSet].filter((c) => c !== 'en');
  const body = { event, location, description, languages: others.length ? others : ['en'] };
  Object.defineProperty(body, '_choice', { value: { wantEnglish: wantAll || chosenSet.has('en'), onlyEnglish: !wantAll && !others.length, codes: wantAll ? null : others }, enumerable: false });
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

const { curateEventTerms } = require('./eventHashtag.curator');

/**
 * POST /event-terms — hashtags + keywords for event Keywords field.
 * Candidate terms are filtered deterministically (no LLM) for event relevance.
 */
const generateEventTerms = async (payload, { db } = {}) => {
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

  const choice = body._choice || { wantEnglish: true, onlyEnglish: false };
  const curated = await curateEventTerms(db, body, rawTerms, { acceptOtherScripts: !choice.onlyEnglish });
  return applyLanguageChoice(curated, choice);
};

/** True when the term has letters outside the Latin script (Hindi, Odia, Bengali ...), also inside a mixed term. */
const hasOtherScript = (term) => /\p{L}/u.test(String(term || '').replace(/\p{Script=Latin}/gu, ''));

/**
 * Applies the English choice: English terms are the ones written only in Latin letters.
 * English unticked removes them; English only keeps nothing else.
 */
// Writing system of each generator language code (Hindi and Marathi share Devanagari).
const SCRIPT_OF_CODE = { or: 'Oriya', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', mr: 'Devanagari', hi: 'Devanagari', gu: 'Gujarati', bn: 'Bengali', pa: 'Gurmukhi' };
const SCRIPT_RE = Object.fromEntries(Object.values(SCRIPT_OF_CODE).map((n) => [n, new RegExp(`\\p{Script=${n}}`, 'u')]));

/** True when every non-Latin letter of the term is in one of the chosen scripts. */
const onlyChosenScripts = (term, scripts) => [...String(term || '')].every((ch) => {
  if (!/\p{L}/u.test(ch) || /\p{Script=Latin}/u.test(ch)) return true;
  return scripts.some((n) => SCRIPT_RE[n] && SCRIPT_RE[n].test(ch));
});

const applyLanguageChoice = (terms, { wantEnglish = true, onlyEnglish = false, codes = null } = {}) => {
  const scripts = Array.isArray(codes) ? [...new Set(codes.map((c) => SCRIPT_OF_CODE[c]).filter(Boolean))] : null;
  const keep = (t) => {
    if (onlyEnglish) return !hasOtherScript(t);
    if (!wantEnglish && !hasOtherScript(t)) return false;
    // The generator always adds the location's own language; terms in a script that was not chosen are removed.
    if (scripts && scripts.length && !onlyChosenScripts(t, scripts)) return false;
    return true;
  };
  return { hashtags: (terms.hashtags || []).filter(keep), keywords: (terms.keywords || []).filter(keep) };
};

module.exports = {
  hasOtherScript,
  applyLanguageChoice,
  BASE_URL,
  health,
  generateEventTerms,
  /** @deprecated alias — use generateEventTerms */
  generateHashtags: generateEventTerms,
};
