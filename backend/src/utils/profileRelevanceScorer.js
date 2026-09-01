// Profile-level Hyderabad / Telangana relevance scorer.
// Complements relevanceScorer.js with handle-aware substring matching.

const { scoreRelevance } = require('./relevanceScorer');

const HANDLE_PATTERNS = [
  { term: 'hyderabad', weight: 45 },
  { term: 'telangana', weight: 40 },
  { term: 'secunderabad', weight: 40 },
  { term: 'cyberabad', weight: 40 },
  { term: 'ghmc', weight: 35 },
  { term: 'deccan', weight: 25 },
  { term: 'telugu', weight: 40 },
  { term: 'warangal', weight: 35 },
  { term: 'karimnagar', weight: 35 },
  { term: 'nizamabad', weight: 35 },
  { term: 'khammam', weight: 35 },
  { term: 'gachibowli', weight: 32 },
  { term: 'charminar', weight: 25 },
  { term: 'హైదరాబాద్', weight: 50 },
  { term: 'తెలంగాణ', weight: 50 }
];

// Short tokens at the start of a handle — skipped when a longer term already matched.
const HANDLE_PREFIX_PATTERNS = [
  { re: /^hyd/i, term: 'hyd', weight: 35, skipIf: ['hyderabad'] },
  { re: /^hyc/i, term: 'hyc', weight: 30, skipIf: ['hyderabad', 'cyberabad'] }
];

const CATEGORY_BOOST_CATEGORIES = new Set(['news', 'political']);
const CATEGORY_BOOST_MIN_STATIC = 30;
const CATEGORY_BOOST = 5;
const MAX_HANDLE_SIGNAL = 70;
const MAX_HANDLE_MATCHES = 2;
const DUAL_SOURCE_BUMP = 5;

const normalizeHandle = (value) => String(value || '')
  .trim()
  .replace(/^@+/, '')
  .toLowerCase();

const scoreHandlePatterns = (handle) => {
  const normalized = normalizeHandle(handle);
  if (!normalized) return { score: 0, matched: [] };

  let score = 0;
  const matched = [];

  for (const pattern of HANDLE_PATTERNS) {
    if (matched.length >= MAX_HANDLE_MATCHES) break;
    if (!normalized.includes(pattern.term.toLowerCase())) continue;
    score += pattern.weight;
    matched.push(pattern.term);
  }

  for (const pattern of HANDLE_PREFIX_PATTERNS) {
    if (matched.includes(pattern.term)) continue;
    if ((pattern.skipIf || []).some((term) => matched.includes(term))) continue;
    if (!pattern.re.test(normalized)) continue;
    score += pattern.weight;
    matched.push(pattern.term);
    break;
  }

  return {
    score: Math.min(score, MAX_HANDLE_SIGNAL),
    matched
  };
};

const scoreProfileStatic = (source = {}) => {
  const handle = normalizeHandle(source.identifier);
  const displayName = String(source.display_name || '').trim();
  const biography = String(source.biography || source.bio || '').trim();
  const userLocation = String(source.user_location || source.location || '').trim();
  const category = String(source.category || '').toLowerCase().trim();

  // Score display name / bio / location only — handle is scored separately to avoid double-counting.
  const profileText = scoreRelevance({
    text: [displayName, biography].filter(Boolean).join(' '),
    user_location: userLocation
  });

  const handleText = scoreHandlePatterns(handle);

  let score = Math.max(profileText.score, handleText.score);
  if (profileText.score > 0 && handleText.score > 0) {
    score = Math.min(100, score + DUAL_SOURCE_BUMP);
  }

  if (
    score >= CATEGORY_BOOST_MIN_STATIC &&
    CATEGORY_BOOST_CATEGORIES.has(category)
  ) {
    score += CATEGORY_BOOST;
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const matchedTerms = [...new Set([
    ...(profileText.matched_terms || []),
    ...handleText.matched
  ])].slice(0, 10);

  const reasonParts = [];
  if (profileText.matched_terms?.length) {
    reasonParts.push(`profile: ${profileText.matched_terms.slice(0, 3).join(', ')}`);
  }
  if (handleText.matched.length) {
    reasonParts.push(`handle: ${handleText.matched.join(', ')}`);
  }
  if (
    score >= CATEGORY_BOOST_MIN_STATIC &&
    CATEGORY_BOOST_CATEGORIES.has(category)
  ) {
    reasonParts.push(`category: ${category}`);
  }
  if (!reasonParts.length) reasonParts.push('no Telangana signal');

  return {
    score,
    static_score: score,
    profile_text_score: profileText.score,
    handle_score: handleText.score,
    reason: reasonParts.join('; '),
    matched_terms: matchedTerms,
    classified_at: new Date()
  };
};

const blendProfileScore = (staticScore, contentAvg, qualifyingCount) => {
  return describeBlend(staticScore, contentAvg, qualifyingCount).score;
};

const describeBlend = (staticScore, contentAvg, qualifyingCount) => {
  const static = Number(staticScore) || 0;
  const avg = Number(contentAvg) || 0;
  const count = Number(qualifyingCount) || 0;

  if (count >= 30) {
    return {
      score: Math.round(0.2 * static + 0.8 * avg),
      static_weight: 20,
      content_weight: 80,
      blend_mode: 'posts_dominant'
    };
  }
  if (count >= 10) {
    return {
      score: Math.round(0.3 * static + 0.7 * avg),
      static_weight: 30,
      content_weight: 70,
      blend_mode: 'posts_heavy'
    };
  }
  if (count >= 5) {
    return {
      score: Math.round(0.35 * static + 0.65 * avg),
      static_weight: 35,
      content_weight: 65,
      blend_mode: 'posts_heavy'
    };
  }
  if (count >= 1) {
    return {
      score: Math.round(0.55 * static + 0.45 * avg),
      static_weight: 55,
      content_weight: 45,
      blend_mode: 'balanced'
    };
  }
  return {
    score: static,
    static_weight: 100,
    content_weight: 0,
    blend_mode: 'profile_only'
  };
};

const confidenceFromCount = (qualifyingCount) => {
  const count = Number(qualifyingCount) || 0;
  if (count >= 5) return 'high';
  if (count >= 1) return 'medium';
  return 'low';
};

const priorityFromScore = (score) => {
  if (score > 80) return 'high';
  if (score >= 60) return 'medium';
  return 'hidden';
};

module.exports = {
  scoreProfileStatic,
  blendProfileScore,
  describeBlend,
  confidenceFromCount,
  priorityFromScore,
  normalizeHandle
};
