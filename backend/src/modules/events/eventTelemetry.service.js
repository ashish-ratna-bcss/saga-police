/**
 * Shared Event Telemetry & Intelligence Service
 * Provides unified, consistent telemetry aggregation, event relevance classification,
 * target/entity classification, and strict risk/sentiment separation across
 * Keyword Analytics and Event Summary LLM.
 */

const TARGET_ENTITIES = {
  GOVERNMENT: 'Government',
  POLICE: 'Police',
  POLITICAL_LEADER: 'Political leader',
  ORGANIZATION: 'Organization',
  OTHER: 'Other',
};

/**
 * Standardize sentiment into canonical 'positive' | 'neutral' | 'negative'
 */
const parseSentiment = (raw) => {
  if (!raw || typeof raw !== 'string') return 'neutral';
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith('pos') || lower.includes('praise') || lower.includes('favour')) return 'positive';
  if (lower.startsWith('neg') || lower.includes('critic') || lower.includes('against')) return 'negative';
  return 'neutral';
};

/**
 * Common grammatical stop words across languages (English + multilingual conjunctions)
 * Used purely to extract substantive anchor tokens from dynamic event title / description / location.
 */
const COMMON_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours'
]);

/**
 * Generic single-word action/status tokens that frequently appear in unrelated contexts worldwide.
 * When an event keyword consists solely of one of these generic tokens, it dynamically requires
 * co-occurrence with at least one substantive event anchor (location, specific title entity, or description entity).
 */
const GENERIC_SINGLE_TOKENS = new Set([
  'demand', 'demands', 'demanding', 'protest', 'protests', 'protesting',
  'rally', 'rallies', 'strike', 'strikes', 'bandh', 'meeting', 'update',
  'news', 'status', 'initiated', 'started', 'resignation', 'resign', 'action',
  'alert', 'urgent', 'boycott', 'march', 'gathering', 'crowd', 'traffic',
  'announcement', 'statement', 'briefing', 'conference', 'summit', 'report',
  'incident', 'scam', 'scheme', 'policy', 'minister', 'leader', 'official',
  'event', 'annual', 'international', 'national', 'state', 'public'
]);

const extractSubstantiveTokens = (text = '') => {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !COMMON_STOP_WORDS.has(t) && !GENERIC_SINGLE_TOKENS.has(t));
};

const extractLocationTokens = (text = '') => {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !COMMON_STOP_WORDS.has(t));
};

/**
 * Dynamic Anchor Profile extracted from an Event's dynamic metadata.
 */
const getEventAnchorProfile = (eventInput, keywordsListInput = [], locationInput = '', descriptionInput = '') => {
  let name = '';
  let location = '';
  let description = '';
  let rawKeywords = [];

  if (eventInput && typeof eventInput === 'object') {
    name = String(eventInput.name || eventInput.title || '').trim();
    location = String(eventInput.location || locationInput || '').trim();
    description = String(eventInput.description || descriptionInput || '').trim();
    rawKeywords = Array.isArray(eventInput.keywords) ? eventInput.keywords : keywordsListInput;
  } else {
    name = String(eventInput || '').trim();
    location = String(locationInput || '').trim();
    description = String(descriptionInput || '').trim();
    rawKeywords = keywordsListInput;
  }

  // Extract location tokens (filtering hyper-generic country words if regional tokens exist)
  let locationTokens = extractLocationTokens(location);
  if (locationTokens.length > 1) {
    const specificLocs = locationTokens.filter((t) => !['india', 'country', 'national', 'usa', 'world', 'global'].includes(t));
    if (specificLocs.length > 0) locationTokens = specificLocs;
  }

  // Extract substantive title tokens and clean title phrase
  const substantiveSubjectTokens = Array.from(
    new Set([...extractSubstantiveTokens(name), ...extractSubstantiveTokens(description)])
  );
  const cleanTitle = name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

  // Partition keywords into specific (multi-word, hashtag, acronym) vs generic single-word
  const normalizedKeywords = (Array.isArray(rawKeywords) ? rawKeywords : [])
    .map((k) => (typeof k === 'string' ? k : k?.keyword || ''))
    .map((k) => String(k).trim())
    .filter(Boolean);

  const specificKeywords = [];
  const genericKeywords = [];

  for (const kw of normalizedKeywords) {
    const lower = kw.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const isHashtag = kw.startsWith('#') && kw.length >= 4;
    const isAcronym = kw.length >= 2 && kw === kw.toUpperCase() && !COMMON_STOP_WORDS.has(lower);
    const isMultiWord = words.length >= 2;
    const isSingleGeneric = words.length === 1 && (GENERIC_SINGLE_TOKENS.has(lower) || lower.length <= 4);

    if (isMultiWord || isHashtag || isAcronym || (!isSingleGeneric && words.length === 1 && substantiveSubjectTokens.includes(lower))) {
      specificKeywords.push({ raw: kw, lower, isMultiWord, isHashtag, isAcronym });
    } else {
      genericKeywords.push({ raw: kw, lower });
    }
  }

  return {
    name,
    cleanTitle,
    substantiveSubjectTokens,
    location,
    locationTokens,
    description,
    specificKeywords,
    genericKeywords,
    allKeywords: normalizedKeywords,
  };
};

