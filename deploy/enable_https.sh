#!/usr/bin/env bash
# Issue/renew Let's Encrypt cert for site domains and reload nginx (HTTP+HTTPS).
# Keeps vLLM on default :80. Does not remove vLLM.
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/blurasaga}"
SITES_JSON="${SITES_JSON:-$APP_DIR/deploy/sites.json}"
NGINX_SITE="${NGINX_SITE:-blurasaga}"
EMAIL="${CERTBOT_EMAIL:-admin@blurasaga.com}"

export DEBIAN_FRONTEND=noninteractive

echo "==> Install certbot"
if ! command -v certbot >/dev/null 2>&1; then
  sudo -n apt-get update -qq
  sudo -n apt-get install -y -qq certbot
fi

sudo -n mkdir -p /var/www/certbot
sudo -n chmod 755 /var/www/certbot

# Ensure HTTP domain blocks expose ACME path (force_https off until certs exist)
node "$APP_DIR/deploy/render_nginx.js" "$SITES_JSON" --out "$APP_DIR/deploy/nginx.conf"
sudo -n cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$NGINX_SITE"
sudo -n ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
sudo -n rm -f /etc/nginx/sites-enabled/default
# home traverse for nginx static files
sudo -n chmod 711 /home/ubuntu || true
sudo -n nginx -t
sudo -n systemctl reload nginx

mapfile -t DOMAINS < <(node -e "
const d = require('$SITES_JSON');
(d.sites || []).filter(s => s.enabled !== false && s.domain).forEach(s => console.log(s.domain.trim()));
")

if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  echo "No domains in $SITES_JSON" >&2
  exit 1
fi

for domain in "${DOMAINS[@]}"; do
  echo "==> Certbot for $domain"
  sudo -n certbot certonly \
    --webroot -w /var/www/certbot \
    -d "$domain" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring \
    --rsa-key-size 2048
done

echo "==> Re-render nginx with HTTPS"
node "$APP_DIR/deploy/render_nginx.js" "$SITES_JSON" --out "$APP_DIR/deploy/nginx.conf"
sudo -n cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$NGINX_SITE"
sudo -n nginx -t
sudo -n systemctl reload nginx

# Public URL for first domain (cookie Secure follows request HTTPS automatically)
FIRST="${DOMAINS[0]}"
ENV_FILE="$APP_DIR/backend/.env"
if [[ -f "$ENV_FILE" ]]; then
  # Drop legacy COOKIE_SECURE — Secure is derived from X-Forwarded-Proto
  if grep -q '^COOKIE_SECURE=' "$ENV_FILE"; then
    sed -i '/^COOKIE_SECURE=/d' "$ENV_FILE"
  fi
  if grep -q '^PUBLIC_BACKEND_URL=' "$ENV_FILE"; then
    sed -i "s|^PUBLIC_BACKEND_URL=.*|PUBLIC_BACKEND_URL=https://$FIRST|" "$ENV_FILE"
  else
    printf 'PUBLIC_BACKEND_URL=https://%s\n' "$FIRST" >> "$ENV_FILE"
  fi
fi

export PATH="/home/ubuntu/.npm-global/bin:$PATH"
if command -v pm2 >/dev/null 2>&1 && pm2 describe odisha-api >/dev/null 2>&1; then
  (cd "$APP_DIR/backend" && HOST=127.0.0.1 PORT=5005 NODE_ENV=production pm2 restart odisha-api --update-env)
  pm2 save || true
fi

echo "==> Verify"
ss -tlnp | grep -E ":80 |:443 " || true
curl -sI "http://$FIRST/" | head -8 || true
curl -skI "https://$FIRST/" | head -12 || true
echo "Done. https://$FIRST/"
