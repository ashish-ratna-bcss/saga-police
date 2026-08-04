# Consolidating LLM Intelligence into `social_media_sentiment_analysis`

**Status:** Phase 0–2 + cutover wiring implemented locally (2026-08-04).
`INTELLIGENCE_ENGINE=SENTIMENT_SERVICE` — SOCEYE Pass A uses sentiment-api.
Deploy to iccc-ws still required (restart backend + ensure sentiment-api has policy_pack code).

### Done so far
- Phase 0(a): `ANALYSIS_STRICT_LLM_MODE=true` (was `flase`)
- Phase 0(b): Created sentiment `.env` → `127.0.0.1:11435` / `qwen2.5:7b`
- Phase 1: `policy_pack` / `intent_mode` / `timeout_s` on `/analyze/intelligence`; dynamic prompt+schema; `verify_intelligence_contract.py` (8/8 pass)
- Phase 2/4: `intelligenceClientService.js`; `analysisService` + `investigationAnalysisService` wired; env cutover flag set
- Rollback: `INTELLIGENCE_ENGINE=LOCAL_OLLAMA` + backend restart
- **Restart the sentiment API** (policy_pack code) **and SOCEYE backend** on iccc-ws before live traffic uses this path.

---

## 1. What is actually running today (verified, not assumed)

### 1.1 SOCKEYE production configuration

From `/home/ashish-ratna/sockeye/backend/.env`:

```
SENTIMENT_ANALYSIS=CUSTOM
CUSTOM_SENTIMENT_URL="http://127.0.0.1:8003"
OLLAMA_BASE_URL="http://127.0.0.1:11435"     <-- note: 11435, not the 11434 default
OLLAMA_MODEL="qwen2.5:7b"
OLLAMA_CONCURRENCY=2
OLLAMA_MAX_ATTEMPTS=2
OLLAMA_TIMEOUT_MS=45000
OLLAMA_MAX_TEXT_LENGTH=1800
OLLAMA_MAX_QUEUE_SIZE=0                       <-- parsed as Infinity by getMaxQueueSize()
OLLAMA_QUEUE_WAIT_MS=0                        <-- no-loss mode, nothing is dropped for waiting
ANALYSIS_STRICT_LLM_MODE=flase                <-- TYPO. See §1.6 — this silently disables strict mode.
```

### 1.2 The per-post work SOCKEYE does right now

For every ingested post, `analysisService.analyzeContent()`
(`/home/ashish-ratna/sockeye/backend/src/services/analysisService.js:102`) performs:

| Step | Where | Cost |
|---|---|---|
| Pass A — `categorizeText(text)` | Node → Ollama `:11435/api/generate` | 1 Ollama inference on the **raw, untranslated** post |
| Sentiment override (`engine === 'CUSTOM'`) | Node → `POST :8003/analyze` | 1 full IndicTrans2 + Cardiff torch pass |
| Pass B — `mappingService.resolveMapping()` × 4 platforms | in-process | deterministic |
| Pass D — forensics | async queue | unrelated |

So today it is **2 network round trips, 1 Ollama call, 1 torch pass**, and the
`sentiment` produced by the Ollama call is computed and then discarded
(`analysisService.js:156-161`).

Critically, **Pass A sees the raw Telugu/Hindi/Hinglish text** while the torch
pipeline has already produced a clean English translation that Pass A never sees.

### 1.3 The four consumers of LLM output in SOCKEYE

1. `analysisService.analyzeContent` — bulk ingest (`monitorService.performFullAnalysis:2219`).
2. `investigationAnalysisService.analyzeInvestigationText` — interactive single-URL
   investigation from `alertController.js:1546`. It **re-implements** the whole Ollama
   call as `classifyDirect` (`investigationAnalysisService.js:24-94`) purely to bypass the
   congested shared queue, importing `buildPromptPrefix`/`extractJSON` from `llmService`.
3. `llmRelevanceSweeper` → `llmService.classifyTelanganaRelevance` — a geo gate that
   **hard-deletes** off-topic Content documents.
4. `sentimentEngineService.analyzeWithLLM` — a thin `categorizeText` wrapper, currently
   unused in production because `SENTIMENT_ANALYSIS=CUSTOM`.

### 1.4 The taxonomy mismatch, concretely

SOCKEYE categories are `PolicyMapping.category_id` values loaded from MongoDB by
`mappingService.loadMappings()` and refreshed every 5 minutes plus on admin edit
(`policyController.js:38,61,78` call `mappingService.forceRefresh()`). The 14 in the
fallback file `backend/src/config/mapping_data.json`:

```
Communal_Violence, Hate_Speech, Hate_Speech_Threat, Hate_Speech_Threat_Extremist,
Harassment, Abusive, Sexual_Harassment, Sexual_Violence, Sexual, threat,
threat_incitement, Misinformation, Communal_Content, Normal
```

The sentiment service's `config.CATEGORY_LABELS` is a completely different, fixed set
(`Political, Religious, Communal, Criminal, Cyber Crime, Hate Speech, Public Safety,
Protest, Terrorism, Fake News, Financial Fraud, Other`). There is **no defensible
mapping** between the two: `Political` has no SOCKEYE equivalent, and
`Hate_Speech_Threat_Extremist` splits across three service labels.

