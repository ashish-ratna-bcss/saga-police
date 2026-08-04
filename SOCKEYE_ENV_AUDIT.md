# SOCKEYE .env / Internal Networking Audit

**Scope:** every `.env` across `iccc-ws` (172.16.218.135) and `iccc-s` (172.16.212.229) for SOCKEYE and its directly-integrated services. Read-only — nothing was changed, restarted, or reconfigured. Secrets masked to variable names only.

---

## Final Table

| Service | Hosted On | Current .env Value | Recommended Internal URL | Accessible from Internal Network? | Notes |
|---|---|---|---|---|---|
| Backend → MongoDB | iccc-s | `MONGODB_URI="mongodb://172.16.212.229:27017/test"` | *(unchanged — already correct)* | ✅ Yes | Cross-host, private IP, no auth on Mongo side. Correct as-is. |
| Backend → Ollama | iccc-s | `OLLAMA_BASE_URL="http://172.16.212.229:11434"` | *(unchanged)* | ✅ Yes | Cross-host, correct. |
| Backend → RAG API | iccc-s | `RAG_API_URL=http://172.16.212.229:8100/` | *(unchanged)* | ✅ Yes | Cross-host, correct. Matches nginx's own `proxy_pass http://172.16.212.229:8100/api/rag/`. |
| Backend → Sentiment service | **iccc-ws** (same host) | `CUSTOM_SENTIMENT_URL=http://127.0.0.1:8003` | *(unchanged — correct)* | ⚠️ Loopback only | Same-host loopback is the *right* choice here (lower latency, not exposed). Only relevant if something on iccc-s ever needs to call it directly — it doesn't today. |
| Backend → Deepfake service | **iccc-s** — not iccc-ws | `DEEPFAKE_ML_URL="http://127.0.0.1:8001"` | `http://172.16.212.229:8001` (once restarted — see below) | ❌ **Broken** | Wrong host *and* wrong live target. Real service is `BluraSaga/deepfake_detection_py` on **iccc-s**, hardcoded `uvicorn.run(host="0.0.0.0", port=8001)` — but it isn't running (no PM2 entry, only orphaned `.pm2/logs/deepfake-detection-*.log`). Meanwhile port 8001 on iccc-ws is occupied by an *unrelated* app (`CP-CopPolice/backend`, transcription/OCR service) — so calls don't even fail cleanly, they hit a different real service that 404s on `/detect/image` etc. |
| Backend → Media analyzer | **iccc-s** — not iccc-ws | `MEDIA_ANALYZER_URL="http://127.0.0.1:8002"` | `http://172.16.212.229:8000` (after rebinding — see below) | ❌ **Broken** | Wrong host, wrong port, and the real service (`BluraSaga/media-download`, PM2 id 1) is **stopped**. Its own start command is `gunicorn app:app -b 127.0.0.1:8000` — bound to loopback even in its own config, so even running it would be unreachable from iccc-ws until rebound to `0.0.0.0`. |
| Backend → ML service | unknown / never found | `ML_SERVICE_URL="http://localhost:8006"` | — | ❌ **Dead** | No process anywhere on either server listens on 8006. `alertController.js` and `feedbackService.js` both reference it; `feedbackService.js` failures (`ECONNREFUSED 127.0.0.1:8006`) confirmed live in backend logs. Looks like a planned-but-never-deployed integration. |
| Backend CORS | n/a | `CORS_ORIGINS` includes `http://172.16.212.229:3000`, `http://172.16.212.229:8000` | drop iccc-s entries | n/a | Stale leftover from when backend/frontend ran **on iccc-s** (see `blura-backend`/`blura-frontend`, now stopped). Harmless (allowlist only), but confusing/dead. |
| Backend → Frontend URL | iccc-ws | `FRONTEND_URL=https://soceye.in` | *(unchanged)* | ✅ Yes | Public domain, works from anywhere. |
| Frontend → Backend | iccc-ws | `REACT_APP_BACKEND_URL=https://soceye.in` | *(unchanged)* | ✅ Yes | Public domain, correct for a **browser-side** var (must never be `localhost`/172.16.x — those aren't reachable from an arbitrary user's browser at all). |
| Frontend → RAG API | iccc-s (via nginx) | `REACT_APP_RAG_API_URL=http://localhost:8100/api/rag` | remove the var, or set to relative `/api/rag` | ❌ Broken if ever wired up | `getServiceUrl()` in `lib/api.js` returns the env var **unconditionally** if set — for a browser, `localhost` means the *visitor's own machine*, not the server. Currently harmless only because `RAG_BASE_URL` is dead code (never imported anywhere in the frontend). |
| Frontend → OSINT portal | iccc-s (via nginx) | `REACT_APP_OSINT_API_URL=http://localhost:8100/osint` | remove the var, or set to relative `/osint` | ❌ **Broken, live** | Same bug as above, but this one **is** actually consumed — `osintApi.js` imports `OSINT_BASE_URL`, backing the (unlinked-but-reachable) `/analysis-tools/osint-tools` page. Any real visitor hitting that page has their browser try to reach `http://localhost:8100/...` — their own laptop, port 8100 — guaranteed failure for every external user. Neither `localhost` nor a 172.16.x IP is right here; it must be a relative path so nginx's same-origin proxy handles it (exactly like the backend's own `buildDefaultOsintUrl()` already does correctly: `${protocol}://${host}/osint/`). |
| RAG Pipeline → MongoDB | iccc-s (self) | `MONGODB_URI=mongodb://172.16.212.229:27017` | works as-is; `127.0.0.1` would also work | ✅ Yes | Self-referencing via private IP instead of loopback — not wrong, just one unnecessary network hop. Minor. |
| RAG Pipeline → Ollama | iccc-s (self) | `OLLAMA_BASE_URL=http://172.16.212.229:11434` | works as-is | ✅ Yes | Same note as above. |
| copint_osint → Postgres | iccc-ws (self) | `DATABASE_URL=postgresql://copint_user:***@localhost:5432/ai_copint_db` | *(unchanged — correct)* | ✅ Yes (same-host) | Postgres confirmed listening on iccc-ws (`ss` shows `0.0.0.0:5432`). `localhost` is right for a same-host DB connection. |
| copint_osint → SOCKEYE SSO/login | iccc-ws (self) | `SOCEYE_SSO_BRIDGE_URL=http://127.0.0.1:5005/...`, `SOCEYE_LOGIN_URL=http://127.0.0.1:5005/...` | *(unchanged — correct)* | ✅ Yes (same-host) | `soceye-backend` runs on the same box. Loopback is correct and preferred. |
| Sentiment Analysis Service | iccc-ws | only `HF_TOKEN` — no URL/host vars | n/a | n/a | Nothing to flag; it's a pure inference service with no outbound service dependencies. |
| osint_portal | iccc-s (embedded in rag-api) | **no `.env` file at all** | n/a | n/a | No independent config — inherits whatever the parent `rag_pipeline` process provides. Nothing broken, just worth knowing it's not independently configurable. |
| Deepfake service (`deepfake_detection_py`) | iccc-s | no `.env`; hardcoded `host="0.0.0.0", port=8001` in `main.py` | n/a (code-level, not env) | n/a — **service is down** | Correctly binds all interfaces *if running* — the problem is entirely on the caller side (see Backend row above) plus the fact it's currently stopped. |
| Media analyzer (`media-download`) | iccc-s | no `.env`; PM2 start command `gunicorn app:app -b 127.0.0.1:8000` | rebind to `-b 0.0.0.0:8000` | n/a — **service is down, and loopback-bound even when up** | Needs a config fix on its own side (not just the caller) before it can ever be reached cross-host. |
| Legacy `BluraSaga/backend` | iccc-s | `PORT=5000`, `OLLAMA_BASE_URL="http://127.0.0.1:11434"` | n/a — decommission | n/a | PM2 process `blura-backend`, **stopped**. Dead duplicate of the real backend (now correctly on iccc-ws). Its own values were correct *for itself, at the time it ran locally on iccc-s* — moot now. |
| Legacy `BluraSaga/frontend` | iccc-s | `REACT_APP_RAG_API_URL=https://soceye.in/api/rag`, `REACT_APP_OSINT_API_URL=https://soceye.in/osint/` | n/a — decommission | n/a | PM2 process `blura-frontend`, **stopped**. Interesting: this *stale, unused* copy actually has the **correct** production-safe values (public domain, not localhost) — better than what's live on iccc-ws today. Worth copying that pattern back, not the file itself. |

