#!/usr/bin/env python3
"""Build nginx.conf from sites.json. One admin = frontend_port + backend_port.

Port 80 is shared: named domains → Blura Saga; default_server → vLLM upstream
(when vllm_upstream is set in sites.json). vLLM is not removed — only rebound
to localhost so nginx can terminate public :80.

When a site has domain + ssl cert paths (or standard Let's Encrypt files exist),
an HTTPS (:443) server is also emitted for that domain.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ADMIN_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$")
UPSTREAM_RE = re.compile(r"^[\w.\[\]:-]+$")


def _port(value, label: str) -> int:
    try:
        port = int(value or 0)
    except (TypeError, ValueError):
        port = 0
    if port < 1024 or port > 65535:
        raise SystemExit(f"{label} must be 1024–65535, got {value!r}")
    return port


def _ssl_paths(site: dict) -> tuple[str, str] | tuple[None, None]:
    """Return cert/key paths. Prefer explicit sites.json values; else Let's Encrypt live/."""
    domain = site.get("domain") or ""
    cert = str(site.get("ssl_certificate") or "").strip()
    key = str(site.get("ssl_certificate_key") or "").strip()
    if not cert and domain:
        # Standard LE layout (may not be readable by non-root; paths still valid for nginx)
        cert = f"/etc/letsencrypt/live/{domain}/fullchain.pem"
        key = f"/etc/letsencrypt/live/{domain}/privkey.pem"
        # Only auto-wire if at least the live dir exists (or root can see the files)
        live = Path(f"/etc/letsencrypt/live/{domain}")
        if not live.exists() and not Path(cert).exists():
            return None, None
    if cert and key:
        return cert, key
    return None, None


def load_sites(path: Path) -> dict:
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise SystemExit("sites.json must be an object")
    sites = [s for s in data.get("sites") or [] if s.get("enabled", True)]
    if not sites:
        raise SystemExit("sites.json has no enabled sites")

    used = []
    admins = []
    for s in sites:
        admin = str(s.get("admin") or "").strip()
        if not ADMIN_RE.match(admin):
            raise SystemExit(f"invalid admin name: {admin!r}")
        frontend_port = _port(s.get("frontend_port"), f"{admin} frontend_port")
        backend_port = _port(s.get("backend_port"), f"{admin} backend_port")
        if frontend_port == backend_port:
            raise SystemExit(f"{admin}: frontend_port and backend_port must differ")
        for p, kind in ((frontend_port, "frontend_port"), (backend_port, "backend_port")):
            if p in used:
                raise SystemExit(f"duplicate {kind} {p}")
            used.append(p)
        if admin.lower() in admins:
            raise SystemExit(f"duplicate admin {admin}")
        admins.append(admin.lower())
        s["admin"] = admin
        s["frontend_port"] = frontend_port
        s["backend_port"] = backend_port
        s["domain"] = str(s.get("domain") or "").strip()
        cert, key = _ssl_paths(s)
        s["ssl_certificate"] = cert or ""
        s["ssl_certificate_key"] = key or ""
        s["force_https"] = bool(s.get("force_https", True)) if cert else False
    data["sites"] = sites
    data["ip"] = str(data.get("ip") or "").strip() or "_"
    data["backend_bind"] = str(data.get("backend_bind") or "127.0.0.1").strip()
    vllm = str(data.get("vllm_upstream") or "").strip()
    if vllm and not UPSTREAM_RE.match(vllm):
        raise SystemExit(f"invalid vllm_upstream: {vllm!r}")
    data["vllm_upstream"] = vllm
    return data


def proxy_block(upstream: str, indent: str = "        ", *, long_timeout: bool = False) -> str:
    read_t = "600s" if long_timeout else "300s"
    send_t = "600s" if long_timeout else "300s"
    lines = [
        f"{indent}proxy_pass {upstream};",
        f"{indent}proxy_http_version 1.1;",
        f"{indent}proxy_set_header Host $host;",
        f"{indent}proxy_set_header X-Real-IP $remote_addr;",
        f"{indent}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
        f"{indent}proxy_set_header X-Forwarded-Proto $scheme;",
        f"{indent}proxy_set_header Connection \"\";",
        f"{indent}proxy_read_timeout {read_t};",
        f"{indent}proxy_send_timeout {send_t};",
    ]
    return "\n".join(lines)


def app_locations(*, bind: str, backend_port: int, web_root: str) -> str:
    loc = proxy_block(f"http://{bind}:{backend_port}")
    return f"""
    root {web_root};
    index index.html;
    client_max_body_size 50m;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/ {{
{loc}
    }}

    location /files/ {{
{loc}
    }}

    location /static/ {{
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }}

    location / {{
        try_files $uri $uri/ /index.html;
    }}

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 1024;
""".rstrip()