`mappingService.resolveMapping()` matches on `m.category_id === category` exactly, so any
value that is not a live `category_id` yields **zero legal sections and zero platform
policies** — Pass B silently produces nothing.

### 1.5 Two contracts that will bite during migration

**a. Failure semantics are inverted between the two systems.**

`categorizeText` returns `null` on failure. `analyzeContent` then either **throws** (so
`monitorService` retries the post later and persists nothing) or falls back to
`Normal`/risk 0, depending on `options.requireLLM` — see §1.6, which matters more than it
looks.

The Python service is designed to **never fail**: `IntelligenceAnalyzer.analyze_one`
catches everything and returns `_insufficient(...)` with `source="error"`,
`category="Unknown"`, `risk_score=0` (`src/intelligence.py:546-556`).

If the Node client treats that as success, the `requireLLM` decision is bypassed
entirely — `analyzeContent` can no longer tell a real verdict from an outage, and every
Ollama failure writes a plausible-looking `Unknown`/0 row. This is the single
highest-severity item in the migration.

**b. Request-size ceilings.**

`config.API_MAX_TEXT_CHARS = 5000` and the service returns **HTTP 413** above it
(`api_server.py:159-167`). `monitorService` builds
`content.text + ' ' + content.scraped_content` (`monitorService.js:2226`), which is
routinely far larger; today `llmService` truncates it to `OLLAMA_MAX_TEXT_LENGTH=1800`
before it ever leaves Node. A client that stops truncating will start getting 413s on
long posts.

### 1.6 A pre-existing bug that must be settled before validation starts

`ANALYSIS_STRICT_LLM_MODE=flase` is a typo. The reader is

```js
const isStrictAnalysisMode = () =>
  String(process.env.ANALYSIS_STRICT_LLM_MODE || 'true').toLowerCase() === 'true';
```

(`monitorService.js:19`, `tempContentProcessor.js:17`). `'flase' !== 'true'`, so it
evaluates to **false**, and the variable is set on the *value* — not unset — so the
`|| 'true'` default never applies.

Every production caller passes `requireLLM: isStrictAnalysisMode()`
(`monitorService.js:2066, 2593, 2704`; `tempContentProcessor.js:235`), so **strict mode is
currently off**. Two live consequences:

1. When Ollama fails, `analysisService.js:136-144` already writes
   `category='Normal', risk_score=0, sentiment='neutral'` rows. The "no-loss retry"
   behaviour the code was written for is not what is running.
2. `tempContentProcessor.js:330-336` skips its on-prem health gate, so items drain out of
   the temp DB through the fallback path while the models are down.

This is not caused by the migration, but it must be resolved in **Phase 0**, because the
R1 failure-injection test asserts throw-and-retry and would fail against the current
config for a reason unrelated to the new code. Decide deliberately whether production
wants `true` (retry, no degraded rows) or `false` (degrade, keep throughput), fix the
spelling, and record the choice. The rest of this plan assumes `true`.

---

## 2. Recommended architecture

> **One Ollama inference per post, performed inside the sentiment service, against the
> English translation the service already produced, constrained by a JSON schema built
> from SOCKEYE's live PolicyMapping taxonomy, which SOCKEYE ships with the request.**

Five decisions define it.

### D1 — The taxonomy travels with the request ("policy pack")

SOCKEYE sends its live category list, with definitions, on every call. The service builds
the system prompt **and the JSON response schema** from it, and validates against it. Its
own `CATEGORY_LABELS` becomes the *default* pack used when no pack is supplied, so
existing consumers and the benchmark harness are unaffected.

Why this and not a translation table:

- `PolicyMapping` stays the single source of truth. Pass B is untouched — the service
  returns a literal `category_id` and `resolveMapping()` resolves it exactly as today.
- Admin edits through `policyController` propagate on the next request. A lookup table
  would silently rot every time someone adds a category.
- `PolicyMapping.definition` is declared in the model as *"Description used for LLM Prompt
  context"* (`models/PolicyMapping.js:13`) and is **currently never used** — today's prompt
  ships bare IDs (`llmService.js:123`). Sending definitions is a free accuracy upgrade.
- Ollama's schema-constrained decoding (`format: <schema>`, already implemented with a
  400-downgrade fallback at `src/intelligence.py:446-461`) makes an out-of-taxonomy
  category **structurally impossible**. Today an invalid category silently degrades to
  `'Normal'` (`llmService.js:293`), which corrupts Pass B without a trace.

### D2 — Cardiff keeps sentiment; the LLM stops producing it

The model no longer emits `sentiment` at all. `sentiment` on the response is the
pipeline's Cardiff label, lower-cased by the Node client.

- Production is already `SENTIMENT_ANALYSIS=CUSTOM`, so Cardiff is **already** what
  SOCKEYE persists. Keeping it means **zero behavioural change** to the sentiment column.
- Cardiff is calibrated and returns a real probability; the LLM returns a bare label.
  `sentimentEngineService.js:29-31` already documents why it refuses to fabricate one.
- The service's entire guard-rail design (`SYSTEM_PROMPT` rules 3, 4, and the
  "conflicting signals" edge case at `src/intelligence.py:127-129`) is built on sentiment
  being a trusted upstream fact. Reversing that invalidates the prompt.
- Dropping `sentiment` from the model's output removes tokens from every generation.

