/**
 * Andhra Pradesh relevance signals for catalog profile scoring.
 * Deterministic / no network — safe to run on every list request.
 */

const LOCATION_KEYWORDS = [
  { term: 'andhra pradesh', weight: 50 },
  { term: 'andhra', weight: 35 },
  { term: 'visakhapatnam', weight: 45 },
  { term: 'vizag', weight: 45 },
  { term: 'vijayawada', weight: 45 },
  { term: 'guntur', weight: 40 },
  { term: 'tirupati', weight: 45 },
  { term: 'tirumala', weight: 42 },
  { term: 'nellore', weight: 38 },
  { term: 'kurnool', weight: 38 },
  { term: 'rajahmundry', weight: 38 },
  { term: 'kakinada', weight: 38 },
  { term: 'ongole', weight: 35 },
  { term: 'anantapur', weight: 35 },
  { term: 'kadapa', weight: 35 },
  { term: 'cuddapah', weight: 35 },
  { term: 'srikakulam', weight: 32 },
  { term: 'vizianagaram', weight: 32 },
  { term: 'eluru', weight: 32 },
  { term: 'machilipatnam', weight: 28 },
  { term: 'amaravati', weight: 40 },
  { term: 'amravati', weight: 35 },
  { term: 'appolice', weight: 45 },
  { term: 'ap police', weight: 45 },
  { term: 'andhra police', weight: 42 },
  { term: 'ఆంధ్రప్రదేశ్', weight: 50 },
  { term: 'విశాఖపట్నం', weight: 45 },
  { term: 'విజయవాడ', weight: 45 },
  { term: 'తిరుపతి', weight: 45 },
  { term: 'గుంటూరు', weight: 40 },
];

const CONTEXT_KEYWORDS = [
  { term: 'telugu', weight: 25 },
  { term: 'తెలుగు', weight: 28 },
  { term: 'sankranti', weight: 18 },
  { term: 'ugadi', weight: 18 },
  { term: 'సంక్రాంతి', weight: 18 },
  { term: 'ఉగాది', weight: 18 },
  { term: 'cyclone', weight: 12 },
  { term: 'bay of bengal', weight: 14 },
  { term: 'godavari', weight: 16 },
  { term: 'krishna river', weight: 14 },
];

const HANDLE_PATTERNS = [
  { term: 'andhra', weight: 40 },
  { term: 'vizag', weight: 40 },
  { term: 'vijayawada', weight: 40 },
  { term: 'tirupati', weight: 40 },
  { term: 'guntur', weight: 35 },
  { term: 'nellore', weight: 32 },
  { term: 'appolice', weight: 45 },
  { term: 'apnews', weight: 30 },
  { term: 'telugu', weight: 35 },
  { term: 'tv9', weight: 20 },
  { term: 'sakshi', weight: 18 },
  { term: 'eenadu', weight: 18 },
];

const HANDLE_PREFIX_PATTERNS = [
  { re: /^ap[_\-]?police/i, term: 'appolice', weight: 45 },
  { re: /^vizag/i, term: 'vizag', weight: 38 },
  { re: /^vijay/i, term: 'vijayawada', weight: 30 },
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildMatcher = (terms) =>
  [...terms]
    .sort((a, b) => b.term.length - a.term.length)
    .map((entry) => ({
      ...entry,
      regex: new RegExp(`(^|[^a-zA-Z0-9_])(${escapeRegex(entry.term)})(?=[^a-zA-Z0-9_]|$)`, 'i'),
    }));

const LOCATION_MATCHERS = buildMatcher(LOCATION_KEYWORDS);
const CONTEXT_MATCHERS = buildMatcher(CONTEXT_KEYWORDS);

const normalizeHandle = (value) =>
  String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\//i, '')
    .toLowerCase();

const scoreBlob = (text) => {
  const blob = String(text || '').trim();
  if (!blob) {
    return { score: 0, matched_terms: [] };
  }

  let score = 0;
  const matched = [];

  for (const m of LOCATION_MATCHERS) {
    if (m.regex.test(blob)) {
      score += m.weight;
      matched.push(m.term);
      if (matched.length >= 5) break;
    }
  }
  for (const m of CONTEXT_MATCHERS) {
    if (m.regex.test(blob)) {
      score += m.weight;
      matched.push(m.term);
      if (matched.length >= 8) break;
    }
  }

  if (/[ఀ-౿]/.test(blob) && matched.length) score += 10;

  return {
    score: Math.min(100, score),
    matched_terms: [...new Set(matched)].slice(0, 10),
  };
};

const scoreHandlePatterns = (handle) => {
  const normalized = normalizeHandle(handle);
  if (!normalized) return { score: 0, matched: [] };

  let score = 0;
  const matched = [];

  for (const pattern of HANDLE_PATTERNS) {
    if (matched.length >= 2) break;
    if (!normalized.includes(pattern.term.toLowerCase())) continue;
    score += pattern.weight;
    matched.push(pattern.term);
  }

  for (const pattern of HANDLE_PREFIX_PATTERNS) {
    if (matched.includes(pattern.term)) continue;
    if (!pattern.re.test(normalized)) continue;
    score += pattern.weight;
    matched.push(pattern.term);
    break;
  }

  return { score: Math.min(70, score), matched };
};

const describeBlend = (staticScore, contentAvg, qualifyingCount) => {
  const staticVal = Number(staticScore) || 0;
  const avg = Number(contentAvg) || 0;
  const count = Number(qualifyingCount) || 0;

  if (count >= 30) {
    return { score: Math.round(0.2 * staticVal + 0.8 * avg), static_weight: 20, content_weight: 80, blend_mode: 'posts_dominant' };
  }
  if (count >= 10) {
    return { score: Math.round(0.3 * staticVal + 0.7 * avg), static_weight: 30, content_weight: 70, blend_mode: 'posts_heavy' };
  }
  if (count >= 5) {
    return { score: Math.round(0.35 * staticVal + 0.65 * avg), static_weight: 35, content_weight: 65, blend_mode: 'posts_heavy' };
  }
  if (count >= 1) {
    return { score: Math.round(0.55 * staticVal + 0.45 * avg), static_weight: 55, content_weight: 45, blend_mode: 'balanced' };
  }
  return { score: staticVal, static_weight: 100, content_weight: 0, blend_mode: 'profile_only' };
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

const scoreProfileStatic = ({ handle, display_name, biography, notes } = {}) => {
  const profileText = scoreBlob([display_name, biography, notes].filter(Boolean).join(' '));
  const handleText = scoreHandlePatterns(handle);

  let score = Math.max(profileText.score, handleText.score);
  if (profileText.score > 0 && handleText.score > 0) {
    score = Math.min(100, score + 5);
  }

  const matched_terms = [...new Set([
    ...(profileText.matched_terms || []),
    ...(handleText.matched || []),
  ])].slice(0, 10);

  return {
    score,
    profile_text_score: profileText.score,
    handle_score: handleText.score,
    matched_terms,
    reason: matched_terms.length
      ? `matched: ${matched_terms.slice(0, 4).join(', ')}`
      : 'no Andhra Pradesh signal',
  };
};

const scorePostText = (text) => {
  const scored = scoreBlob(text);
  return {
    score: scored.score,
    priority: priorityFromScore(scored.score),
    matched_terms: scored.matched_terms,
  };
};

module.exports = {
  scoreProfileStatic,
  scorePostText,
  describeBlend,
  confidenceFromCount,
  priorityFromScore,
  normalizeHandle,
};
