const assert = require('assert');
const { normalizeText, keywordMatchesText } = (() => {
  const { normalizeText } = require('./textNormalize');
  const keywordMatchesText = (keyword, text) => {
    const k = normalizeText(keyword).toLowerCase();
    const t = normalizeText(text).toLowerCase();
    if (!k || !t) return false;
    const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])${esc(k)}($|[^\\p{L}\\p{M}\\p{N}_])`, 'u').test(t);
  };
  return { normalizeText, keywordMatchesText };
})();

assert.strictEqual(normalizeText('रांची'), normalizeText('राँची'));
assert.ok(keywordMatchesText('रांची', 'आज राँची में चोरी'));
assert.ok(keywordMatchesText('राँची', 'आज रांची में चोरी'));
assert.ok(keywordMatchesText('चोरी', 'आज रांची में चोरी हुई'));
assert.ok(!keywordMatchesText('रांची', 'आज पटना में चोरी'));

console.log('textNormalize nasal-fold tests passed.');
