#!/usr/bin/env bash
# Redeploy apsoceye env + restart services on host 1930
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST="${SSH_HOST:-1930}"
REMOTE_DIR=/data/apsoceye

echo "==> SCP backend/frontend .env to ${HOST}"
scp -F "${HOME}/.ssh/config" "${ROOT}/backend/.env" "${HOST}:${REMOTE_DIR}/backend/.env"
scp -F "${HOME}/.ssh/config" "${ROOT}/frontend/.env" "${HOST}:${REMOTE_DIR}/frontend/.env"

echo "==> Remote redeploy"
ssh -F "${HOME}/.ssh/config" -o ConnectTimeout=20 "${HOST}" bash <<'REMOTE'
set -euo pipefail
export PATH=/data/apsoceye/.npm-global/bin:$PATH
export npm_config_cache=/data/apsoceye/.npm-cache
export YARN_CACHE_FOLDER=/data/apsoceye/.yarn-cache
export PUPPETEER_CACHE_DIR=/data/apsoceye/.puppeteer

cd /data/apsoceye

# Keep HTTP cookie fix (required for login on http://IP:3000 -> :5005)
if ! grep -q '^COOKIE_SECURE=' backend/.env; then
  printf '\nCOOKIE_SECURE=false\n' >> backend/.env
else
  sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=false/' backend/.env
fi

echo "=== pull latest apsoceye ==="
git fetch origin apsoceye
git checkout apsoceye
git reset --hard origin/apsoceye

# Re-apply cookie patch after hard reset (not in git)
python3 - <<'PY'
from pathlib import Path
p = Path('/data/apsoceye/backend/src/config/cookies.js')
text = p.read_text()
if 'COOKIE_SECURE' in text:
    print('cookies.js already patched')
else:
    needle = 'secure: crossSite || isProduction(),'
    replacement = (
        "secure: (() => { const v = String(process.env.COOKIE_SECURE || '').toLowerCase(); "
        "if (v === 'false' || v === '0') return false; "
        "if (v === 'true' || v === '1') return true; "
        "return crossSite || isProduction(); })(),"
    )
    count = text.count(needle)
    if count < 1:
        raise SystemExit('cookies.js patch failed')
    p.write_text(text.replace(needle, replacement))
    print(f'cookies.js patched ({count})')
PY

# .env is gitignored — confirm still present after reset
test -f backend/.env
test -f frontend/.env
if ! grep -q '^COOKIE_SECURE=' backend/.env; then
  printf '\nCOOKIE_SECURE=false\n' >> backend/.env
fi

echo "=== branch/commit ==="
git branch --show-current
git log -1 --format='%H %s'

echo "=== env (non-secret) ==="
grep -E '^(PORT|MONGO_ENABLED|CUSTOM_SENTIMENT_URL|MEDIA_ANALYZER_URL|RAG_API_URL|COOKIE_SECURE)=' backend/.env || true
grep REACT_APP_BACKEND_URL frontend/.env || true

echo "=== backend deps ==="
cd /data/apsoceye/backend
PUPPETEER_CACHE_DIR=/data/apsoceye/.puppeteer yarn install --frozen-lockfile
npx prisma generate

# Frontend REACT_APP_* unchanged → skip rebuild unless URL changed
# Restart services with updated backend env
pm2 startOrReload /data/apsoceye/ecosystem.config.js --update-env
pm2 save
sleep 3
pm2 status

echo -n 'backend ping: '
curl -sS -m 5 http://127.0.0.1:5005/api/ping || true
echo
echo -n 'frontend: '
curl -sS -m 5 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/ || true
echo 'DONE'
REMOTE

echo "==> Redeploy finished"
