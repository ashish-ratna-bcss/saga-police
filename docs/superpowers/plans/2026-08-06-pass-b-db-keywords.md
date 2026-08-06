# Pass B DB Keywords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pass B keyword extraction use MongoDB `PolicyMapping.keywords` when present, with KR_MAP fallback when empty, without changing APIs or Pass A.

**Architecture:** Refactor `mappingService.js` so matching lives in one helper (`matchKeywords`). `extractKeywords(text, dbKeywords, categoryId)` chooses DB list vs lazily built KR_MAP. `resolveMapping` passes `mapping?.keywords`.

**Tech Stack:** Node.js CommonJS, Mongoose-backed PolicyMapping cache, Node `assert` script tests (no Jest in repo).

## Global Constraints

- Preserve case-insensitive substring matching, Set dedupe, sorted return array.
- When `dbKeywords.length === 0`, behavior must match current KR_MAP output for the same text.
- When DB keywords non-empty: do not allocate/build KR_MAP; do not merge with KR_MAP.
- Do not change Pass A (`buildPolicyPack`) or analysis API response shapes.
- Logging: `console.debug` with the exact message prefixes from the spec.

---

## File map

| File | Responsibility |
|---|---|
| `backend/src/services/mappingService.js` | Implementation only |
| `backend/scripts/test_mapping_keywords.js` | Scripted unit checks for Cases 1–3 |
| `docs/superpowers/specs/2026-08-06-pass-b-db-keywords-design.md` | Already written (reference) |

---

### Task 1: Failing tests for extractKeywords / resolveMapping keyword path

**Files:**
- Create: `backend/scripts/test_mapping_keywords.js`

- [ ] **Step 1: Write the test script**

```javascript
/**
 * Pass B keyword source checks for mappingService.
 * Run: node backend/scripts/test_mapping_keywords.js
 */
const assert = require('assert');
const path = require('path');

const mappingService = require(path.resolve(__dirname, '../src/services/mappingService'));

// Case 1 — empty DB keywords uses KR_MAP (same as extractKeywords(text) today)
const textKill = 'He will kill them.';
const krOnly = mappingService.extractKeywords(textKill);
const emptyDb = mappingService.extractKeywords(textKill, []);
assert.deepStrictEqual(emptyDb, krOnly);
assert.ok(krOnly.includes('kill'));

// Case 2 — DB keywords without KR_MAP entry
assert.deepStrictEqual(
  mappingService.extractKeywords('He has a knife.', ['knife', 'terror']),
  ['knife']
);

// Case 3 — DB primary only: KR_MAP term must not match
assert.deepStrictEqual(
  mappingService.extractKeywords('He will kill them.', ['knife']),
  []
);

// resolveMapping wiring: inject temp mapping
const prev = mappingService.mappingData.category_mappings;
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

console.log('mappingService keywords: all checks passed.');
process.exit(0);
```

- [ ] **Step 2: Run tests — expect Case 2/3 fail before implementation**

Run: `node backend/scripts/test_mapping_keywords.js`  
Expect: failure on arity / Case 2 until Task 2 lands.

---

### Task 2: Implement matchKeywords + extractKeywords + resolveMapping

**Files:**
- Modify: `backend/src/services/mappingService.js`

- [ ] **Step 1: Add `matchKeywords(text, keywordList)`**

Shared matcher: lowercase text once; iterate keywordList; `text_norm.includes(kw.toLowerCase())`; Set; sort; return array.

- [ ] **Step 2: Refactor `extractKeywords(text, dbKeywords = [], categoryId = null)`**

- Filter/normalize dbKeywords to non-empty strings array when provided.
- If non-empty: `console.debug(\`Using PolicyMapping keywords for category ${categoryId}\`)`; return `matchKeywords(text, list)`; **do not** build KR_MAP.
- Else: `console.debug('PolicyMapping keywords empty, falling back to KR_MAP')`; build KR_MAP object; flatten; `matchKeywords(text, flat)`.

- [ ] **Step 3: Update `resolveMapping` call site**

```javascript
result.triggered_keywords = this.extractKeywords(
  text,
  mapping ? (mapping.keywords || []) : [],
  category
);
```

Note: `mapping` is only in scope inside `if (mapping)` today — fix by capturing:

```javascript
let mapping = this.mappingData.category_mappings.find(...);
// ... use mapping ...
result.triggered_keywords = this.extractKeywords(text, mapping?.keywords || [], category);
```

- [ ] **Step 4: Re-run tests**

Run: `node backend/scripts/test_mapping_keywords.js`  
Expect: all checks passed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mappingService.js backend/scripts/test_mapping_keywords.js
git commit -m "Use PolicyMapping keywords as Pass B primary source."
```

---

### Task 3: Regression sanity (Pass A untouched)

- [ ] Confirm `intelligenceClientService.buildPolicyPack` still reads `m.keywords` (no file change).
- [ ] Confirm `analysisService` still calls `resolveMapping(category, text, p, country)` with same arity.
- [ ] Run: `node backend/scripts/test_sentiment_engine.js` (existing).
- [ ] Run: `node backend/scripts/test_mapping_keywords.js`.

---

## Done when

- Cases 1–3 pass
- Pass A file unmodified
- Empty DB keywords path allocates KR_MAP only on fallback
- Debug logs present on both branches