The LLM-sentiment capability is **not deleted** — `llmService.categorizeText` stays intact
behind the feature flag as the rollback path.

### D3 — Intent is dual-valued in one generation

`intent_mode: "free"` makes the model return both:

- `intent` — free-form, 2–8 words, exactly SOCKEYE's current contract, schema-typed as a
  plain string and word-clamped server-side.
- `intent_label` — one of `config.INTENT_LABELS`, enum-constrained, for the service's own
  structured analytics.

Both keys come out of the same JSON object in the same inference. `intent_mode: "enum"`
(default) keeps today's single enum-only behaviour for existing callers.

### D4 — The wire stays nested; the Node client flattens

`/analyze/intelligence` keeps returning `{...pipeline keys, "intelligence": {...}}`. The
new fields are additive inside `intelligence`. The Node client
(`intelligenceClientService.js`) flattens to exactly the target shape.

Reshaping is a SOCKEYE concern and the adapter is the right place for it; changing the
service's response envelope would break a contract the repo documents in
`api_server.py:21-29` and its README. If a literally-flat wire is later wanted, an opt-in
`response_format: "flat"` request field is ~15 lines — but it is not the default and not
part of this plan's critical path.

One naming collision to resolve explicitly: the target shape's `"confidence": "..."` is a
**string**, so it maps to `evidence_confidence` (high/medium/low). Cardiff's numeric
probability is exposed separately as `sentiment_confidence`.

### D5 — Two lanes in the Node client, not two implementations

`investigationAnalysisService.classifyDirect` exists only to skip the congested bulk
queue. After consolidation there is one HTTP client with two independent concurrency
pools:

- `lane: 'bulk'` — ingest, concurrency 2–3, long timeout.
- `lane: 'interactive'` — investigation, concurrency 1–2, short timeout, never blocked
  behind bulk work.

The 70 lines of duplicated Ollama plumbing and validation in
`investigationAnalysisService.js:24-94` are deleted. Layers 1, 3 and 4 (keyword matching,
all-platform mapping, hybrid keyword-weight merge, Settings-derived risk level) are
genuinely distinct logic and stay exactly as they are.

### D6 — Telangana relevance stays in Node (for now)

`classifyTelanganaRelevance` is a *different* LLM use-case and should not be routed
through `/analyze/intelligence`:

- It runs on concatenated metadata (author bio, tags, location fields —
  `llmRelevanceSweeper.buildClassifierInput:30-45`), not post text.
- It needs no translation and no sentiment, so forcing it through the torch pipeline would
  add IndicTrans2 latency for zero benefit.
- It **hard-deletes Content documents** (`llmRelevanceSweeper.js:94`), a far more
  destructive contract than classification.

`llmService.js` therefore survives with its queue intact. A dedicated
`POST /classify/relevance` endpoint that skips the torch pipeline entirely is scoped as
optional Phase 6. "All LLM *intelligence* is consolidated" is the goal; the geo gate is a
separate, cheaper problem.

### 2.1 Resulting per-post work

| | Today | After |
|---|---|---|
| Network round trips from Node | 2 | 1 |
| Ollama inferences | 1 | 1 |
| Torch pipeline passes | 1 | 1 |
| Text the LLM reads | raw Indic, truncated at 1800 chars in Node | English translation + original, head+tail clipped at 4000 |
| Invalid-category outcome | silent fallback to `Normal` | structurally impossible |
| Unused LLM output | `sentiment` (discarded) | none |

Strictly less work, strictly better input.

---

## 3. Request schema

`POST /analyze/intelligence`

```jsonc
{
  "texts": ["<post text>"],

  // NEW — all optional; omitting every one reproduces today's behaviour exactly.
  "policy_pack": {
    "name": "sockeye-policy-mapping",
    "version": "2026-08-04T07:15:00Z",      // mappingService load timestamp
    "fingerprint": "sha256:9f2c…",           // sha256 of the canonical category list
    "unknown_label": "Normal",               // what to emit when evidence is insufficient
    "categories": [
      {
        "id": "Communal_Violence",
        "definition": "Content inciting or celebrating violence between religious or caste communities.",
        "severity": "High",
        "keywords": ["riot", "మతకలహాలు"]     // optional, from PolicyMapping.keywords
      }
      // … one entry per active PolicyMapping document
    ]
  },

  "intent_mode": "free",                     // "free" | "enum"   (default "enum")
  "timeout_s": 90                            // per-request Ollama timeout override
}
```

**Validation rules (server side)**

| Rule | Behaviour on violation |
|---|---|
| `categories` non-empty, ≤ 128 entries | 422 |
| `id` non-empty, unique, ≤ 96 chars | 422 |
| `unknown_label` must be one of the `id`s, or absent → `config.UNKNOWN_LABEL` is appended to the enum | 422 if present but not an `id` |
| `definition` ≤ 500 chars | truncated, logged |
| `intent_mode` in `{free, enum}` | 422 |
| `timeout_s` in `[5, 600]` | clamped, logged |
| `policy_pack` absent | fall back to the default pack built from `config.CATEGORY_LABELS` |

**Fingerprint and caching.** The service memoizes `(system_prompt, response_schema)` keyed
on `sha256(canonical_json(categories) + intent_mode + unknown_label)`. Because SOCKEYE's
taxonomy changes only on admin edit, the prompt string is byte-identical across requests,
so Ollama's prefix KV cache keeps working exactly as it does today.

