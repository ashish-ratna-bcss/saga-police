#!/usr/bin/env node
/**
 * Build nginx.conf from sites.json. One admin = frontend_port + backend_port.
 * Pure Node.js script replacing render_nginx.py (zero external dependencies).
 *
 * Usage:
 *   node deploy/render_nginx.js [sites.json] [--web-root <path>] [--out <path>]
 */

const fs = require('fs');
const path = require('path');

const ADMIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
const UPSTREAM_RE = /^[\w.[\]:-]+$/;

function parsePort(value, label) {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    console.error(`Error: ${label} must be 1024–65535, got ${JSON.stringify(value)}`);
    process.exit(1);
  }
  return port;
}

function resolveSslPaths(site) {
  const domain = (site.domain || '').trim();
  let cert = (site.ssl_certificate || '').trim();
  let key = (site.ssl_certificate_key || '').trim();

  if (!cert && domain) {
    const defaultCert = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    const defaultKey = `/etc/letsencrypt/live/${domain}/privkey.pem`;
    const liveDir = `/etc/letsencrypt/live/${domain}`;
    if (fs.existsSync(liveDir) || fs.existsSync(defaultCert)) {
      cert = defaultCert;
      key = defaultKey;
    }
  }

  if (cert && key) {
    return [cert, key];
  }
  return ['', ''];
}

function loadSites(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: sites file not found at ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err.message);
    process.exit(1);
  }

  if (!data || typeof data !== 'object') {
    console.error('Error: sites.json must contain a JSON object');
    process.exit(1);
  }

  const allSites = Array.isArray(data.sites) ? data.sites : [];
  const enabledSites = allSites.filter((s) => s.enabled !== false);
  if (enabledSites.length === 0) {
    console.error('Error: sites.json has no enabled sites');
    process.exit(1);
  }

  const usedPorts = new Set();
  const admins = new Set();

  for (const s of enabledSites) {
    const admin = String(s.admin || '').trim();
    if (!ADMIN_RE.test(admin)) {
      console.error(`Error: Invalid admin name: ${JSON.stringify(admin)}`);
      process.exit(1);
    }
    const adminLower = admin.toLowerCase();
    if (admins.has(adminLower)) {
      console.error(`Error: Duplicate admin: ${admin}`);
      process.exit(1);
    }
    admins.add(adminLower);

    const frontendPort = parsePort(s.frontend_port, `${admin} frontend_port`);
    const backendPort = parsePort(s.backend_port, `${admin} backend_port`);
    if (frontendPort === backendPort) {
      console.error(`Error: ${admin} frontend_port and backend_port must differ`);
      process.exit(1);
    }

    if (usedPorts.has(frontendPort)) {
      console.error(`Error: Duplicate frontend_port ${frontendPort}`);
      process.exit(1);
    }
    usedPorts.add(frontendPort);

    if (usedPorts.has(backendPort)) {
      console.error(`Error: Duplicate backend_port ${backendPort}`);
      process.exit(1);
    }
    usedPorts.add(backendPort);

    s.admin = admin;
    s.frontend_port = frontendPort;
    s.backend_port = backendPort;
    s.domain = String(s.domain || '').trim();

    const [cert, key] = resolveSslPaths(s);
    s.ssl_certificate = cert;
    s.ssl_certificate_key = key;
    s.force_https = cert && key ? Boolean(s.force_https ?? true) : false;
  }

  data.sites = enabledSites;
  data.ip = String(data.ip || '').trim() || '_';
  data.backend_bind = String(data.backend_bind || '127.0.0.1').trim();

  const vllm = String(data.vllm_upstream || '').trim();
  if (vllm && !UPSTREAM_RE.test(vllm)) {
    console.error(`Error: Invalid vllm_upstream: ${JSON.stringify(vllm)}`);
    process.exit(1);
  }
  data.vllm_upstream = vllm;

  return data;
}

