# Pass B: PolicyMapping Keywords as Primary Source

**Date:** 2026-08-06  
**Status:** Approved  
**Scope:** `backend/src/services/mappingService.js` (+ new scripted unit checks)

## Problem

Pass A (`intelligenceClientService.buildPolicyPack`) already sends MongoDB `PolicyMapping.keywords` to the LLM. Pass B (`mappingService.resolveMapping` → `extractKeywords`) ignores those keywords and scans a hardcoded `KR_MAP` instead. Admins editing PolicyMapping keywords therefore cannot change Pass B detection.

## Goals

1. Make MongoDB `PolicyMapping.keywords` the primary keyword source for Pass B when populated.
2. Preserve exact backward-compatible behavior when keywords are empty / missing.
3. Do not change API response shapes or Pass A behavior.
4. Avoid duplicated matching logic; skip allocating `KR_MAP` when DB keywords are used.

## Non-goals

- Migrating or seeding existing categories with keywords from `KR_MAP`
- Changing Pass A / policy_pack construction
- Changing analysis HTTP APIs or frontend
- Merging DB keywords with `KR_MAP` when DB keywords are present

## Design decision: DB-primary only (no merge)

When `mapping.keywords` is a non-empty array, Pass B matches **only** those terms. `KR_MAP` is not consulted for that call.

| Approach | Pros | Cons |
|---|---|---|
| **DB-primary only (chosen)** | Admin fully controls detection; Pass A / Pass B can converge on one list; Case 3 holds | Incomplete admin lists miss terms still in `KR_MAP` |
| Merge DB ∪ KR_MAP | Higher recall | Admins cannot disable hardcoded terms |
| DB then KR_MAP on zero hits | Soft safety net | Harder to reason about; hidden double system |

**Behavioral note:** Today `KR_MAP` is scanned globally (all buckets). DB keywords are category-scoped to the resolved mapping. When admins populate keywords, detection becomes category-scoped. That is intentional.

## Data flow (after)

```
analysisService (Pass B)
  → mappingService.resolveMapping(category, text, platform, country)
      → find mapping in mappingData.category_mappings
      → extractKeywords(text, mapping?.keywords || [], category)
           → if dbKeywords non-empty: matchKeywords(text, dbKeywords)
           → else: matchKeywords(text, flatten(KR_MAP))  // lazy KR_MAP
```

Pass A unchanged: `buildPolicyPack()` continues to read `m.keywords` from the same in-memory cache.

## Component changes

### Single file of truth: `mappingService.js`

1. **`matchKeywords(text, keywordList)`** (private method or module-local helper)  
   - Guard empty text / empty list  
   - Lowercase text once  
   - Case-insensitive substring match (`includes`)  
   - Deduplicate via `Set`  
   - Return sorted array of original keyword strings that matched  

2. **`extractKeywords(text, dbKeywords = [], categoryId = null)`**  
   - Normalize `dbKeywords` to an array  
   - If length > 0: debug log `Using PolicyMapping keywords for category X`; return `matchKeywords(text, dbKeywords)` without building `KR_MAP`  
   - Else: debug log `PolicyMapping keywords empty, falling back to KR_MAP`; lazily build `KR_MAP`; flatten values; return `matchKeywords(text, flatList)`  

3. **`resolveMapping(...)`**  
   - After resolving mapping (or not):  
     `result.triggered_keywords = this.extractKeywords(text, mapping?.keywords || [], category)`  
   - When no mapping is found, `dbKeywords` is `[]` → KR_MAP fallback (same as today for empty mappings)

### Logging

Use `console.debug` (Node debug level). Message strings:

- `Using PolicyMapping keywords for category ${categoryId}`
- `PolicyMapping keywords empty, falling back to KR_MAP`

### Files not changed

- `intelligenceClientService.js` (Pass A)
- `analysisService.js` / `investigationAnalysisService.js` (call `resolveMapping` unchanged)
- `PolicyMapping` model (already has `keywords`)
- API routes / response schemas

## Backward compatibility

| Condition | Behavior |
|---|---|
| `keywords` missing / `[]` / falsy | Identical to current `KR_MAP` scan (same matcher semantics) |
| No mapping for category | KR_MAP fallback |
| Non-empty `keywords` | Only those keywords; sorted, deduped, case-insensitive substrings |

## Validation cases

1. Empty DB keywords → output identical to current KR_MAP behavior for same input text.  
2. DB `["knife","terror"]`, text `"He has a knife."` → `["knife"]` without needing KR_MAP.  
3. DB `["knife"]`, text `"He will kill them."` → `[]` (does not match KR_MAP `"kill"`).  

## Testing

No Jest/Mocha in backend today. Add `backend/scripts/test_mapping_keywords.js` using Node `assert`, patterned after `test_sentiment_engine.js`, covering the three cases above plus empty-text / sort-dedupe. Force `process.exit(0)` because importing `mappingService` opens Mongo via the model.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Partial keyword lists reduce recall | Document that empty keywords keep KR_MAP; admins must migrate lists intentionally |
| Fallback file `mapping_data.json` may omit keywords | Treated as empty → KR_MAP (safe) |
| Category-scoped vs global KR_MAP difference | Accepted under DB-primary; only when keywords populated |
