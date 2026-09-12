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

if [[ ! -f "$SITES_JSON" ]]; then
  echo "Missing $SITES_JSON" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR/backend" || ! -d "$APP_DIR/frontend" ]]; then
  echo "APP_DIR does not look like the Sockeye repo: $APP_DIR" >&2
  exit 1
fi

WEB_ROOT="${WEB_ROOT:-$(node -e "const d=require('$SITES_JSON'); console.log(d.web_root || '');")}"
if [[ -z "$WEB_ROOT" ]]; then
  WEB_ROOT="$APP_DIR/frontend/build"
fi
BACKEND_BIND="$(node -e "const d=require('$SITES_JSON'); console.log(d.backend_bind || '127.0.0.1');")"

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
node "$SCRIPT_DIR/render_nginx.js" "$SITES_JSON" --web-root "$WEB_ROOT" --out "$SCRIPT_DIR/nginx.conf"

if command -v pm2 >/dev/null 2>&1; then
  log "Starting/reloading independent PM2 apps from ecosystem.config.js"
  pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.js" --update-env
  pm2 save || true
else
  echo "pm2 not found — start each site from $SITES_JSON manually, e.g.:" >&2
  node -e "
const d = require('$SITES_JSON');
const bind = d.backend_bind || '127.0.0.1';
(d.sites || []).filter(s => s.enabled !== false).forEach(s => {
  console.log(\`  HOST=\${bind} PORT=\${s.backend_port} NODE_ENV=production node src/index.js   # \${s.admin}\`);
});
" >&2
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
node -e "
const d = require('$SITES_JSON');
const ip = d.ip || 'HOST';
(d.sites || []).filter(s => s.enabled !== false).forEach(s => {
  let line = \`  \${s.admin}: UI http://\${ip}:\${s.frontend_port}/  API \${ip}:\${s.backend_port}/\`;
  if (s.domain) line += \`  →  http://\${s.domain}/\`;
  console.log(line);
});
"
