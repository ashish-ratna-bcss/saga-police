const { getGenericTokens } = require('../../modules/events/event.corpus.service');
const {
  rejectReason,
  wordsOf,
  eventTextWords,
  anchored,
} = require('../../modules/events/event.keywords.service');
const {
  isSentenceFragment,
  isRawDescriptionSlice,
  isWeakSearchTerm,
  classifySource,
  qualityScore,
  entityAnchored,
  normalize,
  stripHash,
} = require('./eventHashtag.quality');
const { buildCandidateItems, enrichFromNews, uniqItems } = require('./eventHashtag.enrich');
const { llmRerankTerms } = require('./eventHashtag.rerank');

/**
 * Curate + enrich + optionally LLM-rerank generated keywords/hashtags.
 *
 * Sources allowed here (no BluGate):
 *   - Wigolo /event-terms candidates
 *   - Internal derived entity terms
 *   - Local tenant news_articles (DB only)
 *
 * Returns string lists (backward compatible) plus tagged `items` for the UI.
 */
const pureOtherScript = (term) => {
  const letters = String(term || '').match(/\p{L}/gu) || [];
  return letters.length > 0 && !letters.some((c) => /\p{Script=Latin}/u.test(c));
};

const toItem = (entry, ev, generic, sourceHint = null) => {
  const term = normalize(entry?.term || entry);
  if (!term) return null;
  const source = classifySource(term, ev, entry?.source || sourceHint);
  const score =
    Number(entry?.score) > 0
      ? Number(entry.score) + qualityScore(term, ev, generic, source) * 0.25
      : qualityScore(term, ev, generic, source);
  return { term, source, score };
};

const filterAndRank = (items, { generic, ev, acceptOtherScripts, kind, cap }) => {
  const accepted = [];
  for (const raw of items) {
    const item = toItem(raw, ev, generic, raw?.source);
    if (!item) continue;
    const term = item.term;

    if (isWeakSearchTerm(term) || isWeakSearchTerm(raw?.term || raw)) continue;
    if (isSentenceFragment(term)) continue;
    if (!term.startsWith('#') && isRawDescriptionSlice(term, ev)) continue;

    if (rejectReason(term, { generic, ev })) continue;
    // Derived can stay at lower margin; Wigolo/web must clear a higher bar.
    const minScore = item.source === 'derived' ? 1 : 3;
    if (item.score < minScore) continue;

    const okAnchor =
      anchored(term, ev) ||
      entityAnchored(term, ev) ||
      (acceptOtherScripts && pureOtherScript(term)) ||
      item.source === 'derived' ||
      item.source === 'news';

    if (!okAnchor) continue;
    accepted.push(item);
  }

  accepted.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const item of accepted) {
    const key = stripHash(item.term).toLowerCase();
    const redundant = kept.some((k) => {
      const other = stripHash(k.term).toLowerCase();
      if (other === key) return true;
      const aw = new Set(wordsOf(key));
      const bw = new Set(wordsOf(other));
      if (aw.size && bw.size && aw.size <= bw.size) {
        let subset = true;
        for (const w of aw) if (!bw.has(w)) subset = false;
        if (subset && aw.size < bw.size && item.score + 1.5 < k.score) return true;
      }
      return false;
    });
    if (!redundant) kept.push(item);
  }

  const hasCompound = kept.some(
    (k) => wordsOf(stripHash(k.term)).length >= 2 || /[A-Z]{2,}[A-Z][a-z]/.test(stripHash(k.term))
  );
  const filtered = kept.filter((k) => {
    if (!hasCompound || kind !== 'hashtag') return true;
    const ws = wordsOf(stripHash(k.term));
    if (ws.length === 1 && ev.location.has(ws[0]) && k.score < 6) return false;
    return true;
  });

  return filtered.slice(0, cap);
};

