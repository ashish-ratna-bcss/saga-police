/**
 * Shared Event Telemetry & Intelligence Service
 * Provides unified, consistent telemetry aggregation, event relevance classification,
 * target/entity classification, and strict risk/sentiment separation across
 * Keyword Analytics and Event Summary LLM.
 */

const { resolveStatePlaces, normalizeStateName } = require('./indiaGeography.service');
const { normalizeText } = require('../../lib/textNormalize');

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
        .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, ' ')
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

  const cleanTitle = name.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const titleTokens = tokenize(name);
  const baseLocTokens = tokenize(location);
  const statePlaces = resolveStatePlaces(location);
  // A one-word place ("Bhubaneswar") can count as a word. A multi-word place ("Odisha Legislative Assembly") counts only as the whole
  // phrase: split into words it would turn plain words like "assembly" into locations and match unrelated posts ("morning assembly").
  const statePlaceTokens = statePlaces.filter((p) => tokenize(p).length === 1).flatMap((p) => tokenize(p));
  const multiWordPlaces = statePlaces.filter((p) => tokenize(p).length > 1).map((p) => tokenize(p).join(' '));
  // The state's place list contains generic words ("high", "road", "state"), so a place only counts
  // as this event's location when the typed location or the event's own text/keywords also use it.
  const ownText = new Set([
    ...tokenize(name),
    ...tokenize(description),
    ...(Array.isArray(rawKeywords) ? rawKeywords : []).flatMap((k) => tokenize(typeof k === 'string' ? k : k?.keyword || '')),
  ]);
  const locationTokens = Array.from(new Set([...baseLocTokens, ...statePlaceTokens.filter((t) => t.length >= 5 && ownText.has(t))]));
  const ownTextJoined = ` ${[name, description, ...(Array.isArray(rawKeywords) ? rawKeywords : []).map((k) => (typeof k === 'string' ? k : k?.keyword || ''))].map((x) => tokenize(x).join(' ')).join(' ')} `;
  const locationPhrases = multiWordPlaces.filter((ph) => ownTextJoined.includes(` ${ph} `));

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
    const isHashtag = kw.startsWith('#') && kw.length >= 4;
    // Hashtags are one glued token (#OdishaEducationProtest): anchored if they embed an event anchor
    const isInherentlyAnchored =
      kwTokens.some((kt) => coreAnchors.includes(kt)) ||
      (isHashtag && coreAnchors.some((a) => a.length >= 5 && lower.includes(a)));
    const isAcronym = kw.length >= 2 && kw === kw.toUpperCase() && !GRAMMAR_STOPWORDS.has(lower);
    const isMultiWord = kwTokens.length >= 2;

    // A phrase in another script than the event text (e.g. Odia keyword on an English-titled event)
    // cannot share words with it, so it is treated as deliberately event-specific.
    const eventIsLatin = /[A-Za-z]/.test(`${name} ${location} ${description}`);
    const crossScript = eventIsLatin && !/[A-Za-z]/.test(kw) && (isMultiWord || isHashtag);

    if (crossScript) {
      anchoredKeywords.push({ raw: kw, lower, isHashtag, crossScript: true });
    } else if (isInherentlyAnchored && (isMultiWord || isHashtag || isAcronym || titleTokens.includes(lower))) {
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
    locationPhrases,
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
const profileCache = new WeakMap();
const profileFor = (eventInput, keywordsList, eventLocation, eventDescription) => {
  if (eventInput && typeof eventInput === 'object') {
    let p = profileCache.get(eventInput);
    if (!p) {
      p = getEventAnchorProfile(eventInput, keywordsList, eventLocation, eventDescription);
      profileCache.set(eventInput, p);
    }
    return p;
  }
  return getEventAnchorProfile(eventInput, keywordsList, eventLocation, eventDescription);
};

/**
 * `ctx.genericTokens` (optional) is the tenant-learned set of common words
 * (event.corpus.service). A keyword made only of common words and the event's
 * location is "weak": it can support a match but never decide one alone.
 */
const classifyEventRelevance = (text, eventInput, keywordsList = [], eventLocation = '', eventDescription = '', ctx = {}) => {
  if (!text || typeof text !== 'string') {
    return { isRelevant: false, score: 0, reason: 'empty_text' };
  }

  const cleanText = normalizeText(text).toLowerCase();
  if (cleanText.length < 5) {
    return { isRelevant: false, score: 0, reason: 'too_short' };
  }

  const profile = profileFor(eventInput, keywordsList, eventLocation, eventDescription);
  const { cleanTitle, titleTokens, locationTokens, descTokens, anchoredKeywords, unanchoredKeywords } = profile;
  const locationPhrases = profile.locationPhrases || [];

  const postTokens = new Set(tokenize(cleanText));
  const postJoined = ` ${tokenize(cleanText).join(' ')} `;

  // Check whole-word token overlaps against dynamic event profile
  const matchedLocs = [...locationTokens.filter((loc) => postTokens.has(loc)), ...locationPhrases.filter((ph) => postJoined.includes(` ${ph} `))];
  const matchedTitles = titleTokens.filter((t) => postTokens.has(t));
  const matchedDescs = descTokens.filter((d) => postTokens.has(d));
  const matchedCoreAnchors = [...matchedLocs, ...matchedTitles, ...matchedDescs];
  const hasCoreAnchor = matchedCoreAnchors.length > 0;

  const hasLocation = locationTokens.length > 0;
  const locOk = !hasLocation || matchedLocs.length > 0;
  // Description words are generic ("students", "protest"): a weak signal only.
  // A title word that is also the location (e.g. "Odisha") is not subject evidence.
  const subjectTitles = matchedTitles.filter((t) => !locationTokens.includes(t));
  const subjectDescs = matchedDescs.filter((d) => !locationTokens.includes(d) && !subjectTitles.includes(d));
  const strongSubject = subjectTitles.length >= 1 || subjectDescs.length >= 3;
  // Location + subject alone (no keyword) is easy to hit by accident in long posts, so it needs
  // more than one subject word: two title words, or a title word plus two description words.
  const solidSubject = subjectTitles.length >= 2 || (subjectTitles.length >= 1 && subjectDescs.length >= 2) || subjectDescs.length >= 4;

  // Whole-word / whole-phrase containment (no substring hits like "mp" in "camp").
  const hasPhrase = (phrase) => {
    const p = String(phrase || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!p) return false;
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])${escaped}($|[^\\p{L}\\p{M}\\p{N}_])`, 'u').test(cleanText);
  };
  const hasKeyword = (k) => {
    if (k.isHashtag) {
      const bare = k.lower.slice(1);
      return hasPhrase(k.lower) || (bare.length >= 3 && postTokens.has(bare));
    }
    return hasPhrase(k.lower);
  };

  // 1. Direct title match
  if (cleanTitle.length >= 6 && hasPhrase(cleanTitle)) {
    return { isRelevant: true, score: 100, reason: 'direct_title_match' };
  }

  const generic = ctx?.genericTokens instanceof Set ? ctx.genericTokens : new Set();
  const ownLoc = new Set(tokenize(profile.location));
  const isWeak = (k) => {
    const ws = String(k.raw).replace(/^[#@]/, '').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
    if (k.isHashtag) return false;
    return ws.length > 0 && ws.every((w) => generic.has(w) || ownLoc.has(w) || GRAMMAR_STOPWORDS.has(w));
  };

  // 2. Anchored keyword (contains an event anchor and is multi-word / hashtag / acronym)
  const matchedAnchored = anchoredKeywords.filter(hasKeyword);
  const strongAnchored = matchedAnchored.filter((a) => !isWeak(a));
  if (strongAnchored.length > 0) {
    const specific = strongAnchored.some((a) => a.isHashtag || tokenize(a.raw).length >= 2);
    if ((specific && (locOk || strongAnchored.some((a) => a.isHashtag || a.crossScript))) || (matchedLocs.length > 0 && strongSubject) || subjectTitles.length >= 2) {
      return {
        isRelevant: true,
        score: 95,
        reason: 'anchored_keyword_match',
        matched: strongAnchored.map((a) => a.raw),
      };
    }
  }

  // 3. Unanchored or weak keyword: needs title-level subject evidence and the location
  const hitUnanchored = unanchoredKeywords.filter(hasKeyword);
  // A distinctive multi-word phrase / hashtag / acronym stands on its own once the location matches.
  const specificUnanchored = hitUnanchored.filter((u) => !isWeak(u) && (u.isHashtag || tokenize(u.raw).length >= 2 || (u.raw.length >= 2 && u.raw === u.raw.toUpperCase())));
  if (specificUnanchored.length > 0 && locOk) {
    return {
      isRelevant: true,
      score: 80,
      reason: 'specific_keyword_match',
      matched: specificUnanchored.map((u) => u.raw),
    };
  }
  const matchedUnanchored = [...hitUnanchored, ...matchedAnchored.filter(isWeak)];
  if (matchedUnanchored.length > 0) {
    if (strongSubject && locOk) {
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

  // 4. Location + subject
  if (matchedLocs.length > 0 && solidSubject) {
    return { isRelevant: true, score: 85, reason: 'location_and_subject_match', anchors: matchedCoreAnchors };
  }

  // 5. Multi-token title match
  if (subjectTitles.length >= 2 && locOk) {
    return { isRelevant: true, score: 80, reason: 'multi_title_token_match', anchors: matchedTitles };
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
  // Prefer an explicit target from post analysis when it is one of the known buckets.
  const declared = String(analysis?.target_entity || analysis?.target || '').trim().toLowerCase();
  if (declared) {
    const hit = Object.values(TARGET_ENTITIES).find((v) => v.toLowerCase() === declared);
    if (hit) return hit;
  }
  const combined = `${text} ${author} ${analysis?.summary || ''} ${analysis?.category || ''}`.toLowerCase();

  // Generic institutional roles only (no person, party or organisation names).
  if (/\b(police|cops?|constable|inspector|thana|chowki|patrol)\b/i.test(combined)) return TARGET_ENTITIES.POLICE;
  if (/\b(chief minister|prime minister|minister|mla|mp|neta|president|leader)\b/i.test(combined)) return TARGET_ENTITIES.POLITICAL_LEADER;
  if (/\b(govt|government|sarkar|administration|cabinet|ministry|department|assembly|parliament)\b/i.test(combined)) return TARGET_ENTITIES.GOVERNMENT;
  if (/\b(ngo|committee|delegation|confederation|alliance|corporation)\b/i.test(combined)) return TARGET_ENTITIES.ORGANIZATION;
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
 * Risk comes from the post-analysis result (risk_level / risk_score), kept
 * separate from sentiment. No keyword lists: text is not used to override it.
 */
const evaluateThreatRisk = (analysisResult = {}) => {
  const score = Math.max(0, Math.min(100, Number(analysisResult?.risk_score) || 0));
  let level = String(analysisResult?.risk_level || '').toLowerCase().trim();
  if (!['critical', 'high', 'medium', 'low'].includes(level)) {
    level = score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';
  }
  const hasThreatVector = level === 'critical' || level === 'high';
  return {
    riskLevel: level,
    riskScore: score,
    hasThreatVector,
    hasCriticalVector: level === 'critical',
    hasHighVector: level === 'high',
    hasMediumVector: level === 'medium',
  };
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