def server_block(
    *,
    listen: str,
    server_name: str,
    web_root: str,
    bind: str,
    backend_port: int,
    default_server: bool = False,
    ssl_certificate: str = "",
    ssl_certificate_key: str = "",
) -> str:
    listen_flag = " default_server" if default_server else ""
    ssl = bool(ssl_certificate and ssl_certificate_key)
    listen_lines = [
        f"    listen {listen}{listen_flag};",
        f"    listen [::]:{listen}{listen_flag};",
    ]
    if ssl:
        # dual-stack HTTPS
        listen_lines = [
            f"    listen {listen} ssl{listen_flag};",
            f"    listen [::]:{listen} ssl{listen_flag};",
            "    http2 on;",
            f"    ssl_certificate {ssl_certificate};",
            f"    ssl_certificate_key {ssl_certificate_key};",
            "    ssl_session_timeout 1d;",
            "    ssl_session_cache shared:SSL:10m;",
            "    ssl_protocols TLSv1.2 TLSv1.3;",
            "    add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;",
        ]
    body = app_locations(bind=bind, backend_port=backend_port, web_root=web_root)
    return f"""
server {{
{chr(10).join(listen_lines)}
    server_name {server_name};
{body}
}}
""".rstrip()


def http_redirect_block(domain: str) -> str:
    return f"""
server {{
    listen 80;
    listen [::]:80;
    server_name {domain};

    # ACME HTTP-01
    location ^~ /.well-known/acme-challenge/ {{
        root /var/www/certbot;
        default_type "text/plain";
        try_files $uri =404;
    }}

    location / {{
        return 301 https://$host$request_uri;
    }}
}}
""".rstrip()


def http_domain_block(
    *,
    domain: str,
    web_root: str,
    bind: str,
    backend_port: int,
    force_https: bool,
) -> str:
    if force_https:
        return http_redirect_block(domain)
    body = app_locations(bind=bind, backend_port=backend_port, web_root=web_root)
    return f"""
server {{
    listen 80;
    listen [::]:80;
    server_name {domain};

    location ^~ /.well-known/acme-challenge/ {{
        root /var/www/certbot;
        default_type "text/plain";
        try_files $uri =404;
    }}
{body}
}}
""".rstrip()


def vllm_default_block(upstream: str) -> str:
    loc = proxy_block(f"http://{upstream}", long_timeout=True)
    return f"""
# --- vLLM gateway (default :80; kept alive on {upstream}) ---
server {{
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 100m;

    location / {{
{loc}
    }}
}}
""".rstrip()


def render(data: dict, web_root: str) -> str:
    bind = data["backend_bind"]
    ip = data["ip"]
    parts = [
        "# Generated from deploy/sites.json — edit that file, then run:",
        "#   python3 deploy/render_nginx.py",
        "#   ./deploy/deploy.sh",
        "#",
        "# nginx listens on frontend_port (UI). /api and /files go to backend_port.",
        "# Port 80: domain host → app; default_server → vllm_upstream (if set).",
        "# HTTPS added automatically when Let's Encrypt certs exist for a domain.",
        "# Do not edit this file by hand.",
        "# (No top-level gzip here — main nginx.conf already enables it.)",
        "",
    ]
    if data.get("vllm_upstream"):
        parts.append(vllm_default_block(data["vllm_upstream"]))
        parts.append("")

    for s in data["sites"]:
        admin = s["admin"]
        frontend_port = s["frontend_port"]
        backend_port = s["backend_port"]
        domain = s["domain"]
        cert = s.get("ssl_certificate") or ""
        key = s.get("ssl_certificate_key") or ""
        parts.append(
            f"# --- {admin}  UI :{frontend_port}  API {bind}:{backend_port} ---"
        )
        names = ip if ip != "_" else "_"
        parts.append(
            server_block(
                listen=str(frontend_port),
                server_name=names,
                web_root=web_root,
                bind=bind,
                backend_port=backend_port,
            )
        )
        if domain:
            parts.append(
                http_domain_block(
                    domain=domain,
                    web_root=web_root,
                    bind=bind,
                    backend_port=backend_port,
                    force_https=bool(cert and key and s.get("force_https")),
                )
            )
            if cert and key:
                parts.append(
                    server_block(
                        listen="443",
                        server_name=domain,
                        web_root=web_root,
                        bind=bind,
                        backend_port=backend_port,
                        ssl_certificate=cert,
                        ssl_certificate_key=key,
                    )
                )
        parts.append("")
    return "\n".join(parts).rstrip() + "\n"


def main() -> int:
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Render nginx.conf from sites.json")
    parser.add_argument("sites", nargs="?", default=str(here / "sites.json"))
    parser.add_argument("--web-root", default="")
    parser.add_argument("--out", default=str(here / "nginx.conf"))
    args = parser.parse_args()

    data = load_sites(Path(args.sites))
    web_root = args.web_root or data.get("web_root") or "/var/www/sockeye/frontend/build"
    text = render(data, web_root)
    Path(args.out).write_text(text)
    print(f"Wrote {args.out} ({len(data['sites'])} site(s))")
    if data.get("vllm_upstream"):
        print(f"  vLLM default :80 → http://{data['vllm_upstream']}/")
    for s in data["sites"]:
        extra = f"  domain={s['domain']}" if s["domain"] else "  (set domain later)"
        if s.get("ssl_certificate"):
            extra += "  https=on"
        print(
            f"  {s['admin']}: UI http://{data['ip']}:{s['frontend_port']}/  "
            f"API {data['backend_bind']}:{s['backend_port']}{extra}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
