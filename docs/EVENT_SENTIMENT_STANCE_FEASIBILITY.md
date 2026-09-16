# Events: Risk + Raw Sentiment + Tenant Stance — Feasibility & Implementation Plan

**Status:** The Saga-side implementation described as the recommendation below
has been built, on branch `ai-on-events`. See **§0 Implementation Status**
for exactly what shipped, what didn't, and why. The rest of this document is
kept as originally written (planning artifact) since its architecture
analysis is still the accurate description of *why* the implementation below
looks the way it does.

## 0. Implementation Status (added post-implementation)

**What shipped (Saga repo only — the Sentiment API repo was out of scope for
this change and was not touched):**

- **Tenant name resolution** — `backend/src/lib/tenantDatabase.service.js`
  gained `resolveTenantName(dbName)`: looks up the admin `users` row for a
  given tenant database (`db_name` + `port IS NOT NULL`, the same row login
  branding already reads) and returns `application_details.title`. Resolved
  purely from the job's own `dbName` — never from client input. Cached
  in-process for 5 minutes to avoid a main-DB round trip per post.
- **Sentiment API request contract (Saga's client side only)** —
  `backend/src/modules/intelligence/intelligence.client.service.js`'s
  `requestIntelligence()` now sends `tenant_name` in the `/analyze/intelligence`
  body **only when a name was resolved**; omitted entirely otherwise, so the
  request is byte-for-byte identical to pre-feature behavior whenever tenant
  resolution comes back empty. This is additive to the existing contract in
  §13 below — no existing field changed.
- **Stance parsing** — `flattenResult()` in the same file now reads an
  optional `intelligence.stance: {label, confidence}` from the response,
  validates `label` against `in_favour|against|neutral|unclear`, lowercases
  it, and returns `null` for anything absent, malformed, or out-of-taxonomy
  (never trusted verbatim, never fabricated). This is exactly what makes the
  feature safe to ship **before** the companion Sentiment API change exists:
  today, in production, the API doesn't return `stance` yet, so this parses
  to `null` every time — see the note below.
- **Persistence** — `analyzePost.js` / `analyzeEventMedia.js` write
  `stance`, `stance_confidence`, and (for auditability) `tenant_name` into the
  existing `analysis_result` JSON blob, exactly as §14/§21 recommended. No
  schema change, no migration, no new table.
- **Events API** — `event.utils.js#hydrateEventMedia` now passes through
  `stance`/`stance_confidence` per item (`GET /events/:id/content`), mirroring
  the existing `sentiment`/`risk_level` fields exactly.
- **Events analytics** — `analyticsHub.service.js#getEventsAnalytics` gained
  `by_sentiment` and `by_stance`, computed via a `$queryRaw` JSON-path
  `GROUP BY` over `social_media_event_media.analysis_result` (Prisma can't
  `groupBy` inside a `Json` column — this is the smallest fix for the gap
  documented in §7/§14). Unclassified rows (no stance/sentiment key yet) are
  dropped from the breakdown, not bucketed, per §17's denominator rule.
- **Events frontend** — `ContentCard.jsx` gained a third badge, visually and
  textually distinct from the sentiment badge ("stance: against" vs.
  "negative"), never presented as the same metric. `AnalyticsHub.js`'s
  `EventsTab` gained two `BreakdownPie` blocks (`by_sentiment`, `by_stance`)
  reusing the exact chart component `AlertsTab` already uses for `by_risk`.

**What did NOT ship, and why:**

- **The Sentiment API itself (`/home/ashish-ratna/social_media_sentiment_analysis/`)
  was not modified.** This task's scope was explicitly "the Saga-side
  changes." Concretely, this means: until that sibling repo's `/analyze/intelligence`
  prompt/schema is extended to accept `tenant_name` and return `stance` (as
  designed in §13/§27 below), **every post will keep processing exactly as
  before, and `stance`/`by_stance` will be `null`/empty everywhere** — this is
  the intended backward-compatible degradation, not a bug. Nothing on the
  Saga side breaks or blocks on this; sentiment, risk, category, alerts, and
  all existing Events behavior are unaffected.
- No typed `stance` column on `social_media_alerts` (deferred, §14/§31 —
  optional Phase 2, not required for the Events-module scope of this task).
- No Events-level `sentiment`/`stance` **filter** UI (§19/§28's own note that
  filtering is planning-only for now, not part of this build).
- No historical backfill (§18 — explicitly optional/out of scope; existing
  `done` rows simply have `stance: null` until reprocessed by whatever
  backfill mechanism is separately approved).

**Tests actually run:** `backend/scripts/verify-stance-parsing.js` — a
dependency-free `assert`-based check of `flattenResult`'s stance parsing
(valid stance, missing `stance` key from an older API response, malformed
non-object stance, out-of-taxonomy label, and the existing `source: "error"`
failure path) — see §24 (Test Plan) below for what a live-DB/live-API
integration pass would additionally need to cover; that requires a real
Sentiment API deployment with the stance extension, which does not exist yet
in this environment.

**Deployment order:** unchanged from §28 — deploy the Sentiment API's stance
extension first (whenever that is separately implemented), then these Saga
changes are already safe to run ahead of or after that (both orderings
degrade gracefully, per the additive contract above).

---

**Original planning status below (unchanged):** No code, schema, or config in
this repository or in `/home/ashish-ratna/social_media_sentiment_analysis/`
was modified to produce the rest of this document.

**Scope:** Add two new intelligence dimensions — **Raw Sentiment** (already
computed, not yet aggregated at the Events level) and **Tenant Stance** (does not
exist yet, net-new) — to the Events module, alongside the existing **Risk**
dimension, while reusing the current intelligence pipeline, queue/retry
architecture, and tenant isolation model as-is.

All tenant names in this document are placeholders (`Tenant 1`, `Tenant 2`,
`{tenant_name}`). No specific deployed tenant is referenced in any
recommendation.

---

## 1. Executive Summary

The platform already runs a single intelligence call per post — `POST
/analyze/intelligence` against the shared Sentiment API — that returns both a
deterministic **Raw Sentiment** (`Positive|Neutral|Negative`, from a Cardiff
RoBERTa transformer classifier) and an LLM-generated **Risk** assessment
(`risk_score` 0–100 → `high|medium|low`, from a vLLM/Ollama call). Raw
Sentiment is already stored per post/event-item and already rendered per-item
in the frontend (`ContentCard.jsx`). It is simply never aggregated at the
Events level, because the Events aggregation code (`analyticsHub.service.js`)
never reads it, unlike the Alerts aggregation code, which does.

**Tenant Stance does not exist anywhere in either repository.** No field, no
prompt instruction, no schema, no UI. It requires the Sentiment API's existing
LLM stage to be given a new input (the tenant's display name) and to return one
new output field (`stance`) inside the same JSON response it already produces
for `category`/`intent`/`risk_score`. This is additive to an existing LLM call,
not a second model or a second HTTP round trip — the "one inference request per
post" goal in the brief is achievable with the current architecture.

The authoritative tenant identity already exists in Saga (`application_details.title`
on the admin `users` row that owns a given tenant database) and can be resolved
server-side, without ever trusting client input, for both HTTP-triggered and
background-queue-triggered analysis paths — with one important nuance: the
background poller and queue are **global across all tenant databases inside a
single process** (see §9), so tenant name must be resolved from the job's
`dbName`, not from `req.user`, which does not exist in that code path.

**Verdict: FEASIBLE WITH MODIFICATIONS.** See §30 for the full reasoning and
§31 for the phased plan.

---

## 2. Current Saga Intelligence Pipeline (end-to-end)

```
Platform scheduler (per platform, e.g. X/FB/YT/IG/Telegram)
  backend/src/services/monitoringsocialmedia/<platform>/scheduler.js  — setInterval tick
       ↓
  runProfile.js — fetches posts via the shared "Blugate" scraper client
       ↓
  upsertPost.js — dedupe on (platform, external_id); on new/changed text:
                  enqueuePost(id, {dbName})
       ↓
  In-memory queue: backend/src/services/sentimentanalysis/queue.js
    (concurrency default 1, max 500, dedup key kind:dbName:postId)
       ↓
  Processor dispatch: sentimentanalysis/index.js → analyzePost.js (catalog posts)
                                                  → analyzeEventMedia.js (event content)
       ↓
  intelligence.client.service.js
    POST {INTELLIGENCE_SERVICE_URL}/analyze/intelligence
    body: { texts:[text], policy_pack, intent_mode, timeout_s }
       ↓
  Sentiment API (external, shared service) — one call returns:
    sentiment (Positive/Neutral/Negative) + risk_score/category/intent/... (LLM)
       ↓
  analyzePost.js builds analysis_result JSON:
    { sentiment, sentiment_confidence, risk_score, risk_level, category, intent,
      reasoning, summary, matched_keywords, legal_sections, ... }
       ↓
  Persisted on social_media_posts.analysis_result (Json) / analysis_status='done'
       ↓
  If risk_level ∈ {medium, high} or keyword match → social_media_alerts row created
    (typed columns: risk_level, risk_score, sentiment)
       ↓
  Events: a SEPARATE, keyword-driven discovery pipeline (event.scan.service.js)
    populates social_media_event_media with its OWN independent
    analysis_status/analysis_result, run through analyzeEventMedia.js
    (near-duplicate of analyzePost.js)
       ↓
  Query-time aggregation: event.service.js / analyticsHub.service.js
       ↓
  Events API → Events frontend (Events.js, AnalyticsHub.js, ContentCard.jsx)
```

Safety-net poller (`pollPending.js`) re-scans `analysis_status IN
(pending,failed)` across **every tenant database** every 30 s, independent of
the enqueue-on-write path, and re-enqueues.

Key files: `backend/src/services/monitoringsocialmedia/*/{scheduler,runProfile}.js`,
`backend/src/services/monitoringsocialmedia/upsertPost.js`,
`backend/src/services/sentimentanalysis/{queue,pollPending,index,analyzePost,analyzeEventMedia}.js`,
`backend/src/modules/intelligence/intelligence.client.service.js`,
`backend/src/modules/events/event.scan.service.js`.

---

## 3. Current Sentiment API Architecture

Location: `/home/ashish-ratna/social_media_sentiment_analysis/`

- **Framework:** FastAPI (`api_server.py`), started via `uvicorn api_server:app`
  (no in-repo PM2/gunicorn config; README documents PM2 conceptually only).
- **Endpoints:**
  - `POST /analyze` — `{texts:[str]}` → deterministic pipeline only (sentiment,
    language, translation metadata). Contract explicitly frozen: the file's own
    header comment (`api_server.py:11-37`) calls this "deliberately unchanged...
    consumed in production."
  - `POST /analyze/intelligence` — same request, plus optional `policy_pack`,
    `intent_mode` (`enum|free`), `timeout_s`. Returns every `/analyze` field plus
    an `intelligence` object: `category, intent, risk_score, reasoning, summary,
    recommended_action, evidence_confidence, signals, source, model, latency_ms,
    intent_label, policy_pack_fingerprint, schema_enforced, keyword_context`.
  - `GET /health` — pipeline/device/limits/LLM-gate/circuit-breaker status.
- **Sentiment classifier (deterministic, stage 1):** `src/inference.py`, a
  transformer encoder — `cardiffnlp/twitter-roberta-base-sentiment-latest` —
  loaded via `AutoModelForSequenceClassification`. **Not** LLM-based. Labels are
  canonicalized to exactly `Positive | Neutral | Negative` (`config.py`,
  validated in `pipeline.py`). This is the Raw Sentiment taxonomy the brief
  asked to confirm — it already matches the desired taxonomy exactly.
- **Intelligence classifier (LLM, stage 2):** `src/intelligence.py`, a
  vLLM/Ollama chat-completion call. Prompt is fully defined in code
  (`intelligence.py:267-392`) and is the only LLM prompt in the service. It is
  explicitly told: never recompute/override the supplied sentiment (rules 3–4),
  never invent entities/organizations not present in the input (rule 8), return
  only the JSON object (rule 10). It already accepts a caller-supplied
  `policy_pack` (a taxonomy of categories) and produces a schema-enforced JSON
  response — this is the existing mechanism for "extend what the LLM classifies
  without changing the model."
- **No target/entity/stance support exists today**, partial or otherwise —
  confirmed by repository-wide search. `PolicyPackModel`/`policy_pack` is a
  content-category taxonomy (e.g. "Hate Speech"), not an entity/target
  parameter.
- **Concurrency:** the deterministic stage is serialized by a single
  process-level `threading.Lock` (`_inference_lock`) — one inference in flight
  regardless of how many HTTP requests are admitted concurrently; batching
  within one request is supported (`texts` is a list). The LLM stage has its
  own separate gate (`LlmGate`, default size 2) and circuit breaker; a full gate
  returns HTTP 429 with `Retry-After`, an open circuit returns 503 with
  `Retry-After`.
- **No versioning fields** anywhere in any response (no model version,
  classification version, or processing timestamp).

---

## 4. Current Tenant Identity Flow

- **No dedicated `Tenant` model.** A "tenant" is an admin-role row in the
  shared, single main-DB `users` table (`backend/prisma/schema.prisma`),
  carrying: `db_name` (physical per-tenant Postgres database name),
  `application_details` (Json — holds `title`, the branding/display name shown
  in the UI, e.g. "Odisha Police" in a real deployment), and `port` (unique,
  used for domain/branding lookup at login).
- **Per-request resolution:** `backend/src/middleware/auth.middleware.js:95-181`
  verifies the JWT, loads the `users` row, and sets `req.user`,
  `req.tenantDbName = user.db_name`, `req.tenantPrisma = getTenantPrisma(tenantDbName)`.
  The **live database value is authoritative** — if the JWT's `db_name` claim
  disagrees with the DB, the code logs a warning and uses the DB value anyway
  (line 150-154). This is the correct existing pattern to reuse: tenant identity
  is never taken from client-controlled input at face value.
- **Tenant display name:** `backend/src/modules/user/user.application.js:28-58`
  (`readApplicationDetails`) resolves `application_details.title`, falling back
  through legacy `theme_color` fields, to a hardcoded default app title if
  unset. This is the only field in the codebase that represents a
  human-readable tenant/organization name and is the natural source for
  `{tenant_name}`.
- **No AsyncLocalStorage or request-context module exists.** Tenant identity
  propagates via plain Express request properties (`req.tenantDbName`,
  `req.tenantPrisma`) for HTTP requests, and via an explicit `dbName` string
  field carried inside job objects for background work (`{postId, dbName,
  kind}` in `sentimentanalysis/queue.js`).
- **Critical gap for this feature:** the background sentiment queue and poller
  have **no request context at all** — `analyzePost(postId, {db})` only
  receives a Prisma client, not a tenant name or `req.user`. `dbName` is known
  (it selected which Prisma client to use), but nothing today maps `dbName`
  back to a tenant display name inside the job-processing path. This mapping
  must be added (§12), and it must be resolved server-side from `dbName`, never
  accepted as a parameter that could be supplied by a caller.
- **Deployment topology:** `deploy/ecosystem.config.js` + `deploy/sites.json`
  generate **one PM2 process per tenant**, each on its own port, optionally
  with its own `.env.<admin>`. However, the sentiment queue and poller
  (`backend/src/index.js:114-123`, unconditional at every process boot) operate
  **globally across every tenant database** inside whichever process is
  running (`pollPending.js` calls `listTenantDbNames()` — `SELECT DISTINCT
  db_name FROM users` — with no filter). In practice this means each tenant's
  own PM2 process is also processing every *other* tenant's backlog. This is
  pre-existing behavior, not something this feature should change, but it
  means "the current backend/process" is not a reliable proxy for "the tenant
  this post belongs to" — the code must always resolve tenant identity from the
  post/job's own `dbName`, never from "which process am I running in."

---

## 5. Current Tenant Database Architecture

Database-per-tenant, confirmed by the complete absence of any `tenant_id`
column in `backend/prisma/tenant.schema.prisma` (401 lines, zero matches).
Physical DB name format: `blurasaga_<user>_<title>_<id>`
(`backend/src/lib/tenantDatabase.service.js:104-123`).

Per-tenant DB contents relevant to this feature (all in `tenant.schema.prisma`):

| Model | Purpose | Sentiment/Risk storage |
|---|---|---|
| `social_media_posts` | Monitored-account posts | `analysis_result` Json (sentiment, risk, category, ...) |
| `social_media_alerts` | Subset of posts crossing a risk/keyword threshold | Typed columns: `risk_level` (String), `risk_score` (Int), `sentiment` (String?) |
| `social_media_events` | Keyword-defined monitoring campaign | No sentiment/risk/stance columns |
| `social_media_event_media` | Keyword-search discoveries tied to an event | `analysis_result` Json (same shape as posts) |

There is **no join table between `social_media_posts` and `social_media_events`**
— events are populated exclusively by an independent keyword-search scan
(`event.scan.service.js`), not by linking existing monitored posts. This is an
important existing-architecture fact: "Events" in this codebase means "a
keyword campaign with its own content feed," not "an aggregation view over
monitored posts."

No migrations directory exists anywhere in the repo. Schema changes are
applied by pushing `tenant.schema.prisma` directly against every tenant
database (`ensureSchema.js`/`ensureOpsSchema.js`), not via versioned migration
files. Any schema change proposed in this document must go through that same
mechanism, run once per tenant DB, and this document does **not** create or
run it.

All of Posts, Risk, Sentiment, (future) Stance, and Events already live
tenant-locally today with zero shared-storage crossover. No change to this
isolation model is proposed.

---

## 6. Current Risk Pipeline

- **Input:** the LLM `risk_score` (0–100) returned in the same
  `/analyze/intelligence` response that carries sentiment — risk is **not** a
  separate model call, and Raw Sentiment does not feed a separate risk formula;
  they are two outputs of one call.
- **Level derivation:** `scoreToLevel(score, high, medium)` in
  `backend/src/services/sentimentanalysis/analyzePost.js:47-51` — `score ≥ high
  → 'high'`, `score ≥ medium → 'medium'`, else `'low'`. Exact values used:
  lowercase strings `'high' | 'medium' | 'low'`.
- **Thresholds are per-tenant**, stored in `alert_config` (single-row config
  table per tenant DB, defaults `high=70`, `medium=40`), loaded via
  `loadRiskThresholds()`.
- **Storage:** post-level, inside `analysis_result` Json
  (`social_media_posts`/`social_media_event_media`); promoted to typed columns
  on `social_media_alerts` only when an alert is actually created (risk
  `medium`/`high`, or keyword match, or `alert_for_every_post` setting).
- **Post-level and (via event_media) event-content-level** — there is no
  distinct event-aggregate risk column; event-level risk today is whatever the
  Events UI/analytics computes at query time (currently: nothing — see §7).

This existing risk logic is **not proposed to change**. It is the reference
pattern the new Stance dimension should follow as closely as possible.

---

## 7. Current Raw Sentiment Pipeline

- **Taxonomy:** exactly `Positive | Neutral | Negative` (Sentiment API,
  canonical) — Saga's client (`intelligence.client.service.js:275-277`)
  normalizes to lowercase `positive|neutral|negative`, defaulting to `neutral`
  if the sentiment API response is missing or unrecognized.
- **Endpoint used:** `POST /analyze/intelligence` (not the plain `/analyze` —
  Saga always requests the combined sentiment+risk call).
- **Confidence:** `sentiment_confidence` — the deterministic classifier's own
  softmax confidence, a float, nullable.
- **Storage:** `analysis_result.sentiment` / `analysis_result.sentiment_confidence`,
  same Json blob as risk, on both `social_media_posts` and
  `social_media_event_media`. Also copied into a typed `sentiment` column on
  `social_media_alerts` when an alert is created.
- **Already exposed by Events, at the per-item level only:**
  `event.utils.js`'s `hydrateEventMedia()` already reads
  `analysis_result.sentiment` / `.risk_level` / `.risk_score` and returns them
  on every item from `GET /events/:id/content`. The shared `ContentCard.jsx`
  component (also used by Alerts/Grievances) already renders a sentiment badge
  and a risk badge per post. **This means per-post Raw Sentiment display in
  Events requires no backend change and no new frontend component — only
  event-*aggregate* sentiment (breakdowns/percentages) is missing.**
- **Historical posts:** `analysis_result` defaults to `{}` and
  `analysis_status` defaults to `pending`; sentiment is genuinely null/absent
  until a successful run. Nothing enforces non-null sentiment. Recalculation
  happens automatically when a post's text changes on re-fetch
  (`upsertPost.js:41-46` resets to `pending` and clears `analysis_result`), and
  there is a manual admin-triggered bulk-reset precedent
  (`rescanCatalogPostsForKeyword`, `alert.keyword.service.js:28-54`) for
  re-running analysis on existing rows. No caching layer exists — every claimed
  post makes a live API call exactly once (per attempt).
- **Why it isn't aggregated at the Events level today:** `analyticsHub.service.js`'s
  `getEventsAnalytics()` only computes `by_status`, `by_origin`, and
  `content_by_platform` via Prisma `groupBy` — none of which touch
  `analysis_result`. By contrast, `getAlertsAnalytics()` computes `by_risk` via
  `groupBy(['risk_level'])`, which works trivially because `risk_level` is a
  **typed column** on `social_media_alerts`. Prisma cannot `groupBy` on a value
  nested inside a `Json` column, which is exactly why Events (JSON-only) lacks
  what Alerts (typed columns) already has. This is the concrete, verified
  reason the aggregate view is missing — not a design gap on the frontend, a
  data-shape limitation on the backend query layer.

---

## 8. Existing Queue/Retry/Backpressure Flow

Two layers, both **global across tenants within a single process**, not
tenant-isolated:

1. **In-memory job queue** (`sentimentanalysis/queue.js`) — plain array, job =
   `{postId, dbName, kind}`. Concurrency default 1
   (`SENTIMENT_QUEUE_CONCURRENCY`), max 500 queued. Deduplicated by
   `kind:dbName:postId`.
2. **Poller safety net** (`pollPending.js`) — every 30 s
   (`SENTIMENT_POLL_MS`), scans `analysis_status IN (pending, failed)` with
   `analysis_attempts < maxAttempts` across **every tenant DB**
   (`listTenantDbNames()`), batches 20 rows per tenant per tick, re-enqueues.

**Retry state lives on the row itself** — `analysis_status`
(`pending|processing|done|failed|skipped`), `analysis_attempts` (Int),
`analysis_error` (String). No separate job/error table. Claim pattern is
optimistic-lock `updateMany` (`WHERE status IN (pending,failed)`) to prevent
double-processing.

**Failure branching** (`analyzePost.js:143-174`): a backpressure/429 error
resets status to `pending` **without** incrementing `analysis_attempts`
(effectively infinite retry while the Sentiment API is saturated); any other
failure increments attempts and only flips to `failed` once
`analysis_attempts ≥ SENTIMENT_MAX_ATTEMPTS` (default 5).

**`Retry-After` is parsed by the HTTP client** (`intelligence.client.service.js:349-354`,
`retryAfterS`) but is **not consumed anywhere upstream** — the queue/poller
simply rely on the fixed 30 s tick. This is a pre-existing gap, unrelated to
this feature, and is explicitly **not** proposed to be fixed here (§39
prohibits unrelated refactoring); it is noted only because it affects the
performance-impact analysis in §20.

Because sentiment and risk are two outputs of **one** call, they already share
one retry lifecycle. **Stance, if returned by the same call, inherits this
retry lifecycle automatically with zero new code** — this is the central
architectural reason the "one job, one API call, three outputs" target
architecture in the brief is achievable without touching the queue/retry
system at all.

---

## 9. Existing Events Module

**Backend routes** (`backend/src/modules/events/event.routes.js`, all behind
`authorize({pages:['/events']})`):

| Method | Path | Purpose | Filters/params |
|---|---|---|---|
| GET | `/events` | List | `monitoring_status` (legacy `status`) only |
| GET | `/events/report` | Report/export view | none |
| GET | `/events/:id` | Detail | — |
| GET | `/events/:id/dashboard` | Aggregate stats | — |
| GET | `/events/:id/content` | Paginated content feed | `page`, `limit` (≤200), `platform` |
| POST | `/events` | Create | — |
| PUT | `/events/:id` | Update | — |
| PUT | `/events/:id/monitoring` | Start/stop | — |
| POST | `/events/:id/run` | Manual scan trigger | — |
| DELETE | `/events/:id` | Delete | — |

No risk/sentiment/keyword/date filter exists on any endpoint today, and only
`/events/:id/content` has real pagination. Adding `sentiment`/`stance` filters
later would slot into the same `where` pattern already used for `platform` and
`monitoring_status` — no architectural blocker, but out of scope for this
phase (brief explicitly asks for planning only, §19).

**Aggregation** (`event.service.js`, `analyticsHub.service.js`):
- `getDashboard()`: live `groupBy(platform)` on `social_media_event_media`;
  `alerts_total/active/priority` are **hardcoded to 0** (not implemented —
  pre-existing gap, unrelated to this feature).
- `getEventsReport()`: live `groupBy(event_id)` count.
- `getEventsAnalytics()` (analytics hub): `by_status`, `by_origin`,
  `content_by_platform`, day-bucketed trend — **no risk or sentiment
  breakdown, confirmed by full-file review.**

All aggregation is **query-time**, computed fresh on every request. No
async/materialized aggregation job exists anywhere in the Events module. This
matters for §14 (where to compute the new metrics) — the existing pattern is
"aggregate at read time from already-persisted per-item data," and the
recommended approach preserves that pattern exactly rather than introducing a
new computation stage.

**Database:** `social_media_events` (no sentiment/risk/stance columns) →
`social_media_event_media` (1:N, own `analysis_status`/`analysis_result`
lifecycle, unrelated to `social_media_posts`).

**Frontend:**
- `frontend/src/pages/events/Events.js` — single monolithic file (list,
  detail, dashboard, forms, calendar modal). No separate detail route.
- `frontend/src/components/ContentCard.jsx` — shared card (also used by
  Alerts/Grievances) already rendering sentiment + risk badges per item.
- `frontend/src/pages/analytics/AnalyticsHub.js` — `EventsTab` renders
  `by_status`/`by_origin` pies and a platform bar chart via generic
  `BreakdownPie`/`BreakdownBar` components that take a `{key: count}` map and
  a color map. `AlertsTab` already uses the identical components for `by_risk`
  with a `RISK_COLORS` map — this is the exact pattern to mirror for
  `by_sentiment`/`by_stance`.
- No TypeScript anywhere in the frontend (plain JS/JSX) — there are no
  interfaces to update, only implicit shapes defined by what the backend
  returns.
- `eventsApi` client (`frontend/src/api/events.api.js`) exists but `Events.js`
  inconsistently calls a raw `api` instance directly for several operations —
  pre-existing inconsistency, not something this feature needs to resolve, but
  worth being aware of when wiring a new endpoint/field into the page.

---

## 10. Feasibility Analysis

### 10.1 Can stance be produced in the same API call as sentiment? — Yes.

The Sentiment API's `/analyze/intelligence` endpoint already runs **one** LLM
generation per text that returns a JSON object with multiple independent
fields (`category`, `intent`, `risk_score`, `reasoning`, `summary`,
`recommended_action`, `evidence_confidence`, `signals`). Adding a `stance`
object to that same JSON schema, produced by the same generation call, is
architecturally identical to how `category`/`intent`/`risk_score` already
coexist. No second model, no second HTTP request, no new queue lane is
required. This directly satisfies §9's requirement.

### 10.2 Can stance be told to sentiment-first without becoming a sentiment relabel? — Yes, with an explicit prompt instruction.

The LLM prompt (`intelligence.py:267-392`) already contains a rule that risk
must NOT be derived from sentiment alone ("A strongly negative post can be low
risk... Sentiment is one input among several") and an edge case explicitly
about conflicting signals ("Positive sentiment alongside threatening language:
do NOT resolve this by changing the sentiment... weigh the CONTENT"). This is
strong existing precedent that the model is already asked to reason about
sentiment and a *different* judgment independently in the same call — stance
is architecturally the same kind of second judgment, and the same "do not
collapse these into each other" instruction pattern applies directly. This is
not proof the model will get it right (that needs evaluation, §21), but it is
evidence the API/prompt architecture already supports asking for
sentiment-independent judgments in one pass.

### 10.3 Can the LLM be told a target entity without violating its "don't invent entities" rule? — Yes.

Rule 8 forbids the model from **inventing** entities not present in the input
— it does not forbid the caller from supplying a known entity name to
evaluate. Today, no target entity is supplied because Saga's client never adds
one; the LLM stage isn't extracting entities on its own, and this feature
should not ask it to. The correct design supplies `tenant_name` as a
request-level fact ("evaluate this post's stance toward the following named
organization: `{tenant_name}`") — this is consistent with, not a violation of,
the existing prompt's rules.

### 10.4 Is tenant identity available and safe to pass? — Yes, with one required addition.

`application_details.title` is the correct, already-authoritative source. It
is safe for HTTP-triggered analysis because it comes from `req.user` (server
resolved). It is **not yet available** in the background queue/poller path,
which only carries `dbName` — this is a genuine gap that must be closed (a
small lookup added inside `analyzePost.js`/`analyzeEventMedia.js`, not a new
tenant infrastructure layer). See §12.

### 10.5 Does Events aggregation need new backend logic? — Yes, but small and precedented.

Per-post display needs almost nothing (data already flows to the frontend).
Per-event aggregation needs a `groupBy`-equivalent over a JSON field, which
Prisma cannot do directly — this requires either a raw SQL query (smallest
change, no migration) or promoting `sentiment`/`risk_level`/`stance` to typed
columns on `social_media_event_media` (larger change, but makes the query
trivial and mirrors how `social_media_alerts` already works). See §14 for the
recommendation.

---

## 11. Recommended Architecture

```
Tenant admin `users` row (main DB)
  db_name, application_details.title  ← authoritative {tenant_name}
       │
       ▼
Post/event-media claimed for analysis (analyzePost.js / analyzeEventMedia.js)
  tenant_name resolved server-side from the row's own `dbName`
  (NOT from req.user — this path has no request context)
       │
       ▼
intelligence.client.service.js
  POST /analyze/intelligence
  body: { texts:[text], policy_pack, intent_mode, timeout_s, tenant_name }
       │
       ▼
Sentiment API — ONE LLM generation, same call as today
  deterministic stage:  sentiment (unchanged)
  LLM stage:            category, intent, risk_score, ... (unchanged)
                         + stance (NEW: {label, confidence})
                           — only computed when tenant_name is present
       │
       ▼
flattenResult() / analysis_result JSON
  { sentiment, risk_score, risk_level, stance, stance_confidence, ... }
  — same Json column, same table, same status lifecycle as today
       │
       ▼
Events per-item (hydrateEventMedia) — add stance passthrough (1-line change)
Events aggregate (analyticsHub.service.js) — add by_sentiment / by_stance
  via a JSON-path groupBy query (new, small)
       │
       ▼
Events API (additive response fields) → Events frontend
  (ContentCard stance badge, AnalyticsHub BreakdownPie/Bar reuse)
```

No new queue, no new retry system, no new tenant infrastructure, no change to
the Sentiment API's request/response for `/analyze` or for callers that omit
`tenant_name`.

---

## 12. Tenant Name Flow (detailed)

```
Main DB: users row where db_name = <this tenant's database>
  application_details.title  (readApplicationDetails() in user.application.js)
       ↓
[HTTP-triggered paths: already resolved onto req.user by auth.middleware.js]
[Background queue/poller paths: NOT resolved today — must be added]
       ↓
NEW: a small resolver, e.g. resolveTenantName(dbName), added near
     analyzePost.js / analyzeEventMedia.js, doing:
       prisma(main).users.findFirst({ where: { db_name: dbName },
                                       select: { application_details: true } })
     then applying the same readApplicationDetails() logic already used
     for branding, so there is exactly one source of truth for tenant display
     name in the whole codebase.
       ↓
{tenant_name} — a plain string, resolved entirely server-side from the
     dbName the job is already scoped to. Never accepted from request body,
     query string, or any user-controlled field.
       ↓
intelligence.client.service.js — added to the /analyze/intelligence body
       ↓
Sentiment API — stance classification target
       ↓
analysis_result.stance — written back into the SAME tenant database
     (`social_media_posts` / `social_media_event_media`) the post came from
       ↓
Events aggregation / API / frontend — tenant-scoped exactly as today
     (every query already filters by the caller's own tenantPrisma)
```

**Tenant isolation guarantee:** because `tenant_name` is derived from the same
`dbName` that already determines which tenant database a job reads from and
writes to, there is no code path by which Tenant A's post can be scored
against Tenant B's name — doing so would require the resolver to look up a
different `dbName` than the one already driving the whole job, which the
design above never does. No new authorization surface is introduced; the
Sentiment API does not need to authenticate `tenant_name` — it is not a
credential, and the existing `x-api-key: GATEWAY_API_KEY` header already
gates access to the shared service.

Tenant display names are not currently normalized in any way (`title` is a
free-text field with a hardcoded default) — no alias handling exists today,
and none is proposed. If two tenants happened to configure an identical
display name, stance classification would be identical for both, which is
functionally correct (same target text), not a leak (data still lives in each
tenant's own database).

---

## 13. Proposed Sentiment API Contract

### Current

```jsonc
// POST /analyze/intelligence
{
  "texts": ["..."],
  "policy_pack": { "...": "..." },   // optional
  "intent_mode": "enum",              // optional
  "timeout_s": 60                     // optional
}
```

```jsonc
// response
{
  "results": [{
    "post_text": "...", "language": "...", "english_text": "...",
    "sentiment": "Positive", "confidence": 0.91, /* ... */
    "intelligence": {
      "category": "...", "intent": "...", "risk_score": 42,
      "reasoning": "...", "summary": "...", "recommended_action": "...",
      "evidence_confidence": "medium", "signals": [], "source": "provider",
      "model": "...", "latency_ms": 812
    }
  }]
}
```

### Proposed (additive only)

```jsonc
// POST /analyze/intelligence
{
  "texts": ["..."],
  "policy_pack": { "...": "..." },
  "intent_mode": "enum",
  "timeout_s": 60,
  "tenant_name": "{tenant_name}"      // NEW, optional
}
```

```jsonc
// response — one new key inside `intelligence`, only when tenant_name was sent
{
  "results": [{
    "...": "unchanged",
    "intelligence": {
      "...": "unchanged",
      "stance": {                      // NEW
        "label": "against",            // in_favour | against | neutral | unclear
        "confidence": "medium"         // reuses the existing evidence_confidence vocabulary
      }
    }
  }]
}
```

**Design decisions and why:**
- `tenant_name` is added to `AnalyzeRequest` (`api_server.py:236-243`) as
  `Optional[str] = None`, exactly the way `policy_pack`/`intent_mode`/`timeout_s`
  were added previously — the file's own contract comment already documents
  this endpoint as the one that accepts additive optional fields, while
  `/analyze` is explicitly frozen. Adding `tenant_name` here, not to `/analyze`,
  respects that existing boundary.
  - Omitting `tenant_name` must reproduce today's exact response
    (`intelligence` object unchanged, no `stance` key) — this is what makes the
    change backward compatible for any other consumer of this shared service.
- `stance.label` uses `in_favour|against|neutral|unclear` (lowercase, matching
  the existing lowercase convention for `sentiment` and `evidence_confidence`),
  not the brief's uppercase example — matching house style rather than
  introducing a new casing convention.
- `stance.confidence` reuses the existing three-level `evidence_confidence`
  vocabulary (`high|medium|low`) rather than inventing a numeric score,
  because the LLM stage does not currently produce calibrated numeric
  confidences for anything else it returns (`risk_score` is a magnitude, not a
  confidence). Introducing a numeric stance score with no numeric precedent
  elsewhere in this response would be a new kind of output the prompt has
  never been asked to produce reliably — recommend starting with the
  categorical confidence already proven to work for `category`/`evidence_confidence`,
  and revisiting only if evaluation shows it's insufficient.
- Validation: `tenant_name`, when present, should be a short, non-empty string
  (e.g. reuse the existing `_validate()`-style length ceiling pattern rather
  than inventing a new one) — reject absurdly long values with the same 413
  pattern already used for oversized `texts`, but this is a minor addition,
  not a new validation subsystem.
- Error behavior: stance failures should not be modeled as a separate failure
  mode from sentiment/risk failures — if the LLM call fails today, the entire
  `intelligence` object is treated as absent (`source: "error"` → `flattenResult`
  returns `null` → Saga retries the whole post). Stance should fail the same
  way, as part of the same object, not as an independently-retryable field —
  this preserves the existing "one job, one call, one retry lifecycle"
  behavior (§8) with zero new code in Saga's retry logic.
- Versioning: since no versioning concept exists anywhere in either service
  today, this document does not recommend introducing one solely for stance —
  consistent with §39's instruction not to bundle unrelated infrastructure
  work into this feature. If prompt/schema changes for stance need to be
  tracked later, that is a separate, generalizable improvement to propose on
  its own merits.

---

## 14. Proposed Database Changes

### Existing storage pattern (reused, not changed)

`social_media_posts.analysis_result` (Json, default `{}`) and
`social_media_event_media.analysis_result` (Json, nullable) already hold
`sentiment`, `sentiment_confidence`, `risk_score`, `risk_level`, `category`,
etc., with **no dedicated typed columns** for any of these on either table.

### Recommendation: Option A — add fields to the existing JSON blob

| Table | Field | Type | Nullable | Default | Index | Migration |
|---|---|---|---|---|---|---|
| `social_media_posts` | `analysis_result.stance` | string, inside existing `Json` | yes (absent until analyzed) | — (key absent) | none (JSON) | **No** — no schema change, same column already exists |
| `social_media_posts` | `analysis_result.stance_confidence` | string, inside existing `Json` | yes | — | none | **No** |
| `social_media_event_media` | `analysis_result.stance` / `.stance_confidence` | same | same | same | none | **No** |

**Why Option A, not a dedicated table (Option B) or typed columns (Option C)
right now:** stance is produced by, retried by, and consumed alongside
sentiment and risk in exactly the same lifecycle — putting it in a separate
table would require a new join, a new write inside the same transaction/update
as today's `analysis_result` write, and a new read path in every place that
currently reads `analysis_result`, for no benefit at this stage. Following the
exact precedent already set by `sentiment`/`risk_level`/`risk_score` living in
this same Json column is the smallest change consistent with current
architecture (§21 of the brief's own instructions to prefer the smallest
design matching the existing schema).

**Deferred, optional (Phase 2+): typed `stance` column on `social_media_alerts`.**
This table already has typed `risk_level`/`risk_score`/`sentiment` columns
specifically because it needs to be filterable/groupable — if stance is ever
needed as an Alerts-level filter the way risk is today, add `stance String?`
there via the existing `ensureSchema.js`-style push (no traditional migration
file exists in this repo to write). Not required for the Events-module ask in
this brief; flagged as an open question in §28.

**Migration required:** No, for the Events-module scope of this brief.
**Backfill required:** Optional (see §15).
**Index required:** No — nothing here is queried by equality/range in a way
that benefits from an index; event-level aggregation (§14.1) uses a JSON-path
`groupBy`-equivalent query, not an indexed lookup.

### Events-aggregate query change (new, small)

`analyticsHub.service.js`'s `getEventsAnalytics()` needs a new query
alongside its existing `groupBy` calls, since Prisma cannot `groupBy` on a
nested JSON field. Recommended approach: a `$queryRaw` using Postgres's
`->>'sentiment'` / `->>'stance'` / `->>'risk_level'` JSON operators against
`social_media_event_media.analysis_result`, grouped and counted, mirroring the
shape `getAlertsAnalytics()`'s `by_risk` already returns
(`{[label]: count}`). This is a new query, not a schema change, and is the
smallest way to close the exact gap identified in §7/§9: Alerts can `groupBy`
because its risk is a typed column; Events cannot because its risk/sentiment
live in JSON. Adding the same typed-column treatment to
`social_media_event_media` (promoting `risk_level`/`sentiment`/`stance` to
real columns) is a valid **alternative** that would make the query trivial
Prisma `groupBy` calls identical to Alerts' — flagged as an explicit open
design choice in §28, not decided here, since it does require a schema
push whereas the raw-SQL approach does not.

---

## 15. Proposed Events API Changes

All changes are **additive extensions of existing responses** — no new
endpoint is required.

### `GET /events/:id/content` (per-item — `event.utils.js: hydrateEventMedia`)

Current (`event.utils.js:215-217`):
```js
sentiment: asJson(row.analysis_result, null)?.sentiment || null,
risk_level: asJson(row.analysis_result, null)?.risk_level || null,
risk_score: asJson(row.analysis_result, null)?.risk_score ?? null,
```

Proposed — one more line, same pattern:
```js
stance: asJson(row.analysis_result, null)?.stance || null,
stance_confidence: asJson(row.analysis_result, null)?.stance_confidence || null,
```

### `GET /events/:id/dashboard` and `GET /analytics-hub/events` (aggregate)

Current `getEventsAnalytics()` response: `{total, by_status, by_origin,
content_by_platform, trend}`.

Proposed, additive keys, computed via the new JSON-path query from §14:
```jsonc
{
  "total": 1000, "by_status": {...}, "by_origin": {...},
  "content_by_platform": {...}, "trend": [...],
  "by_sentiment": { "positive": 300, "neutral": 250, "negative": 450 },   // NEW
  "by_stance": { "in_favour": 410, "neutral": 220, "against": 300, "unclear": 70 }  // NEW
}
```

This exactly mirrors the existing `by_risk` shape already returned by
`getAlertsAnalytics()`, so the frontend can reuse the identical
`BreakdownPie`/`BreakdownBar` rendering path (§16) with no new chart
component.

`event.service.js`'s `getDashboard()` could similarly gain a `by_sentiment`/`by_stance`
block inside `stats`, alongside the existing (currently hardcoded-zero)
`alerts_total` fields — recommended as the same small addition, not a
redesign of the dashboard payload shape.

---

## 16. Proposed Events UI Changes

No redesign. Two additive changes, each mirroring an existing component:

1. **`ContentCard.jsx`** (`~432-489`): add a third badge, styled like the
   existing sentiment/risk badges (lines 441-473), rendering
   `item.stance` with a small color map (e.g. in_favour=green,
   against=red/rose, neutral=slate, unclear=amber) — same conditional-render
   pattern already used for sentiment and risk.
2. **`AnalyticsHub.js` → `EventsTab`**: add a `by_sentiment` and `by_stance`
   `BreakdownPie`/`BreakdownBar` block, exactly as `AlertsTab` already does for
   `by_risk`, including a new `SENTIMENT_COLORS`/`STANCE_COLORS` map next to
   the existing `RISK_COLORS` (`AnalyticsHub.js:25`). No new chart library, no
   new chart component.
3. **Events list/detail filters** (`Events.js`): not changed in this phase —
   the brief asks only to plan for future sentiment/stance filters (§19); the
   existing client-side `filteredEvents` `useMemo` pattern would extend
   naturally later, but is out of scope now.

Since the frontend has no TypeScript, there are no type definitions to update
— only the implicit shapes returned by the endpoints above, which are already
covered.

---

## 17. Aggregation Definitions

**Raw Sentiment %:**
```
sentiment_category_count / classified_sentiment_posts × 100
```
where `classified_sentiment_posts` = count of items with
`analysis_status = 'done'` AND `analysis_result.sentiment` present (i.e.
excludes `pending/processing/failed/skipped` and pre-analysis rows). This
mirrors how `by_risk` on Alerts is implicitly scoped — Alerts rows only exist
after a successful analysis, so there is no "unclassified" bucket to worry
about there; Events content, by contrast, includes not-yet-analyzed items, so
the denominator must explicitly exclude them rather than silently counting
them as some default label.

**Stance %:**
```
stance_category_count / classified_stance_posts × 100
```

**Should `UNCLEAR` be included in the stance denominator? — Yes, include it.**
Reasoning: `UNCLEAR` is a real, informative model output (§29 — "insufficient
content to classify reliably"), not a missing value. Excluding it would make
"In Favour"/"Against"/"Neutral" percentages sum to 100% of *classified* posts
in a way that hides how much of the tenant's dataset is actually
unclassifiable — which is itself operationally important for an intelligence
dashboard (a police organization would want to know "40% of mentions were too
ambiguous to score," not have that silently dropped). `classified_stance_posts`
should mean "posts for which the model successfully returned some stance
label (including `unclear`)," excluding only posts that never got a stance at
all because analysis hasn't run yet or failed outright (the same exclusion
already applied to sentiment above).

---

## 18. Historical Data Strategy (plan only — no backfill performed)

- **Existing nullable state:** both `sentiment` and `risk` are already
  nullable/absent for any post that hasn't completed analysis
  (`analysis_result` defaults to `{}`), so the platform already tolerates
  partially-populated intelligence data everywhere it's read — no new
  null-handling is required for `stance` to coexist with existing rows.
- **Existing precedent:** `rescanCatalogPostsForKeyword`
  (`alert.keyword.service.js:28-54`) resets `analysis_status` to `pending`,
  clears `analysis_attempts`/`analysis_error`, and lets the existing
  poller/queue re-process the row. This is the only reprocessing pattern in
  the codebase today.
- **Why that pattern is not appropriate for a stance-only backfill, as-is:**
  because sentiment/risk/stance now come from **one shared call**, resetting
  `analysis_status` to `pending` would force a full re-run of sentiment and
  risk too — for posts whose sentiment/risk are already correct, this wastes
  a Sentiment API call and risks a different (LLM-based) risk_score/category
  overwriting a previously-stored value non-deterministically.
- **Recommended backfill selector, if/when backfill is undertaken:** treat
  `analysis_result.stance IS NULL AND analysis_status = 'done'` as the
  candidate set (i.e., "already successfully analyzed, but before stance
  existed"), and process those through a **dedicated, explicitly-invoked**
  script/admin action that calls the intelligence client the same way
  `analyzePost.js` does, but writes back only the new `stance`/`stance_confidence`
  keys into the existing `analysis_result` object — an additive JSON merge,
  not a full re-analysis reset. This avoids inventing a new `stance_status`
  column (Option A stays the smallest schema footprint) while avoiding the
  waste/non-determinism risk of the existing reset-to-pending pattern.
- **Expected cost:** proportional to the count of `done` rows across all
  tenants at the time backfill is run — this document does not estimate a
  number (no query was run to count existing rows, and doing so was out of
  scope for a code-only review), but flags that it should be measured before
  committing to backfilling all history vs. a bounded recent window.
- **Recommendation: backfill is optional, and should default to OFF** —
  ship stance for new posts first (§31 Phase 3+), decide on historical
  backfill as a separate, explicitly-approved follow-up once real stance
  quality is validated on live traffic.

---

## 19. Failure/Retry Behavior

**Design decision: sentiment + risk + stance are ONE classification
operation, not three independently retried results.**

This is not a new decision this feature introduces — it is already true for
sentiment + risk today (both come from one `/analyze/intelligence` call, and a
failure of that call fails both together, retried together via the existing
`analysis_status`/`analysis_attempts` state machine in `analyzePost.js`). Adding
stance to the same response object means it automatically inherits this exact
behavior with **no new code**:

| Scenario | Current behavior (sentiment+risk) | Behavior once stance is added |
|---|---|---|
| Sentiment API call succeeds | `analysis_result` written, status → `done` | Same call also carries `stance`; written together |
| Sentiment API returns 429 | `err.backpressure` set → status reset to `pending`, attempts **not** incremented | Unchanged — same single call, same branch |
| Sentiment API times out | Axios timeout → retryable error → linear backoff up to `INTELLIGENCE_MAX_ATTEMPTS` (default 1), then `null` → Saga's own attempts counter increments | Unchanged |
| Model/LLM inference fails (`source: "error"`) | `flattenResult` returns `null` → treated as full failure, retried | Unchanged — a stance-generation failure inside the LLM call is indistinguishable from any other `intelligence` field failing, by design |

**No second retry pipeline is introduced.** This satisfies §24's explicit
instruction not to duplicate the queue/retry work already under separate
review, and follows directly from putting stance inside the same
`intelligence` JSON object rather than a separate endpoint or separate field
computed by a separate call.

---

## 20. Performance Impact

- **Additional inference cost:** one more field in an already-single LLM
  generation call. The dominant cost of an LLM call is the fixed
  request/generation overhead plus output-token count; adding a `stance`
  object (a label + a confidence string) adds a small, bounded number of
  output tokens to a prompt that already generates `category`, `intent`,
  `reasoning` (free text), `summary` (free text), and `recommended_action` —
  the marginal token increase from one more short structured field is small
  relative to the existing free-text fields already being generated. This
  document does not have access to production latency numbers for the vLLM
  provider and does not fabricate a specific millisecond estimate; the
  concrete number should be measured by the implementing team via the
  existing `/health` endpoint's `intelligence`/`llm_gate` stats and the
  service's own request logging (`req %d: ... completed ... ms`,
  `api_server.py:387-391`) before and after the prompt change.
- **Concurrency ceiling is unaffected in kind:** the bottleneck today is the
  LLM gate (`VLLM_GATE_SIZE`, default 2) and the deterministic-stage
  `_inference_lock` (one at a time) — neither of these change in *kind*
  because of a larger prompt; a slightly longer per-call latency will
  marginally reduce throughput through the existing gate, but does not
  introduce a new bottleneck class or require new worker configuration.
- **429/backpressure mechanism is unaffected:** the same `LlmGate`/circuit
  breaker governs the same single call; nothing about adding a field to its
  output changes when the gate is considered full.
- **Saga-side cost:** effectively zero — one additional field parsed in
  `flattenResult()` and one additional key written into an already-existing
  Json update. No new HTTP round trip, no new queue entry, no new DB write.
- **Recommendation:** benchmark the actual before/after latency of
  `/analyze/intelligence` with the extended prompt on representative
  production-like text before rolling out to any tenant, using the existing
  `/health` telemetry — this is a measurement task for the implementation
  phase, not something this review can certify from a static code read.

---

## 21. Security / Tenant Isolation

- **`{tenant_name}` is never client-controlled.** It is resolved server-side
  from the same `dbName` that already scopes every Prisma query for that job
  (§12). There is no request parameter, header, or body field anywhere in the
  proposed design through which a caller could supply an arbitrary
  `tenant_name` that gets attached to another tenant's post.
- **The Sentiment API remains a shared, stateless classification service.**
  It receives `tenant_name` as plain request data, the same way it already
  receives `policy_pack` (a caller-supplied taxonomy) — it does not need to
  authenticate or verify the tenant name, store any tenant state, or maintain
  any tenant database/queue of its own. This preserves §41's constraint that
  tenant-specific storage/queueing stays entirely inside Saga.
- **Cross-tenant leakage vector, explicitly checked:** could Tenant A's post
  ever be scored against Tenant B's name? Only if the resolver in §12 looked
  up a `dbName` different from the one already driving the job — the design
  above never does this; it derives `tenant_name` from the *same* `dbName`
  value already used to select `tenantPrisma`/read the post/write the result.
  No code path in the proposal introduces a second, independent tenant
  lookup that could disagree with the first.
- **Tenant name is not currently treated as sensitive** (it's already shown
  in the UI/branding, sent to a third-party scraping API as account handles,
  etc.) — no new sensitivity classification is introduced by sending it to
  the (also already-trusted) shared Sentiment API. No normalization/alias
  handling exists or is proposed; two identically-named tenants would each
  get correct-for-them stance classification independently, since results
  are always written back into the tenant's own isolated database.

---

## 22. Edge Cases

Based on the actual model/prompt architecture (§3, §10), not aspirational
capability:

| Edge case | Assessment |
|---|---|
| Tenant not mentioned at all | The existing "insufficient evidence" pattern already used for `category`/`recommended_action` in ambiguous cases is direct precedent for mapping this to `stance = neutral` (post doesn't address the tenant) — should be an explicit prompt instruction, not left implicit. |
| Police mentioned generically, not the specific tenant | Requires the prompt to distinguish "police in general" from "the named tenant specifically" — this is a genuine prompt-design risk, not something the current architecture guarantees; must be validated with real examples (§36), not assumed. |
| Tenant mentioned positively, context negative / vice versa | This is precisely the brief's own example (§6) and the existing prompt already has a template for holding two signals apart without collapsing them (the sentiment/risk conflict rule, §10.2) — the same instruction style should be extended to sentiment/stance, but must be evaluated, not assumed correct out of the box. |
| Sarcasm | Existing prompt already has an explicit sarcasm rule ("mark uncertain rather than overconfident") for its other judgments — reusable pattern, unproven for stance specifically until tested. |
| Mixed sentiment / multiple police organizations | Not something the current single-target-string design handles distinctly — with one `tenant_name` input, the model is being asked about stance toward *that* organization specifically; posts naming multiple organizations should, per the same principle as tenant-not-mentioned, still be answerable if the prompt is precise about "toward `{tenant_name}` specifically," but this needs real-example validation. |
| News reporting without an author's own stance | The prompt's existing "quoted or forwarded content" edge case ("assess the content, but note... the author may not be the originator") is the closest existing precedent; extending this reasoning to "objective news report, no author opinion → neutral, not unclear" is a plausible design instruction but unproven. |
| Question / ambiguous / noisy social-media text / very short post | The prompt already has an explicit "very short, ambiguous, or incomplete" edge case that prefers the taxonomy's "unknown" label, lowers confidence, and recommends human review — this is the direct precedent to map onto stance's `unclear`. |
| Emoji-only / URL-only content | `analyzeText()` already rejects text under 3 characters before calling the API at all (`intelligence.client.service.js:381-384`); emoji/URL-only content that passes that length check would fall to the model's own judgment — likely `unclear`, but unproven without testing actual examples. |
| Hindi / English / Hinglish / regional languages | The deterministic translation stage (stage 1) already runs before the LLM stage for every post, regardless of language — so stance, like category/intent today, operates on the already-translated `english_text`. This means multilingual input is architecturally handled the same way existing fields are, but translation quality for regional/code-mixed text is a known variable risk the repo's own README and test suite (`test_urdu_translation_resilience.py`, `test_short_tenglish_lid_benchmark.py`) already acknowledge — stance inherits that same risk, unproven to be better or worse than sentiment/category accuracy today. |

**No capability listed above should be presented to stakeholders as
guaranteed** until validated against real examples per tenant's actual post
volume and language mix (§36).

---

## 23. §29 — `NEUTRAL` vs `UNCLEAR`, are they distinguishable?

The current model architecture has real, working precedent for a similar
distinction: the existing `evidence_confidence` field plus the
"insufficient evidence" edge-case instructions already ask the model to say
"I don't have enough to be confident" (→ low confidence, "unknown" category,
"Human Review" action) as something structurally different from "I am
confident, and the answer is unremarkable" (→ the "Normal"/default category
at high confidence). This is architecturally the same shape as `NEUTRAL`
(confident: the post takes no stance) vs. `UNCLEAR` (not confident: cannot
tell either way). **This document recommends keeping them distinct in the
schema** (`stance.label ∈ {in_favour, against, neutral, unclear}`, not
collapsing `unclear` into `neutral`), because the existing prompt architecture
already has the vocabulary to express this distinction (confidence + label
are separate outputs) — but whether the model reliably produces the *right*
one for a given post is an empirical question for evaluation (§36), not
something a static code/prompt review can certify.

---

## 24. Full Dependency Map (actual, as discovered)

```
Tenant admin `users` row (main DB): db_name, application_details.title
      ↓
Platform scheduler → runProfile.js → upsertPost.js  (Posts)
event.scan.service.js → upsertMedia()                (Event content — separate feed)
      ↓
social_media_posts / social_media_event_media  (analysis_status: pending)
      ↓
sentimentanalysis/queue.js  +  pollPending.js  (global, cross-tenant, per-process)
      ↓
analyzePost.js / analyzeEventMedia.js
  ├─ resolves tenant_name from dbName        [NEW — currently missing]
  └─ calls intelligenceClient.analyzeText()
      ↓
intelligence.client.service.js
  POST /analyze/intelligence { texts, policy_pack, intent_mode, timeout_s, tenant_name }
      ↓
Sentiment API (shared, stateless)
  deterministic stage: sentiment (unchanged)
  LLM stage:           category / intent / risk_score / ... / stance [NEW]
      ↓
flattenResult() → analysis_result JSON (sentiment, risk_level, risk_score,
                                          stance, stance_confidence [NEW], ...)
      ↓
social_media_posts.analysis_result / social_media_event_media.analysis_result
  (same tenant DB the post came from — isolation preserved)
      ↓
Alert creation (risk-gated, unaffected by stance)
      ↓
Events per-item exposure: event.utils.js hydrateEventMedia() [+1 field, NEW]
Events aggregate exposure: analyticsHub.service.js getEventsAnalytics()
  [+ by_sentiment, + by_stance via JSON-path query, NEW]
      ↓
Events API (additive response fields)
      ↓
Events frontend: ContentCard.jsx [+stance badge, NEW]
                 AnalyticsHub.js EventsTab [+2 BreakdownPie/Bar blocks, NEW]
```

---

## 25. File-by-File Impact Analysis

| Repository | File | Current Responsibility | Required Change | Change Type | Risk |
|---|---|---|---|---|---|
| Sentiment API | `api_server.py` | `AnalyzeRequest` model, `/analyze/intelligence` handler | Add optional `tenant_name` field; pass through to intelligence layer | API | Low |
| Sentiment API | `src/intelligence.py` | LLM prompt construction, request/response schema, `IntelligenceResult` | Add stance instruction block to prompt; add `stance` to response schema/validation | Model/Prompt | Medium — prompt-quality risk, needs evaluation |
| Sentiment API | `config.py` | Env vars, taxonomies, action labels | Possibly add a `STANCE_LABELS` constant, mirroring `ACTION_LABELS` | Config | Low |
| Sentiment API | `README.md` | Client contract documentation | Document new optional field/response key | Docs | Low |
| Saga | `backend/src/modules/intelligence/intelligence.client.service.js` | Builds request body, parses response (`flattenResult`) | Add `tenant_name` to request body (`requestIntelligence`, lines 310-318); extract `stance`/`stance_confidence` in `flattenResult` (lines 263-308) | Backend | Low |
| Saga | `backend/src/services/sentimentanalysis/analyzePost.js` | Claims post, calls intelligence client, builds `analysis_result` | Resolve `tenant_name` from `dbName` before calling `analyzeText`; add `stance`/`stance_confidence` to `analysis_result` object (lines 200-223) | Backend | Low-Medium (needs the new tenant-name resolver) |
| Saga | `backend/src/services/sentimentanalysis/analyzeEventMedia.js` | Same, for event content (near-duplicate of `analyzePost.js`) | Same two changes, mirrored | Backend | Low-Medium |
| Saga | `backend/src/modules/user/user.application.js` | `readApplicationDetails()` | No change — reused as-is by the new resolver | — | None |
| Saga | *(new, small)* tenant-name resolver, colocated with `analyzePost.js`/`analyzeEventMedia.js` or a small shared helper | — | New function: `dbName → tenant_name` via main-DB `users` lookup + `readApplicationDetails` | Backend | Low |
| Saga | `backend/prisma/tenant.schema.prisma` | `social_media_posts`, `social_media_event_media`, `social_media_alerts` models | No required change (Option A: JSON blob) — optional future `stance` column on `social_media_alerts` | DB | Low (none required); Medium if the optional Alerts column is taken on |
| Saga | `backend/src/modules/events/event.utils.js` | `hydrateEventMedia()` | Add `stance`/`stance_confidence` passthrough (mirrors lines 215-217) | Backend | Low |
| Saga | `backend/src/modules/analytics-hub/analyticsHub.service.js` | `getEventsAnalytics()` | Add `by_sentiment`/`by_stance` via new JSON-path query | Backend | Medium — new raw-SQL query, needs testing across Postgres JSON operators |
| Saga | `backend/src/modules/events/event.service.js` | `getDashboard()` | Optionally add `by_sentiment`/`by_stance` to `stats` (mirrors `content_by_platform`) | Backend | Low |
| Saga | `frontend/src/components/ContentCard.jsx` | Per-item sentiment/risk badges | Add a third stance badge (mirrors lines 441-473) | Frontend | Low |
| Saga | `frontend/src/pages/analytics/AnalyticsHub.js` | `EventsTab`, `BreakdownPie`/`BreakdownBar`, `RISK_COLORS` | Add `SENTIMENT_COLORS`/`STANCE_COLORS`; add two breakdown blocks to `EventsTab` | Frontend | Low |
| Saga | `frontend/src/api/events.api.js` | API client methods | No required change (response fields are additive; existing `getDashboard`/`getContent` calls already forward whatever the backend returns) | Frontend | None |

No other files were found to require changes for the scope of this brief.

---

## 26. Test Plan

### Sentiment API

- Existing `/analyze` and `/analyze/intelligence` behavior is unchanged when
  `tenant_name` is omitted (regression test against current fixtures/tests in
  `tests/`).
- `tenant_name` accepted and produces a non-null `stance` object when supplied
  with clearly one-sided example text.
- Malformed `tenant_name` (empty string, excessively long, non-string via
  direct API call bypassing Pydantic) is rejected or safely ignored, not
  silently corrupting the prompt.
- Missing `tenant_name` → `stance` key absent from `intelligence` (or
  explicitly `null`), never a crash.
- Each stance label individually: `in_favour`, `against`, `neutral`, `unclear`
  — constructed test sentences per §6/§22's edge cases, evaluated by a human
  reviewer against the model's actual output before trusting it in production.
- Existing sentiment/risk regression: confirm `sentiment`/`risk_score`/`category`
  values for a fixed test set are unchanged before vs. after the prompt
  change (the prompt is shared, so any prompt edit is a risk to the *existing*
  fields too — this must be checked, not assumed safe).
- Multilingual input, if currently supported for other fields (it is, via the
  translation stage) — confirm stance is evaluated on the same
  translated/English text as category/intent, not skipped for non-English
  input.
- API error / timeout / 429 — confirm existing error-handling paths
  (`LlmGateFull`, `LlmCircuitOpen`, `TimeoutError`) are unaffected and stance
  simply isn't present when `intelligence` itself fails.
- Response schema validation: `stance` object shape matches the documented
  contract when present.

### Saga

- Tenant-name resolver returns the correct `application_details.title` for a
  given `dbName`, and returns a safe fallback (not a crash) if the admin row
  is somehow missing (defensive, matching the existing default-title fallback
  already in `readApplicationDetails`).
- `tenant_name` passed correctly end-to-end for both the enqueue-on-write path
  and the poller-driven path (the two code paths that can trigger
  `analyzePost`/`analyzeEventMedia`).
- Tenant isolation: process Tenant 1's post and Tenant 2's post in the same
  test run (both flow through the same global in-memory queue/poller today —
  §8) and confirm each request sent to the Sentiment API carries the correct
  tenant's name, never the other's.
- Persistence: `stance`/`stance_confidence` correctly written into
  `analysis_result` for both `social_media_posts` and
  `social_media_event_media`.
- Retry/queue behavior unchanged: force a 429/backpressure response and
  confirm the existing `pending`-without-attempts-increment behavior still
  applies exactly as before (no new branch was added).
- Existing risk behavior unchanged: fixed input set produces the same
  `risk_level`/`risk_score` as before this feature (protects §40's "must not
  change existing risk semantics").
- Event aggregation: `by_sentiment`/`by_stance` counts match a manually
  computed expected count for a fixture set of `social_media_event_media` rows.
- Event API: `GET /events/:id/content` returns `stance` per item; `GET
  /analytics-hub/events` returns `by_stance`.
- Frontend: `ContentCard` renders the correct stance badge/color for each
  label including `null` (no badge, matching existing sentiment/risk
  null-handling); `AnalyticsHub` `EventsTab` renders the new breakdown charts
  correctly, including the existing `EmptyChartNote` empty-state when no data
  exists yet (e.g., immediately after deploy, before any post has a stance
  value).

### Cross-tenant test (explicit, per brief §36)

- Construct a test scenario where Tenant 1 and Tenant 2 each have a queued
  post referencing "the police" generically. Confirm Tenant 1's post is
  classified with `tenant_name = Tenant 1`'s display name and Tenant 2's post
  with Tenant 2's — and that neither ever receives the other's name, even
  under the existing global poller/queue behavior (§8) where both tenants'
  jobs may be processed by the same running process, potentially
  interleaved.

---

## 27. Migration Plan

No traditional migration files exist in this repository (schema is applied by
pushing `tenant.schema.prisma` directly per tenant DB via
`ensureSchema.js`/`ensureOpsSchema.js`). For the Option A recommendation in
§14, **no schema push is required at all** — `analysis_result` is already a
`Json` column and simply gains new keys inside it, which requires no DDL.

If the optional Phase 2 typed `stance` column on `social_media_alerts` is
later approved: add the field to `tenant.schema.prisma`, then run the
existing schema-application mechanism once per tenant database (the same
mechanism already used for every prior schema change in this repo) — this
document does not perform that step.

---

## 28. Deployment Considerations

- Sentiment API: prompt/schema change is a code deploy of that service. Given
  it's a **shared** service across tenants (§41), the change must be
  backward-compatible for the instant it deploys (which it is, by design —
  `tenant_name` optional, `stance` additive) so that in-flight/queued requests
  from Saga (which won't send `tenant_name` until Saga itself is deployed)
  continue to work unchanged.
- Saga: the tenant-name resolver and the `tenant_name` request field should
  deploy together; a partial deploy (Saga updated, Sentiment API not yet)
  would simply have the Sentiment API ignore the unrecognized field
  (Pydantic's default behavior for an `Optional` field it doesn't define yet
  would actually reject unknown fields depending on model config — the
  Sentiment API should deploy first, or the field addition should be
  validated for forward-compatibility before Saga starts sending it).
- No PM2/ecosystem config change is required — no new process, no new port,
  no new service. Existing per-tenant process topology (`deploy/sites.json`)
  is untouched.
- No new environment variables are strictly required, though a
  `STANCE_ENABLED`-style flag could be considered by the implementing team if
  a staged rollout (tenant-by-tenant or percentage-based) is desired before
  fully trusting stance quality — this document does not mandate one, since
  no feature-flag mechanism currently exists in either repo to hang it off of,
  and inventing one is outside this brief's smallest-change goal unless the
  team decides staged rollout is a hard requirement.

---

## 29. Rollback Plan

- **Sentiment API:** since the change is purely additive (new optional
  request field, new optional response key), rollback is a standard code
  revert of the prompt/schema change — no data migration to undo, because no
  schema changed there.
- **Saga:** rollback the small set of files in §25. Because `stance` lives
  inside the existing `analysis_result` JSON blob, no destructive schema
  change needs to be undone — old rows with a `stance` key already written
  simply keep an unused field if the feature is rolled back; no cleanup step
  is required, and nothing about existing `sentiment`/`risk_level` behavior is
  altered by this feature at any point, so a rollback cannot corrupt the
  existing risk/sentiment pipeline.
- **Frontend:** revert the additive UI changes; absence of `stance` in API
  responses (post-rollback) is already handled the same way missing
  `sentiment`/`risk_level` is handled today (conditional rendering, no crash).

---

## 30. Risks

1. **Prompt-quality risk (highest):** whether the LLM can reliably distinguish
   sentiment from stance, and neutral from unclear, for real Indian
   social-media text (Hindi/Hinglish/regional languages, sarcasm, mixed
   signals) is unproven by this code review and can only be established by
   empirical evaluation against real examples (§22, §26) before trusting
   stance in any dashboard shown to end users.
2. **Shared-prompt regression risk:** because sentiment/risk/stance now share
   one prompt, any prompt edit for stance risks subtly changing existing
   `category`/`risk_score`/`recommended_action` outputs for the same call —
   this must be regression-tested against the existing test suite/fixtures,
   not assumed safe.
3. **Global queue/poller cross-tenant processing (pre-existing, not
   introduced by this feature, but load-bearing for its correctness):**
   because the sentiment queue and poller already process every tenant's
   backlog from any single running process, the tenant-name resolver must be
   airtight per-job — a bug here would misattribute stance across tenants
   silently (wrong `tenant_name` sent, still returns *a* label, just for the
   wrong entity) rather than failing loudly. Recommend explicit logging of
   `(postId, dbName, tenant_name)` on every intelligence call during initial
   rollout to make this auditable.
4. **JSON-path aggregation query risk:** the new `by_sentiment`/`by_stance`
   raw SQL query in `analyticsHub.service.js` is new code in a codebase that
   otherwise relies entirely on Prisma's typed query builder — needs careful
   review for correct Postgres JSON operator usage and for tenant-DB
   Prisma-client wiring (`dbOf(query.db)`) consistency with the rest of the
   file.
5. **Retry-After still not honored (pre-existing gap, not fixed by this
   feature):** if stance generation makes calls marginally slower/more likely
   to hit the LLM gate, the existing fixed-30s-poll retry behavior (rather
   than honoring the Sentiment API's own `Retry-After` hint) means recovery
   from a saturated LLM gate is slightly less efficient than it could be —
   noted as a pre-existing limitation this feature does not worsen but also
   does not fix.

---

## 31. Open Questions

1. Should `social_media_alerts` get a typed `stance` column (Phase 2, §14) so
   stance can be filtered the way `risk_level` is today, or is Events-level
   display/aggregation the only requirement for now?
2. Should Events gain a `stance`/`sentiment` **filter** in this phase, or only
   display/aggregation (brief §19 asks to plan, not necessarily build, the
   filter)?
3. Should historical backfill (§18) be scheduled at all, and if so, for all
   tenants or a bounded recent window — this is a product/cost decision, not
   a technical blocker.
4. Should a feature flag / staged rollout exist for stance, given no such
   mechanism currently exists in either repo (§28)?
5. Is the categorical `stance.confidence` (`high|medium|low`, reusing
   `evidence_confidence`) sufficient, or does product want a numeric score
   (matching the brief's own conceptual example of `"score": -0.76`) — the
   current model/prompt has no existing precedent for producing calibrated
   numeric confidence for anything else it returns, so a numeric score would
   be new territory requiring its own evaluation.
6. What is the actual current volume of `analysis_status = 'done'` rows per
   tenant, to inform §18's backfill cost/scope decision? Not measured by this
   review (would require running a query against live tenant databases,
   outside a static code review's scope).

---

## 32. Final Feasibility Verdict

```
FEASIBLE WITH MODIFICATIONS
```

**Evidence for feasibility:**
- The existing `/analyze/intelligence` call already produces multiple
  independent classifications (sentiment + category + intent + risk_score) in
  one LLM generation — adding `stance` as one more field in that same
  response is architecturally proven-in-kind, not a new mechanism.
- The existing queue/retry/persistence lifecycle already treats
  sentiment+risk as one atomic operation — stance inherits this for free with
  no new queue, no new retry code, no new job type.
- Tenant identity already exists, is already resolved server-side, and is
  already tied to the same `dbName` that scopes every tenant-isolated query —
  the only gap is that the background job path doesn't currently carry it
  forward, which is a small, well-understood addition.
- Raw Sentiment is *already computed and already displayed per-post* in
  Events — the only real gap for Raw Sentiment is event-level aggregation,
  which has a precedented, small fix (JSON-path query, mirroring the existing
  Alerts `by_risk` pattern).

**Evidence for "with modifications" rather than a trivial change:**
- Stance is a genuinely new model capability, not a relabeling of existing
  sentiment — it requires prompt engineering and empirical evaluation, which
  carries real, unquantified accuracy risk that this code review cannot
  resolve by itself.
- The background queue/poller's global, cross-tenant, request-context-free
  design means the tenant-name resolution path must be added carefully and
  tested explicitly for cross-tenant correctness (§30.3).
- Event-level aggregation of any JSON-nested field is currently unsupported
  by the existing Prisma query patterns and requires new (small) raw-SQL
  code, not a one-line change.

---

## 33. Phase-by-Phase Implementation Plan

**Phase 1 — Sentiment API contract/model changes**
- Files: `api_server.py` (`AnalyzeRequest`, `/analyze/intelligence` handler),
  `src/intelligence.py` (prompt, response schema/validation), `config.py`
  (optional `STANCE_LABELS` constant), `README.md`.
- Add optional `tenant_name` to the request; add stance instruction block to
  the prompt; add `stance` to the response schema, populated only when
  `tenant_name` is present.
- Dependencies: none (independent of Saga).
- Risks: prompt-quality/regression risk (§30.1, §30.2).
- Tests: full Sentiment API test list in §26; explicit regression check that
  existing sentiment/risk/category outputs are byte-for-byte unchanged for a
  fixed fixture set with the new prompt when `tenant_name` is omitted.
- Rollback: revert the code change; no data to unwind.

**Phase 2 — Saga tenant-name resolution**
- Files: new small resolver (colocated with `analyzePost.js`/`analyzeEventMedia.js`),
  reusing `user.application.js`'s `readApplicationDetails`.
- Dependencies: none on Phase 1 (can be built/tested independently against a
  mock Sentiment API response).
- Risks: cross-tenant misattribution if the resolver ever looks up a
  different `dbName` than the job's own (§30.3) — mitigate with explicit
  logging and the cross-tenant test in §26.
- Tests: resolver unit tests; cross-tenant test from §26.
- Rollback: revert; no persisted data depends on it yet.

**Phase 3 — Saga intelligence persistence**
- Files: `intelligence.client.service.js` (add `tenant_name` to request,
  extract `stance` in `flattenResult`), `analyzePost.js`, `analyzeEventMedia.js`
  (call resolver, add `stance`/`stance_confidence` to `analysis_result`).
- Dependencies: Phase 1 (API must accept/return the new fields) and Phase 2
  (resolver must exist).
- Risks: none new beyond Phase 1/2's already-listed risks; this phase is
  otherwise a mechanical extension of an existing, well-tested code path.
- Tests: Saga persistence tests from §26; existing risk/sentiment regression
  test (§26) to confirm this phase didn't disturb the current pipeline.
- Rollback: revert; existing rows keep whatever `stance` key they already
  got written (harmless, unused) if rolled back.

**Phase 4 — Events per-item exposure**
- Files: `event.utils.js` (`hydrateEventMedia`).
- Dependencies: Phase 3 (there must be a `stance` value to expose).
- Risks: low — one-line addition mirroring an existing pattern.
- Tests: `GET /events/:id/content` returns `stance` per item.
- Rollback: revert; response simply stops including the field.

**Phase 5 — Events aggregation**
- Files: `analyticsHub.service.js` (`getEventsAnalytics`, new JSON-path
  query), optionally `event.service.js` (`getDashboard`).
- Dependencies: Phase 3 (needs real stance data to aggregate meaningfully,
  though the query can be built/tested against fixtures earlier).
- Risks: new raw-SQL code (§30.4) — needs careful review/testing of Postgres
  JSON operators and multi-tenant Prisma client wiring.
- Tests: aggregation correctness tests from §26.
- Rollback: revert; existing `by_status`/`by_origin`/`content_by_platform`
  keys are unaffected since this only adds new keys.

**Phase 6 — Events frontend**
- Files: `ContentCard.jsx` (stance badge), `AnalyticsHub.js` (`STANCE_COLORS`/`SENTIMENT_COLORS`,
  new breakdown blocks in `EventsTab`).
- Dependencies: Phase 4 (per-item) and Phase 5 (aggregate).
- Risks: low — purely additive UI mirroring existing components; verify in a
  real browser per this session's UI-testing guidance once implemented.
- Tests: manual verification of badge rendering and chart rendering,
  including empty states (no stance data yet).
- Rollback: revert; UI simply stops rendering the new badge/charts.

**Phase 7 — Tests (consolidation)**
- Run the full test plan in §26 across both repositories, including the
  explicit cross-tenant test, before considering the feature complete.

**Phase 8 — Controlled deployment**
- Deploy Sentiment API first (backward compatible on its own, per §28).
- Deploy Saga changes second.
- Consider validating stance quality on a small subset of live traffic (one
  tenant, or a sampled window) before enabling the Events UI changes broadly,
  given the unresolved prompt-quality risk in §30.1 — this is a product
  decision (§31.4), not a technical blocker, and this document does not
  mandate a specific mechanism since none exists today.

---

## What must NOT change (protected by this plan)

- Existing risk calculation logic and thresholds (`scoreToLevel`,
  `alert_config` per-tenant thresholds) — untouched.
- Existing sentiment taxonomy and behavior for any consumer that doesn't send
  `tenant_name` — the Sentiment API's `/analyze` endpoint and the
  `/analyze/intelligence` endpoint's existing fields are unchanged for
  existing callers.
- Tenant isolation model (database-per-tenant, `dbOf`/`getTenantPrisma`) —
  unchanged; stance data is written into the same per-tenant database as
  everything else.
- Existing queue/retry/backpressure architecture — reused as-is, no second
  pipeline introduced.
- The Sentiment API's status as a shared, stateless service — no tenant
  database, tenant queue, or tenant state is introduced into it.
- Existing Events behavior for any client that doesn't yet read the new
  `stance`/`by_stance` fields — purely additive response changes throughout.