function proxyBlock(upstream, indent = '        ', longTimeout = false) {
  const timeout = longTimeout ? '600s' : '300s';
  const lines = [
    `${indent}proxy_pass ${upstream};`,
    `${indent}proxy_http_version 1.1;`,
    `${indent}proxy_set_header Host $http_host;`,
    `${indent}proxy_set_header X-Forwarded-Host $http_host;`,
    `${indent}proxy_set_header X-Real-IP $remote_addr;`,
    `${indent}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `${indent}proxy_set_header X-Forwarded-Proto $scheme;`,
    `${indent}proxy_set_header Connection "";`,
    `${indent}proxy_read_timeout ${timeout};`,
    `${indent}proxy_send_timeout ${timeout};`,
  ];
  return lines.join('\n');
}

function appLocations({ bind, backendPort, webRoot }) {
  const loc = proxyBlock(`http://${bind}:${backendPort}`);
  return `    root ${webRoot};
    index index.html;
    client_max_body_size 50m;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/ {
${loc}
    }

    location /files/ {
${loc}
    }

    location /static/ {
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 1024;`;
}

function serverBlock({
  listen,
  serverName,
  webRoot,
  bind,
  backendPort,
  defaultServer = false,
  sslCertificate = '',
  sslCertificateKey = '',
}) {
  const listenFlag = defaultServer ? ' default_server' : '';
  const isSsl = Boolean(sslCertificate && sslCertificateKey);

  let listenLines = [
    `    listen ${listen}${listenFlag};`,
    `    listen [::]:${listen}${listenFlag};`,
  ];

  if (isSsl) {
    listenLines = [
      `    listen ${listen} ssl${listenFlag};`,
      `    listen [::]:${listen} ssl${listenFlag};`,
      '    http2 on;',
      `    ssl_certificate ${sslCertificate};`,
      `    ssl_certificate_key ${sslCertificateKey};`,
      '    ssl_session_timeout 1d;',
      '    ssl_session_cache shared:SSL:10m;',
      '    ssl_protocols TLSv1.2 TLSv1.3;',
      '    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
    ];
  }

  const body = appLocations({ bind, backendPort, webRoot });
  return `server {
${listenLines.join('\n')}
    server_name ${serverName};
${body}
}`;
}

function httpRedirectBlock(domain) {
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    # ACME HTTP-01
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}`;
}

function httpDomainBlock({ domain, webRoot, bind, backendPort, forceHttps }) {
  if (forceHttps) {
    return httpRedirectBlock(domain);
  }
  const body = appLocations({ bind, backendPort, webRoot });
  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files $uri =404;
    }
${body}
}`;
}

function vllmDefaultBlock(upstream) {
  const loc = proxyBlock(`http://${upstream}`, '        ', true);
  return `# --- vLLM gateway (default :80; kept alive on ${upstream}) ---
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 100m;

    location / {
${loc}
    }
}`;
}

function render(data, webRoot) {
  const bind = data.backend_bind;
  const ip = data.ip;
  const parts = [
    '# Generated from deploy/sites.json — edit that file, then run:',
    '#   node deploy/render_nginx.js',
    '#   ./deploy/deploy.sh',
    '#',
    '# nginx listens on frontend_port (UI). /api and /files go to backend_port.',
    '# Port 80: domain host → app; default_server → vllm_upstream (if set).',
    '# HTTPS added automatically when Let\'s Encrypt certs exist for a domain.',
    '# Do not edit this file by hand.',
    '# (No top-level gzip here — main nginx.conf already enables it.)',
    '',
  ];

  if (data.vllm_upstream) {
    parts.push(vllmDefaultBlock(data.vllm_upstream));
    parts.push('');
  }

  for (const s of data.sites) {
    const admin = s.admin;
    const frontendPort = s.frontend_port;
    const backendPort = s.backend_port;
    const domain = s.domain;
    const cert = s.ssl_certificate || '';
    const key = s.ssl_certificate_key || '';

    parts.push(`# --- ${admin}  UI :${frontendPort}  API ${bind}:${backendPort} ---`);
    const serverName = ip !== '_' ? ip : '_';

    parts.push(
      serverBlock({
        listen: String(frontendPort),
        serverName,
        webRoot,
        bind,
        backendPort,
      })
    );

    if (domain) {
      parts.push(
        httpDomainBlock({
          domain,
          webRoot,
          bind,
          backendPort,
          forceHttps: Boolean(cert && key && s.force_https),
        })
      );

      if (cert && key) {
        parts.push(
          serverBlock({
            listen: '443',
            serverName: domain,
            webRoot,
            bind,
            backendPort,
            sslCertificate: cert,
            sslCertificateKey: key,
          })
        );
      }
    }

    parts.push('');
  }

  return parts.join('\n').trimEnd() + '\n';
}

function main() {
  const args = process.argv.slice(2);
  let sitesPath = path.join(__dirname, 'sites.json');
  let webRoot = '';
  let outPath = path.join(__dirname, 'nginx.conf');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--web-root' && args[i + 1]) {
      webRoot = args[++i];
    } else if (arg === '--out' && args[i + 1]) {
      outPath = args[++i];
    } else if (!arg.startsWith('-')) {
      sitesPath = path.resolve(arg);
    }
  }

  const data = loadSites(sitesPath);
  const finalWebRoot = webRoot || data.web_root || '/var/www/sockeye/frontend/build';
  const confText = render(data, finalWebRoot);

  fs.writeFileSync(outPath, confText, 'utf8');
  console.log(`Wrote ${outPath} (${data.sites.length} site(s))`);
  if (data.vllm_upstream) {
    console.log(`  vLLM default :80 → http://${data.vllm_upstream}/`);
  }
  for (const s of data.sites) {
    let extra = s.domain ? `  domain=${s.domain}` : '  (set domain later)';
    if (s.ssl_certificate) {
      extra += '  https=on';
    }
    console.log(
      `  ${s.admin}: UI http://${data.ip}:${s.frontend_port}/  API ${data.backend_bind}:${s.backend_port}${extra}`
    );
  }
}

if (require.main === module) {
  main();
}
