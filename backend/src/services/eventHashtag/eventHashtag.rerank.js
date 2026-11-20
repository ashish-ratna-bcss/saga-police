/**
 * Optional LLM re-rank of curated keyword/hashtag candidates.
 * Soft-fails when LLM is unavailable — never blocks suggestions.
 */

const logger = require('../../lib/logger');

const parseJsonObject = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

/**
 * Ask the LLM to keep the best short, search-ready terms.
 * @returns {Promise<{ hashtags: object[], keywords: object[], used: boolean }>}
 */
const llmRerankTerms = async (eventObj, curated, { maxHashtags = 20, maxKeywords = 20 } = {}) => {
  if (String(process.env.EVENT_TERMS_LLM_RERANK || 'true').toLowerCase() === 'false') {
    return { ...curated, used: false };
  }
  if (!process.env.LLM_BASE_URL && !process.env.OLLAMA_BASE_URL) {
    return { ...curated, used: false };
  }

  let complete;
  try {
    ({ complete } = require('../../modules/ai-assistant/llm.service'));
  } catch {
    return { ...curated, used: false };
  }

  const kw = (curated.keywords || []).map((x) => x.term || x).slice(0, 40);
  const ht = (curated.hashtags || []).map((x) => x.term || x).slice(0, 40);
  if (!kw.length && !ht.length) return { ...curated, used: false };

  const prompt = `You help police social-media monitoring pick search keywords and hashtags.

Event: ${eventObj.event || eventObj.name || ''}
Location: ${eventObj.location || ''}
Description: ${eventObj.description || ''}

Candidate keywords:
${kw.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Candidate hashtags:
${ht.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Rules:
- Keep only short, search-ready terms people would type or tag online.
- Reject sentence fragments and incomplete phrases.
- Prefer entity+topic / entity+location compounds.
- Keep useful Hindi/other-script terms if present.
- Return at most ${maxKeywords} keywords and ${maxHashtags} hashtags.

Reply with JSON only:
{"keywords":["..."],"hashtags":["..."]}`;

  try {
    const result = await complete(
      [
        { role: 'system', content: 'You curate search terms. Reply with JSON only.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.1, maxTokens: 800 }
    );
    const parsed = parseJsonObject(result.content);
    if (!parsed) return { ...curated, used: false };

    const byKey = (items) => {
      const map = new Map();
      for (const item of items || []) {
        const term = String(item.term || item || '').trim();
        if (term) map.set(term.toLowerCase(), item.term ? item : { term, source: 'web', score: 0 });
      }
      return map;
    };
    const kwMap = byKey(curated.keywords);
    const htMap = byKey(curated.hashtags);

    const pick = (list, map, fallback) => {
      const chosen = [];
      const seen = new Set();
      for (const t of Array.isArray(list) ? list : []) {
        const term = String(t || '').trim();
        const key = term.toLowerCase();
        if (!term || seen.has(key)) continue;
        seen.add(key);
        const prev = map.get(key);
        chosen.push(prev ? { ...prev, term: prev.term || term } : { term, source: 'web', score: 5 });
      }
      // Always pin derived + live social/web terms the LLM dropped.
      for (const item of fallback || []) {
        const key = String(item.term || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        if (['derived', 'web', 'news'].includes(item.source)) {
          seen.add(key);
          chosen.push(item);
        }
      }
      return chosen.length ? chosen : fallback;
    };

    return {
      keywords: pick(parsed.keywords, kwMap, curated.keywords).slice(0, maxKeywords),
      hashtags: pick(parsed.hashtags, htMap, curated.hashtags).slice(0, maxHashtags),
      used: true,
    };
  } catch (err) {
    logger.warn(`[event-terms] LLM re-rank skipped: ${err.message}`);
    return { ...curated, used: false };
  }
};

module.exports = { llmRerankTerms, parseJsonObject };
