/**
 * parseKeyword must split keywords exactly like the news API
 * (Blura-Engine processing/keywords.py), so live and Saved searches agree.
 * Run: node src/modules/news/news.keywords.test.js
 */
const assert = require('assert');
const { parseKeyword, MAX_PHRASES } = require('./news.keywords');

const terms = (k) => parseKeyword(k).terms;
const phraseTexts = (k) => parseKeyword(k).phrases.map((p) => p.text);

// One phrase
const single = parseKeyword('CJP School Thik Karo');
assert.deepStrictEqual(single.terms, ['cjp', 'school', 'thik', 'karo']);
assert.strictEqual(single.isList, false);
assert.strictEqual(single.phrases[0].text, 'cjp school thik karo');
assert.deepStrictEqual(terms('protest in the school of a town'), ['protest', 'school', 'town']);
assert.deepStrictEqual(terms('police ka action'), ['police', 'action']);
assert.deepStrictEqual(terms('the'), ['the'], 'only common words: fall back instead of matching everything');
assert.deepStrictEqual(terms('Drugs drugs! (Hyderabad)'), ['drugs', 'hyderabad']);
assert.deepStrictEqual(terms('hit-and-run covid-19'), ['hit-and-run', 'covid-19']);
assert.deepStrictEqual(terms("minister's resignation"), ['minister', 'resignation']);
assert.deepStrictEqual(terms('హత్యలు పెరిగాయి'), ['హత్యలు', 'పెరిగాయి'], 'Indian-script words stay whole');
assert.deepStrictEqual(terms('one two three four five six seven eight nine ten').length, 8, 'MAX_TERMS per phrase');

const quoted = parseKeyword('"thik karo" school');
assert.deepStrictEqual(quoted.required, ['thik karo']);
assert.deepStrictEqual(quoted.terms, ['school']);
assert.deepStrictEqual(parseKeyword('   ').terms, []);

// Lists
const list = parseKeyword('CJP School Thik Karo campaign, NYCS; textbook errors\nSourav Das');
assert.strictEqual(list.isList, true);
assert.deepStrictEqual(list.phrases.map((p) => p.text), ['cjp school thik karo campaign', 'nycs', 'textbook errors', 'sourav das']);
assert.deepStrictEqual(list.phrases[0].terms, ['cjp', 'school', 'thik', 'karo', 'campaign']);
assert.deepStrictEqual(
  parseKeyword("school and mass, School  Mass, the, minister's exit, ministers exit").phrases.map((p) => p.terms),
  [['school', 'mass'], ['minister', 'exit'], ['ministers', 'exit']],
  'duplicates, common-word-only items and possessives');
assert.deepStrictEqual(phraseTexts('"school thik karo", nycs, textbook errors'), ['nycs', 'textbook errors']);
assert.strictEqual(
  parseKeyword(Array.from({ length: MAX_PHRASES + 50 }, (_, i) => `term${i} word${i}`).join(', ')).phrases.length,
  MAX_PHRASES);

console.log('All news keyword parsing tests passed.');
