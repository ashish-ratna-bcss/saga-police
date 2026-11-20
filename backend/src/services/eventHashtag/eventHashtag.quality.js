/**
 * Quality rules for event keyword/hashtag suggestions.
 * Rejects sentence fragments from descriptions; prefers short search-ready terms.
 */

const { wordsOf, isAcronym, eventTextWords } = require('../../modules/events/event.keywords.service');

/** Trailing/leading words that mark an incomplete phrase cut from a sentence. */
const FRAGMENT_EDGE = new Set(
  `a an the and or of to for in on at by with from as is are was were be been being
   this that these those it its into over under about after before while when where
   who whom which what how has have had do does did will would can could should may
   might must also just than then so such very more most other into onto across
   rocked allegations large scale especially especially conducted during amid amid`
    .split(/\s+/)
    .filter(Boolean)
);

const FRAGMENT_VERBS = new Set(['rocked', 'alleging', 'alleged', 'claimed', 'saying', 'according']);

/** Soft filler words that make “person + filler” keywords weak for monitoring search. */
const WEAK_META = new Set(
  `details detail update updates news report reports incident incidents information
   info latest today breaking coverage story overview summary status development
   developments regarding related about caseupdate casedetails`
    .split(/\s+/)
    .filter(Boolean)
);

/** Strong topic words that can rescue a phrase even if it also has meta. */
const STRONG_TOPIC = new Set(
  `death suicide murdered murder killed killing leak leaks protest bandh rally
   resign resignation scam controversy activist rights investigation arrest
   FIR case FIR`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
);

const normalize = (t) => String(t || '').trim().replace(/\s+/g, ' ');