On the Node side the pack is built once from `mappingService.mappingData` and memoized on
the same fingerprint. `policyController` already calls `mappingService.forceRefresh()` on
every mutation, so no controller change is needed — the fingerprint simply changes and the
client rebuilds.

---

## 4. Response schema

### 4.1 Wire (`/analyze/intelligence`) — nested, additive

Every existing key is unchanged. `intelligence` gains four keys:

```jsonc
{
  "results": [{
    // ── unchanged pipeline keys ──
    "post_text": "…", "language": "te", "english_text": "…",
    "was_translated": true, "was_transliterated": false,
    "sentiment": "Negative", "confidence": 0.9412,
    "translation_time_ms": 812.4, "sentiment_time_ms": 41.2, "total_time_ms": 861.9,

    "intelligence": {
      "category": "Communal_Violence",       // CHANGED: now from the caller's pack
      "intent": "incite retaliation against a community",   // CHANGED: free-form in "free" mode
      "intent_label": "Call to Action",      // NEW: enum, always present
      "risk_score": 78,
      "reasoning": "…",
      "summary": "…",
      "recommended_action": "Escalate",
      "evidence_confidence": "high",
      "signals": ["code_mixed", "romanized_indic_transliterated"],
      "source": "provider",                  // provider | triage | error
      "model": "qwen2.5:7b",
      "latency_ms": 2841.0,
      "policy_pack_fingerprint": "sha256:9f2c…",   // NEW: proves which taxonomy was used
      "schema_enforced": true                       // NEW: false if the 400-downgrade fired
    }
  }]
}
```

### 4.2 What the Node client returns to `analysisService` — the target flat shape

```jsonc
{
  "category": "Communal_Violence",
  "intent": "incite retaliation against a community",
  "sentiment": "negative",            // Cardiff, lower-cased
  "risk_score": 78,
  "reasoning": "…",
  "summary": "…",
  "recommended_action": "Escalate",
  "signals": ["code_mixed"],
  "confidence": "high",               // == evidence_confidence
  "source": "provider",
  "model": "qwen2.5:7b",

  // additive, not in the target shape but cheap and useful
  "intent_label": "Call to Action",
  "sentiment_confidence": 0.9412,
  "language": "te",
  "english_text": "…",
  "was_translated": true,
  "was_transliterated": false,
  "latency_ms": 2841.0
}
```

`{category, intent, sentiment, risk_score, reasoning}` is a **superset** of what
`categorizeText` returns today, with identical types and identical value domains
(`risk_score` int 0–100, `sentiment` lower-case triple). `analysisService` and
`investigationAnalysisService` need no change to their existing field handling.

### 4.3 Error mapping — the rule that must not be got wrong

```
source === "provider"  ->  success
source === "triage"    ->  success; category := unknown_label ("Normal"), risk_score 0
source === "error"     ->  the client returns null   (mirrors categorizeText)
HTTP 5xx / timeout     ->  the client returns null   after its own retries
HTTP 413 / 422         ->  log loudly, return null   (never silently degrade)
```

`source === "error"` **must not** be surfaced as a result. Returning `null` preserves the
`requireLLM` throw in `analysisService.js:133-135` and therefore the existing no-loss
retry behaviour under `monitorService`.

`source === "triage"` is a legitimate deterministic verdict (empty post, emoji-only, media
placeholder — `src/intelligence.py:283-320`) and is a success. Because SOCKEYE sends
`unknown_label: "Normal"`, triage records already carry a Pass-B-resolvable category and
need no client-side rewriting.

---

## 5. Prompt strategy

The current module-level `SYSTEM_PROMPT` constant (`src/intelligence.py:56-141`) becomes
`build_system_prompt(pack, intent_mode)`, memoized on the pack fingerprint. Changes:

1. **Rule 3/4 stay verbatim.** "Never perform sentiment analysis" / "never override the
   supplied sentiment" is the reason D2 works. Do not weaken it.
2. **Remove `sentiment` from the output object** in the closing template — it is already
   absent, which is correct; the schema must keep it absent so the model cannot spend
   tokens on it.
3. **Category block becomes definition-driven.** Instead of a bare comma list:

   ```
   category — exactly one of the following. Choose the single best fit.
     Communal_Violence — Content inciting or celebrating violence between religious
       or caste communities.
     Hate_Speech — …
     Normal — Harmless or neutral content. Use this when nothing else applies AND when
       the evidence is insufficient to choose.
   ```

   The `unknown_label` entry gets the explicit "use when evidence is insufficient"
   sentence appended, so the INSUFFICIENT EVIDENCE block at `src/intelligence.py:131-136`
   stays coherent when the caller has no `Unknown` category.

4. **Intent block is mode-dependent.**

   - `enum`: today's text, unchanged.
   - `free`: *"`intent` — a short free-form phrase of 2 to 8 words naming what the author
     is trying to achieve (e.g. 'mobilize a protest march', 'warn residents of flooding').
     Do not use a full sentence. `intent_label` — additionally classify that intent as
     exactly one of: Information, Opinion, …"*

5. **Keep every EDGE CASES bullet.** They are the reason the service handles code-mixing
   and OCR noise better than SOCKEYE's 14-line prompt, and they are why `signals` is
   worth carrying into SOCKEYE.

