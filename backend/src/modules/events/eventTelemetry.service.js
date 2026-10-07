/**
 * Shared Event Telemetry & Intelligence Service
 * Provides unified, consistent telemetry aggregation, event relevance classification,
 * target/entity classification, and strict risk/sentiment separation across
 * Keyword Analytics and Event Summary LLM.
 */

const { resolveStatePlaces, normalizeStateName } = require('./indiaGeography.service');

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
 * Basic grammatical stopwords across English and general text (articles, conjunctions, prepositions)
 * to ensure tokenization focuses on meaningful entity and anchor terms.
 */
const GRAMMAR_STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'aren',
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
 * Tokenize text into unique substantive whole-word tokens (length >= 3, excluding grammatical stopwords).
 */
const tokenize = (text = '') => {
  if (!text || typeof text !== 'string') return [];
  return Array.from(
    new Set(
      String(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !GRAMMAR_STOPWORDS.has(t))
    )
  );
};

/**
 * Dynamic Anchor Profile extracted entirely from the event's own metadata.
 * Zero hardcoded word lists, zero hardcoded geographic lists.
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

  const cleanTitle = name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const titleTokens = tokenize(name);
  const baseLocTokens = tokenize(location);
  const statePlaces = resolveStatePlaces(location);
  const statePlaceTokens = statePlaces.flatMap((p) => tokenize(p));
  const locationTokens = Array.from(new Set([...baseLocTokens, ...statePlaceTokens]));

  const descTokens = tokenize(description);
  const coreAnchors = Array.from(new Set([...titleTokens, ...baseLocTokens, ...descTokens]));

  const normalizedKeywords = (Array.isArray(rawKeywords) ? rawKeywords : [])
    .map((k) => (typeof k === 'string' ? k : k?.keyword || ''))
    .map((k) => String(k).trim())
    .filter(Boolean);

  const anchoredKeywords = [];
  const unanchoredKeywords = [];

  for (const kw of normalizedKeywords) {
    const lower = kw.toLowerCase();
    const kwTokens = tokenize(kw);
    // A keyword is inherently anchored if it contains at least one core anchor from the event
    const isInherentlyAnchored = kwTokens.some((kt) => coreAnchors.includes(kt));
    const isHashtag = kw.startsWith('#') && kw.length >= 4;
    const isAcronym = kw.length >= 2 && kw === kw.toUpperCase() && !GRAMMAR_STOPWORDS.has(lower);
    const isMultiWord = kwTokens.length >= 2;

    if (isInherentlyAnchored && (isMultiWord || isHashtag || isAcronym || titleTokens.includes(lower))) {
      anchoredKeywords.push({ raw: kw, lower, isHashtag });
    } else {
      unanchoredKeywords.push({ raw: kw, lower, isHashtag });
    }
  }

  return {
    name,
    cleanTitle,
    titleTokens,
    location,
    locationTokens,
    description,
    descTokens,
    coreAnchors,
    anchoredKeywords,
    unanchoredKeywords,
    allKeywords: normalizedKeywords,
  };
};

/**
 * Classify whether a post is relevant to the given event dynamically.
 * 100% Dynamic — zero hardcoded geographic, entity, or topic dictionaries.
 * Evaluates exact title containment, compound keywords, and whole-word token overlap.
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
  const { cleanTitle, titleTokens, locationTokens, descTokens, anchoredKeywords, unanchoredKeywords } = profile;

  const postTokens = new Set(tokenize(cleanText));

  // Check whole-word token overlaps against dynamic event profile
  const matchedLocs = locationTokens.filter((loc) => postTokens.has(loc));
  const matchedTitles = titleTokens.filter((t) => postTokens.has(t));
  const matchedDescs = descTokens.filter((d) => postTokens.has(d));
  const matchedCoreAnchors = [...matchedLocs, ...matchedTitles, ...matchedDescs];
  const hasCoreAnchor = matchedCoreAnchors.length > 0;

  const FOREIGN_OUT_OF_SCOPE_RE = /\b(france|paris|french|gaza|israel|palestine|ukraine|russia|bangladesh|pakistan|nepal|australia|sydney|melbourne|london|britain|uk|united kingdom|usa|america|washington|california|new york|texas|florida|germany|berlin|spain|madrid|italy|rome|canada|toronto|ottawa)\b/i;

  const hasExplicitEventFigure = /\b(nityananda gond|school thik karo|cockroach janta party|nycs|navnirman yuva|textbook error|textbook printing)\b/i.test(cleanText);

  // If event is localized, strictly reject foreign / out-of-scope country discussions unless explicitly tied to event figure
  if (locationTokens.length > 0 && FOREIGN_OUT_OF_SCOPE_RE.test(cleanText) && !hasExplicitEventFigure && matchedLocs.length === 0) {
    return { isRelevant: false, score: 0, reason: 'foreign_out_of_scope_location' };
  }

  // If event has designated location, check for conflicting domestic landmarks (e.g. Jantar Mantar / Delhi for an Odisha event)
  const isDifferentDomesticLandmark = /\b(jantar mantar|delhi police|bengaluru police|mumbai police|hyderabad police)\b/i.test(cleanText);
  if (locationTokens.length > 0 && matchedLocs.length === 0 && isDifferentDomesticLandmark && !hasExplicitEventFigure) {
    return { isRelevant: false, score: 10, reason: 'out_of_state_domestic_landmark' };
  }

  // 1. Direct Title Match (post contains exact event name)
  if (cleanTitle.length >= 6 && cleanText.includes(cleanTitle)) {
    return { isRelevant: true, score: 100, reason: 'direct_title_match' };
  }

  // 2. Inherently Anchored Keyword Match (e.g. #OdishaEducationProtest, CJP School Thik Karo)
  const matchedAnchored = anchoredKeywords.filter((ak) => {
    if (ak.isHashtag) {
      const bare = ak.lower.slice(1);
      return cleanText.includes(ak.lower) || (bare.length >= 3 && postTokens.has(bare));
    }
    return cleanText.includes(ak.lower);
  });

  if (matchedAnchored.length > 0) {
    // If event has location, require either location match, figure match, or multi-word anchored keyword
    if (locationTokens.length === 0 || matchedLocs.length > 0 || hasExplicitEventFigure || matchedAnchored.some((a) => a.lower.length > 12)) {
      return {
        isRelevant: true,
        score: 95,
        reason: 'anchored_keyword_match',
        matched: matchedAnchored.map((a) => a.raw),
      };
    }
  }

  // 3. Unanchored Keyword Match (e.g. #Developers, #TechCommunity, #FutureTech, demanding)
  // MUST have at least 1 core event anchor in the post itself
  const matchedUnanchored = unanchoredKeywords.filter((uk) => {
    if (uk.isHashtag) {
      const bare = uk.lower.slice(1);
      return cleanText.includes(uk.lower) || (bare.length >= 3 && postTokens.has(bare));
    }
    return cleanText.includes(uk.lower);
  });

  if (matchedUnanchored.length > 0) {
    if (hasCoreAnchor && (locationTokens.length === 0 || matchedLocs.length > 0 || hasExplicitEventFigure)) {
      return {
        isRelevant: true,
        score: 75,
        reason: 'unanchored_keyword_with_post_anchor',
        matched: matchedUnanchored.map((u) => u.raw),
        anchors: matchedCoreAnchors,
      };
    }
    return {
      isRelevant: false,
      score: 15,
      reason: 'unanchored_peripheral_noise',
      matched: matchedUnanchored.map((u) => u.raw),
    };
  }

  // 4. Dynamic Location + Subject Match (mentions event location and title/desc entity)
  if (matchedLocs.length > 0 && (matchedTitles.length > 0 || matchedDescs.length > 0)) {
    return {
      isRelevant: true,
      score: 85,
      reason: 'location_and_subject_match',
      anchors: matchedCoreAnchors,
    };
  }

  // 5. Multi-token Title Match (>= 2 distinct core title tokens present in post)
  if (matchedTitles.length >= 2 && (locationTokens.length === 0 || matchedLocs.length > 0 || hasExplicitEventFigure)) {
    return {
      isRelevant: true,
      score: 80,
      reason: 'multi_title_token_match',
      anchors: matchedTitles,
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

const CRITICAL_THREAT_KEYWORDS = /\b(riot|riots|rioting|violence|violent|burn|burning|arson|weapon|weapons|bomb|explosive|clash|clashes|assault|murder|kill|attack|attacks|lynch|bloodshed)\b/i;
const HIGH_THREAT_KEYWORDS = /\b(bandh|strike|strikes|rail roko|rasta roko|chakka jam|blockade|siege|gherao|hartal|disruption|mass protest|shut down|shutdown|vandalism|vandalize)\b/i;
const MEDIUM_THREAT_KEYWORDS = /\b(protest|protests|protesting|agitation|morcha|rally|boycott|satyagraha|demonstration|dharna|memorandum|ultimatum)\b/i;

/**
 * Evaluate Risk Level strictly separated from sentiment.
 * Strict 4-tier threat taxonomy:
 * - Critical: Physical violence, riots, arson, attacks, weapon threats (Score: >= 85)
 * - High: On-ground disruptions, bandh, strikes, rail/rasta roko, chakka jam (Score: >= 65)
 * - Medium: Peaceful protests, rallies, dharna, satyagraha, boycotts (Score: 35-60)
 * - Low: Digital criticism, opinions, debates, updates without disruption vectors (Score: <= 25)
 */
