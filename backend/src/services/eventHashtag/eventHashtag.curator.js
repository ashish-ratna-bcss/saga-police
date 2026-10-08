const { getGenericTokens } = require('../../modules/events/event.corpus.service');
const { rejectReason, wordsOf, eventTextWords, anchored } = require('../../modules/events/event.keywords.service');

/**
 * Deterministic (no LLM) curation of generated keywords/hashtags.
 * Generic words are learned from the tenant's own posts, so there are no
 * word lists here. A term is kept when it passes the shared keyword rules and
 * is tied to the event's own text, directly or through a name that appears in
 * an already-kept phrase.
 */
const curateEventTerms = async (db, eventObj, candidateTerms = {}) => {
  const rawHashtags = Array.isArray(candidateTerms.hashtags) ? candidateTerms.hashtags : [];
  const rawKeywords = Array.isArray(candidateTerms.keywords) ? candidateTerms.keywords : [];
  const generic = await getGenericTokens(db);
  const ev = eventTextWords({
    name: eventObj?.event || eventObj?.name,
    location: eventObj?.location,
    description: eventObj?.description,
  });
  const anchorWords = new Set([...ev.title, ...ev.location, ...ev.desc]);

  const accepted = [];
  const pending = [];
  for (const term of [...rawKeywords, ...rawHashtags].map((t) => String(t || '').trim()).filter(Boolean)) {
    if (rejectReason(term, { generic, ev })) continue;
    if (anchored(term, ev)) accepted.push(term);
    else pending.push(term);
  }

  // Names that sit next to event words in kept multi-word phrases become anchors too.
  const derived = new Set();
  for (const t of accepted) {
    const ws = wordsOf(t);
    if (ws.length >= 2) ws.filter((w) => w.length >= 5 && !anchorWords.has(w) && !generic.has(w)).forEach((w) => derived.add(w));
  }
  for (const t of pending) {
    const ws = wordsOf(t);
    const lower = t.toLowerCase();
    const tagOk = t.startsWith('#') && [...derived].some((d) => lower.includes(d));
    const phraseOk = ws.length >= 2 && ws.some((w) => derived.has(w)) && ws.every((w) => derived.has(w) || anchorWords.has(w) || generic.has(w) || w.length < 4);
    if (tagOk || phraseOk) accepted.push(t);
  }

  const keep = new Set(accepted.map((t) => t.toLowerCase()));
  const dedupe = (list) => {
    const seen = new Set();
    return list
      .map((t) => String(t || '').trim())
      .filter((t) => {
        const k = t.toLowerCase();
        if (!keep.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  };
  return { hashtags: dedupe(rawHashtags), keywords: dedupe(rawKeywords) };
};

module.exports = { curateEventTerms };
