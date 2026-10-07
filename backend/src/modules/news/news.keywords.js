/**
 * Keyword search over the tenant's saved news articles, with the news API's rules
 * (Blura-Engine processing/keywords.py) so saved and live results agree.
 * news.keywords.test.js checks the parsing matches.
 *
 * Each keyword is matched as a whole phrase, exactly as written: "CJP School Thik
 * Karo" matches only articles containing that phrase. Several keywords are separated
 * by commas, semicolons or new lines: an article matches when it contains any of them,
 * and articles containing more of them rank higher (then keywords in the title).
 * min_match = the minimum number of keywords an article must contain. Double quotes
 * only group text that itself contains a comma.
 *
 * Matching ignores case and punctuation between words; a Latin-script keyword starts
 * at a word boundary ('kill' finds 'killed', not 'skill').
 */

const { Prisma } = require('../../generated/tenant-client');

const MAX_PHRASES = 150;
const MAX_KEYWORD_LENGTH = 6000;
const QUOTED = /["“”]([^"“”]*)["“”]/g;
const ITEM_SEPARATORS = /[,;\n\r]+/;
const EDGE_PUNCTUATION = /^[ .,;:!?\-_*#@&'"“”‘’()[\]{}]+|[ .,;:!?\-_*#@&'"“”‘’()[\]{}]+$/g;
const NON_WORD = /[^a-z0-9]+/g;

const normalize = (text) => String(text || '').normalize('NFKC').toLowerCase();
/** Plain ASCII keywords use the word index; anything with non-ASCII letters, substring search. */
const isLatin = (phrase) => /^[\x00-\x7F]*$/.test(phrase);
const latinWords = (text) => text.replace(NON_WORD, ' ').trim().split(' ').filter(Boolean);

/** Split on commas / semicolons / new lines, except inside double quotes. */
const splitItems = (text) => {
  const items = [];
  let last = 0;
  for (const m of text.matchAll(QUOTED)) {
    items.push(...text.slice(last, m.index).split(ITEM_SEPARATORS), m[1]);
    last = m.index + m[0].length;
  }
  items.push(...text.slice(last).split(ITEM_SEPARATORS));
  return items;
};

/** @returns {{ phrases: {text: string, words: string[]}[], terms: string[], isList: boolean }} */
const parseKeyword = (keyword) => {
  const phrases = [];
  const seen = new Set();
  for (const raw of splitItems(normalize(keyword))) {
    const text = raw.replace(/\s+/g, ' ').replace(EDGE_PUNCTUATION, '');
    if (!text) continue;
    const latin = isLatin(text);
    const words = latin ? latinWords(text) : text.split(' ').filter(Boolean);
    const key = latin ? ` ${words.join(' ')}` : text;
    if (!words.length || seen.has(key)) continue; // punctuation only, or a duplicate
    seen.add(key);
    phrases.push({ text, words });
    if (phrases.length === MAX_PHRASES) break;
  }
  const terms = [...new Set(phrases.flatMap((p) => p.words))];
  return { phrases, terms, isList: phrases.length > 1 };
};

/*
 * Latin keywords are matched through news_articles.search_tsv — a GIN-indexed
 * tsvector of the article's [a-z0-9] words (title weighted 'A'), kept current by
 * Postgres — as a phrase query whose last word may continue, so no article text is
 * scanned at search time:
 *   'CJP School Thik Karo' → cjp <-> school <-> thik <-> karo:*
 *   'kill'                 → kill:*            (killed; not skill)
 * Same rule as the API's ascii_words() test. Other keywords are matched as a phrase
 * in the NFKC-normalized, lower-cased, whitespace-collapsed text.
 */
const tsQuery = (words, weight = '') =>
  words.map((w, i) => (i === words.length - 1 ? `${w}:*${weight}` : weight ? `${w}:${weight}` : w)).join(' <-> ');

const TEXT_SQL = "regexp_replace(normalize(lower(a.title || ' ' || a.summary || ' ' || a.content), NFKC), '\\s+', ' ', 'g')";
const TITLE_SQL = "regexp_replace(normalize(lower(a.title), NFKC), '\\s+', ' ', 'g')";

/** SQL boolean: does article row `a` contain the keyword (anywhere, or in its title)? */
const contains = (phrase, { title = false } = {}) => {
  if (isLatin(phrase.text)) return Prisma.sql`(a.search_tsv @@ ${tsQuery(phrase.words, title ? 'A' : '')}::tsquery)`;
  return title
    ? Prisma.sql`(strpos(${Prisma.raw(TITLE_SQL)}, ${phrase.text}) > 0)`
    : Prisma.sql`(strpos(a.hay, ${phrase.text}) > 0)`;
};
const asInt = (condition) => Prisma.sql`(CASE WHEN ${condition} THEN 1 ELSE 0 END)`;
const flag = (name) => Prisma.raw(`s.${name}`);

/**
 * SQL for a keyword search, in layers so each keyword is tested once per row:
 *
 *   SELECT s.*, <select> FROM (
 *     SELECT <list columns> <flags>
 *     FROM (SELECT a.* <hay> FROM news_articles a WHERE <filters> AND <prefilter> OFFSET 0) a
 *     OFFSET 0
 *   ) s WHERE <where> ORDER BY <rank> ...
 *
 * prefilter → index-backed test (contains any keyword) to AND into the innermost WHERE
 * needsHay  → whether the inner row needs the normalized text column (HAY_COLUMNS)
 * flags     → ", <keyword test> AS kp0, <in title> AS kh0, ..." (or empty)
 * select    → matched_phrases, match_score (always present)
 * where     → condition on s.* (or null for no keyword)
 * ranked    → whether ORDER BY should lead with match_score
 * wordsOf   → keyword text → its words, to derive matched_terms from matched_phrases
 */
const keywordSql = (keyword, minMatch = 1) => {
  const { phrases, terms } = parseKeyword(keyword);
  const base = { terms, phrases: phrases.map((p) => p.text), wordsOf: new Map(phrases.map((p) => [p.text, p.words])) };

  if (!phrases.length) {
    return {
      ...base,
      prefilter: null,
      needsHay: false,
      flags: Prisma.empty,
      where: null,
      ranked: false,
      select: Prisma.sql`ARRAY[]::text[] AS matched_phrases, 0 AS match_score`,
    };
  }

  const need = Math.min(Math.max(1, Number.parseInt(minMatch, 10) || 1), phrases.length);
  const flagCols = [
    ...phrases.map((p, i) => Prisma.sql`${contains(p)} AS kp${Prisma.raw(String(i))}`),
    ...phrases.map((p, i) => Prisma.sql`${contains(p, { title: true })} AS kh${Prisma.raw(String(i))}`),
  ];
  const sum = (parts) => Prisma.join(parts, ' + ');
  const matched = sum(phrases.map((_, i) => asInt(flag(`kp${i}`))));
  const titleHits = sum(phrases.map((_, i) => asInt(flag(`kh${i}`))));
  const matchedPhrases = Prisma.sql`ARRAY_REMOVE(ARRAY[${Prisma.join(
    phrases.map((p, i) => Prisma.sql`CASE WHEN ${flag(`kp${i}`)} THEN ${p.text}::text END`),
  )}], NULL)`;

  // Every match contains at least one keyword, so this narrows rows through the GIN
  // index before any per-keyword flag is computed.
  const latin = phrases.filter((p) => isLatin(p.text));
  const anyKeyword = [
    ...(latin.length ? [Prisma.sql`a.search_tsv @@ ${latin.map((p) => `(${tsQuery(p.words)})`).join(' | ')}::tsquery`] : []),
    ...phrases.filter((p) => !isLatin(p.text)).map((p) => Prisma.sql`strpos(${Prisma.raw(TEXT_SQL)}, ${p.text}) > 0`),
  ];

  return {
    ...base,
    prefilter: Prisma.sql`(${Prisma.join(anyKeyword, ' OR ')})`,
    needsHay: phrases.some((p) => !isLatin(p.text)),
    flags: Prisma.sql`, ${Prisma.join(flagCols)}`,
    where: Prisma.sql`(${matched}) >= ${need}`,
    ranked: true,
    select: Prisma.sql`${matchedPhrases} AS matched_phrases, ((${matched}) * 1000 + LEAST(${titleHits}, 999)) AS match_score`,
  };
};

/** Normalized full text for non-Latin keywords, added to the inner row when needed. */
const HAY_COLUMNS = Prisma.sql`${Prisma.raw(TEXT_SQL)} AS hay`;

module.exports = { parseKeyword, keywordSql, HAY_COLUMNS, MAX_PHRASES, MAX_KEYWORD_LENGTH };
