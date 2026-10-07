/**
 * parseKeyword must split keywords exactly like the news API
 * (Blura-Engine processing/keywords.py), so live and saved searches agree.
 * Run: node src/modules/news/news.keywords.test.js
 */
const assert = require('assert');
const { parseKeyword, MAX_PHRASES } = require('./news.keywords');

const texts = (k) => parseKeyword(k).phrases.map((p) => p.text);

// One keyword = one whole phrase (no splitting into words)
const single = parseKeyword('CJP School Thik Karo');
assert.deepStrictEqual(texts('CJP School Thik Karo'), ['cjp school thik karo']);
assert.strictEqual(single.isList, false);
assert.deepStrictEqual(single.phrases[0].words, ['cjp', 'school', 'thik', 'karo']);
assert.deepStrictEqual(texts('  school and mass  '), ['school and mass'], 'common words stay in the phrase');
assert.deepStrictEqual(texts("minister's resignation"), ["minister's resignation"]);
assert.deepStrictEqual(parseKeyword("minister's resignation").phrases[0].words, ['minister', 's', 'resignation']);
assert.deepStrictEqual(texts('హత్యలు   పెరిగాయి'), ['హత్యలు పెరిగాయి'], 'spaces collapsed');
assert.deepStrictEqual(parseKeyword('   ').phrases, []);

// Commas (semicolons, new lines) separate keywords
const list = parseKeyword('CJP School Thik Karo campaign, NYCS; textbook errors\nSourav Das');
assert.strictEqual(list.isList, true);
assert.deepStrictEqual(list.phrases.map((p) => p.text), ['cjp school thik karo campaign', 'nycs', 'textbook errors', 'sourav das']);
assert.deepStrictEqual(texts('School  Mass, school mass, , ; NYCS, nycs'), ['school mass', 'nycs'], 'duplicates and empties dropped');
assert.deepStrictEqual(texts('"Bhubaneswar, Sep 21", NYCS'), ['bhubaneswar, sep 21', 'nycs'], 'quotes group a comma');
assert.strictEqual(
  parseKeyword(Array.from({ length: MAX_PHRASES + 50 }, (_, i) => `term${i} word${i}`).join(', ')).phrases.length,
  MAX_PHRASES);

console.log('All news keyword parsing tests passed.');
