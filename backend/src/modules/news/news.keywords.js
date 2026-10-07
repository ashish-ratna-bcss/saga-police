/**
 * Keyword search over the tenant's stored news articles, matching the news API's
 * rules (Blura-Engine processing/keywords.py) so the Saved tab ranks results the
 * same way a live search does. news.keywords.test.js checks the parsing matches.
 *
 * One phrase ("CJP School Thik Karo"): its words match independently and results
 * rank by words matched, then the whole phrase appearing, then words in the title.
 *
 * A list of phrases separated by commas, semicolons or new lines: an article
 * matches a phrase when it contains ALL of that phrase's words, and results rank
 * by phrases matched, then words, then title hits.
 *
 * min_match: minimum words (one phrase) or phrases (a list) an article must match.
 * "Double quoted" text is an exact phrase every result must contain. Common
 * English / romanized-Hindi words are ignored. Latin-script words match at the
 * start of a word ('kill' ≠ 'skill'); Indian scripts match anywhere.
 */

const { Prisma } = require('../../generated/tenant-client');

const STOP_WORDS = new Set(`
a an the of in on at to for and or is are was were be been by with from as
it its this that these those into about over after before than then there
their his her he she they we you i our your not no
ka ki ke ko se me mein hai hain tha thi aur ya par bhi ek
`.split(/\s+/).filter(Boolean));