6. **Response template regenerated per mode**, matching the schema exactly.

### 5.1 Response schema construction

`RESPONSE_SCHEMA` (currently a module constant, `src/intelligence.py:143-158`) becomes
`build_response_schema(pack, intent_mode)`:

```python
"category":   {"type": "string", "enum": [c.id for c in pack.categories]}
"intent":     {"type": "string"}                        if intent_mode == "free"
              {"type": "string", "enum": [...INTENT_LABELS, UNKNOWN]}  if "enum"
"intent_label": {"type": "string", "enum": [...INTENT_LABELS, UNKNOWN]}
"risk_score": {"type": "integer", "minimum": 0, "maximum": 100}
"reasoning" / "summary": {"type": "string"}
"recommended_action":  {"type": "string", "enum": ACTION_LABELS}
"evidence_confidence": {"type": "string", "enum": ["high","medium","low"]}
```

With `OLLAMA_JSON_SCHEMA=1` the category enum is enforced at decode time. The existing
one-shot downgrade to `format: "json"` on HTTP 400 (`src/intelligence.py:446-461`) stays,
and `_validate` keeps its case-drift tolerance and clamping as the safety net for that
degraded mode. `schema_enforced` on the response reports which path was taken.

### 5.2 Output-length budget

The service currently sets no `num_predict`. `summary` + `intent_label` add tokens on top
of what SOCKEYE's 240-token cap allowed. Add
`OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "512"))` to `config.py` and pass
it in `OllamaProvider._body`. 512 is comfortably above a full valid object and bounds the
worst case of a degenerate decode.

---

## 6. Files to change

### 6.1 `/home/ashish-ratna/social_media_sentiment_analysis`

| File | Change |
|---|---|
| `config.py` | Add `OLLAMA_NUM_PREDICT`, `INTELLIGENCE_INTENT_MAX_WORDS` (default 8), `INTELLIGENCE_MAX_POLICY_CATEGORIES` (128). Keep `CATEGORY_LABELS` / `INTENT_LABELS` / `ACTION_LABELS`; add `DEFAULT_POLICY_PACK` built from `CATEGORY_LABELS` so the no-pack path is the current behaviour. |
| `src/intelligence.py` | **Primary change.** Add `PolicyCategory` / `PolicyPack` dataclasses + `PolicyPack.fingerprint()`. Replace the `SYSTEM_PROMPT` constant with memoized `build_system_prompt(pack, intent_mode)`; replace `RESPONSE_SCHEMA` with memoized `build_response_schema(pack, intent_mode)`. `_insufficient()` takes `unknown_label`. `IntelligenceResult` gains `intent_label`, `policy_pack_fingerprint`, `schema_enforced`. `OllamaProvider.generate(payload, system_prompt, schema, timeout_s)`. `IntelligenceAnalyzer.analyze_one/analyze_batch(results, pack, intent_mode, timeout_s)`. `_validate(raw, signals, pack, intent_mode)` — enum check against `pack.category_ids`, free-intent word clamp to 8. `analyze_batch` dedupe key gains the fingerprint. |
| `api_server.py` | Add `PolicyCategoryModel` / `PolicyPackModel` pydantic models; extend `AnalyzeRequest` with `policy_pack`, `intent_mode`, `timeout_s` (all optional). `/analyze` ignores them entirely — its contract does not move. `/analyze/intelligence` passes them to `analyze_batch`. `/health` reports the default pack fingerprint and `num_predict`. Log the fingerprint per request. |
| `.env` **(create — currently absent)** | `OLLAMA_BASE_URL=http://127.0.0.1:11435`, `OLLAMA_MODEL=qwen2.5:7b`, `OLLAMA_NUM_PREDICT=512`, `OLLAMA_TIMEOUT_S=90`, `OLLAMA_CONCURRENCY=2`, `SENTIMENT_INTELLIGENCE_MAX_TEXT_CHARS=4000`. See Risk R7 — the service has no `.env` at all today, so it is defaulting to `localhost:11434` and `llama3.1:8b`. |
| `verify_intelligence_contract.py` **(new)** | Standalone checker, flat layout matching `run.py` / `predict.py`. Asserts: schema is built from the supplied pack; every returned category ∈ pack; `unknown_label` honoured; free intent ≤ 8 words; `intent_label` ∈ enum; provider failure yields `source="error"`; triage yields `source="triage"`; exactly one `/api/chat` call per post (counted with a stub provider). |
| `README.md` | Document `policy_pack`, `intent_mode`, `timeout_s`, the new `intelligence` keys, and the `source` contract. |

### 6.2 `/home/ashish-ratna/sockeye/backend`

