# SOCKEYE Deployment & Hosting Architecture Audit

**Scope:** Read-only audit of `iccc-s` (172.16.212.229) and `iccc-ws` (172.16.218.135).
**Method:** Direct SSH inspection — `ps`, `ss`, `systemctl`, `pm2`, `git`, config file reads. No service was started, stopped, restarted, or reconfigured.
**Secrets:** All `.env` values below are masked to variable names only; no credentials are reproduced.

---

## 1. Executive Summary

SOCKEYE is a 3-tier system split across two physically separate Ubuntu 24.04 servers on a private `172.16.x.x` network, reachable publicly only through one domain, `soceye.in`, terminated at `iccc-ws`.

| Server | SSH alias | Real role |
|---|---|---|
| `172.16.218.135` | `iccc-ws` | **Public entry point.** Nginx + Let's Encrypt TLS for `soceye.in`. Runs the Node.js backend (`:5005`) and React frontend (`:3000`) under PM2. Also hosts the GPU-based custom sentiment-analysis service and the `copint_osint` investigation app. |
| `172.16.212.229` | `iccc-s` | **Internal AI/data tier.** MongoDB (the application's only database), Ollama (LLM + embeddings), and the RAG pipeline API (`:8100`, PM2), which itself embeds a smaller OSINT portal. Not part of the public path — only reachable from `iccc-ws` via the private network. |

Both boxes are shared, multi-tenant machines — each runs several unrelated third-party projects (CopWriter, hcp-ticketing, rowdyfinder, n8n, a Postgres/Citus cluster, etc.) alongside SOCKEYE. This audit documents SOCKEYE's slice and notes the neighbors only where they affect shared resources (ports, DB, GPU).

**Two findings need immediate attention** (Section 10): MongoDB's automated backup has been silently failing on every run for an extended period, and MongoDB itself has no authentication enabled while bound to all interfaces.

---

## 2. Hosting Architecture

```
Browser
   │  https://soceye.in
   ▼
DNS (soceye.in → 202.53.76.103)
   │
   ▼
iccc-ws  (172.16.218.135) — public server
   │
   ├─ Nginx :80/:443 (Let's Encrypt TLS)
   │     ├─ /              → localhost:3000  (React frontend, PM2 "soceye-frontend")
   │     ├─ /api           → localhost:5005  (Node backend, PM2 "soceye-backend")
   │     ├─ /api/rag/      → 172.16.212.229:8100  (proxied to iccc-s)
   │     ├─ /osint/        → 172.16.212.229:8100/osint  (proxied to iccc-s)
   │     └─ /copint-osint/ → 127.0.0.1:8090  (local Flask/gunicorn app, URL-rewritten)
   │
   ├─ Node backend :5005 (PM2)  ──────┐
   ├─ React frontend :3000 (PM2)      │  private network (172.16.x.x)
   └─ GPU sentiment service :8003 ────┼──────────────────────────────┐
                                       │                              │
                                       ▼                              ▼
                              iccc-s (172.16.212.229)          (called by iccc-ws
                              ├─ MongoDB :27017 (0.0.0.0, no auth)  backend directly)
                              ├─ Ollama :11434 (llama3.1, qwen2.5:7b,
                              │                nomic-embed-text, gemma3:12b)
                              └─ RAG API :8100 (PM2 "rag-api", FastAPI/uvicorn)
                                    └─ embeds osint_portal/ (Flask, WSGI-mounted at /osint)
```

Backend talks to `iccc-s` directly over the private network for MongoDB and Ollama (no proxy in between); the browser only ever talks to `iccc-ws`.

---

## 3. Public Exposure Analysis

**Domain:** `soceye.in` → `202.53.76.103` (resolved via public DNS from outside the private network; the servers themselves sit behind this, presumably via NAT/port-forward not visible from inside either box).

**Reverse proxy:** Nginx, on `iccc-ws` only. Config: `/etc/nginx/sites-available/soceye.in`, symlinked into `sites-enabled/` (confirmed active).

```nginx
server {
    server_name soceye.in www.soceye.in;
    location / { proxy_pass http://localhost:3000; ... }
    location /api/rag/ { proxy_pass http://172.16.212.229:8100/api/rag/; ... }
    location /osint/   { proxy_pass http://172.16.212.229:8100/osint/; ... }
    location /api      { proxy_pass http://localhost:5005; ... }
    location /copint-osint/ { proxy_pass http://127.0.0.1:8090/; ... sub_filter rewrites ... }
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/soceye.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/soceye.in/privkey.pem;
}
```

- **SSL/TLS:** Let's Encrypt via Certbot (cert paths managed by `certbot`; renewal job present in `/etc/cron.d/certbot` on both boxes). Could not read cert file directly (no passwordless sudo) but the `include /etc/letsencrypt/options-ssl-nginx.conf` + `ssl_dhparam` lines confirm certbot's standard nginx plugin setup.
- **No Cloudflare, no HAProxy, no Caddy, no external load balancer** — plain Nginx is the only reverse proxy layer.
- A **stale duplicate** of this same `soceye.in` nginx config exists on `iccc-s` too, but it is **not** in that box's `sites-enabled/` — dead config, not serving traffic. `iccc-s` nginx is active but only serves *other* unrelated sites (`cdat-web`, `copint`, `copwriter.in`, `hcp`, `inventory-frontend`, `osintfinal`, `osintrep`).
- **Not publicly exposed:** MongoDB `:27017` and Ollama `:11434` on `iccc-s`, and the sentiment service `:8003` on `iccc-ws` — all only reachable over the private `172.16.x.x` network / loopback, never proxied by nginx.

---

## 4. `iccc-ws` Audit

**OS:** Ubuntu 24.04.4 LTS. **GPU:** NVIDIA RTX 4000 Ada, 20GB (0% util at time of audit; SOCKEYE's custom sentiment service is the only SOCKEYE consumer).

### PM2 processes (SOCKEYE-relevant)
| Name | Status | Uptime | Restarts | Cwd | Start command |
|---|---|---|---|---|---|
| `soceye-backend` | online | 3D | 142 | `/home/cat-hyd-work-station/SOCEYE/backend` | `npm start` → `node src/index.js`, port 5005 |
| `soceye-frontend` | online | 4D | 9 | `/home/cat-hyd-work-station/SOCEYE/frontend` | `npm start` → craco dev server, port 3000 |

(Other PM2 entries on this box — `CopWriter-backend/frontend`, `hcp-backend` — belong to unrelated projects sharing the machine.)

### Listening ports (SOCKEYE + directly relevant)
| Port | Bind | Process | Purpose |
|---|---|---|---|
| 80, 443 | 0.0.0.0 | nginx | public entry, TLS termination |
| 3000 | 0.0.0.0 | node (PM2 soceye-frontend) | React dev server |
| 5005 | 0.0.0.0 | node (PM2 soceye-backend) | Express API |
| 8090 | 127.0.0.1 | gunicorn (3 workers) | `copint_osint` Flask app — the *larger* OSINT investigation tool (image/phone/email intel, its own Postgres DB `ai_copint_db`) |
| 8003 | (tunnel-only during this session's testing; not normally bound) | uvicorn | Custom sentiment-analysis service (`social_media_sentiment_analysis/api_server.py`), GPU-backed |
| 27017 | 127.0.0.1 | mongod | a **second, local-only** MongoDB — not the one SOCKEYE's backend connects to (that's on `iccc-s`); appears to belong to another local project |
| 4040 | 127.0.0.1 | ngrok | active tunnel → `localhost:5173` (a **different**, unrelated Vite dev server) — see risk #3 |

### Repository / deployment reality — important finding
`SOCEYE/backend` and `SOCEYE/frontend` on this server have **no `.git` directory at all**:
```
$ git -C /home/cat-hyd-work-station/SOCEYE/backend status
fatal: not a git repository (or any of the parent directories): .git
```
Code here was placed by direct file copy (scp/rsync or manual edit), not by `git clone`/`git pull`. There is no git-based deployment trail for the running backend or frontend — confirmed identical to the developer's local working copy only because file checksums were compared byte-for-byte during this session, not because of any git history.

### Environment variables (names only — values masked)
`backend/.env`: `MONGODB_URI, DB_NAME, CORS_ORIGINS, PORT, OLLAMA_*`(11 vars), `RAPIDAPI_*`(7 vars), `YOUTUBE_API_KEY, ML_SERVICE_URL, DEEPFAKE_ML_URL, MEDIA_ANALYZER_URL, GATEWAY_API_KEY, TELEGRAM_API_ID/HASH, GROQ_API_KEY/MODEL, SMTP_*`(6 vars), `FRONTEND_URL, JWT_SECRET, RAG_API_URL`.
`frontend/.env`: `REACT_APP_BACKEND_URL, ENABLE_HEALTH_CHECK, REACT_APP_RAG_API_URL, REACT_APP_OSINT_API_URL`.

### Auth / WebSocket
Backend auth is JWT-based (`JWT_SECRET` in env; `Not authorized, no token` observed from unauthenticated requests during earlier testing). No WebSocket server found in the backend codebase (no `socket.io`/`ws` usage) — REST-only API.

### Boot persistence
`pm2-cat-hyd-work-station.service` (systemd) is active — PM2's process list survives a reboot on this box.

---

## 5. `iccc-s` Audit

Your assumption was **mostly correct, with one correction**: this server hosts the RAG pipeline and *a* small OSINT portal, but the larger/primary OSINT investigation app (`copint_osint`) actually lives on `iccc-ws`, not here.

**OS:** Ubuntu 24.04.4 LTS. **GPU:** NVIDIA RTX A4000, 16GB (14% util at time of audit, used by Ollama).

### PM2 processes (SOCKEYE-relevant)
| Name | Status | Uptime | Restarts | Cwd | Start command |
|---|---|---|---|---|---|
| `rag-api` | online | 4D | 4 | `/home/hyd-cat/SOCEYE/BluraSaga/rag_pipeline` | `venv/bin/python3 -m uvicorn api_server:app --host 0.0.0.0 --port 8100` |

### systemd services
| Service | State | Notes |
|---|---|---|
| `mongod.service` | active/running | the application database |
| `ollama.service` | active/running | LLM + embeddings |
| `rag-api.service` | **broken**, crash-looping | `ExecStart` points at `.venv/bin/uvicorn`, but only `venv/` (no dot) exists on disk — 900,000+ restart attempts, never once holds port 8100 since PM2 already owns it |
| `rag-pipeline.service` | **broken**, crash-looping | `WorkingDirectory=/home/hyd-cat/rag_pipeline` — that path doesn't exist at all |

Both broken units are dead weight, safe to `systemctl disable`, but harmless (never successfully bind the port PM2 already holds).

**PM2 has no systemd boot-persistence service on this box** (unlike `iccc-ws`) — if `iccc-s` reboots, `rag-api` will **not** restart automatically; someone must run `pm2 resurrect` manually. Given the two broken systemd units above appear to be a prior, abandoned attempt to solve exactly this gap, this looks like unfinished work rather than an intentional choice.

### Listening ports
| Port | Bind | Process | Purpose |
|---|---|---|---|
| 8100 | 0.0.0.0 | python3 (PM2 rag-api) | RAG + embedded OSINT portal |
| 27017 | 0.0.0.0 | mongod | **the** SOCKEYE database — see risk #1 |
| 11434 | 0.0.0.0 | ollama | LLM/embedding inference |
| 80, 443 | 0.0.0.0 | nginx | serves *other*, unrelated domains only (soceye.in config present but not enabled here) |

### Ollama models
`llama3.1:latest` (4.9GB), `qwen2.5:7b` (4.7GB — the model actually configured via `OLLAMA_MODEL`), `nomic-embed-text` (274MB, embeddings), `gemma3:12b-it-q8_0` (13GB — present but not referenced by any config found; likely leftover from ad hoc testing).

### Repository / deployment reality
`SOCEYE/BluraSaga` (parent of `rag_pipeline`) **is** a git repo: `origin = github.com/BCS-Developer/BluraSaga.git`, branch `master`, **last commit 2026-04-23** — over 3 months stale relative to the actual running code (scheduler/ingestion features observed in the live files are not reflected in that commit). Same pattern as `iccc-ws`: the deployment process edits files in place on the server and does not commit/push as part of shipping changes.

A **stale, unused duplicate** of the rag_pipeline code exists at `/app/rag_pipeline` (older, mismatched checksums on 3 files) — not referenced by PM2, systemd, or nginx anywhere. Dead leftover, safe to remove.

### `osint_portal` (embedded in rag-api, distinct from `copint_osint`)
Small Flask app mounted via `WSGIMiddleware` inside `api_server.py` at `/osint` — shares the RAG API's process and port (8100), not a separate service.

---

## 6. Service Dependency Map

```
                                Internet
                                    │
                          DNS: soceye.in → 202.53.76.103
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │   iccc-ws  (172.16.218.135)  │
                     │   Nginx :80/:443 (Certbot)   │
                     └──────────────┬──────────────┘
                ┌───────────────────┼────────────────────┬─────────────────┐
                ▼                   ▼                    ▼                 ▼
        Frontend :3000      Backend :5005/api    /osint,/api/rag →   /copint-osint →
        (React, PM2)        (Node/Express, PM2)   iccc-s:8100        127.0.0.1:8090
                                    │                                 (Flask/gunicorn,
                    ┌───────────────┼────────────────┐                own Postgres DB)
                    ▼               ▼                ▼
              MongoDB :27017   Ollama :11434   Sentiment svc :8003
              (iccc-s)         (iccc-s)        (iccc-ws, GPU, local)
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │   iccc-s  (172.16.212.229)   │
                     │  RAG API :8100 (FastAPI, PM2)│
                     │   └─ osint_portal (WSGI, embedded, /osint) │
                     └─────────────────────────────┘
```

Backend is the hub: it is the only component that talks to MongoDB, Ollama, the RAG API, and the sentiment service directly. Nothing calls the frontend except the browser.

---

## 7. Deployment Workflow (as observed, not as documented anywhere)

1. **No CI/CD pipeline found** — no `.github/workflows`, no Jenkins, no deploy webhook, no build server referenced anywhere in configs, cron, or systemd units on either box.
2. **Backend/frontend (`iccc-ws`)**: code is placed directly in `~/SOCEYE/backend` and `~/SOCEYE/frontend` with no `.git` — deployment = manual file copy, then `pm2 restart soceye-backend` / `soceye-frontend` (inferred from PM2 `restarts: 142` / `9` counters, no automation found driving those restarts).
3. **RAG pipeline (`iccc-s`)**: lives inside a real git repo (`BluraSaga`) but the working tree has diverged from the last commit — same manual-edit-then-restart pattern, restart via `pm2 restart rag-api` (inferred from PM2 `restarts: 4`).
4. **Build step:** frontend build/serve is `npm start` (CRA dev server via craco) under PM2 — **this is a development server running in production**, not a production build (`npm run build` + static file serving). Confirmed via PM2 `script path: /usr/bin/npm`.
5. **Environment config:** `.env` files sit alongside the code on each server, edited in place; no secrets manager, no vault, no `.env.example` reconciliation observed.
6. **Restart mechanism:** PM2 process manager on both boxes (`pm2 start`/`pm2 restart`), with systemd (`pm2-<user>.service`) providing boot-persistence **on `iccc-ws` only**.

---

## 8. Network Topology

- **Private network:** `172.16.x.x`, connecting `iccc-s` and `iccc-ws` directly (backend on `iccc-ws` reaches Mongo/Ollama on `iccc-s` over this network, unproxied).
- **Public ingress:** only `iccc-ws:80/443` via nginx; DNS `soceye.in` → `202.53.76.103` (a NAT/forwarding layer in front of the private network, not visible from inside either host).
- **UFW / iptables:** could not be read on either server — both require sudo with a password not available in this session. **Not verified; flagged as a gap, not a finding.**
- **Internal-only services confirmed by bind address, not firewall:** MongoDB and Ollama on `iccc-s` bind `0.0.0.0` (reachable from the whole private network by anyone who can route to that IP, not just `iccc-ws`) rather than being restricted to the specific peer; the sentiment service and local Mongo instance on `iccc-ws` bind `127.0.0.1` (loopback-only, genuinely internal).
- **Ad hoc public exposure found:** an active `ngrok` tunnel on `iccc-ws` (`https://uncompanioned-stacy-undeceptive.ngrok-free.dev` → `localhost:5173`) — unrelated to SOCKEYE, but it demonstrates a public tunnel can be stood up on this box outside of the documented nginx path. See risk #3.

---

## 9. Repository Inventory

| Path | Server | Git? | Origin | Branch | Last commit | Actually deployed? |
|---|---|---|---|---|---|---|
| `~/SOCEYE/backend` | iccc-ws | **No** | — | — | — | Yes (running, PM2) |
| `~/SOCEYE/frontend` | iccc-ws | **No** | — | — | — | Yes (running, PM2) |
| `~/SOCEYE/BluraSaga` (incl. `rag_pipeline`) | iccc-s | Yes | `github.com/BCS-Developer/BluraSaga.git` | `master` | `349e94f` (2026-04-23) — **stale** | Yes, but working tree has diverged from this commit |
| `~/BCSS/social_media_sentiment_analysis` | iccc-ws | Yes | `github.com/BCSS-Nandeep/social_media_sentiment_analysis.git` | `main` | `4b81e02` — **also stale relative to running files** (this session's changes were `scp`'d, then separately pushed to GitHub today, but never `git pull`'d on the server itself) | Yes, files match this session's pushed commit `247491a` by content, not by git state |
| `/app/rag_pipeline` | iccc-s | No | — | — | — | **No** — stale unused duplicate |

**Pattern across every repo:** git, where it exists at all, is not the deployment mechanism — it's at best a loose, out-of-date mirror of what's actually running. Treat the servers' disk state, not any git branch, as ground truth until this is fixed.

---

## 10. Runtime Inventory

| Component | Server | Port | Process | Startup | Public/Internal | Purpose |
|---|---|---|---|---|---|---|
| Nginx | iccc-ws | 80, 443 | nginx | systemd | **Public** | TLS termination, reverse proxy, only path to the internet |
| Frontend | iccc-ws | 3000 | node (craco dev server) | PM2 | Internal (proxied) | React UI |
| Backend | iccc-ws | 5005 | node | PM2 | Internal (proxied) | Express REST API, JWT auth |
| copint_osint | iccc-ws | 8090 | gunicorn ×3 | PM2/manual | Internal (proxied via `/copint-osint/`) | Larger OSINT investigation tool, own Postgres DB |
| Sentiment service | iccc-ws | 8003 | uvicorn | manual (not currently running) | Internal only | IndicTrans2 + Cardiff RoBERTa, GPU |
| Local mongod | iccc-ws | 27017 (127.0.0.1) | mongod | systemd | Internal, loopback | **Not** SOCKEYE's DB — separate local instance, likely another project |
| ngrok | iccc-ws | 4040 (local API) | ngrok | manual | Public (via ngrok's cloud) | Unrelated tunnel to `:5173` — flag for review |
| RAG API | iccc-s | 8100 | python3/uvicorn | PM2 | Internal (proxied via iccc-ws) | FastAPI RAG + embedded osint_portal |
| MongoDB | iccc-s | 27017 (0.0.0.0) | mongod | systemd | Internal (whole private net) | **The** SOCKEYE database — no auth |
| Ollama | iccc-s | 11434 (0.0.0.0) | ollama | systemd | Internal (whole private net) | LLM + embeddings |
| Nginx | iccc-s | 80, 443 | nginx | systemd | Public (other domains only) | Not part of SOCKEYE's path |

---

## 11. Risks & Misconfigurations Discovered

**HIGH — MongoDB backup has been silently failing on every run.**
`crontab -l` on `iccc-s` shows `0 1,13 * * * /home/hyd-cat/mongo_safe_backup.sh` (twice daily). The script **does not exist**:
```
$ tail /home/hyd-cat/mongo_backup.log
/bin/sh: 1: /home/hyd-cat/mongo_safe_backup.sh: not found     (×10, every logged run)
```
There is currently **no working automated backup** of the production database. This has presumably been the case since whenever that script was last removed or renamed.

**HIGH — MongoDB has no authentication and binds to all interfaces.**
`/etc/mongod.conf`: `bindIp: 0.0.0.0`, and the `security:` block is entirely commented out (no `authorization: enabled`). Anyone who can reach `172.16.212.229:27017` on the private network — not just `iccc-ws` — can connect and read/write/delete the entire database with zero credentials.

**MEDIUM — No git-based deployment trail anywhere.**
Backend/frontend have no `.git` at all; the RAG pipeline's git history is 3+ months stale versus its actual working tree. There is no reliable way to answer "what code is running right now" except by reading the live files directly, and no easy rollback path.

**MEDIUM — Production frontend runs a dev server, not a build.**
`soceye-frontend` PM2 process runs `npm start` (craco dev server) rather than serving a static production build — slower, larger memory footprint, and dev-server behaviors (like verbose error overlays) exposed in production.

**MEDIUM — `rag-api` has no boot-persistence on `iccc-s`.**
Unlike `iccc-ws` (which has `pm2-cat-hyd-work-station.service`), `iccc-s` has no equivalent — a reboot would leave the RAG API down until someone manually runs `pm2 resurrect`. The two broken systemd units (`rag-api.service`, `rag-pipeline.service`) look like an abandoned attempt to fix exactly this gap, both pointing at wrong paths.

**LOW — Dead/stale artifacts.**
`/app/rag_pipeline` (stale duplicate, iccc-s), 2 broken crash-looping systemd units (iccc-s), a stale duplicate `soceye.in` nginx config not enabled (iccc-s).

**LOW/INFORMATIONAL — Ad hoc `ngrok` tunnel active on `iccc-ws`.**
Points at an unrelated dev server (`:5173`), not SOCKEYE, but demonstrates unmanaged public exposure is possible on this box outside the documented nginx path — worth a policy note even though it's not currently touching SOCKEYE itself.

**Not verified (gap, not a finding):** UFW/iptables rules on either box — both required a sudo password not available in this session.

---

## 12. Recommendations

1. **Fix the MongoDB backup immediately** — restore or rewrite `mongo_safe_backup.sh`, then verify a real backup file lands and is restorable before trusting it again.
2. **Enable MongoDB authentication** and restrict `bindIp` to just the two servers that need it (or firewall port 27017 to those two IPs specifically), even on the private network.
3. **Put backend, frontend, and rag_pipeline under git properly** — `git init` + push each to its own repo (or bring them into one), then make "deploy" mean "git pull + restart," not "copy files by hand." This audit itself could not fully trust "last commit" for two of the three components because of this gap.
4. **Serve the frontend as a production build** (`npm run build` + `serve`/nginx static, or at least `pm2 serve build/`), not the dev server.
5. **Add PM2 boot-persistence on `iccc-s`** (`pm2 startup` + `pm2 save`), then remove the two broken, crash-looping systemd units so they stop polluting logs.
6. **Clean up dead artifacts:** `/app/rag_pipeline`, the disabled `soceye.in` nginx config on `iccc-s`.
7. **Review the `ngrok` tunnel** on `iccc-ws` — confirm it's intentional and time-boxed, not forgotten.
8. **Get UFW/iptables visibility** (with proper sudo access) to close the one real gap in this audit — confirming whether MongoDB/Ollama's `0.0.0.0` binds are actually mitigated by a firewall rule or genuinely wide open on the private network.

---

## Appendix — Key Commands & Evidence

All commands below were run read-only over SSH (`ssh iccc-s "..."` / `ssh iccc-ws "..."`) or locally against the working copy of this repository. Full raw output is available in the session transcript; representative excerpts only are kept here to keep this file readable.

```bash
# Public DNS
dig +short soceye.in A                       # → 202.53.76.103

# Listening ports (per server)
ss -tlnp

# Process managers
pm2 jlist ; pm2 show <name>
systemctl list-units --type=service --all
journalctl -u rag-api.service -n 15

# GPUs
nvidia-smi

# Databases
grep -A3 'net:' /etc/mongod.conf             # bindIp: 0.0.0.0
grep -A3 'security:' /etc/mongod.conf        # commented out — no auth
ps aux | grep -i postgres                    # Citus/distributed_db cluster (unrelated to SOCKEYE)

# Backup automation
crontab -l                                   # 0 1,13 * * * /home/hyd-cat/mongo_safe_backup.sh
tail /home/hyd-cat/mongo_backup.log          # ".../mongo_safe_backup.sh: not found" (repeated)

# Git state
git -C ~/SOCEYE/backend status               # fatal: not a git repository
git -C ~/SOCEYE/BluraSaga log -1 --format='%h %ci %s'
                                              # 349e94f 2026-04-23 ... (stale vs. running tree)

# Reverse proxy
cat /etc/nginx/sites-available/soceye.in     # (see Section 3)
ls /etc/nginx/sites-enabled/                 # confirms soceye.in enabled on iccc-ws, not iccc-s

# Ad hoc tunnel
curl -s 127.0.0.1:4040/api/tunnels           # ngrok → https://....ngrok-free.dev -> localhost:5173

# Env var names only (values withheld)
grep -oE '^[A-Z_]+=' backend/.env frontend/.env
```