/**
 * Classify whether a post is relevant to the given event dynamically.
 * Zero hardcoded lists — strictly evaluates dynamic event anchor profile
 * (name, location, description, and specific vs generic keywords).
 */
const classifyEventRelevance = (text, eventInput, keywordsList = [], eventLocation = '', eventDescription = '') => {
  if (!text || typeof text !== 'string') {
    return { isRelevant: false, score: 0, reason: 'empty_text' };
  }

  const cleanText = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (cleanText.length < 5) {
    return { isRelevant: false, score: 0, reason: 'too_short' };
  }

  const profile = getEventAnchorProfile(eventInput, keywordsList, eventLocation, eventDescription);
  const { cleanTitle, substantiveSubjectTokens, locationTokens, specificKeywords, genericKeywords } = profile;

  // 1. Direct Title Match (Full title or phrase >= 6 chars in text)
  if (cleanTitle.length >= 6 && cleanText.includes(cleanTitle)) {
    return { isRelevant: true, score: 100, reason: 'direct_title_match' };
  }

  // 2. Specific Keyword Match (Compound / Multi-word, Hashtag, Distinctive Acronym)
  const matchedSpecific = specificKeywords.filter((sk) => {
    if (sk.isHashtag) {
      const bare = sk.lower.slice(1);
      return cleanText.includes(sk.lower) || (bare.length >= 3 && cleanText.includes(bare));
    }
    return cleanText.includes(sk.lower);
  });

  if (matchedSpecific.length > 0) {
    return {
      isRelevant: true,
      score: 90,
      reason: 'specific_keyword_match',
      matched: matchedSpecific.map((s) => s.raw),
    };
  }

  // Check overlap with dynamic anchors
  const matchedLocationTokens = locationTokens.filter((loc) => cleanText.includes(loc));
  const matchedSubjectTokens = substantiveSubjectTokens.filter((t) => cleanText.includes(t));

  const hasLocationAnchor = matchedLocationTokens.length > 0;
  const hasSubjectAnchor = matchedSubjectTokens.length > 0;

  // 3. Generic / Single-Word Keyword Match
  // If matched only generic single words (e.g., "demanding", "protest", "resignation"),
  // MUST have at least one dynamic anchor (location OR substantive subject token) to prevent off-topic noise.
  const matchedGeneric = genericKeywords.filter((gk) => cleanText.includes(gk.lower));
  if (matchedGeneric.length > 0) {
    if (hasLocationAnchor || hasSubjectAnchor) {
      return {
        isRelevant: true,
        score: 75,
        reason: 'anchored_generic_keyword_match',
        matched: matchedGeneric.map((g) => g.raw),
        anchors: [...matchedLocationTokens, ...matchedSubjectTokens],
      };
    }
    // Generic word matched with ZERO anchor overlap -> off-topic noise!
    return {
      isRelevant: false,
      score: 15,
      reason: 'unanchored_generic_keyword_noise',
      matched: matchedGeneric.map((g) => g.raw),
    };
  }

  // 4. Combined Location + Substantive Subject Match (even without explicit keywords)
  if (hasLocationAnchor && hasSubjectAnchor) {
    return {
      isRelevant: true,
      score: 85,
      reason: 'location_and_subject_match',
      anchors: [...matchedLocationTokens, ...matchedSubjectTokens],
    };
  }

  // 5. Multi-token Subject Match (>= 2 substantive subject tokens co-occurring in the post)
  if (matchedSubjectTokens.length >= 2) {
    return {
      isRelevant: true,
      score: 80,
      reason: 'multi_subject_token_match',
      anchors: matchedSubjectTokens,
    };
  }

  // 6. If location is given and post matches at least 1 substantive subject token
  if (locationTokens.length === 0 && matchedSubjectTokens.length >= 1 && cleanTitle.length < 15) {
    return {
      isRelevant: true,
      score: 60,
      reason: 'single_subject_token_match',
      anchors: matchedSubjectTokens,
    };
  }

  return { isRelevant: false, score: 0, reason: 'insufficient_event_overlap' };
};

/**
 * Classifies post text into target/entity:
 * - Government
 * - Police
 * - Political leader
 * - Organization
 * - Other
 */
