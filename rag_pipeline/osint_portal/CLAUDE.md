# CLAUDE.md — Application Root (Sam/)

> Full project documentation lives at the workspace root: `../../CLAUDE.md`
> This file contains the quick-reference for working directly in the Sam/ application directory.

---

## Quick Reference

**Phase 1 (Environment Stabilization) — COMPLETE 2026-05-10**
**Phase 2 (Runtime Stabilization & Frontend Consistency) — COMPLETE 2026-05-10**
**Phase 3 (Frontend Overhaul & Feature Additions) — COMPLETE 2026-05-11**

**Start:**
```powershell
.\.venv\Scripts\Activate.ps1        # activate canonical venv
$env:APP_SECRET_KEY = "..."          # required
$env:POLICE_PORTAL_PASSWORD = "..."  # required
python start_server.py               # launches on port 8000 with threaded=True
```

**Canonical venv:** `.venv\Scripts\python.exe` (Python 3.11.9)  
**Install deps:** `pip install -r requirements.txt`  
**Auth domains:** `tspolice.gov.in`, `hydtspolice.gov.in`  
**Default admin:** `admin@tspolice.gov.in` + `POLICE_PORTAL_PASSWORD` env var

## Key Files
| File | Purpose |
|------|---------|
| `app.py` | All routes, tool runners, auth logic (~1,618 lines) |
| `start_server.py` | Dev startup (hardcoded paths — fix before prod) |
| `routes/image_routes.py` | Blueprint: /image-intel/* |
| `services/user_scanner_service.py` | user-scanner CLI wrapper + SSE |
| `services/image_metadata_service.py` | PIL EXIF extractor |
| `Sam/core.py` | Holehe async engine (trio + httpx) |
| `data/police_users.json` | Scrypt-hashed user accounts |
| `data/other_links.json` | Merged OSINT + commercial links (replaces osint_links.json + commercial_links.json) |
| `audit_logs/police_portal_audit.jsonl` | Append-only audit trail |

## Absolute Rules
1. Never render raw CLI output on frontend — always parse and structure
2. Never show raw JSON on frontend — use cards, tables, badges
3. Streaming tools (Sherlock, Maigret, user-scanner) MUST use SSE, not blocking POST
4. All subprocess calls: `shell=False`, list-format args, use `sys.executable` not `"python"`
5. All routes must call `_is_authorized()` before serving content
6. Every admin action must call `_write_audit_log()`
7. CSS: always use `--navy`, `--khaki`, `--accent` variables — never hardcode colors
8. Extend `base.html` for all authenticated pages

## ✅ Phase 1 Fixes Applied
1. ~~`app.run()` lacks `threaded=True`~~ — **FIXED** (line 1616)
2. ~~`["python", "-m", ...]` subprocess calls~~ — **FIXED:** all 4 replaced with `sys.executable` (lines 876, 943, 1481, 1520)
3. ~~`BRAND_LOGO_PATH` hardcoded to `rockg` machine~~ — **FIXED:** reads `POLICE_BRAND_LOGO_PATH` env var (line 63)
4. ~~Hardcoded secrets in `start_server.py`~~ — **FIXED:** fully portable now
5. ~~No `requirements.txt`~~ — **FIXED:** created with pinned versions
6. ~~No canonical venv~~ — **FIXED:** `.venv` created and verified

## ✅ Phase 2 Fixes Applied
1. ~~`username_tools.html` does not extend `base.html`~~ — **FIXED:** now extends base.html; eliminated ~190 lines of duplicated boilerplate
2. ~~`tool-user_scanner` ID appears twice on main dashboard~~ — **FIXED:** username group now uses `id="tool-user_scanner-u"` 
3. ~~`userdeep` + `sherlock` + `maigret` spawn 4 concurrent subprocesses~~ — **FIXED:** `startCombinedStreaming` absorbs sherlock+maigret EventSources when userdeep is active; DOMContentLoaded skips separate sherlock/maigret connections in that case
4. ~~SSE generators leave zombie subprocesses on client disconnect~~ — **FIXED:** `stream_sherlock` and `stream_maigret` generators now use try/finally to `process.kill()` on `GeneratorExit`
5. ~~`/ai-investigation-assistant` uses inconsistent auth check~~ — **FIXED:** now uses `_is_authorized()` like all other routes

## Remaining Issues (Phase 3+)
1. Tools `gravatar`, `domain`, `mxsec`, `whois` implemented but hidden from UI selector — decision needed: restore or remove dead code
2. Holehe `run_holehe()` is synchronous/blocking — can take 10–30s before page renders; future: stream via SSE
3. Audit log has no rotation — single append-only JSONL file grows forever
4. Production deployment needs gunicorn, not the Flask dev server

## SSE Event Schema
```json
{"type": "result",   "data": {platform, found, url, category, status}, "found_count": N, "checked_count": N}
{"type": "progress", "message": "...", "found_count": N, "checked_count": N}
{"type": "complete", "found_count": N, "checked_count": N, "duration": N}
{"type": "error",    "message": "..."}
```

## URL Routes
```
GET/POST /                    → index.html (main dashboard)
GET/POST /tools/email         → email_tools.html
GET/POST /tools/phone         → phone_tools.html
GET/POST /tools/username      → username_tools.html
GET      /image-intel/        → image_intel.html
GET/POST /login               → login.html
GET      /logout
GET/POST /admin/users         → admin_users.html (admin only)
GET/POST /other-links         → other_links.html (merged OSINT + commercial links)
GET      /web-links           → 302 redirect → /other-links
GET      /commercial-links    → 302 redirect → /other-links
GET      /ask-ai              → ask_ai.html (live OpenAI GPT-4o-mini copilot)
POST     /api/ask-ai          → JSON: OpenAI structured response
GET      /api/stream/scan     → SSE: user-scanner
GET      /api/stream/sherlock → SSE: sherlock
GET      /api/stream/maigret  → SSE: maigret
POST     /image-intel/upload  → JSON: upload result
POST     /image-intel/analyze → JSON: metadata result
GET      /image-intel/download/json
GET      /download/json|csv|pdf
GET      /brand-logo
```

*Full documentation: `../../CLAUDE.md`*