const curateEventTerms = async (
  db,
  eventObj,
  candidateTerms = {},
  { acceptOtherScripts = false, includeSocial = true, maxHashtags = 24, maxKeywords = 24 } = {}
) => {
  let generic = new Set();
  generic.edge = new Set();
  if (db) {
    try {
      generic = await getGenericTokens(db);
    } catch {
      generic = new Set();
      generic.edge = new Set();
    }
  }
  const ev = eventTextWords({
    name: eventObj?.event || eventObj?.name,
    location: eventObj?.location,
    description: eventObj?.description,
  });

  // Local DB only — never calls BluGate / external news APIs.
  let newsTerms = { keywords: [], hashtags: [] };
  if (db) {
    try {
      newsTerms = await enrichFromNews(db, eventObj);
    } catch {
      newsTerms = { keywords: [], hashtags: [] };
    }
  }

  const candidates = buildCandidateItems(candidateTerms, eventObj, newsTerms);

  // Tag Wigolo leftovers; keep derived/news as-is.
  // includeSocial only affects Wigolo upstream (passed by client); no BluGate here.
  const tagProvenance = (list) =>
    list.map((item) => {
      if (['derived', 'news'].includes(item.source)) return item;

      const source = classifySource(item.term, ev, item.source === 'web' ? 'web' : null);
      if (
        (source === 'web' || item.source === 'web') &&
        (anchored(item.term, ev) || isRawDescriptionSlice(item.term, ev))
      ) {
        return { ...item, source: 'event' };
      }
      // Wigolo web/social corpus terms that still pass filters.
      if (includeSocial && source === 'web') return { ...item, source: 'web' };
      return { ...item, source: source === 'web' ? 'web' : source };
    });

  const rankedKeywords = filterAndRank(tagProvenance(candidates.keywords), {
    generic,
    ev,
    acceptOtherScripts,
    kind: 'keyword',
    cap: maxKeywords * 3,
  });
  const rankedHashtags = filterAndRank(tagProvenance(candidates.hashtags), {
    generic,
    ev,
    acceptOtherScripts,
    kind: 'hashtag',
    cap: maxHashtags * 3,
  });

  const splitPreferDerived = (list, cap) => {
    const derived = list.filter((i) => i.source === 'derived');
    const news = list.filter((i) => i.source === 'news' || i.source === 'web');
    const rest = list.filter((i) => !['derived', 'news', 'web'].includes(i.source));
    const out = [];
    const seen = new Set();
    const push = (arr) => {
      for (const item of arr) {
        const k = String(item.term || '').toLowerCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(item);
        if (out.length >= cap) break;
      }
    };
    push(derived);
    push(news);
    push(rest);
    return out;
  };

  let curated = {
    keywords: splitPreferDerived(rankedKeywords, maxKeywords),
    hashtags: splitPreferDerived(rankedHashtags, maxHashtags),
  };

  const reranked = await llmRerankTerms(eventObj, curated, { maxHashtags, maxKeywords });
  curated = {
    keywords: (reranked.keywords || []).slice(0, maxKeywords),
    hashtags: (reranked.hashtags || []).slice(0, maxHashtags),
  };

  if (!curated.keywords.length && !curated.hashtags.length) {
    const fallback = buildCandidateItems({ keywords: [], hashtags: [] }, eventObj, null);
    curated = {
      keywords: filterAndRank(fallback.keywords, {
        generic,
        ev,
        acceptOtherScripts: true,
        kind: 'keyword',
        cap: maxKeywords,
      }),
      hashtags: filterAndRank(fallback.hashtags, {
        generic,
        ev,
        acceptOtherScripts: true,
        kind: 'hashtag',
        cap: maxHashtags,
      }),
    };
  }

  const items = {
    keywords: uniqItems(curated.keywords),
    hashtags: uniqItems(curated.hashtags),
  };

  return {
    hashtags: items.hashtags.map((i) => i.term),
    keywords: items.keywords.map((i) => i.term),
    items,
    meta: {
      include_social: Boolean(includeSocial),
      news_enriched: Boolean(newsTerms.keywords?.length || newsTerms.hashtags?.length),
      llm_rerank: Boolean(reranked.used),
      sources_used: [...new Set([...items.keywords, ...items.hashtags].map((i) => i.source))],
    },
  };
};

module.exports = { curateEventTerms };
