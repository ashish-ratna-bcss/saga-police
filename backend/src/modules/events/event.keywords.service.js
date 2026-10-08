const cfg = require('./event.config');
const { getGenericTokens } = require('./event.corpus.service');

/**
 * Language-agnostic, data-driven keyword quality rules. No word lists:
 * "generic" comes from the tenant's own corpus (event.corpus.service) and the
 * event's own name/location/description.
 */

const wordsOf = (term) =>
  String(term || '')
    .replace(/^[#@]/, '')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);

const kwText = (k) => (typeof k === 'string' ? k : k?.keyword || '');

const eventTextWords = (event) => ({
  title: new Set(wordsOf(event?.name).filter((w) => w.length >= 3)),
  location: new Set(wordsOf(event?.location).filter((w) => w.length >= 3)),
  desc: new Set(wordsOf(event?.description).filter((w) => w.length >= 4)),
  titleOrder: wordsOf(event?.name),
  descOrder: wordsOf(event?.description),
});

const isAcronym = (raw) => /^[\p{Lu}\p{N}]{2,6}$/u.test(String(raw).trim()) && /\p{Lu}/u.test(raw);

/** Why a keyword is unusable, or null when it is fine. */
const rejectReason = (raw, { generic, ev }) => {
  const term = String(raw || '').trim();
  if (term.replace(/^[#@]/, '').length < 2) return 'too_short';
  const isTag = term.startsWith('#') || term.startsWith('@');
  const ws = wordsOf(term);
  if (!ws.length) return 'no_words';
  if (ws.length > 6) return 'too_long_fragment';

  if (!isTag) {
    // dates / bylines: short pure-number tokens inside a phrase ("sep 21 pti")
    const shortNums = ws.filter((w) => /^\d{1,2}$/.test(w)).length;
    const nums = ws.filter((w) => /^\d+$/.test(w)).length;
    if (ws.length >= 2 && (nums * 2 >= ws.length || (ws.length >= 3 && shortNums >= 1))) return 'date_or_number_fragment';
  }

  const all = [...ws];
  const known = new Set([...ev.title, ...ev.location, ...ev.desc]);
  // Words the event itself uses are never "generic" for that event.
  const isGeneric = (w) => generic.has(w) && !known.has(w);
  const isEdge = (w) => generic.edge?.has(w) && !known.has(w);
  if (generic.size) {
    if (!isTag && ws.length >= 2) {
      if (isEdge(ws[0]) || isEdge(ws[ws.length - 1])) return 'fragment_edge_word';
    }
    // every word is common in this tenant's posts and none comes from the event itself
    if (all.every(isGeneric)) return ws.length === 1 ? 'generic_word' : 'all_words_generic';
    if (!isTag && ws.length === 1 && isGeneric(ws[0]) && !isAcronym(term)) return 'generic_word';
  } else if (!isTag && ws.length === 1 && !known.has(ws[0]) && !isAcronym(term) && ws[0].length < 5) {
    return 'unanchored_single_word';
  }
  return null;
};

const anchored = (raw, ev) => {
  const ws = wordsOf(raw);
  const lower = String(raw).toLowerCase().replace(/^[#@]/, '');
  const known = [...ev.title, ...ev.location, ...ev.desc];
  return (
    ws.some((w) => ev.title.has(w) || ev.location.has(w) || ev.desc.has(w)) ||
    (String(raw).startsWith('#') && known.some((k) => k.length >= 5 && lower.includes(k)))
  );
};

/**
 * How strongly a keyword is supported by the event's own text (name,
 * location, description). Used to rank when a list is over the cap.
 */
const priority = (raw, ev, generic = new Set()) => {
  const t = String(raw).trim();
  const ws = wordsOf(t);
  const known = new Set([...ev.title, ...ev.location, ...ev.desc]);
  const glued = (arr) => arr.join('');
  const eventWords = [...(ev.titleOrder || []), ...(ev.descOrder || [])];
  const eventText = ` ${eventWords.join(' ')} `;
  let score = 0;
  // Different script from the event text: cannot overlap lexically, so a deliberate translation/variant.
  if (/[A-Za-z]/.test(`${[...ev.title].join('')}${[...ev.desc].join('')}`) && !/[A-Za-z]/.test(t)) score += 5;
  if (t.startsWith('#')) {
    const g = ws.join('');
    if (glued(eventWords).includes(g)) score += 6;
    const hits = [...known].filter((k) => k.length >= 3 && g.includes(k)).length;
    score += Math.min(hits, 4) * 1.5 + 1;
  } else {
    if (eventText.includes(` ${ws.join(' ')} `)) score += 6;
    const overlap = ws.filter((w) => known.has(w) && !generic.has(w)).length / ws.length;
    score += overlap * 4;
    if (isAcronym(t) && ev.title.has(ws[0])) score += 3;
    if (ws.length >= 2) score += 1;
    // function words in the middle of a phrase ("errors in school") signal a sentence fragment
    score -= ws.slice(1, -1).filter((w) => generic.edge?.has(w) && !known.has(w)).length * 2;
  }
  return score;
};

/**
 * Clean a keyword list for an event. Returns the kept keyword objects plus
 * what was removed and why, so callers can surface it to the user.
 */
const sanitizeEventKeywords = async (db, event, keywords) => {
  const generic = await getGenericTokens(db);
  const ev = eventTextWords(event);
  const removed = [];
  const warnings = [];
  const seen = new Set();
  let kept = [];

  for (const item of Array.isArray(keywords) ? keywords : []) {
    const term = kwText(item).replace(/\s+/g, ' ').trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) {
      removed.push({ keyword: term, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
    const reason = rejectReason(term, { generic, ev });
    if (reason) {
      removed.push({ keyword: term, reason });
      continue;
    }
    kept.push(typeof item === 'string' ? { keyword: term, language: 'all' } : { ...item, keyword: term });
  }

  if (kept.length > cfg.maxKeywords) {
    const ranked = kept
      .map((k, i) => ({ k, i, p: priority(k.keyword, ev, generic) }))
      .sort((a, b) => b.p - a.p || a.i - b.i);
    const keepSet = new Set(ranked.slice(0, cfg.maxKeywords).map((r) => r.i));
    kept.forEach((k, i) => {
      if (!keepSet.has(i)) removed.push({ keyword: k.keyword, reason: 'over_keyword_cap' });
    });
    kept = kept.filter((_, i) => keepSet.has(i));
  }

  const unanchored = kept.filter((k) => !anchored(k.keyword, ev)).map((k) => k.keyword);
  if (unanchored.length) {
    warnings.push(`Not tied to the event name, location or description: ${unanchored.slice(0, 8).join(', ')}`);
  }
  if (!generic.size) warnings.push('Not enough tenant posts yet to learn common words; structural checks only.');
  return { keywords: kept, removed, warnings };
};

/** Existing events (other than `selfId`) that look like duplicates of this one. */
const findOverlappingEvents = async (prisma, event, selfId = null) => {
  const others = await prisma.social_media_events.findMany({
    where: selfId ? { id: { not: Number(selfId) } } : {},
    select: { id: true, name: true, location: true, start_date: true, end_date: true, keywords: true, monitoring_status: true },
  });
  const tokens = (list) => new Set((list || []).flatMap((k) => wordsOf(kwText(k))).filter((w) => w.length >= 3));
  const mine = tokens(event.keywords?.length ? event.keywords : [event.name]);
  const sameDay = (a, b) => a && b && String(a).slice(0, 10) === String(b).slice(0, 10);
  const out = [];
  for (const o of others) {
    const kwRaw = typeof o.keywords === 'string' ? JSON.parse(o.keywords) : o.keywords;
    const theirs = tokens(kwRaw?.length ? kwRaw : [o.name]);
    if (!mine.size || !theirs.size) continue;
    let shared = 0;
    for (const t of mine) if (theirs.has(t)) shared += 1;
    const overlap = shared / Math.min(mine.size, theirs.size);
    const startA = event.start_date ? new Date(event.start_date).getTime() : null;
    const endA = event.end_date ? new Date(event.end_date).getTime() : null;
    const startB = o.start_date ? new Date(o.start_date).getTime() : null;
    const endB = o.end_date ? new Date(o.end_date).getTime() : null;
    const datesOverlap =
      (startA == null && endA == null) ||
      (startB == null && endB == null) ||
      ((endA == null || startB == null || startB <= endA) && (endB == null || startA == null || startA <= endB));
    if (overlap >= cfg.duplicateOverlap && datesOverlap) {
      out.push({ id: String(o.id), name: o.name, overlap: Math.round(overlap * 100), monitoring_status: o.monitoring_status });
    }
  }
  return out;
};

module.exports = { sanitizeEventKeywords, findOverlappingEvents, rejectReason, wordsOf, eventTextWords, anchored, isAcronym };
