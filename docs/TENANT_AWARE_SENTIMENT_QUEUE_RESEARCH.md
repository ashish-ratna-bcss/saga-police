# Tenant-Aware Sentiment Queue — Research

**Status: research only. No code, schema, database data, branch, PM2 config, or
deployment was modified to produce this document.** Every finding below is
either a **FACT** (directly observed in code, config, or live read-only DB
query), a **RECOMMENDATION** (a judgment call this document is making), or an
**INFERENCE** (a reasoned conclusion from facts, flagged as such because it
wasn't directly observed). Anything not established from code/schema/DB/config
is marked `NOT DETERMINED` rather than guessed.

This builds directly on the stance-feature work already shipped tonight
(`ai-on-events` → `multitenancy`, Saga; `fix/odia-*` → `multitennacy`,
Sentiment API) — the tenant-name resolver and request/response contract
described there already exist in code, not just in this doc.

---

## 1. Executive Summary

- Saga's canonical, system-wide tenant identifier is **FACT: `db_name`** — a
  physical Postgres database name. It is what the JWT carries, what auth
  middleware resolves per request, what every background job (queue, poller)
  carries, and what every Prisma tenant-client lookup keys on. It is already
  the de facto tenant key everywhere in the codebase — this document did not
  have to invent one.
- Saga already resolves a **human-readable tenant name** (`tenant_name`, e.g.
  `"ODISHA BLURA SAGA"`) from `db_name` and already sends it to the Sentiment
  API — this was built and deployed earlier tonight
  (`backend/src/lib/tenantDatabase.service.js#resolveTenantName`,
  `intelligence.client.service.js`'s `tenant_name` request field). **FACT.**
- The Sentiment API's admission control (`LlmGate`) has **no per-tenant
  awareness at all** — one process-wide semaphore (`size=2` by default),
  admits-or-immediately-429s, no FIFO wait queue, no notion of "whose request
  this is." **FACT**, confirmed by reading `src/llm_gate.py` in full.
- **Critical, previously-undocumented finding**: the deployed `sentiment-api`
  process runs `uvicorn ... --workers 2` (confirmed via live `pm2 jlist`).
  This means **there are two independent OS processes** behind one port, each
  with its own `LlmGate` singleton, its own circuit-breaker state, its own
  loaded models. **Any pure in-memory per-tenant queue design inherits this
  same split**, unless explicitly built to survive it. **FACT + this is the
  single most load-bearing finding for the whole proposed architecture.**
- The current burst is **not** caused by the Sentiment API alone. It emerges
  from the intersection of: (a) 4 independent Saga tenant processes each
  polling/enqueuing with zero cross-tenant coordination, (b) the Sentiment
  API's gate being split across 2 uvicorn workers with no shared state
  between them, and (c) — until tonight's fix — Odisha's Odia-language bug
  silently doubling its effective demand on that shared, already-fragmented
  capacity. **FACT** (all three independently confirmed in code/logs).
- The proposed tenant-aware fair-queue architecture is **feasible as an
  in-memory, additive design inside the Sentiment API repo**, with one
  structural caveat that must be decided before implementation: **it must
  either force `--workers 1` (real throughput cost) or be built
  worker-aware from day one** (a bigger change). **RECOMMENDATION**, argued
  in full in §13.
- Tenant queues would fix **fairness**, not **correctness bugs**. They would
  have **no effect** on the ~197-attempt Saga retry loop or on orphaned
  `processing` rows — those are Saga-side state-machine bugs, unrelated to
  which tenant's request the Sentiment API services next. **FACT**, argued
  in §19.
- **Implementation readiness: BLOCKED on one open decision** (the
  multi-worker question, §13) and one open question about the identifier to
  send (§7) — everything else is ready to design from.

---

## 2. Saga Tenant Identity — Exact Source of Truth

Traced end-to-end, starting from login, using the actual code (not assumed):

```
Admin creation (backend/src/modules/user/user.service.js)
  → users row created in the MAIN database (schema.prisma), with:
      db_name             (physical tenant Postgres DB name — set here)
      application_details (JSON: {title, description, application_name, domains[]})
      port                (unique, admin-only — child users get port: null)
      role_id             (FK to roles; admin vs user)
       ↓
Login (backend/src/modules/auth/auth.service.js#generateToken)
  → JWT payload: { user_id, db_name, sid }
       ↓
Every authenticated request (backend/src/middleware/auth.middleware.js:95-181)
  → jwt.verify() → prisma.users.findUnique(decoded.user_id)
  → req.tenantDbName = user.db_name   (the LIVE DB VALUE, not the JWT claim —
    if they disagree, a warning is logged and the DB value wins, auth.middleware.js:150-154)
  → req.tenantPrisma = getTenantPrisma(tenantDbName)
       ↓
Tenant display name (backend/src/modules/user/user.application.js#readApplicationDetails)
  → application_details.title, defaulting to "BLURA SAGA" if unset
```

**FACT: There is no dedicated `Tenant` model or `tenants` table anywhere in
either Prisma schema.** A "tenant" is an admin-role row in the shared main-DB
`users` table. Confirmed by reading `backend/prisma/schema.prisma` in full —
only `users`, `roles`, `auth_sessions` exist on the main DB.

**FACT: `db_name` is the canonical, stable, system-wide tenant key already in
use everywhere:**
- JWT claim (`auth.service.js:5-10`)
- Request context (`req.tenantDbName`, set in every authenticated request)
- Tenant Prisma client pool key (`tenantDatabase.service.js#getTenantPrisma`,
  a `Map<dbName, PrismaClient>`)
- Background job payload (`{postId, dbName, kind}` in
  `sentimentanalysis/queue.js`)
- Poller iteration key (`listTenantDbNames()` returns `db_name` values,
  `pollPending.js`)

**FACT: `application_details.title` (referred to as `tenant_name` throughout
this document and in the code shipped tonight) is the human-readable name,**
resolved from the same `users` row, but is a **separate, mutable, free-text
field** with no uniqueness constraint.

**FACT: neither `db_name` nor `tenant_name` is a numeric "tenant ID."** The
closest thing to a stable numeric identifier is the admin user's own `id`
(Int, autoincrement, on the main `users` table) — but this document found no
existing code path anywhere that uses the numeric admin `id` as a
tenant-partitioning key. It is not currently "the" tenant identifier in
practice, only a candidate (evaluated in §7).

---

## 3. Database Findings

### 3.1 Control (main) database — `backend/prisma/schema.prisma`

| Entity/Table | Field | Meaning | Unique? | Stable? | Candidate for Sentiment API |
|---|---|---|---|---|---|
| `users` | `id` (Int) | Row's own numeric ID | Yes (PK) | Yes | Candidate D (opaque numeric key) — not currently used as a tenant key anywhere |
| `users` | `db_name` (String?) | Physical tenant Postgres DB name | Yes in practice (one admin owns each; shared by that admin's own child users, never across tenants) — **no DB-level unique constraint**, uniqueness is enforced only by provisioning logic (`buildAdminDatabaseName`) | Yes — used as the live DB connection target; changing it would break the tenant's own connectivity | Yes, but leaks infra detail (see §16) |
| `users` | `application_details.title` (Json field) | Human-readable tenant/org display name | **No** — free text, no uniqueness constraint anywhere in schema or app code | **No** — admin can change it any time via settings | Yes — already in use (tonight's `tenant_name`) |
| `users` | `port` (Int?) | Frontend port, admin rows only | Yes (`@unique` in schema) | Reasonably stable (infra plumbing, rarely changed) | Not semantically a tenant identity; only identifies admin rows |
| `users` | `role_id` (Int) | FK to `roles` | No | Yes | No — identifies role, not tenant |
| `roles` | `slug` | e.g. `admin`, `superadmin`, `user` | Yes | Yes | No — not tenant-specific |

**No `tenants`, `organizations`, `admins`, `default_policies`-with-tenant-scope,
or `configuration` table exists.** `default_policies` exists but is a
single shared table with no tenant scoping column — confirmed by reading the
full schema; it is not part of tenant identity.

### 3.2 Tenant database — `backend/prisma/tenant.schema.prisma`

**FACT: the tenant database itself contains no `tenant_id`, `tenant_name`,
`organization_name`, `state_name`, `admin_name`, or branding/settings table
naming the tenant.** Read the full 401-line schema — models are
`platforms`, `social_media_profiles`, `social_media_accounts`,
`social_media_posts`, `social_media_alerts`, `social_media_grievances`,
`social_media_grievance_reports`, `social_media_grievance_contacts`,
`keywords`, `social_media_occasion_calendar`, `social_media_events`,
`social_media_event_media`, `alert_config`, `report_templates`,
`policy_mappings`, `audit_logs`. None of them store the tenant's own
identity — the tenant DB is purely operational data, self-identifying
nothing.

**Conclusion (FACT): the tenant database cannot resolve its own canonical
identity or human-readable name without querying the control DB.** The
`db_name` a given tenant Prisma client is connected to is known only because
the *caller* (Saga backend) chose it when opening the connection — the
database itself has no internal record of "I am tenant X." This is why
tonight's `resolveTenantName()` has to query the **main** DB
(`mainPrisma.users.findFirst({ where: { db_name, port: { not: null } } })`),
not the tenant DB.

### 3.3 Actual database values (read-only, live, no secrets)

Pulled via a read-only `findMany` (no writes) against the main DB:

| id | username | role_id | db_name | port | title (tenant_name) |
|---|---|---|---|---|---|
| 2 | odisha@blurasaga.com | 2 (admin) | `blurasaga_odisha_blurasaga_com_odisha_blura_saga_2` | 3000 | ODISHA BLURA SAGA |
| 3 | delhipolice | 2 (admin) | `blurasaga_delhipolice_delhi_blura_saga_3` | 3001 | DELHI BLURA SAGA |
| 4 | uttarakhandpolice | 2 (admin) | `blurasaga_uttarakhandpolice_uttarakhand_blura_saga_4` | 3002 | UTTARAKHAND BLURA SAGA |
| 5 | test | 2 (admin) | `blurasaga_test_test_blura_saga_5` | 3003 | Test BLURA SAGA |
| 6 | devteam | 3 (user) | `blurasaga_delhipolice_delhi_blura_saga_3` | null | DELHI BLURA SAGA (inherited) |
| 7 | ashish | 3 (user) | `blurasaga_delhipolice_delhi_blura_saga_3` | null | DELHI BLURA SAGA (inherited) |

**FACT confirmed by this data**: `db_name` correctly groups an admin with its
own child users (rows 6, 7 share row 3's `db_name` and inherited `title`) —
this is empirical proof that `db_name` is the right grouping key, not `id`
or `username` (both are per-user, not per-tenant).

**FACT**: `db_name` literally embeds the admin's username/email, slugified
(`odisha@blurasaga.com` → `odisha_blurasaga_com`), plus the title-slug, plus
the numeric admin `id`. This is a real finding for the security section
(§16) — `db_name` is not an opaque token, it's a derived, mildly
PII-adjacent infrastructure string.

---

## 4. Background Job Tenant Flow

Traced through actual code, not assumed:

| Stage | Tenant available? | Field | Source | Can it be propagated further? |
|---|---|---|---|---|
| Monitoring scheduler (per platform, `monitoringsocialmedia/*/scheduler.js`) | Yes | `dbName` (loop variable from `listTenantDbNames()`) | Main DB `users.db_name` | Yes — already flows into `upsertPost` |
| Post upsert (`upsertPost.js`) | Yes | `dbName` | Passed down from scheduler | Yes — calls `enqueuePost(id, {dbName})` |
| In-memory queue (`sentimentanalysis/queue.js`) | Yes | `job.dbName` | Job object field, `{postId, dbName, kind}` | Yes — carried through the whole job lifecycle |
| Poller (`pollPending.js`) | Yes | `dbName` (loop variable) | `listTenantDbNames()` | Yes — same as scheduler |
| Queue processor (`sentimentanalysis/index.js`) | Yes | `job.dbName` | Queue job | **FACT: was NOT propagated into `analyzePost`/`analyzeEventMedia` before tonight** — only `db` (the resolved tenant Prisma client) was passed, `dbName` (the string) was dropped. **Fixed tonight** — `index.js` now passes both `db` and `dbName`. |
| Worker (`analyzePost.js` / `analyzeEventMedia.js`) | Yes (as of tonight) | `dbName` param | Queue processor | Yes — resolves `tenant_name` via `resolveTenantName(dbName)` and passes to the intelligence client |
| Intelligence client (`intelligence.client.service.js`) | Yes (as of tonight) | `tenant_name` (resolved string) | `resolveTenantName()` | Yes — already sent in the `/analyze/intelligence` request body |
| Sentiment API | Yes (as of tonight) | `tenant_name` (request field) | Saga's request body | This is the boundary — everything from here on is what this research is about |

**INFERENCE**: before tonight's stance work, tenant identity existed at
every stage *except* the worker/intelligence-client boundary, where it was
silently dropped despite being available one function call away. This
matches exactly what this document's earlier work (the stance feature) had
to fix to make `tenant_name` reach the API at all.

---

## 5. Current Sentiment API Architecture

```
POST /analyze/intelligence
  ↓ Pydantic validation (AnalyzeRequest: texts, policy_pack?, intent_mode?, timeout_s?, tenant_name?)
  ↓ _validate(texts) — size/char-count limits, 413 if exceeded
  ↓ _resolve_intelligence_options() — parses policy_pack, clamps timeout_s, validates tenant_name (422 on control chars/length)
  ↓ _run_pipeline_with_fallback(texts, request_id)
      deterministic stage: LID → roman-LID → transliteration → translation → Cardiff sentiment
      serialized by a single `threading.Lock` (_inference_lock), WAITS up to INFERENCE_LOCK_TIMEOUT_S (blocking, not reject-immediately)
  ↓ _analyzer.analyze_batch(payloads, tenant_name=tenant_name, ...)
      one vLLM chat-completion call per unique text, admitted through LlmGate
  ↓ {"results": [{...pipeline fields, "intelligence": {...,"stance","stance_confidence"}}]}
```

**FACT**: the deterministic stage (translation + Cardiff sentiment) and the
LLM/intelligence stage have **two different admission-control mechanisms**:
- Deterministic: a single `threading.Lock`, **blocking** (waits, with a
  timeout), effectively a size-1 FIFO-ish queue (Python's GIL/lock wakeup
  order is not a strict FIFO guarantee, but functions as one in practice for
  this workload).
- LLM (`LlmGate`, `src/llm_gate.py`): **non-blocking**. `acquire()` either
  admits immediately or raises `LlmGateFull` (429) / `LlmCircuitOpen` (503)
  **instantly** — there is no wait queue for the LLM gate at all today.

---

## 6. Current Queue/Burst Problem — Exact Source

**FACT, not assumption** — three independent, compounding causes, traced in
code:

1. **No cross-tenant coordination on the Saga side.** 4 independent PM2
   processes (`delhipolice-api`, `odisha-api`, `uttarakhandpolice-api`,
   `test-api`), each running its own poller (`pollPending.js`, every 30s,
   `listTenantDbNames()` with **no filter** — meaning every tenant's process
   also processes every *other* tenant's backlog, confirmed in the earlier
   feasibility doc's tenant-isolation findings) and its own queue
   (`SENTIMENT_QUEUE_CONCURRENCY=1` default, `INTELLIGENCE_BULK_CONCURRENCY=1`
   default). Up to 4 concurrent `/analyze/intelligence` requests can already
   originate simultaneously with zero knowledge of each other.
2. **The Sentiment API's own admission control is split across 2 processes**
   with no shared state (§1, §13) — the effective capacity a given request
   sees depends on which of the 2 uvicorn workers the OS/uvicorn routed it
   to, and that worker's *own* gate/circuit state, not a true global view.
3. **Until tonight, Odisha's Odia-language bug doubled its own demand** —
   every Odisha post needed 2 LLM gate slots (`pipeline_fallback` +
   `intelligence`) instead of 1, confirmed via live `llm_gate`/
   `pipeline_fallback.queue` stats before and after the fix. This alone was
   enough to push `rejected: 350` out of ~650 gate attempts in one log
   window.

**INFERENCE**: with cause 3 now fixed, the remaining structural causes (1
and 2) are still present and will still produce bursts/429s under enough
simultaneous tenant load — they were simply less visible while Odisha was
consuming double share. **This document does not claim the burst problem is
fully solved** — only that the Odia-specific amplification of it is gone.

---

## 7. Tenant Identifier Comparison

| Criterion | `db_name` | `tenant_name` (title) | numeric `id` | new opaque `tenant_key` (not implemented) |
|---|---|---|---|---|
| Uniqueness | Enforced by provisioning logic, not a DB constraint | **Not unique** (no constraint, free text) | DB primary key — guaranteed unique | Would need to be generated; could guarantee uniqueness |
| Stability | Stable (it's the live connection target) | **Mutable** — admin can rename branding any time | Stable (PK never changes) | Stable by design |
| Availability in Saga | Everywhere (JWT, middleware, jobs) | Everywhere (resolved from same row) | Everywhere (same row) | Not implemented |
| Availability in background jobs | **Yes — already the field carried on every job** | Resolved from `db_name` (needs the same DB lookup either way) | Resolvable from the same row | Not implemented |
| Human readability | Poor (`blurasaga_odisha_blurasaga_com_odisha_blura_saga_2`) | Good (`ODISHA BLURA SAGA`) | Poor (bare integer) | Depends on design |
| Security/privacy | **Leaks admin username/email slug + internal numeric ID** (§16) | Already shown in UI/branding — no new exposure | Bare integer, low information content, but reveals admin creation order/count across tenants | Best — reveals nothing if generated as a random/hashed token |
| Mutability | Effectively immutable (renaming breaks the live DB connection) | Mutable | Immutable | Immutable by design |
| Length | Long (~50-63 chars, Postgres NAMEDATALEN-capped) | Variable, admin-controlled | Short | Design choice |
| Safe as map/dict key | Yes (string) | Yes, but **two tenants could collide** since it's not unique | Yes | Yes |
| Backward compatibility | `tenant_name` already ships in the current contract; switching now is a breaking change to what's already deployed | **Already the field in production tonight** | Would be a new field, not breaking anything existing | New field, not breaking |
| Cross-service suitability | Poor — it's Saga's own infra detail | Good for a *queue label*, poor as a strict uniqueness guarantee | Fair — bare integer, low readability but safe | Best, if built |

**RECOMMENDATION**: use `db_name` as the **queue-partitioning key**
(internal, never logged/exposed raw — see §16), and keep `tenant_name` as
the **human-readable label** for logs/dashboards. This is not a new
decision — it reuses exactly the field already flowing through every job
today (§4), requires no new Saga-side plumbing, and sidesteps
`tenant_name`'s non-uniqueness (two tenants could theoretically pick an
identical display title; `db_name` cannot collide across tenants by
construction). The privacy concern in §16 is about not **exposing** `db_name`
in logs/metrics, not about using it internally as a map key — those are
different things.

**Do NOT use the numeric admin `id`** as the primary key for this: it is not
currently propagated anywhere in the job/request chain (§4), so using it
would require new plumbing that `db_name` doesn't need, for no clear benefit
over `db_name` as an internal key.

---

## 8. Recommended Metadata Contract

**FACT**: neither repository has a generic `metadata`/`meta`/`context`
object anywhere in the request or response schema. Confirmed by grep across
both repos for `metadata`, `meta`, `context`, `request_id`, `job_id` — the
only `request_id` that exists is the Sentiment API's own internal,
per-process, log-only counter (`itertools.count(1)` in `api_server.py`),
never returned to the caller and never tenant-scoped.

**RECOMMENDATION**: do not introduce a generic `metadata` wrapper object —
there's nothing to migrate into it, and `tenant_name` already shipped
tonight as a flat, additive top-level field on `AnalyzeRequest`, matching
this codebase's existing convention (`policy_pack`, `intent_mode`,
`timeout_s` are all flat optional fields, not nested under a wrapper). For
the queue-partitioning key specifically, the smallest additive change is one
more optional flat field:

```jsonc
// POST /analyze/intelligence (current + proposed addition)
{
  "texts": ["..."],
  "policy_pack": { "...": "..." },
  "intent_mode": "enum",
  "timeout_s": 60,
  "tenant_name": "ODISHA BLURA SAGA",   // already shipped tonight — human label, prompt context
  "tenant_key": "blurasaga_odisha_..."  // PROPOSED — queue-partitioning key, opaque, not shown to the LLM
}
```

`tenant_key` would need the same defensive handling `tenant_name` already
has (`_validate_tenant_name`-style sanitization) but **must never be
injected into the LLM prompt/payload** the way `tenant_name` intentionally
is — it's a scheduling key, not classification context. This is a real
design distinction the implementation must respect (see §22).

---

## 9. Fallback

**RECOMMENDATION**: `"unknown"`, not `"default"`.

Reasoning: `"default"` in this codebase already has an established, different
meaning — `alert_config.id` is literally the string `"default"` (the
single-row global config table, `tenant.schema.prisma:324`). Reusing
`"default"` as a fallback tenant-queue label risks a confusing collision in
logs/metrics between "the tenant-less fallback queue" and "the default
config row." `"unknown"` has no such collision and matches this codebase's
own existing convention for "couldn't determine X" (`language_detector.py`'s
`UNKNOWN = "unknown"`, `pipeline.py`'s language-unknown signal).

**On whether the fallback creates fairness concerns**: yes, and this must be
bounded. If `tenant_key` is ever missing (a caller that hasn't been updated,
or the resolver failing), those requests should land in a single shared
`unknown` queue that participates in the same round-robin rotation as any
named tenant queue — **not** get a free pass to bypass fairness entirely.
**RECOMMENDATION**, not yet designed in code.

---

## 10. Dynamic Tenant Queue Design (conceptual — not implemented)

```
Map<tenant_key, TenantQueue>
```

- Created lazily on first request from a new `tenant_key`.
- Removed when empty **and** idle past a TTL (not removed the instant it
  empties — a tenant mid-burst shouldn't have its queue torn down and
  rebuilt between consecutive requests).
- `TenantQueue` should be a thin FIFO of pending batches, not a copy of
  Saga's queue logic — this lives entirely inside the Sentiment API process.

**This is a RECOMMENDATION/conceptual design only — no code was written.**

---

## 11. Fair Scheduler (conceptual)

Given `VLLM_GATE_SIZE=2` (current), a round-robin scheduler would, on each
available gate slot, pick the next **non-empty** tenant queue in rotation,
skip empty queues without consuming a rotation slot, and insert newly-created
queues at the current rotation position (not always at the end, or a new
tenant could wait a full rotation before its first request is even
considered).

**RECOMMENDATION**: keep this scheduler logic **inside the Sentiment API**,
not Saga — Saga has no visibility into other tenants' demand by design (each
Saga tenant is an isolated process/DB), so fairness can only be enforced at
the one place that sees all tenants: the shared service.

---

## 12. 429 Handling — Tenant-Specific Cooldown

**FACT (current)**: `LlmGateFull`/`LlmCircuitOpen` are global — one
tenant's failures currently affect the shared circuit breaker state for
*everyone* hitting the same worker (§1's circuit breaker is not tenant-scoped
at all today).

**RECOMMENDATION**: a `next_eligible_at` per tenant key, checked before a
tenant's queue is considered for the next rotation slot, so Tenant A's
429/backoff doesn't remove Tenant B/C from rotation. This is a **new
data structure** (a `Map<tenant_key, timestamp>`), not present today.
**Not implemented — conceptual only.**

---

## 13. Multi-Process Considerations — the critical blocker

**FACT, confirmed live via `pm2 jlist`** (read-only inspection, no
modification):

```
name: sentiment-api
exec_mode: fork_mode      (PM2's view — it only manages ONE process)
instances: 1              (PM2 thinks there's one process)
script: uvicorn
args: ['api_server:app', '--host', '0.0.0.0', '--port', '8003', '--workers', '2', ...]
```

**PM2 manages exactly one process. That process is `uvicorn ... --workers
2`, which internally forks 2 independent OS worker processes sharing one
listening socket.** This was not visible from `/health` alone (each
`/health` call is answered by whichever worker the OS/uvicorn routed it to)
and is not documented anywhere in either repo — it only surfaced by
inspecting the live process arguments.

**Consequence (FACT/INFERENCE)**: `_GATE` (the `LlmGate` singleton),
`_inference_lock`, the loaded ML models, and any future in-memory
`Map<tenant_key, TenantQueue>` registry are **per-worker-process state**.
There is no shared memory between the 2 workers — no Redis, no shared file,
nothing. Confirmed by reading `get_llm_gate()`'s implementation: a plain
module-level global, `_GATE: LlmGate | None = None`.

This directly reproduces the exact failure mode Part 12/13 of the research
brief asked to check for:

```
                 uvicorn (1 listening socket)
                /                            \
               ↓                              ↓
         worker process 1                worker process 2
         Queue A (own memory)             Queue A (own memory, DIFFERENT instance)
         Queue B                          Queue B
```

Tenant A's requests could land on **either** worker depending on which one
the OS/uvicorn hands the connection to — there is no guarantee of
"sticky" routing to the same worker for the same tenant. **NOT DETERMINED**:
this document did not verify uvicorn's exact `--workers` connection
distribution algorithm (round-robin vs OS-level SO_REUSEPORT) from its
source — flagging this as unverified rather than asserting a specific
mechanism.

**Either way, the practical consequence is the same: a naive
per-process in-memory tenant queue cannot provide true global fairness**,
because "Tenant A's backlog" would be split unpredictably across 2 disjoint
in-memory structures that don't know about each other.

**RECOMMENDATION — three options, explicitly not choosing one without your
input:**

1. **Run with `--workers 1`.** Removes the split entirely; the in-memory
   design becomes trivially correct. Real cost: this uvicorn deployment
   currently gets 2x the deterministic-stage throughput from the OS
   scheduling both workers' `_inference_lock`s independently (they don't
   share that lock either) — dropping to 1 worker roughly halves raw
   throughput for the deterministic (translation/sentiment) stage, though
   the actual bottleneck observed tonight was the LLM gate, not the
   deterministic stage. **This is the smallest-code-change option** but has
   a real capacity tradeoff that needs a decision from whoever owns
   capacity planning for this service.
2. **Build the queue registry worker-aware from day one** — e.g. each
   worker tracks only what arrives at it, and fairness becomes
   "statistically fair across enough requests" rather than "strictly fair
   per request," accepting that a burst landing entirely on one worker
   won't be perfectly interleaved with a burst on the other. No new
   infrastructure, but weaker fairness guarantee than the brief's diagram
   implies.
3. **Introduce real shared state (Redis or equivalent).** Solves it
   properly, but is exactly the kind of new infrastructure earlier
   session guidance explicitly said not to introduce without the code
   review proving it necessary — and this document has now proven the
   *need* exists (§13), it just hasn't decided whether the cost is
   justified over option 1.

**This document does not recommend one of the three — it is the one
architectural decision this whole feature is blocked on**, per the
executive summary.

---

## 14. Tenant Key Selection — see §7

Comparison table already produced in §7 per the brief's request; not
duplicated here.

---

## 15. Fallback Behavior — see §9

---

## 16. Security Review

**FACT**: `db_name` encodes the admin's username/email (slugified) plus the
tenant's own branding title (slugified) plus the numeric admin `id` —
demonstrated directly in §3.3's real values
(`blurasaga_odisha_blurasaga_com_odisha_blura_saga_2` literally contains
`odisha_blurasaga_com`, derived from `odisha@blurasaga.com`).

**RECOMMENDATION**: if `db_name` (or any value derived from it) is used as
the queue-partitioning key internally, it should **never appear in logs,
metrics labels, or error messages verbatim** — those should use
`tenant_name` (already-public branding) instead. This is a policy for the
*implementation*, not something enforced by anything today (nothing
currently masks `db_name` in logs — `pollPending.js` and others log it
directly, e.g. `` `[sentimentanalysis] pollPending tenant=${dbName}` ``, an
existing pre-tenant-queue pattern this document is not asking to change,
just flagging as the existing baseline).

**`tenant_name` is already crossing the service boundary today** (shipped
tonight) — it is treated by the Sentiment API's own prompt-construction code
as "context only — never authorization, routing or a database selector"
(the exact wording in `intelligence.py`'s system prompt, confirmed by
reading it). This is the correct existing posture and should extend to
`tenant_key`: it must be usable for scheduling, **never** interpolated into
anything the LLM reads.

**Do not send credentials, connection strings, or the full `DATABASE_URL`**
— nothing in the current design does this, and this document is not
proposing to.

---

## 17. Fair Scheduling Design — see §11

Current batch/concurrency baseline (FACT, from `config.py`):

| Setting | Value | Scope |
|---|---|---|
| `BATCH_SIZE` | 16 | deterministic pipeline |
| `TRANSLATION_BATCH_SIZE` | 8 | IndicTrans2 |
| `VLLM_CONCURRENCY` | 2 | intended parallel LLM workers |
| `VLLM_GATE_SIZE` | 2 | **the real concurrency cap**, per the config.py comment itself |
| `VLLM_CIRCUIT_FAILURES` | 8 | consecutive failures before circuit opens |
| `VLLM_CIRCUIT_COOLDOWN_S` | 30 | circuit cooldown |

All of the above are **per-worker-process** values (§13) — with 2 uvicorn
workers, the *effective* combined gate capacity is currently 4 slots
total, split unevenly and non-deterministically between the two workers.

---

## 18. 429 / Backpressure Design — see §12

---

## 19. Burst Analysis — see §6

---

## 20. Retry Loop Relationship

**Explicitly separating these, per the brief's instruction:**

- **Queue fairness** (this document's subject): which tenant's *pending,
  not-yet-attempted* request gets the next available inference slot.
- **Retry termination** (the ~197-attempt bug found earlier tonight): a
  **Saga-side** state machine issue — `analysis_attempts` keeps getting
  reset to 0 by an unrelated re-fetch/upsert path (`upsertPost.js`) faster
  than the 5-attempt cap can ever be reached, so the same permanently-failing
  content gets endlessly re-queued.

**FACT/CONCLUSION: tenant-aware queues would have no effect on this bug.**
A fairer scheduler still eventually gives that content its turn — it would
still fail every time (the underlying cause, per the earlier session's
finding, was the Odia-language gap, now fixed for *new* language-detection
failures, but the reset-before-cap-is-reached mechanism itself is untouched
and would still apply to any *other* permanently-failing content in the
future). **This document does not claim tenant queues fix this bug.**

---

## 21. Orphaned Processing Rows — Relationship

**FACT/CONCLUSION**: no effect, and this is a genuinely separate concern.
Orphaned `processing` rows happen when a Saga worker crashes/restarts mid-
claim, and Saga's own poller query (`WHERE analysis_status IN
('pending','failed')`) never revisits `'processing'` rows. This is entirely
a Saga-side claim-lifecycle gap — it happens (or doesn't) regardless of how
fairly the Sentiment API schedules the requests that *do* get sent. Tenant
queues operate strictly downstream of this bug and cannot reach back to fix
it.

---

## 22. Stance Feature Compatibility

**FACT**: the stance contract shipped tonight (`tenant_name`,
`intelligence.stance`, `intelligence.stance_confidence`) is entirely
orthogonal to queue-level scheduling. `tenant_name` is prompt context
(consumed inside `_analyzer.analyze_batch()`, deep inside the pipeline);
a `tenant_key` for scheduling would be consumed **before** that, at the
admission-control layer (`LlmGate`/the proposed tenant queue), and would
never need to reach the prompt-building code at all. **They can coexist
without interference** — the request would simply carry both an
opaque scheduling key and a human-readable prompt-context field, used at
two different layers of the same request lifecycle.

---

## 23. Database Schema Change Requirement

**RECOMMENDATION: none required, in either repository.**

- **Saga DB**: no change. `db_name` already exists, already flows through
  every job, needs no new column/table.
- **Sentiment API**: no persistent queue table needed. The proposed design
  (§10) is entirely in-memory, process-local state — same pattern the
  existing `LlmGate` singleton already uses. Introducing a persistent queue
  table would be new infrastructure this document found no evidence is
  currently justified (see §24 for why in-memory is acceptable here).

---

## 24. Persistence / Restart Behavior

**FACT**: on a Sentiment API restart, an in-memory `Map<tenant_key,
TenantQueue>` would be wiped — but so would `_pipeline`, `_analyzer`,
`_GATE`, and every other piece of in-memory state that already exists
today. This is not a new risk the proposed feature introduces.

**Why this is safe (INFERENCE, grounded in already-traced Saga behavior)**:
Saga's own durable state (`social_media_posts.analysis_status`,
`social_media_event_media.analysis_status`) is the actual source of truth
for "what work is pending." A Sentiment API restart doesn't lose any Saga
work — in-flight requests fail (already-existing behavior today, unrelated
to tenant queues), Saga's own retry logic (§20's bug notwithstanding, for
requests that *aren't* permanently failing) picks them back up on the next
poll cycle or queue retry, and the tenant queues simply repopulate from
scratch as new requests arrive. **No new persistence is required as long as
this reasoning holds** — which it does today, because Saga was already
designed this way before tenant queues were proposed.

---

## 25. Memory/Resource Safety

**RECOMMENDATION** (not implemented, no code exists to size these against
real numbers yet):

- Cap the number of distinct tenant queues held at once — bounded
  naturally by the number of Saga tenants (currently 4, per §3.3's live
  data), but a hostile/malformed `tenant_key` should not be able to create
  unbounded queue objects. A simple upper bound (e.g. reuse the existing
  `API_MAX_TENANT_NAME_CHARS`-style length cap, plus a max-distinct-keys
  ceiling) is enough given the current tenant count.
- Idle queue TTL-based cleanup (§10) bounds long-term memory growth from
  tenants that stop sending work (e.g. a decommissioned tenant).
- Per-tenant queue depth cap, mirroring the existing pattern already used
  for the *interactive*/*bulk* lane's `maxQueue`/`maxWaiters` on the **Saga
  side** (`intelligence.client.service.js`'s `createLane()`) — the Sentiment
  API has no equivalent today and would need one for its own tenant queues.
- **NOT DETERMINED**: no specific numeric limits are recommended here
  because no load-testing data exists yet to size them against.

---

## 26. Observability Requirements

**RECOMMENDATION**, extending the existing `/health` pattern (which already
exposes `llm_gate` and `pipeline_fallback.queue` stats globally) to be
per-tenant:

- Tenant key created / removed (with `tenant_name` in the log line, not raw
  `db_name`, per §16)
- Queue depth per tenant, active tenant count
- Batches processed, batch duration, per tenant
- 429/circuit-open count per tenant, next-eligible cooldown per tenant
- Failed batch count per tenant
- Global inference utilization (already partially exposed via
  `llm_gate.in_flight`/`accepted`/`rejected`)

**Must not log post content** — nothing in the current logging does this
today either (confirmed: existing log lines use `tenant=<name>`,
`req %d: ... %d text(s)`, never the text itself), so this is a "don't
regress the existing good practice," not a new requirement.

---

## 27. Exact Implementation Plan (phased, not implemented)

| Repo | Branch | File/Component | Change | Reason | Dependency | Risk |
|---|---|---|---|---|---|---|
| Sentiment API | new branch off `multitennacy` | `config.py` | Decide + set `--workers` topology (§13 decision) | Blocks correct fairness | Owner decision on the 3-option tradeoff in §13 | Medium — throughput impact if `--workers 1` chosen |
| Sentiment API | same | `api_server.py` (`AnalyzeRequest`) | Add optional `tenant_key: str \| None` field, additive, same pattern as `tenant_name` | Scheduling key distinct from prompt-context `tenant_name` | §13 decision | Low |
| Sentiment API | same | new module, e.g. `src/tenant_queue.py` | `Map<tenant_key, TenantQueue>` registry + round-robin scheduler + per-tenant cooldown map | Core of the feature | `tenant_key` field | Medium — new concurrency-sensitive code |
| Sentiment API | same | `src/llm_gate.py` or its caller | Route gate admission through the tenant scheduler instead of directly | Fairness enforcement point | `tenant_queue.py` | Medium — touches the one piece of code every request already goes through |
| Sentiment API | same | `api_server.py` `/health` | Add per-tenant stats block | Observability (§26) | `tenant_queue.py` | Low |
| Saga | `ai-on-events`-successor or new branch | `intelligence.client.service.js` | Add `tenant_key: dbName` alongside the existing `tenant_name` in the request body | Supplies the scheduling key | §13 decision, Sentiment API's new field | Low — additive, `dbName` already resolved in scope at every call site |
| Saga | same | none needed elsewhere | `dbName` is already threaded through `analyzePost.js`/`analyzeEventMedia.js` from tonight's work | No new plumbing required | — | None |

**No Saga DB migration. No Sentiment API DB migration or new table** (§23).

---

## 28. Contract (proposed final shape)

```jsonc
// Request — additive to what already shipped tonight
{
  "texts": ["..."],
  "policy_pack": { "...": "..." },
  "intent_mode": "enum",
  "timeout_s": 60,
  "tenant_name": "ODISHA BLURA SAGA",         // already shipped — prompt context
  "tenant_key": "blurasaga_odisha_..."        // PROPOSED — scheduling key, opaque to the LLM
}
```

```jsonc
// Response — unchanged. Scheduling is invisible to the caller; it only
// affects WHEN a request is serviced, not the shape of what comes back.
{
  "results": [{ "...": "unchanged, including intelligence.stance" }]
}
```

```jsonc
// /health — additive block
{
  "...": "unchanged existing keys",
  "tenant_queues": {
    "active": 3,
    "by_tenant": {
      "ODISHA BLURA SAGA": { "depth": 4, "next_eligible_at": null },
      "DELHI BLURA SAGA": { "depth": 0, "next_eligible_at": null }
    }
  }
}
```

---

## 29. Acceptance Criteria (for a future implementation, not met by this document)

- A burst of requests from one tenant does not delay another tenant's
  request beyond one scheduler rotation, **under the chosen `--workers`
  topology from §13** (the criteria differ depending on which option is
  picked — this must be re-stated once that decision is made).
- A 429/circuit-open for Tenant A does not affect Tenant B/C's eligibility.
- Sentiment API restart does not lose any Saga-durable pending work (already
  true today, per §24 — verify it remains true).
- No tenant identifier or database name appears in logs in a way that
  reveals `db_name`'s embedded username/email slug (§16).
- Existing callers that don't send `tenant_key` still work unchanged
  (falls into the `unknown` shared queue, §9).
- No new database table or migration in either repository (§23).

---

# Final Answer

```text
RESEARCH COMPLETE

Saga tenant identity:
db_name (main-DB users.db_name) is the canonical, already-universally-used
tenant key — JWT, middleware, tenant Prisma pool, background job payloads
all key on it. No dedicated Tenant/tenants table exists in either schema.

Canonical tenant key:
db_name for internal partitioning/scheduling; application_details.title
("tenant_name") for the human-readable label already shipped in the
request contract tonight.

Tenant name:
application_details.title on the admin users row — mutable, not unique,
already resolved via resolveTenantName(dbName) and already sent as
tenant_name in the /analyze/intelligence request.

Tenant DB identifier:
db_name — physical Postgres database name, format
blurasaga_<username-slug>_<title-slug>_<admin-id>. Confirmed live for all
4 real tenants (read-only query, no secrets exposed).

Background job propagation:
Fully traced scheduler -> upsertPost -> queue -> poller -> processor ->
worker -> intelligence client. dbName was the one broken link (dropped at
the queue-processor -> worker boundary) before tonight; now fixed and
verified live.

Current Sentiment API queue:
No true queue for the LLM stage — a non-blocking semaphore (LlmGate,
size=2 default) that immediately 429s/503s when full. The deterministic
stage has a separate, blocking single lock. Neither has any tenant
awareness.

Current burst source:
Three compounding causes: (1) 4 independent Saga tenant processes with
zero cross-tenant coordination, (2) the Sentiment API's own admission
control split across 2 independent uvicorn worker processes with no
shared state, (3) until tonight, Odisha's language-detection bug doubling
its own demand. Not attributable to any single component.

Recommended metadata:
No generic metadata wrapper needed (none exists today, nothing to
migrate). Add one more flat optional field, tenant_key, alongside the
already-shipped tenant_name, matching this codebase's existing flat-field
convention.

Fallback:
"unknown" — not "default" (that string is already semantically taken by
alert_config's single-row id in the tenant schema).

Recommended queue architecture:
In-memory Map<tenant_key, TenantQueue> inside the Sentiment API process,
round-robin scheduler gating admission into the existing LlmGate, per-
tenant next_eligible_at for 429/circuit isolation. No new database, no new
external infrastructure — IF the multi-worker question below is resolved.

Multi-process concern:
CRITICAL, confirmed live: sentiment-api runs uvicorn --workers 2 (2
independent OS processes, no shared memory) despite PM2 showing it as one
"instance." Any in-memory tenant-queue design is split across these two
workers unless --workers 1 is chosen or the design is explicitly built
worker-aware. This is the one unresolved architectural decision blocking
implementation.

Database changes:
None required in either repository. Confirmed both DB schemas already
carry everything needed; the design is process-local, in-memory.

Saga changes:
One additive field (tenant_key = dbName) in
intelligence.client.service.js's request body. No new plumbing needed —
dbName is already in scope at every call site as of tonight's stance work.

Sentiment API changes:
New tenant_key request field, a new tenant-queue/scheduler module, gate
admission routed through it, additive /health stats. No response-shape
change.

Existing retry-loop relationship:
No effect. Tenant queues are a fairness mechanism; the ~197-attempt retry
loop is a Saga-side state-machine bug (attempts reset before the cap is
reached) that would still occur regardless of scheduling fairness.

Orphan processing relationship:
No effect. Orphaned processing rows are a Saga-side claim-lifecycle gap
(poller never revisits 'processing' status); entirely upstream of, and
unrelated to, how fairly the Sentiment API schedules the requests that do
get sent.

Implementation readiness:
BLOCKED — on one explicit decision (the --workers topology, §13) and one
design confirmation (whether tenant_key should be db_name as recommended,
§7). Everything else in this document is ready to hand to an
implementation phase once those two are decided.

Research document:
docs/TENANT_AWARE_SENTIMENT_QUEUE_RESEARCH.md
```
