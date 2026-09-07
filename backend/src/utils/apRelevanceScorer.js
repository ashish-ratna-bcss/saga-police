/**
 * Catalog-keyword relevance scoring for social profiles.
 * Keywords are supplied by the caller (from Alerts → Manage keywords) —
 * nothing is hard-coded here.
 */

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Longer / more specific catalog phrases score higher. */
const weightForKeyword = (keyword) => {
  const len = String(keyword || '').trim().length;
  if (len >= 18) return 48;
  if (len >= 12) return 40;
  if (len >= 8) return 32;
  if (len >= 5) return 22;
  if (len >= 3) return 14;
  return 8;
};

/**
 * @param {string[]} keywords - live catalog keyword strings
 * @returns {{ term: string, weight: number, regex: RegExp }[]}
 */
const buildKeywordMatchers = (keywords = []) => {
  const seen = new Set();
  const entries = [];

  for (const raw of keywords) {
    const term = String(raw || '').trim();
    if (!term || term.length < 2) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      term,
      weight: weightForKeyword(term),
      regex: new RegExp(`(^|[^a-zA-Z0-9_ఀ-౿])(${escapeRegex(term)})(?=[^a-zA-Z0-9_ఀ-౿]|$)`, 'i'),
    });
  }

  return entries.sort((a, b) => b.term.length - a.term.length);
};

const normalizeHandle = (value) =>
  String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\//i, '')
    .toLowerCase();

const scoreBlobAgainstMatchers = (text, matchers = []) => {
  const blob = String(text || '').trim();
  if (!blob || !matchers.length) {
    return { score: 0, matched_terms: [] };
  }

  let score = 0;
  const matched = [];

  for (const m of matchers) {
    if (matched.length >= 10) break;
    if (!m.regex.test(blob)) continue;
    score += m.weight;
    matched.push(m.term);
  }

  return {
    score: Math.min(100, score),
    matched_terms: matched,
  };
};

/**
 * Handle match — only full compacted keyword or ALL significant tokens.
 * Never score a multi-word keyword from a single shared token (e.g. "andhra").
 */
const scoreHandleAgainstMatchers = (handle, matchers = []) => {
  const normalized = normalizeHandle(handle).replace(/[^a-z0-9ఀ-౿]/g, '');
  if (!normalized || !matchers.length) return { score: 0, matched: [] };

  let score = 0;
  const matched = [];

  for (const m of matchers) {
    if (matched.length >= 3) break;
    const term = String(m.term || '').trim();
    if (!term) continue;

    const compact = term.toLowerCase().replace(/[^a-z0-9ఀ-౿]+/g, '');
    const tokens = term
      .toLowerCase()
      .split(/[^a-z0-9ఀ-౿]+/)
      .filter((t) => t.length >= 4);

    let hit = false;
    if (compact.length >= 4 && normalized.includes(compact)) {
      hit = true;
    } else if (tokens.length === 1 && normalized.includes(tokens[0])) {
      hit = true;
    } else if (tokens.length >= 2 && tokens.every((t) => normalized.includes(t))) {
      hit = true;
    }

    if (!hit) continue;
    score += Math.min(m.weight, 40);
    matched.push(m.term);
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

/** Any catalog keyword hit (≥14) counts as medium; strong multi-hit as high. */
const priorityFromScore = (score) => {
  if (score >= 50) return 'high';
  if (score >= 14) return 'medium';
  return 'hidden';
};

const scoreProfileStatic = ({ handle, display_name, biography, notes } = {}, matchers = []) => {
  const profileText = scoreBlobAgainstMatchers(
    [display_name, biography, notes].filter(Boolean).join(' '),
    matchers
  );
  const handleText = scoreHandleAgainstMatchers(handle, matchers);

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
      : 'no catalog keyword match',
  };
};

const scorePostText = (text, matchers = []) => {
  const scored = scoreBlobAgainstMatchers(text, matchers);
  return {
    score: scored.score,
    priority: priorityFromScore(scored.score),
    matched_terms: scored.matched_terms,
  };
};

module.exports = {
  buildKeywordMatchers,
  weightForKeyword,
  scoreProfileStatic,
  scorePostText,
  describeBlend,
  confidenceFromCount,
  priorityFromScore,
  normalizeHandle,
};