| File | Change |
|---|---|
| `src/services/intelligenceClientService.js` **(new)** | The whole adapter. Policy-pack builder + fingerprint memo from `mappingService.mappingData`; two-lane queue (`bulk`, `interactive`) modelled on the queue in `llmService.js:42-109`; pre-send truncation to `INTELLIGENCE_MAX_TEXT_CHARS` (default 4500, under the service's 5000 ceiling); axios POST with retry/backoff; the §4.3 error mapping; flatten to the §4.2 shape; `getQueueStats()`. |
| `src/services/analysisService.js` | `analyzeContent` Pass A routes on `INTELLIGENCE_ENGINE`. When `SENTIMENT_SERVICE`: one `intelligenceClient.analyzeText(text, { lane: 'bulk' })` call and **delete the separate `customSentimentService.analyzeSentiment` call** at lines 156-161 — that is the duplicate torch pass. Add `summary`, `recommended_action`, `signals`, `evidence_confidence`, `intelligence_source`, `intelligence_model` to `finalResult` and to the `llm_analysis` object (lines 210-218). Remove the now-unused `customSentimentService` / `getEngineName` imports on that branch. |
| `src/services/investigationAnalysisService.js` | Delete `classifyDirect` (lines 24-94) and the `buildPromptPrefix`/`extractJSON` import. Layer 2 becomes `intelligenceClient.analyzeText(analysisText, { lane: 'interactive' })`. Layers 1/3/4 and the Settings-threshold logic unchanged. Extend the returned `llm_analysis` with the same new fields. |
| `src/services/sentimentEngineService.js` | Register `SENTIMENT_SERVICE` in `ENGINES`, delegating to the new client. `LLM` and `CUSTOM` stay for rollback. Update the header comment, which currently claims analysisService/investigationAnalysisService call `categorizeText` directly. |
| `src/services/llmService.js` | **No change.** Retained in full as the `LOCAL_OLLAMA` fallback and as the home of `classifyTelanganaRelevance`. |
| `src/services/customSentimentService.js` | **No change.** Still serves `sentimentEngineService`'s `CUSTOM` engine. |
| `src/models/Analysis.js` | Additive fields: `recommended_action` (String), `evidence_confidence` (String), `signals` ([String]), `intelligence_source` (String), `intelligence_model` (String). `summary` already exists at line 58 — reuse it. No enum/required changes; `sentiment` stays the lower-case triple. |
| `src/services/monitorService.js` | Persist the new fields on the `Analysis` document (around lines 2305-2328). No change to the risk-level derivation. |
| `src/controllers/alertController.js` | Surface `summary` / `recommended_action` in the investigation response (~line 1561). Optional. |
| `scripts/compare_intelligence_engines.js` **(new)** | The parity harness of §8. |
| `.env` | New vars, §7.1. |

### 6.3 `/home/ashish-ratna/sockeye/frontend` — optional, additive

`src/components/ReasonModal.jsx` reads `alert.llm_analysis.{category,intent,sentiment,reasoning,score,platform_policies_violated,bns_sections_violated}` (lines 14-31). Every one of those keys is preserved, so **the modal keeps working with no frontend change**. Adding a "Summary" line and a "Recommended action" chip from `llm_analysis.summary` / `.recommended_action` is a nice-to-have for Phase 5.

---

## 7. Phased migration

### Phase 0 — Fix two pre-existing config faults (before any code)

**a. `ANALYSIS_STRICT_LLM_MODE=flase`.** Per §1.6, strict mode is off in production and
LLM failures are already being written as `Normal`/0 rows. Decide the intended value, fix
the spelling, deploy, and confirm the behaviour matches the intent. Do this first — the
R1 test is meaningless until it is settled.

**b. The sentiment service has no `.env`.** So `config.OLLAMA_BASE_URL` resolves to
`http://localhost:11434` and `config.OLLAMA_MODEL` to `llama3.1:8b`, while SOCKEYE's
Ollama is on `:11435` running `qwen2.5:7b`. Create the `.env`, restart, and confirm:

```bash
curl -s localhost:8003/health | python3 -m json.tool
# expect intelligence.available == true, .model == "qwen2.5:7b",
#        .base_url == "http://127.0.0.1:11435", .reachable == true
```

If `reachable` is false today, the intelligence endpoint has never worked in this
deployment and every subsequent measurement would be against a broken baseline.

### Phase 1 — Python: policy pack, dynamic prompt, dynamic schema

Implement §6.1. Ship it **inert**: with no `policy_pack` in the request the service
behaves byte-identically to today. Gate on `verify_intelligence_contract.py` passing and
on a manual `/analyze/intelligence` call with no pack returning the current shape.

Deploy and let it sit. Nothing in SOCKEYE has changed yet.

### Phase 2 — Node: client + shadow mode

Add `intelligenceClientService.js` and the `INTELLIGENCE_ENGINE` flag. Wire `SHADOW`:

```
INTELLIGENCE_ENGINE=SHADOW
INTELLIGENCE_SHADOW_SAMPLE_RATE=0.15
```

In `SHADOW`, `analyzeContent` runs the **existing** path (authoritative, persisted) and,
for a sampled fraction, additionally calls the new client and writes a structured
comparison line to a JSONL log — never to Mongo. Shadow is deliberately 2 Ollama calls; it
exists only to produce the §8 dataset and is off by default.

Run for 48 h or 2 000 sampled posts, whichever comes first.

### Phase 3 — Analyse, and recalibrate thresholds if needed

Run the §8 harness over the shadow log. The likely finding is that the two `risk_score`
distributions differ — SOCKEYE's prompt gives the model no rubric at all
(`llmService.js:134`) while the service's rubric is explicit
(`src/intelligence.py:90-95`). If the mean shifts by more than ~5 points, propose new
`Settings.high_risk_threshold` / `medium_risk_threshold` values that preserve today's
alert *volume*, and get them signed off before cutover. **Do not** cut over and discover
the alert rate has tripled.

### Phase 4 — Cutover, bulk path only

```
INTELLIGENCE_ENGINE=SENTIMENT_SERVICE
```

`analysisService` only. `investigationAnalysisService` still uses `classifyDirect`. Watch
for 24 h:

- Ollama request count per ingested post → must be **1.00**.
- `intelligence_source` distribution: `provider` ≫ `triage` ≫ `error`.
- Retry/throw rate from `requireLLM` — must not exceed the pre-cutover baseline.
- p95 end-to-end per post.

Rollback is one env var and a restart.

### Phase 5 — Investigation path + persistence + UI

Delete `classifyDirect`, route Layer 2 through the `interactive` lane, add the new
`Analysis` fields and the `monitorService` persistence, and (optionally) the ReasonModal
additions. Verify an interactive investigation completes inside
`INVESTIGATION_QUEUE_JOB_TIMEOUT_MS` — see Risk R3.

### Phase 6 — Optional: relevance endpoint

Only if the Node→Ollama dependency must go to zero. Add `POST /classify/relevance` to the
Python service that skips the torch pipeline entirely, then repoint
`llmRelevanceSweeper`. Explicitly **do not** route relevance through
`/analyze/intelligence`. Independent of everything above.

### 7.1 New environment variables

SOCKEYE `backend/.env`:

```
INTELLIGENCE_ENGINE=LOCAL_OLLAMA        # LOCAL_OLLAMA | SENTIMENT_SERVICE | SHADOW
INTELLIGENCE_SERVICE_URL=http://127.0.0.1:8003
INTELLIGENCE_TIMEOUT_MS=180000          # bulk lane; must exceed torch + Ollama
INTELLIGENCE_INTERACTIVE_TIMEOUT_MS=100000
INTELLIGENCE_BULK_CONCURRENCY=2
INTELLIGENCE_INTERACTIVE_CONCURRENCY=1
INTELLIGENCE_MAX_ATTEMPTS=2
INTELLIGENCE_MAX_TEXT_CHARS=4500        # stay under the service's 5000 ceiling
INTELLIGENCE_INTENT_MODE=free
INTELLIGENCE_SHADOW_SAMPLE_RATE=0
INVESTIGATION_QUEUE_JOB_TIMEOUT_MS=120000   # raised from the 55000 default — see R3
```

Sentiment service `.env`: as listed in §6.1.

---

## 8. Validation plan

### 8.1 Dataset

500 recent `Content` documents that already have an `Analysis` row with a non-null
`llm_analysis`, stratified so each of the 14 categories contributes at least 10 documents
(over-sample the rare ones) and at least 150 documents are non-English.

### 8.2 Harness

`backend/scripts/compare_intelligence_engines.js` — for each document, run
`llmService.categorizeText` (baseline) and `intelligenceClient.analyzeText` (candidate),
then `mappingService.resolveMapping` on both categories across all four platforms. Emit
one JSONL row per document. Same script consumes the Phase-2 shadow log.

### 8.3 Acceptance gates

| # | Metric | Gate |
|---|---|---|
| V1 | Category ∈ live `PolicyMapping.category_id` set | **100.0%**, no exceptions |
| V2 | Category exact agreement with baseline | ≥ 70%; every disagreement bucket manually reviewed |
| V3 | Category agreement collapsed to severity tier (`Normal` / harassment-abuse / hate-threat-violence) | ≥ 85% |
| V4 | Pass B legal-section set equality, given the same category | **100%** (proves `resolveMapping` is untouched) |
| V5 | `risk_score` MAE vs baseline | ≤ 15 points; mean shift reported, not gated |
| V6 | `risk_level` agreement at current thresholds (70/40) | ≥ 80%, **or** new thresholds signed off in Phase 3 |
| V7 | Sentiment agreement vs today's persisted value | **100%** — Cardiff is unchanged, any drift is a client bug |
| V8 | `intent` word count in `free` mode | 100% within 2–8 words |
| V9 | Ollama inferences per post | exactly **1.00**, measured from the Ollama server access log over a 100-post run |
| V10 | Non-null `summary`, `recommended_action`, `evidence_confidence` when `source="provider"` | 100% |
| V11 | Blind analyst review, 60 disagreement cases, "which reasoning is more useful?" | candidate preferred or tied in ≥ 70% |

V2's 70% bar is deliberately not 95%: the candidate reads a **translated English**
rendering that the baseline never saw, so on non-English posts it *should* disagree — and
should be right more often. V11 is what actually decides whether a disagreement is a
regression or an improvement, which is why it is a gate rather than a nice-to-have.

### 8.4 Failure-injection tests

| Test | Expected |
|---|---|
| Stop Ollama, keep the service up | Every result `source="error"`; client returns `null`; `analyzeContent` **throws** under `requireLLM: true`; **zero** Analysis rows written. *Requires Phase 0(a) — see §1.6.* |
| Stop the sentiment service | Client returns `null` after retries; same throw-and-retry; no `Unknown`/0 rows |
| Same two tests with `requireLLM: false` | Client still returns `null`; `analyzeContent` takes its **existing** documented fallback path, unchanged from today |
| Post > 5000 chars | Client pre-truncates; **no 413** reaches the caller |
| Empty / emoji-only post | `source="triage"`, `category="Normal"`, `risk_score=0`, persisted normally, no exception |
| Admin adds a PolicyMapping category via `policyController` | Next request carries a new fingerprint and the new category is selectable, with no restart |
| Ollama server too old for schema `format` | One 400, then `schema_enforced=false` for the process, results still valid via `_validate` |
| 50 concurrent bulk posts + 1 investigation | Investigation completes inside its job timeout — the interactive lane is not queued behind bulk |

### 8.5 Performance baseline

Measure p50/p95 per post before and after, split by `was_translated`. Expect end-to-end
p50 to **improve** (one fewer round trip, one fewer duplicate torch pass) and generation
time to rise slightly (`summary` + `intent_label` tokens). Net p95 must not regress by
more than 20%.

---

## 9. Risk register

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| **R1** | `source="error"` treated as a valid result → the `requireLLM` decision is bypassed and Ollama outages persist plausible-looking `Unknown`/0 rows | **High** | **Critical** | The §4.3 mapping is a hard requirement: the client must return `null` and let `analyzeContent` decide. Unit-test it in `compare_intelligence_engines.js`; failure-injection test in §8.4. Assert `source` is one of three known literals and treat anything else as an error. Depends on Phase 0(a). |
| **R1b** | `ANALYSIS_STRICT_LLM_MODE=flase` — strict mode is already off, so degraded rows are being written today and the R1 test would fail for unrelated reasons | **Confirmed** | High | Phase 0(a). See §1.6. |
| **R2** | 413 on long posts once Node stops truncating to 1800 chars — `text + scraped_content` routinely exceeds 5000 | **High** | High | Client truncates to `INTELLIGENCE_MAX_TEXT_CHARS=4500` before sending. Explicit §8.4 test. |
| **R3** | Interactive investigation blows its budget: the service's Ollama timeout is 120 s and `INVESTIGATION_QUEUE_JOB_TIMEOUT_MS` defaults to **55 s** | **High** | High | Send `timeout_s: 60` on the interactive lane; raise the queue job timeout to 120 s; separate concurrency pool so bulk never queues ahead of it. |
| **R4** | `risk_score` distribution shifts → alert volume changes overnight | **High** | Medium | Phase 3 exists solely for this. Threshold recalibration signed off before Phase 4. Gate V6. |
| **R5** | Category disagreement on the 14-way taxonomy → different legal sections for the same post | Medium | High | Gates V2/V3/V11. Definitions in the pack (currently unused) should *improve* this. Pass B itself is provably untouched by V4. |
| **R6** | Schema-constrained decoding degrades output quality or fails on a large enum | Low | Medium | `_validate` remains the safety net; the 400-downgrade path already exists; `schema_enforced` is reported per response so silent degradation is visible. |
| **R7** | The sentiment service has **no `.env`** — it is running against `localhost:11434` / `llama3.1:8b`, not SOCKEYE's `:11435` / `qwen2.5:7b` | **Confirmed** | High | Phase 0 blocks everything else. Verify via `/health`. |
| **R8** | Single point of failure: the service now owns sentiment *and* intelligence | Medium | High | `INTELLIGENCE_ENGINE=LOCAL_OLLAMA` is a one-variable rollback; `llmService` and `customSentimentService` are retained intact, not deleted. |
| **R9** | Throughput drops — the service serializes torch inference on `_inference_lock` and SOCKEYE sends one post per request | Medium | Medium | Already true today for the CUSTOM sentiment call, so it is not a new constraint. Micro-batching in the client is the Phase-4+ lever if p95 regresses. |
| **R10** | Prompt drift between the two repos after the split | Medium | Medium | Structurally eliminated: `classifyDirect` is deleted and there is exactly one prompt builder, in Python. |
| **R11** | Free-form `intent` degrades quality vs the enum the service was tuned on | Low | Low | `intent_label` is returned alongside, so the enum signal is never lost. Gate V8. |
| **R12** | Longer outputs (`summary`) increase latency and can run away | Medium | Low | `OLLAMA_NUM_PREDICT=512` bounds it. §8.5 measures it. |
| **R13** | Policy-pack payload on every request adds parse/hash overhead | Low | Low | Memoized on both sides by fingerprint. If profiling ever shows it matters, add `POST /policy-pack` registration + `policy_pack_ref` with a self-healing 409 retry — explicitly deferred, not in the critical path. |
| **R14** | `SENTIMENT_ANALYSIS=CUSTOM` becomes meaningless once the LLM stops producing sentiment | Certain | Low | It stays honoured for `LOCAL_OLLAMA` (rollback). Document it as legacy; remove one release after the cutover is stable. |

---

## 10. Definition of done

- One Ollama inference per post, proven by V9 against the Ollama access log.
- Category values are live `PolicyMapping.category_id`s, 100% of the time (V1), and Pass B
  resolves identically given the same category (V4).
- `{category, intent, sentiment, risk_score, reasoning}` and the `llm_analysis` object are
  populated exactly as before; `ReasonModal` renders with no frontend change.
- `summary`, `recommended_action`, `signals`, `evidence_confidence` are persisted and
  available.
- Ollama or the sentiment service going down returns `null` from the client, so
  `analyzeContent`'s existing `requireLLM` branch — and nothing else — decides between
  retry and degraded fallback.
- `INTELLIGENCE_ENGINE=LOCAL_OLLAMA` restores the previous behaviour with a restart and no
  code change.
