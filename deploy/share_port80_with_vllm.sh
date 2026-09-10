#!/usr/bin/env bash
# Share public :80 between Blura Saga (odisha.blurasaga.com) and vLLM (default).
# vLLM is NOT removed — rebound to 127.0.0.1:8080; nginx proxies default :80 to it.
set -euo pipefail

export PATH="/home/ubuntu/.npm-global/bin:$PATH"
export DEBIAN_FRONTEND=noninteractive
export PUPPETEER_SKIP_DOWNLOAD=1
export NODE_ENV=production

APP_DIR=/home/ubuntu/blurasaga
VLLM_DIR=/data/vllm-server
NGINX_SITE=blurasaga

echo "==> Patch vLLM gateway publish to 127.0.0.1:8080"
cd "$VLLM_DIR"
python3 <<'PY'
from pathlib import Path

cfg = Path("config.yaml")
text = cfg.read_text()
if "host_port:" not in text.split("gateway:", 1)[-1].split("\n\n", 1)[0]:
    text = text.replace(
        "gateway:\n  port: 80\n  require_api_key: true\n",
        "gateway:\n  port: 80\n  host_port: 8080\n  host_bind: 127.0.0.1\n  require_api_key: true\n",
        1,
    )
    cfg.write_text(text)
    print("config.yaml updated")
else:
    print("config.yaml ok")

p = Path("scripts/render_compose.py")
t = p.read_text()
idx = t.rfind('lines.append("  gateway:")')
if idx < 0:
    raise SystemExit("gateway block missing")
if "gw_host_port" in t[idx:]:
    print("render_compose.py ok")
else:
    old_block = (
        '    lines.append("    ports:")\n'
        '    lines.append(f\'      - "{gw_port}:80"\')'
    )
    new_block = (
        '    gw_host_port = cfg.get("gateway", {}).get("host_port", gw_port)\n'
        '    gw_host_bind = str(cfg.get("gateway", {}).get("host_bind") or "0.0.0.0")\n'
        '    lines.append("    ports:")\n'
        '    lines.append(f\'      - "{gw_host_bind}:{gw_host_port}:80"\')'
    )
    if old_block not in t[idx:]:
        raise SystemExit("gateway ports block not found for patch")
    p.write_text(t[:idx] + t[idx:].replace(old_block, new_block, 1))
    print("render_compose.py patched")
PY

python3 scripts/render_compose.py
grep -A6 "^  gateway:" docker-compose.yml | head -12

echo "==> Recreate gateway (still running, new host port)"
docker compose up -d gateway
sleep 3
docker ps --filter name=vllm-1930-gateway --format "{{.Names}} {{.Status}} {{.Ports}}"
curl -s -o /dev/null -w "vllm8080:%{http_code}\n" http://127.0.0.1:8080/ || true

echo "==> Install nginx"
if ! command -v nginx >/dev/null 2>&1; then
  sudo -n apt-get update -qq
  sudo -n apt-get install -y -qq nginx
fi
nginx -v

echo "==> Free :3000 for nginx UI (stop PM2 serve only)"
pm2 delete odisha-ui 2>/dev/null || true
pm2 save || true

echo "==> Frontend same-origin API (clear hardcoded :5005)"
cd "$APP_DIR"
if [[ -f frontend/.env ]]; then
  # Keep file but blank the override so domain uses window.origin → /api via nginx
  if grep -q '^REACT_APP_BACKEND_URL=' frontend/.env; then
    sed -i 's|^REACT_APP_BACKEND_URL=.*|REACT_APP_BACKEND_URL=|' frontend/.env
  else
    printf 'REACT_APP_BACKEND_URL=\n' >> frontend/.env
  fi
fi
cat frontend/.env || true

echo "==> Rebuild frontend"
(cd frontend && npm ci --prefer-offline || npm install)
(cd frontend && NODE_ENV=production npm run build)

echo "==> Install nginx site"
python3 deploy/render_nginx.py
sudo -n cp deploy/nginx.conf "/etc/nginx/sites-available/$NGINX_SITE"
sudo -n ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
# disable default site if present so our default_server wins
sudo -n rm -f /etc/nginx/sites-enabled/default
sudo -n nginx -t
sudo -n systemctl enable nginx
sudo -n systemctl restart nginx

echo "==> Ensure API is up"
if pm2 describe odisha-api >/dev/null 2>&1; then
  (cd backend && HOST=127.0.0.1 PORT=5005 NODE_ENV=production pm2 restart odisha-api --update-env)
else
  (cd backend && HOST=127.0.0.1 PORT=5005 NODE_ENV=production pm2 start src/index.js --name odisha-api --update-env)
fi
pm2 save || true

echo "==> Verify"
ss -tlnp | grep -E ":80 |:8080|:3000|:5005" || true
echo -n "odisha host: "; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -H "Host: odisha.blurasaga.com" http://127.0.0.1/
echo -n "odisha body: "; curl -s -H "Host: odisha.blurasaga.com" http://127.0.0.1/ | head -c 80; echo
echo -n "default :80 (vLLM): "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
echo -n "ip:3000: "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
echo -n "api via domain: "; curl -s -o /dev/null -w "%{http_code}\n" -H "Host: odisha.blurasaga.com" http://127.0.0.1/api/ || true

echo "Done."
