#!/usr/bin/env bash
# Deploy Sockeye from deploy/sites.json
# (one admin = frontend_port + backend_port, optional domain).
#
# Usage:
#   ./deploy/deploy.sh
#   APP_DIR=/var/www/sockeye ./deploy/deploy.sh
#   ./deploy/deploy.sh --skip-nginx
#   ./deploy/deploy.sh --skip-build
#
# Edit deploy/sites.json, then run this script.
# Env: APP_DIR, WEB_ROOT, NGINX_SITE, NODE_ENV

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SITES_JSON="${SITES_JSON:-$SCRIPT_DIR/sites.json}"
NGINX_SITE="${NGINX_SITE:-blurasaga}"
NODE_ENV="${NODE_ENV:-production}"

SKIP_NGINX=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-nginx) SKIP_NGINX=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm
require_cmd python3

if [[ ! -f "$SITES_JSON" ]]; then
  echo "Missing $SITES_JSON" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR/backend" || ! -d "$APP_DIR/frontend" ]]; then
  echo "APP_DIR does not look like the Sockeye repo: $APP_DIR" >&2
  exit 1
fi

WEB_ROOT="${WEB_ROOT:-$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('web_root') or '')" "$SITES_JSON")}"
if [[ -z "$WEB_ROOT" ]]; then
  WEB_ROOT="$APP_DIR/frontend/build"
fi
BACKEND_BIND="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('backend_bind') or '127.0.0.1')" "$SITES_JSON")"

cd "$APP_DIR"
log "Deploying from $APP_DIR (NODE_ENV=$NODE_ENV)"
log "Sites file: $SITES_JSON"

# ── Frontend ──────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "Installing frontend dependencies"
  (cd frontend && npm ci --prefer-offline || npm install)

  log "Building frontend"
  (cd frontend && NODE_ENV=production npm run build)

  if [[ ! -f "$WEB_ROOT/index.html" ]]; then
    echo "Frontend build missing index.html at $WEB_ROOT" >&2
    exit 1
  fi
else
  log "Skipping frontend build (--skip-build)"
fi

# ── Backend ───────────────────────────────────────────────────────────────
log "Installing backend dependencies"
(cd backend && npm ci --omit=dev --prefer-offline || npm install --omit=dev)

log "Generating Prisma clients"
(cd backend && npm run prisma:generate)

if [[ ! -f "$APP_DIR/backend/.env" ]]; then
  echo "Warning: backend/.env not found — copy from .env.example and set secrets before starting." >&2
fi

export NODE_ENV

# ── Process manager: one PM2 app per enabled site ─────────────────────────
log "Rendering nginx from sites.json"
python3 "$SCRIPT_DIR/render_nginx.py" "$SITES_JSON" --web-root "$WEB_ROOT" --out "$SCRIPT_DIR/nginx.conf"

if command -v pm2 >/dev/null 2>&1; then
  python3 -c "import json,sys
d=json.load(open(sys.argv[1]))
for s in d.get('sites') or []:
    if s.get('enabled', True):
        print(s['admin'], int(s['backend_port']))
" "$SITES_JSON" | while read -r admin port; do
    name="blurasaga-${admin}"
    log "API $name on ${BACKEND_BIND}:${port}"
    if pm2 describe "$name" >/dev/null 2>&1; then
      (cd "$APP_DIR/backend" && HOST="$BACKEND_BIND" PORT="$port" NODE_ENV="$NODE_ENV" pm2 restart "$name" --update-env)
    else
      (cd "$APP_DIR/backend" && HOST="$BACKEND_BIND" PORT="$port" NODE_ENV="$NODE_ENV" pm2 start src/index.js --name "$name" --update-env)
    fi
  done
  pm2 save || true
else
  echo "pm2 not found — start each site from $SITES_JSON manually, e.g.:" >&2
  python3 -c "import json,sys
d=json.load(open(sys.argv[1]))
bind=d.get('backend_bind') or '127.0.0.1'
for s in d.get('sites') or []:
    if s.get('enabled', True):
        print(f\"  HOST={bind} PORT={s['backend_port']} NODE_ENV=production node src/index.js   # {s['admin']}\")
" "$SITES_JSON" >&2
fi

# ── Nginx ─────────────────────────────────────────────────────────────────
if [[ "$SKIP_NGINX" -eq 0 ]]; then
  if command -v nginx >/dev/null 2>&1; then
    log "Installing nginx site ($NGINX_SITE)"
    if [[ "$(id -u)" -eq 0 ]]; then
      cp "$SCRIPT_DIR/nginx.conf" "/etc/nginx/sites-available/$NGINX_SITE"
      ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
      if [[ -L /etc/nginx/sites-enabled/default ]]; then
        rm -f /etc/nginx/sites-enabled/default
      fi
      nginx -t
      systemctl reload nginx
    else
      echo "Not root — copy nginx config with:"
      echo "  sudo cp $SCRIPT_DIR/nginx.conf /etc/nginx/sites-available/$NGINX_SITE"
      echo "  sudo ln -sf /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/$NGINX_SITE"
      echo "  sudo nginx -t && sudo systemctl reload nginx"
    fi
  else
    echo "nginx not installed; skipped site install. Config is at $SCRIPT_DIR/nginx.conf" >&2
  fi
else
  log "Skipping nginx install (--skip-nginx); nginx.conf still rendered"
fi

log "Done"
echo "  Frontend: $WEB_ROOT"
echo "  Registry: $SITES_JSON"
python3 -c "import json,sys
d=json.load(open(sys.argv[1]))
ip=d.get('ip') or 'HOST'
for s in d.get('sites') or []:
    if not s.get('enabled', True):
        continue
    line=f\"  {s['admin']}: UI http://{ip}:{s['frontend_port']}/  API {ip}:{s['backend_port']}/\"
    if s.get('domain'):
        line += f\"  →  http://{s['domain']}/\"
    print(line)
" "$SITES_JSON"