const stripHash = (t) => normalize(t).replace(/^#+/, '');

/**
 * Weak / low-value suggestions to drop (generic fillers, age scraps, bloated tags).
 * e.g. "nisha bhagat case details", "nisha bhagat incident", "#…लगभग38वर्ष"
 */
const isWeakSearchTerm = (raw) => {
  const term = stripHash(raw);
  if (!term) return true;
  const lower = term.toLowerCase();
  const ws = wordsOf(term);
  const isTag = String(raw || '').trim().startsWith('#');

  // Age / “around 38 years” scraps (any script).
  if (
    /\b(around|aged?|yrs?|years?)\b/i.test(term) ||
    /लगभग|वर्ष|साल|उम्र/.test(term) ||
    (isTag && /\d{2}/.test(term) && /(year|yrs?|वर्ष|साल|लगभग|around|age)/i.test(term))
  ) {
    return true;
  }

  // Bloated glued hashtags (usually description mashed together).
  if (isTag && stripHash(term).length > 32) return true;

  if (!ws.length) return true;

  // Ends with soft meta: "… case details", "… death news", "… incident"
  const last = ws[ws.length - 1];
  const secondLast = ws.length >= 2 ? ws[ws.length - 2] : '';
  if (WEAK_META.has(last)) return true;
  if (secondLast === 'case' && WEAK_META.has(last)) return true;
  // bare "… case" / "… case jharkhand" without a stronger topic word
  if (ws.includes('case')) {
    const strongElse = ws.filter((w) => STRONG_TOPIC.has(w) && w !== 'case');
    if (!strongElse.length) return true;
  }

  if (ws.every((w) => WEAK_META.has(w) || w === 'case')) return true;

  return false;
};

/** True when term looks like a cut n-gram from prose (not a search phrase). */
const isSentenceFragment = (raw) => {
  const term = stripHash(raw);
  if (!term || /[^\p{Script=Latin}\p{N}\s&#\-./]/u.test(term) && !/[A-Za-z]/.test(term)) {
    // Non-Latin (Hindi etc.) — not judged as English sentence fragments.
    return false;
  }
  const ws = wordsOf(term);
  if (!ws.length) return true;
  if (ws.length === 1) return false;

  const first = ws[0];
  const last = ws[ws.length - 1];
  if (FRAGMENT_EDGE.has(first) || FRAGMENT_EDGE.has(last)) return true;
  if (FRAGMENT_VERBS.has(first)) return true;
  // "paper leaks and large" / "allegations of paper"
  if (ws.length >= 3 && FRAGMENT_EDGE.has(ws[ws.length - 2])) return true;
  // Long prose windows (>4 content words) are almost always description slices.
  if (ws.length > 4 && !term.startsWith('#')) return true;
  // Ends with conjunction / preposition leftovers after punctuation strip
  if (/\b(and|of|by|to|for|with|the|a|an)$/i.test(term)) return true;
  if (/^(and|of|by|to|for|with|the|a|an|rocked|allegations)\b/i.test(term)) return true;
  return false;
};

/** Contiguous multi-word slice copied from event description. */
const isRawDescriptionSlice = (raw, ev) => {
  const term = stripHash(raw).toLowerCase();
  const ws = wordsOf(term);
  if (ws.length < 3) return false;
  const desc = ` ${(ev.descOrder || []).join(' ')} `;
  return desc.includes(` ${ws.join(' ')} `);
};

/**
 * Extract search entities from event fields (acronyms, location, title tokens).
 * No geographic word lists — only structural signals from the form text.
 */
const extractEntities = (eventObj = {}) => {
  const name = String(eventObj.event || eventObj.name || '').trim();
  const location = String(eventObj.location || '').trim();
  const description = String(eventObj.description || '').trim();
  const blob = `${name} ${location} ${description}`;

  const acronyms = [
    ...new Set(
      (blob.match(/\b[A-Z]{2,6}(?:-[A-Z0-9]{1,6})?\b/g) || [])
        .map((a) => a.trim())
        .filter((a) => a.length >= 2)
    ),
  ];

  const titleWords = wordsOf(name).filter((w) => w.length >= 4 && !FRAGMENT_EDGE.has(w));
  const locWords = wordsOf(location).filter((w) => w.length >= 3);

  const topicHints = [];
  const lower = blob.toLowerCase();
  if (/\bleak/.test(lower)) topicHints.push('paper leak');
  if (/\brecruit/.test(lower)) topicHints.push('recruitment');
  if (/\bexam/.test(lower)) topicHints.push('exam');
  if (/\bprotest|bandh|rally|agitat/.test(lower)) topicHints.push('protest');
  if (/\bresign/.test(lower)) topicHints.push('resignation');
  if (/\bcontrovers/.test(lower)) topicHints.push('controversy');

  return { acronyms, titleWords, locWords, location, name, topicHints };
};

/** Synthesize short, search-ready terms from entities (source: derived). */
const deriveEntityTerms = (eventObj = {}) => {
  const { acronyms, locWords, location, topicHints } = extractEntities(eventObj);
  const locLabel = location || locWords[0] || '';
  const locCompact = locWords.map((w) => w.replace(/^\w/, (c) => c.toUpperCase())).join('');
  const keywords = [];
  const hashtags = [];

  for (const ac of acronyms.slice(0, 8)) {
    keywords.push(ac);
    hashtags.push(`#${ac.replace(/[^A-Za-z0-9]/g, '')}`);
    if (locLabel) {
      keywords.push(`${ac} ${locLabel}`);
      const glued = `${ac.replace(/[^A-Za-z0-9]/g, '')}${locCompact || locLabel.replace(/\s+/g, '')}`;
      if (glued.length >= 4 && glued.length <= 40) hashtags.push(`#${glued}`);
    }
    for (const hint of topicHints.slice(0, 3)) {
      keywords.push(`${ac} ${hint}`);
    }
  }

  if (locLabel && topicHints.length) {
    for (const hint of topicHints.slice(0, 2)) {
      keywords.push(`${locLabel} ${hint}`);
    }
  }

  // Compact title phrase (2–3 informative words), not the whole title dump.
  const titleWs = wordsOf(eventObj.event || eventObj.name || '').filter((w) => !FRAGMENT_EDGE.has(w));
  if (titleWs.length >= 2 && titleWs.length <= 4) {
    keywords.push(titleWs.join(' '));
  }

  const dedupe = (list) => {
    const seen = new Set();
    return list
      .map(normalize)
      .filter(Boolean)
      .filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  };

  return {
    keywords: dedupe(keywords).map((term) => ({ term, source: 'derived', score: 7 })),
    hashtags: dedupe(hashtags).map((term) => ({ term, source: 'derived', score: 7 })),
  };
};

/**
 * Classify provenance relative to the event form text.
 * @returns {'event'|'web'|'derived'|'news'|'social'}
 */
const classifySource = (raw, ev, hint = null) => {
  if (hint) return hint;
  const term = stripHash(raw).toLowerCase();
  const ws = wordsOf(term);
  if (!ws.length) return 'event';

  const title = ` ${(ev.titleOrder || []).join(' ')} `;
  const loc = ` ${[...(ev.location || [])].join(' ')} `;
  const desc = ` ${(ev.descOrder || []).join(' ')} `;
  const joined = ws.join(' ');

  if (title.includes(` ${joined} `) || loc.includes(` ${joined} `)) return 'event';
  if (ws.length <= 2 && ws.every((w) => ev.title.has(w) || ev.location.has(w))) return 'event';
  if (desc.includes(` ${joined} `)) return 'event';
  // Strong entity overlap but not a literal slice → likely web/social hit or derived.
  const entityHits = ws.filter((w) => ev.title.has(w) || ev.location.has(w) || isAcronym(w.toUpperCase())).length;
  if (entityHits > 0 && ws.length <= 3) return 'web';
  return 'web';
};

/**
 * Quality score for ranking. Higher = better search term.
 */
const qualityScore = (raw, ev, generic = new Set(), source = 'web') => {
  const t = normalize(raw);
  const bare = stripHash(t);
  const ws = wordsOf(bare);
  let score = 0;

  if (t.startsWith('#')) score += 1.5;
  if (isWeakSearchTerm(t) || isWeakSearchTerm(raw)) score -= 10;
  if (isSentenceFragment(t)) score -= 8;
  if (isRawDescriptionSlice(t, ev)) score -= 6;

  if (ws.length === 1) {
    if (isAcronym(bare) || isAcronym(bare.toUpperCase())) score += 5;
    else if (ev.location.has(ws[0])) score += 2;
    else if (ev.title.has(ws[0])) score += 3;
    else score += 1;
  } else if (ws.length === 2 || ws.length === 3) {
    score += 4;
    const overlap = ws.filter((w) => ev.title.has(w) || ev.location.has(w) || ev.desc.has(w)).length;
    score += overlap * 1.5;
  } else {
    score -= (ws.length - 3) * 1.5;
  }

  // Acronym + location compounds
  if (ws.some((w) => isAcronym(w.toUpperCase()) || /^[a-z]{2,6}$/i.test(w) && ev.title.has(w)) &&
      ws.some((w) => ev.location.has(w))) {
    score += 4;
  }

  // Demote location-only tags when we already have richer terms
  if (ws.length === 1 && ev.location.has(ws[0]) && !t.startsWith('#')) score -= 1;

  if (source === 'derived') score += 2;
  if (source === 'news' || source === 'social') score += 3;
  if (source === 'web') score += 1;

  if (generic?.has?.(ws[0]) && ws.length === 1) score -= 2;

  // Prefer compact length
  if (bare.length > 48) score -= 3;
  if (bare.length >= 8 && bare.length <= 28) score += 1;

  return score;
};

/** Keep external terms that still touch event entities/location (relaxed curator). */
const entityAnchored = (raw, ev) => {
  const ws = wordsOf(stripHash(raw));
  if (!ws.length) return false;
  if (ws.some((w) => ev.title.has(w) || ev.location.has(w))) return true;
  // Acronym appearing inside a hashtag glue: #JPSCJharkhand
  const glued = ws.join('');
  const titleBits = [...ev.title].filter((w) => w.length >= 2);
  const locBits = [...ev.location].filter((w) => w.length >= 3);
  if (titleBits.some((t) => glued.includes(t)) && locBits.some((l) => glued.includes(l))) return true;
  if (titleBits.some((t) => t.length >= 3 && glued.includes(t))) return true;
  return false;
};

module.exports = {
  FRAGMENT_EDGE,
  WEAK_META,
  normalize,
  stripHash,
  isWeakSearchTerm,
  isSentenceFragment,
  isRawDescriptionSlice,
  extractEntities,
  deriveEntityTerms,
  classifySource,
  qualityScore,
  entityAnchored,
  eventTextWords,
};
