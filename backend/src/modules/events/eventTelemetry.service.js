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
 * Classify whether a post is relevant to the given event or unrelated peripheral noise.
 * E.g., for "BRICS Summit", unrelated posts like "Mumbai Police traffic update" or
 * unrelated Russia-Ukraine frontline news that don't mention BRICS/summit should be flagged as unrelated.
 */
const classifyEventRelevance = (text, eventName, keywordsList = []) => {
  if (!text || typeof text !== 'string') {
    return { isRelevant: false, reason: 'empty_text' };
  }

  const cleanText = text.toLowerCase();
  const cleanEvent = (eventName || '').toLowerCase().trim();
  const eventTerms = cleanEvent.split(/[\s,–—\-_/]+/).filter((t) => t.length > 2);

  // 1. Direct event name match
  if (cleanEvent && cleanText.includes(cleanEvent)) {
    return { isRelevant: true, reason: 'direct_event_match' };
  }

  // 2. High-specificity keyword matching
  const matchedEventKeywords = keywordsList.filter((k) => {
    const kw = (typeof k === 'string' ? k : k?.keyword || '').toLowerCase().trim();
    return kw.length > 2 && cleanText.includes(kw);
  });

  // 3. Detect known off-topic noise vectors if they do not match any core event term
  // E.g., unrelated local police traffic alerts or generic international conflict when event is not about that
  const hasCoreEventTerm = eventTerms.some((term) => cleanText.includes(term));
  const hasEventKeyword = matchedEventKeywords.length > 0;

  // Check for unrelated local police alerts when the event is not a police event
  const isPoliceEvent = cleanEvent.includes('police') || eventTerms.some((t) => t === 'police');
  const isLocalPoliceNoise = !isPoliceEvent && /\b(mumbai police|traffic update|challan|local police station|traffic advisory)\b/i.test(cleanText);

  if (isLocalPoliceNoise && !hasCoreEventTerm) {
    return { isRelevant: false, reason: 'unrelated_local_police_noise' };
  }

  // Check for unrelated foreign conflict noise if the event is a summit / governance event
  const isWarEvent = cleanEvent.includes('war') || cleanEvent.includes('conflict') || cleanEvent.includes('ukraine');
  const isForeignWarNoise = !isWarEvent && /\b(russia-ukraine war|frontline clash|kharkiv artillery|avdiivka)\b/i.test(cleanText);
  if (isForeignWarNoise && !hasCoreEventTerm) {
    return { isRelevant: false, reason: 'unrelated_foreign_war_noise' };
  }

  // Default: if it matched event keywords or core event terms, it is relevant
  if (hasEventKeyword || hasCoreEventTerm) {
    return { isRelevant: true, reason: 'keyword_or_term_match' };
  }

  // If no keywords were passed or event name is generic, treat as peripheral
  return { isRelevant: true, reason: 'default_inclusion' };
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
  classifyEventRelevance,
  classifyTargetEntity,
  getSentimentTargetSemantics,
  evaluateThreatRisk,
  calculateReconciledPercentages,
};