const MAX_TERMS = 8;
const MAX_PHRASES = 150;
const MAX_KEYWORD_LENGTH = 6000;
const QUOTED = /["“”]([^"“”]+)["“”]/g;
const ITEM_SEPARATORS = /[,;\n\r]+/;
// Whitespace and punctuation only — never \W, which would split Indian-script words.
const SEPARATORS = /[\s,;:!?()[\]{}|/\\<>“”"‘’]+/;
const EDGE_PUNCTUATION = /^[.'\-_*#@&]+|[.'\-_*#@&]+$/g;

const normalize = (text) => String(text || '').normalize('NFKC').toLowerCase();
const isLatin = (term) => /^[a-z0-9]/.test(term);

const tokensOf = (text) => {
  const out = [];
  for (const raw of text.split(SEPARATORS)) {
    const token = raw.replace(EDGE_PUNCTUATION, '').replace(/'s$/, '').replace(EDGE_PUNCTUATION, '');
    if (token && !out.includes(token)) out.push(token);
  }
  return out;
};

/** @returns {{ phrases: {text: string, terms: string[]}[], required: string[], terms: string[], isList: boolean }} */
const parseKeyword = (keyword) => {
  const text = normalize(keyword).trim();
  const empty = { phrases: [], required: [], terms: [], isList: false };
  if (!text) return empty;

  const required = [...text.matchAll(QUOTED)].map((m) => m[1].trim()).filter(Boolean);
  const items = text.replace(QUOTED, ' ').split(ITEM_SEPARATORS).filter((i) => i.trim());

  const phrases = [];
  const seen = new Set();
  for (const item of items) {
    const tokens = tokensOf(item);
    let terms = tokens.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
    if (!terms.length && items.length === 1 && !required.length) terms = tokens;
    terms = terms.slice(0, MAX_TERMS);
    const key = [...terms].sort().join('\u0000');
    if (!terms.length || seen.has(key)) continue;
    seen.add(key);
    phrases.push({ text: tokens.join(' '), terms });
    if (phrases.length === MAX_PHRASES) break;
  }
  const terms = [...new Set(phrases.flatMap((p) => p.terms))];
  return { phrases, required, terms, isList: phrases.length > 1 };
};

/*
 * Latin-script terms are matched through news_articles.search_tsv — a GIN-indexed
 * tsvector of the article's [a-z0-9] words (title weighted 'A'), kept up to date by
 * Postgres. "Starts a word" becomes a prefix query on the last word, so no article
 * text is scanned at search time:
 *   'kill' → kill:*                (killed, killing; not skill)
 *   'hit-and-run' → hit <-> and <-> run:*
 * Same rule as the API's ascii_words() test. Indian-script terms (rare in lists)
 * fall back to substring search on the lower-cased text.
 */
const NON_WORD = /[^a-z0-9]+/g;
const tsQuery = (term, weight = '') => {
  const words = term.replace(NON_WORD, ' ').trim().split(' ').filter(Boolean);
  return words.map((w, i) => (i === words.length - 1 ? `${w}:*${weight}` : weight ? `${w}:${weight}` : w)).join(' <-> ');
};

/** SQL boolean: does the article row `a` contain `term` (anywhere, or in its title)? */
const contains = (term, { title = false } = {}) => {
  if (isLatin(term)) return Prisma.sql`(a.search_tsv @@ ${tsQuery(term, title ? 'A' : '')}::tsquery)`;
  return title
    ? Prisma.sql`(strpos(lower(a.title), ${term}) > 0)`
    : Prisma.sql`(strpos(a.hay, ${term}) > 0)`;
};
const asInt = (condition) => Prisma.sql`(CASE WHEN ${condition} THEN 1 ELSE 0 END)`;
const flag = (name) => Prisma.raw(`s.${name}`);

/**
 * SQL for a keyword search, in layers so each word is tested once per row:
 *
 *   SELECT s.*, <select> FROM (
 *     SELECT <list columns> <flags>
 *     FROM (SELECT a.* <hay> FROM news_articles a WHERE <filters> AND <prefilter> OFFSET 0) a
 *     OFFSET 0
 *   ) s WHERE <where> ORDER BY <rank> ...
 *
 * prefilter → cheap index-backed test (any searched word / required phrase present)
 *             to AND into the innermost WHERE, or null
 * needsHay  → whether the inner row needs the lower-cased text column (HAY_COLUMNS)
 *             — only for Indian-script words
 * flags     → ", <word test> AS kt0, ..." columns computed on the inner row (or empty)
 * select    → matched_terms, matched_phrases, match_score (always present)
 * where     → condition on s.* (or null for no keyword)
 * ranked    → whether ORDER BY should lead with match_score
 */
const keywordSql = (keyword, minMatch = 1) => {
  const query = parseKeyword(keyword);
  const { phrases, required, terms, isList } = query;
  const need = Math.max(1, Number.parseInt(minMatch, 10) || 1);
  const base = { terms, phrases: isList ? phrases.map((p) => p.text) : [] };

  if (!phrases.length && !required.length) {
    return {
      ...base,
      prefilter: null,
      needsHay: false,
      flags: Prisma.empty,
      where: null,
      ranked: false,
      select: Prisma.sql`ARRAY[]::text[] AS matched_terms, ARRAY[]::text[] AS matched_phrases, 0 AS match_score`,
    };
  }

  const termIndex = new Map(terms.map((t, i) => [t, i]));
  const single = !isList ? phrases[0] : null;
  const flagCols = [
    ...terms.map((t, i) => Prisma.sql`${contains(t)} AS kt${Prisma.raw(String(i))}`),
    ...terms.map((t, i) => Prisma.sql`${contains(t, { title: true })} AS kh${Prisma.raw(String(i))}`),
    ...required.map((p, i) => Prisma.sql`${contains(p)} AS kr${Prisma.raw(String(i))}`),
  ];
  if (single && single.terms.length > 1) flagCols.push(Prisma.sql`${contains(single.text)} AS kp`);

  // Every match needs at least one searched word (and all required phrases), so
  // this narrows rows through the GIN index before any per-word flag is computed.
  const latin = terms.filter(isLatin);
  const indic = [...terms, ...required, ...(single ? [single.text] : [])].filter((t) => !isLatin(t));
  const anyWord = [
    ...(latin.length ? [Prisma.sql`a.search_tsv @@ ${latin.map((t) => `(${tsQuery(t)})`).join(' | ')}::tsquery`] : []),
    ...terms.filter((t) => !isLatin(t)).map((t) => Prisma.sql`strpos(lower(a.title || ' ' || a.summary || ' ' || a.content), ${t}) > 0`),
  ];
  const requiredRaw = required.map((p) => (isLatin(p)
    ? Prisma.sql`a.search_tsv @@ ${tsQuery(p)}::tsquery`
    : Prisma.sql`strpos(lower(a.title || ' ' || a.summary || ' ' || a.content), ${p}) > 0`));
  const prefilterParts = [...requiredRaw, ...(anyWord.length ? [Prisma.sql`(${Prisma.join(anyWord, ' OR ')})`] : [])];

  const sum = (parts) => (parts.length ? Prisma.join(parts, ' + ') : Prisma.sql`0`);
  const words = sum(terms.map((_, i) => asInt(flag(`kt${i}`))));
  const titleHits = sum(terms.map((_, i) => asInt(flag(`kh${i}`))));
  const fullMatch = (p) => Prisma.join(p.terms.map((t) => flag(`kt${termIndex.get(t)}`)), ' AND ');
  const phraseCount = sum(phrases.map((p) => asInt(fullMatch(p))));
  const label = (cond, text) => Prisma.sql`CASE WHEN ${cond} THEN ${text}::text END`;
  const matchedTerms = terms.length
    ? Prisma.sql`ARRAY_REMOVE(ARRAY[${Prisma.join(terms.map((t, i) => label(flag(`kt${i}`), t)))}], NULL)`
    : Prisma.sql`ARRAY[]::text[]`;
  const matchedPhrases = isList
    ? Prisma.sql`ARRAY_REMOVE(ARRAY[${Prisma.join(phrases.map((p) => label(fullMatch(p), p.text)))}], NULL)`
    : Prisma.sql`ARRAY[]::text[]`;
  const score = isList
    ? Prisma.sql`((${phraseCount}) * 10000000 + (${words}) * 1000 + LEAST(${titleHits}, 999))`
    : Prisma.sql`((${words}) * 1000 + ${single && single.terms.length > 1 ? asInt(flag('kp')) : Prisma.sql`0`} * 100 + LEAST(${titleHits}, 9) * 10)`;

  const conditions = required.map((_, i) => flag(`kr${i}`));
  if (isList) conditions.push(Prisma.sql`(${phraseCount}) >= ${need}`);
  else if (terms.length) conditions.push(Prisma.sql`(${words}) >= ${Math.min(need, terms.length)}`);

  return {
    ...base,
    prefilter: prefilterParts.length ? Prisma.join(prefilterParts, ' AND ') : null,
    needsHay: indic.length > 0,
    flags: Prisma.sql`, ${Prisma.join(flagCols)}`,
    where: conditions.length ? Prisma.join(conditions, ' AND ') : null,
    ranked: true,
    select: Prisma.sql`${matchedTerms} AS matched_terms, ${matchedPhrases} AS matched_phrases, ${score} AS match_score`,
  };
};

/** Lower-cased full text for Indian-script words, added to the inner row when needed. */
const HAY_COLUMNS = Prisma.sql`lower(a.title || ' ' || a.summary || ' ' || a.content) AS hay`;

module.exports = { parseKeyword, keywordSql, HAY_COLUMNS, STOP_WORDS, MAX_TERMS, MAX_PHRASES, MAX_KEYWORD_LENGTH };
