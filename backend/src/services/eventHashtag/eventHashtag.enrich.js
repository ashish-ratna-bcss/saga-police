/**
 * Enrich event-term suggestions with derived entity terms and tenant news signals.
 */

const {
  deriveEntityTerms,
  extractEntities,
  normalize,
  stripHash,
} = require('./eventHashtag.quality');
const { wordsOf } = require('../../modules/events/event.keywords.service');

const HASHTAG_RE = /#[\p{L}\p{N}_]{2,40}/gu;

const uniqItems = (items) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const term = normalize(item?.term || item);
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) {
      // Prefer news/derived over plain wigolo leftovers when duplicates collide.
      const prev = out.find((x) => x.term.toLowerCase() === key);
      const rank = (s) =>
        ({ news: 4, derived: 3, web: 2, event: 1 }[s] || 0);
      if (prev && rank(item.source) > rank(prev.source)) {
        prev.source = item.source;
        prev.score = Math.max(Number(prev.score) || 0, Number(item.score) || 0);
        if (item.count) prev.count = item.count;
      }
      continue;
    }
    seen.add(key);
    out.push({
      term,
      source: item.source || 'derived',
      score: Number(item.score) || 0,
      ...(item.count ? { count: item.count } : {}),
    });
  }
  return out;
};

/**
 * Pull hashtags / short phrases from recent tenant news that mention event entities.
 * Soft-fails when news tables are empty or missing.
 */
const enrichFromNews = async (db, eventObj = {}) => {
  if (!db?.$queryRawUnsafe) return { keywords: [], hashtags: [] };

  const { acronyms, locWords, location, topicHints } = extractEntities(eventObj);
  const needles = [...acronyms, ...locWords.slice(0, 2), location, ...topicHints]
    .map((s) => String(s || '').trim())
    .filter((s) => s.length >= 3)
    .slice(0, 8);

  if (!needles.length) return { keywords: [], hashtags: [] };

  let rows = [];
  try {
    const patterns = needles.map((n) => `%${n.replace(/[%_]/g, '')}%`);
    rows = await db.$queryRawUnsafe(
      `SELECT title,
              COALESCE(summary, '') || ' ' || COALESCE(content, '') AS body
       FROM news_articles
       WHERE (
         ${patterns
           .map(
             (_, i) =>
               `(title ILIKE $${i + 1} OR summary ILIKE $${i + 1} OR content ILIKE $${i + 1})`
           )
           .join(' OR ')}
       )
       ORDER BY published_at DESC NULLS LAST
       LIMIT 40`,
      ...patterns
    );
  } catch {
    try {
      rows = await db.$queryRawUnsafe(
        `SELECT title, COALESCE(summary, '') AS body
         FROM news_articles
         ORDER BY published_at DESC NULLS LAST
         LIMIT 20`
      );
    } catch {
      return { keywords: [], hashtags: [] };
    }
  }

  const hashtags = [];
  const keywords = [];
  const entityLower = new Set(needles.map((n) => n.toLowerCase()));

  for (const row of rows || []) {
    const blob = `${row.title || ''} ${row.body || ''}`;
    const tags = blob.match(HASHTAG_RE) || [];
    for (const tag of tags.slice(0, 6)) {
      const bare = stripHash(tag).toLowerCase();
      if ([...entityLower].some((e) => bare.includes(e.replace(/\s+/g, '')) || bare.includes(e.split(/\s+/)[0]))) {
        hashtags.push({ term: tag.startsWith('#') ? tag : `#${tag}`, source: 'news', score: 8 });
      }
    }

    const title = normalize(row.title);
    if (!title) continue;
    const tw = wordsOf(title).filter((w) => w.length >= 3);
    if (tw.length >= 2 && tw.length <= 5) {
      const hits = tw.filter((w) => entityLower.has(w) || [...entityLower].some((e) => e.includes(w)));
      if (hits.length) {
        keywords.push({
          term: tw.slice(0, 4).join(' '),
          source: 'news',
          score: 6 + hits.length,
        });
      }
    }
  }

  return {
    keywords: uniqItems(keywords).slice(0, 15),
    hashtags: uniqItems(hashtags).slice(0, 15),
  };
};

/**
 * Merge Wigolo raw lists with derived + news enrichments into tagged items.
 */
const buildCandidateItems = (rawTerms = {}, eventObj = {}, newsTerms = null) => {
  const derived = deriveEntityTerms(eventObj);
  const news = newsTerms || { keywords: [], hashtags: [] };

  const fromList = (list, source) =>
    (Array.isArray(list) ? list : []).map((t) => ({
      term: normalize(t),
      source,
      score: 0,
    }));

  // Wigolo results → "web" (upstream does not return per-term provenance).
  // derived = internal entity logic; news = local news_articles only (no BluGate).
  const keywords = uniqItems([
    ...fromList(rawTerms.keywords, 'web'),
    ...derived.keywords,
    ...(news.keywords || []),
  ]);
  const hashtags = uniqItems([
    ...fromList(rawTerms.hashtags, 'web'),
    ...derived.hashtags,
    ...(news.hashtags || []),
  ]);

  return { keywords, hashtags };
};

module.exports = {
  enrichFromNews,
  buildCandidateItems,
  deriveEntityTerms,
  uniqItems,
};
