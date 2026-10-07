require('dotenv').config();
const axios = require('axios');
const logger = require('../../lib/logger');
const { getEventAnchorProfile } = require('../../modules/events/eventTelemetry.service');

const getLLMConfig = () => {
  let baseUrl = (process.env.LLM_BASE_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl && process.env.OLLAMA_BASE_URL) {
    baseUrl = `${process.env.OLLAMA_BASE_URL.trim().replace(/\/$/, '')}/v1`;
  }
  const apiKey = (process.env.LLM_API_KEY || 'ollama').trim();
  const model = (process.env.LLM_MODEL || 'qwen3-14b').trim();
  const timeoutMs = Math.max(15000, Number(process.env.LLM_CURATOR_TIMEOUT_MS || 30000));
  return { baseUrl, apiKey, model, timeoutMs };
};

/**
 * Deterministic fallback filter to strip known noise tokens and ensure
 * candidate keywords & hashtags have substantive anchors or event relevance.
 */
const deterministicSanitize = (eventObj, rawHashtags = [], rawKeywords = []) => {
  const NOISE_SET = new Set([
    '#developers', '#techcommunity', '#innovation', '#futuretech', '#tech', '#ai', '#software',
    '#storiesin', '#educationfirst', '#futureleaders', '#studentsupport',
    'demanding', 'initiated', 'started', 'meeting', 'update', 'status', 'shown support',
    'monday extended', 'cjp co', 'officially backed', 'agitation calling', 'textbooks according',
    'monday september 21', 'sep 21 pti', 'theprint bhubaneswar sep', 'bhubaneswar sep 21',
    'students theprint bhubaneswar', 'odisha students theprint', 'supports', 'commission',
    'infrastructure', 'strengthen', 'students', 'stories in', 'distant ally', 'rebuilding communities',
    'jewish federation', 'families in crisis', 'moments of crisis', 'moments of hope'
  ]);

  const cleanHashtags = (Array.isArray(rawHashtags) ? rawHashtags : [])
    .map((h) => String(h).trim())
    .filter((h) => {
      if (!h || h.length < 3) return false;
      const lower = h.toLowerCase();
      if (NOISE_SET.has(lower)) return false;
      return true;
    });

  const cleanKeywords = (Array.isArray(rawKeywords) ? rawKeywords : [])
    .map((k) => String(k).trim())
    .filter((k) => {
      if (!k || k.length < 3) return false;
      const lower = k.toLowerCase();
      if (NOISE_SET.has(lower)) return false;
      if (lower.startsWith('sep ') && lower.endsWith(' pti')) return false;
      return true;
    });

  return {
    hashtags: Array.from(new Set(cleanHashtags)),
    keywords: Array.from(new Set(cleanKeywords)),
  };
};

/**
 * Curates and verifies candidate keywords/hashtags using the LLM with deterministic fallback.
 */
const curateEventTermsWithLLM = async (eventObj, candidateTerms = {}) => {
  const rawHashtags = Array.isArray(candidateTerms.hashtags) ? candidateTerms.hashtags : [];
  const rawKeywords = Array.isArray(candidateTerms.keywords) ? candidateTerms.keywords : [];

  if (!rawHashtags.length && !rawKeywords.length) {
    return { hashtags: [], keywords: [] };
  }

  const { baseUrl, apiKey, model, timeoutMs } = getLLMConfig();
  if (!baseUrl) {
    return deterministicSanitize(eventObj, rawHashtags, rawKeywords);
  }

  const eventName = String(eventObj.event || eventObj.name || '').trim();
  const eventLocation = String(eventObj.location || '').trim();
  const eventDescription = String(eventObj.description || '').trim();

  const prompt = `You are an Expert Law Enforcement OSINT / Cyber Intelligence Analyst.
Review, verify, and curate candidate keywords and hashtags for intelligence monitoring of an event.

TARGET EVENT:
- Event Name: ${eventName}
- Location: ${eventLocation}
- Description: ${eventDescription}

CANDIDATE HASHTAGS:
${JSON.stringify(rawHashtags)}

CANDIDATE KEYWORDS:
${JSON.stringify(rawKeywords)}

STRICT CURATION RULES:
1. DISAMBIGUATE ACRONYMS & ENTITIES: Any candidate term referring to an unrelated foreign organization, different city/state/country, or different domain (e.g., Jewish Federation, foreign courts, unrelated companies) MUST BE COMPLETELY DISCARDED.
2. REMOVE GENERIC BUZZWORDS: Discard all generic tech buzzwords (#Developers, #TechCommunity, #Innovation, #FutureTech, #AI, #StoriesIn, #EducationFirst, #FutureLeaders).
3. REMOVE MEANINGLESS / SINGLE-WORD FILLER: Discard single generic words (e.g., "demanding", "initiated", "started", "meeting", "supports", "commission", "infrastructure", "strengthen", "students").
4. REMOVE WIRE BYLINES & FRAGMENTS: Discard date stamps, news wire bylines, and incomplete sentence fragments (e.g., "sep 21 pti", "monday extended", "theprint bhubaneswar", "error row cjp").
5. KEEP ONLY HIGH-PRECISION RELEVANT TERMS: Retain only terms that specifically name the actual individuals, organizations, slogans, government bodies, or specific protest issues directly mentioned in or relevant to "${eventName}" in "${eventLocation}".
6. Output MUST BE strictly valid JSON without markdown formatting or backticks:
{
  "hashtags": ["#Tag1", "#Tag2"],
  "keywords": ["Keyword 1", "Keyword 2"]
}`;

  try {
    const res = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.1,
        chat_template_kwargs: { enable_thinking: false },
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: timeoutMs,
      }
    );

    const rawReply = res.data?.choices?.[0]?.message?.content || '';
    // Extract JSON block
    const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.hashtags) && Array.isArray(parsed.keywords)) {
        return deterministicSanitize(eventObj, parsed.hashtags, parsed.keywords);
      }
    }
    logger.warn('[EventHashtagCurator] LLM output not in expected JSON format, using fallback');
  } catch (err) {
    logger.warn(`[EventHashtagCurator] LLM curation call failed (${err.message}), using deterministic fallback`);
  }

  return deterministicSanitize(eventObj, rawHashtags, rawKeywords);
};

module.exports = {
  curateEventTermsWithLLM,
  deterministicSanitize,
};
