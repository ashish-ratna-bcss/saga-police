/**
 * Pass B keyword source checks for mappingService.
 * Run: node backend/scripts/test_mapping_keywords.js
 */
const assert = require('assert');
const path = require('path');

const mappingService = require(path.resolve(__dirname, '../src/services/mappingService'));

// Case 1 — empty DB keywords uses KR_MAP (identical to extractKeywords(text))
const case1Texts = [
  'He will kill them.',
  'This promotes enmity and hateful conduct.',
  'Check aadhaar and phone number leak',
  'hindu muslim caste tension'
];
for (const t of case1Texts) {
  const krOnly = mappingService.extractKeywords(t);
  const emptyDb = mappingService.extractKeywords(t, []);
  const omitted = mappingService.extractKeywords(t, undefined);
  assert.deepStrictEqual(emptyDb, krOnly, `empty [] must match 1-arg for: ${t}`);
  assert.deepStrictEqual(omitted, krOnly, `undefined dbKeywords must match 1-arg for: ${t}`);
}
assert.ok(mappingService.extractKeywords('He will kill them.').includes('kill'), 'KR_MAP should still match "kill"');

// Case 2 — DB keywords without requiring KR_MAP
assert.deepStrictEqual(
  mappingService.extractKeywords('He has a knife.', ['knife', 'terror']),
  ['knife'],
  'DB keywords should match knife without KR_MAP'
);

// Case 3 — DB primary only: KR_MAP term must not match when DB list is set
assert.deepStrictEqual(
  mappingService.extractKeywords('He will kill them.', ['knife']),
  [],
  'populated DB keywords must not fall through to KR_MAP'
);

// Matching semantics preserved: case-insensitive, dedupe, sort
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

// mappingService opens a background Mongo connection via PolicyMapping — force exit
process.exit(0);