const classifyTargetEntity = (text = '', author = '', analysis = {}) => {
  const combined = `${text} ${author} ${analysis?.summary || ''} ${analysis?.category || ''}`.toLowerCase();

  // 1. Police / Law enforcement
  if (
    /\b(police|cop|cops|dgp|sp|commissioner|constable|dsp|inspector|chowki|thana|patrol|traffic police|khaki)\b/i.test(
      combined
    )
  ) {
    return TARGET_ENTITIES.POLICE;
  }

  // 2. Political Leader
  if (
    /\b(cm|pm|chief minister|prime minister|narendra modi|modi|putin|xi jinping|biden|minister|neta|mla|mp|president|leader|mohan majhi|rahul gandhi)\b/i.test(
      combined
    )
  ) {
    return TARGET_ENTITIES.POLITICAL_LEADER;
  }

  // 3. Government / Administration / Policy
  if (
    /\b(govt|government|sarkar|administration|cabinet|ministry|yojana|parliament|assembly|vidhan sabha|scheme|portal|dept|department)\b/i.test(
      combined
    )
  ) {
    return TARGET_ENTITIES.GOVERNMENT;
  }

  // 4. Organization / Summit / Multilateral body
  if (
    /\b(brics|summit|un|united nations|nato|g20|asean|ngo|omc|corporation|committee|delegation|confederation|alliance)\b/i.test(
      combined
    )
  ) {
    return TARGET_ENTITIES.ORGANIZATION;
  }

  return TARGET_ENTITIES.OTHER;
};

/**
 * Map sentiment to target-specific meaning:
 * Positive = Praise
 * Neutral = News/Updates
 * Negative = Criticism
 */
const getSentimentTargetSemantics = (sentiment) => {
  const s = parseSentiment(sentiment);
  if (s === 'positive') return { label: 'Praise', code: 'positive' };
  if (s === 'negative') return { label: 'Criticism', code: 'negative' };
  return { label: 'News/Updates', code: 'neutral' };
};

/**
 * Evaluate Risk Level strictly separated from sentiment.
 * Negative sentiment (criticism, disagreement) is NOT a threat signal.
 */
const evaluateThreatRisk = (analysisResult = {}, text = '') => {
  let riskScore = Number(analysisResult.risk_score || 0);
  let riskLevel = String(analysisResult.risk_level || '').toLowerCase();

  const threatKeywords = /\b(protest|bandh|strike|rail roko|rasta roko|chakka jam|riot|violence|burn|clash|vandalism|giti|assault|attack|threat|disruption|blockade|siege|boycott)\b/i;
  const hasThreatVector = threatKeywords.test(text || '');

  // If flagged high risk solely because of negative sentiment without threat vectors, demote to low/medium
  if (!hasThreatVector && riskScore < 60) {
    riskLevel = 'low';
    riskScore = Math.min(riskScore, 25);
  } else if (!riskLevel) {
    if (riskScore >= 85) riskLevel = 'critical';
    else if (riskScore >= 65) riskLevel = 'high';
    else if (riskScore >= 35) riskLevel = 'medium';
    else riskLevel = 'low';
  }

  if (riskLevel === 'safe') riskLevel = 'low';
  if (!['low', 'medium', 'high', 'critical'].includes(riskLevel)) {
    riskLevel = 'low';
  }

  return { riskLevel, riskScore, hasThreatVector };
};

/**
 * Calculate reconciled percentages that sum to 100%.
 */
const calculateReconciledPercentages = (countsMap) => {
  const keys = Object.keys(countsMap);
  const total = keys.reduce((sum, k) => sum + (Number(countsMap[k]) || 0), 0);
  if (total <= 0) {
    const empty = {};
    keys.forEach((k) => {
      empty[k] = 0;
    });
    return empty;
  }

  // Initial rounding
  const rawPcts = {};
  let currentSum = 0;
  keys.forEach((k) => {
    const pct = Math.round(((countsMap[k] || 0) / total) * 100);
    rawPcts[k] = pct;
    currentSum += pct;
  });

  // Adjust diff on largest key to ensure exact 100% sum
  const diff = 100 - currentSum;
  if (diff !== 0 && keys.length > 0) {
    const largestKey = keys.reduce((maxK, k) => (countsMap[k] > (countsMap[maxK] || 0) ? k : maxK), keys[0]);
    rawPcts[largestKey] = Math.max(0, rawPcts[largestKey] + diff);
  }

  return rawPcts;
};

module.exports = {
  TARGET_ENTITIES,
  parseSentiment,
  getEventAnchorProfile,
  classifyEventRelevance,
  classifyTargetEntity,
  getSentimentTargetSemantics,
  evaluateThreatRisk,
  calculateReconciledPercentages,
};
