/**
 * Pass B keyword source checks for mappingService.
 * Run: node backend/scripts/test_mapping_keywords.js
 */
const assert = require('assert');
const path = require('path');

const mappingService = require(path.resolve(__dirname, '../src/services/mappingService'));

// Case 1 — empty Policy Manager keywords → no matches (no KR_MAP fallback)
const case1Texts = [
  'He will kill them.',
  'This promotes enmity and hateful conduct.',
  'Check aadhaar and phone number leak',
  'hindu muslim caste tension'
];
for (const t of case1Texts) {
  assert.deepStrictEqual(mappingService.extractKeywords(t), [], `no keywords list → [] for: ${t}`);
  assert.deepStrictEqual(mappingService.extractKeywords(t, []), [], `empty [] → [] for: ${t}`);
  assert.deepStrictEqual(mappingService.extractKeywords(t, undefined), [], `undefined → [] for: ${t}`);
}

// Case 2 — Policy Manager keywords only
assert.deepStrictEqual(
  mappingService.extractKeywords('He has a knife.', ['knife', 'terror']),
  ['knife'],
  'DB keywords should match knife'
);

// Case 3 — only listed keywords match
assert.deepStrictEqual(
  mappingService.extractKeywords('He will kill them.', ['knife']),
  [],
  'unlisted terms must not match'
);

// Matching semantics: case-insensitive, dedupe, sort
assert.deepStrictEqual(
  mappingService.extractKeywords('KNIFE and terror and knife', ['terror', 'knife']),
  ['knife', 'terror']
);

// resolveMapping wiring: inject temp mapping with DB keywords
const prev = mappingService.mappingData.category_mappings;
mappingService.isLoaded = true;
mappingService.mappingData.category_mappings = [{
  category_id: 'Test_Cat',
  country: 'IN',
  keywords: ['knife'],
  legal_sections: [],
  platform_policies: { x: [] }
}];
const resolved = mappingService.resolveMapping('Test_Cat', 'He has a knife.', 'x', 'IN');
assert.deepStrictEqual(resolved.triggered_keywords, ['knife']);
mappingService.mappingData.category_mappings = prev;

// Empty text
assert.deepStrictEqual(mappingService.extractKeywords('', ['knife']), []);
assert.deepStrictEqual(mappingService.extractKeywords(null, ['knife']), []);

console.log('mappingService keywords: all checks passed.');
process.exit(0);