---

## Answering your specific questions

**"Would the same .env work from both servers / any device on the 172.16.x network unmodified?"**

No, for three separate reasons:
1. `DEEPFAKE_ML_URL` and `MEDIA_ANALYZER_URL` use `127.0.0.1` while pointing at services that actually live on **the other server** — these are host-specific and would silently hit nothing (or the wrong thing) if copied anywhere else, including onto iccc-s itself unless corrected to loopback there.
2. `REACT_APP_RAG_API_URL` / `REACT_APP_OSINT_API_URL` use `localhost` in a **browser-side** env var — this class of variable must never be `localhost` *or* a `172.16.x` IP, since a visitor's browser is not on that network at all. It needs to be a relative path (or the public domain), which is the one case where "internal private IP" is the wrong answer entirely.
3. `CUSTOM_SENTIMENT_URL`, `SOCEYE_SSO_BRIDGE_URL`, `SOCEYE_LOGIN_URL`, copint_osint's `DATABASE_URL` all correctly use `127.0.0.1`/`localhost` **because** they're same-host — moving that exact `.env` to the other server would break them (that's expected and correct; they're not meant to be portable, they're meant to be host-specific by design).

**Duplicate/unnecessary configs found:** the entire `BluraSaga/backend` + `BluraSaga/frontend` tree on iccc-s (stopped PM2 processes, superseded by the real deployment on iccc-ws) and a stale duplicate `/app/rag_pipeline` (noted in the earlier deployment audit).

---

## Severity summary

| Finding | Severity |
|---|---|
| `ML_SERVICE_URL` — nothing listens, ever | Medium (silently swallowed by try/catch, but a real dead integration) |
| `DEEPFAKE_ML_URL` — wrong host, wrong live target, real service down | High |
| `MEDIA_ANALYZER_URL` — wrong host, wrong port, real service down + loopback-bound at its own config | High |
| `REACT_APP_OSINT_API_URL` — browser-side `localhost`, actively used by a reachable page | High (user-facing, silent failure for every external visitor) |
| `REACT_APP_RAG_API_URL` — same bug, currently dead code | Low (not live, but a landmine if `RAG_BASE_URL` ever gets wired up) |
| Stale CORS entries, legacy BluraSaga PM2 processes | Low (cleanup only) |
| RAG Pipeline self-referencing its own host via private IP instead of loopback | Informational, not a bug |

No changes made — this is a report only, per your constraint.