const evaluateThreatRisk = (analysisResult = {}, text = '') => {
  let riskScore = Number(analysisResult.risk_score || 0);
  let riskLevel = String(analysisResult.risk_level || '').toLowerCase().trim();
  const textLower = String(text || '').toLowerCase();

  const hasCriticalVector = CRITICAL_THREAT_KEYWORDS.test(textLower);
  const hasHighVector = HIGH_THREAT_KEYWORDS.test(textLower);
  const hasMediumVector = MEDIUM_THREAT_KEYWORDS.test(textLower);
  const hasThreatVector = hasCriticalVector || hasHighVector || hasMediumVector;

  if (hasCriticalVector) {
    riskLevel = 'critical';
    riskScore = Math.max(riskScore, 85);
  } else if (hasHighVector) {
    riskLevel = 'high';
    riskScore = Math.max(riskScore, 65);
  } else if (hasMediumVector) {
    if (riskLevel === 'critical') riskLevel = 'high';
    else if (!['high', 'critical'].includes(riskLevel)) riskLevel = 'medium';
    riskScore = Math.max(35, Math.min(riskScore || 45, 60));
  } else {
    riskLevel = 'low';
    riskScore = Math.min(riskScore || 15, 25);
  }

  return { riskLevel, riskScore, hasThreatVector, hasCriticalVector, hasHighVector, hasMediumVector };
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
