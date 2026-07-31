from flask import Flask, render_template, request, session, redirect, url_for, Response, send_file, jsonify
import trio
import httpx
import hashlib
import socket
import subprocess
from urllib.parse import quote, urlparse
import phonenumbers
from phonenumbers import carrier, geocoder, number_type, timezone as pn_timezone, PhoneNumberType
import os
import io
import csv
import json
from datetime import datetime, timezone as dt_timezone
from werkzeug.security import generate_password_hash, check_password_hash
import shutil
import re
import sys

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
except ImportError:
    pass

# Add project root to path for imports
_APP_DIR = os.path.dirname(os.path.abspath(__file__))
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

import Sam.core as hc
from services.user_scanner_service import get_scanner_service, UserScannerService

app = Flask(__name__)
app.secret_key = os.getenv("APP_SECRET_KEY", "change-this-in-production")

# Register Image Intelligence Blueprint
from routes.image_routes import image_bp
app.register_blueprint(image_bp)

class Args:
    onlyused = False
    nocolor = True
    noclear = True
    nopasswordrecovery = False
    csvoutput = False
    timeout = 10

AVAILABLE_TOOLS = [
    {"id": "holehe", "label": "Holehe Email Footprint"},
    {"id": "user_scanner", "label": "User-Scanner OSINT Engine (195+ Platforms)"},
    {"id": "disposable", "label": "Disposable Email Risk Check"},
    {"id": "emailpivots", "label": "Email Breach & Intel Pivots"},
    {"id": "phone", "label": "Phone Intelligence (Metadata/Search)"},
    {"id": "sherlock", "label": "Sherlock Username Deep Scan"},
    {"id": "maigret", "label": "Maigret Username Deep Scan"},
    {"id": "userdeep", "label": "Username Deep Scan (Sherlock + Maigret)"},
]

EMAIL_BASED_TOOLS = {"holehe", "user_scanner", "disposable", "emailpivots"}
USER_SCANNER_TOOLS = {"user_scanner"}
USERNAME_BASED_TOOLS = {"username", "sherlock", "maigret", "userdeep"}
PHONE_BASED_TOOLS = {"phone"}
AUTH_PASSWORD = os.getenv("POLICE_PORTAL_PASSWORD", "ChangeMe@123")
AUDIT_LOG_PATH = os.getenv("POLICE_AUDIT_LOG_PATH", os.path.join(_APP_DIR, "audit_logs", "police_portal_audit.jsonl"))
POLICE_USERS_FILE = os.getenv("POLICE_USERS_FILE", os.path.join(_APP_DIR, "data", "police_users.json"))
BRAND_LOGO_PATH = os.getenv("POLICE_BRAND_LOGO_PATH", "")
PORTAL_DEFAULT_USER = os.getenv("OSINT_PORTAL_USER", "integrated_user")
PORTAL_DEFAULT_ROLE = os.getenv("OSINT_PORTAL_ROLE", "admin").strip().lower() or "admin"

USERNAME_PLATFORMS = [
    {"name": "GitHub", "url": "https://github.com/{username}"},
    {"name": "GitLab", "url": "https://gitlab.com/{username}"},
    {"name": "Instagram", "url": "https://www.instagram.com/{username}/"},
    {"name": "Pinterest", "url": "https://www.pinterest.com/{username}/"},
    {"name": "TikTok", "url": "https://www.tiktok.com/@{username}"},
    {"name": "Medium", "url": "https://medium.com/@{username}"},
    {"name": "Tumblr", "url": "https://{username}.tumblr.com"},
    {"name": "Vimeo", "url": "https://vimeo.com/{username}"},
    {"name": "Keybase", "url": "https://keybase.io/{username}"},
    {"name": "Behance", "url": "https://www.behance.net/{username}"},
    {"name": "Docker Hub", "url": "https://hub.docker.com/u/{username}"},
]


def _migrate_email_keys(accounts: dict) -> dict:
    """Convert any legacy email-format keys (user@domain) to plain username keys."""
    migrated = {}
    for key, val in accounts.items():
        ukey = key.split("@")[0].lower() if "@" in key else key.lower()
        migrated[ukey] = val
    return migrated


def _load_police_accounts():
    """
    Loads accounts keyed by plain username (no @domain).
    Legacy email-keyed accounts are migrated automatically.
    POLICE_USERS env var format: username|password|role;...
    """
    raw = os.getenv("POLICE_USERS", "").strip()
    accounts = _migrate_email_keys(_load_file_police_accounts())

    # Deterministic fallback admin (plain username, no domain)
    if "admin" not in accounts:
        accounts["admin"] = {"password": AUTH_PASSWORD, "role": "admin"}

    if not raw:
        return accounts

    for row in raw.split(";"):
        item = row.strip()
        if not item:
            continue
        parts = [p.strip() for p in item.split("|")]
        if len(parts) < 2:
            continue
        # Strip domain if someone still passes email format in env var
        username = parts[0].split("@")[0].lower()
        password = parts[1]
        role = parts[2] if len(parts) >= 3 and parts[2] else "officer"
        accounts[username] = {"password": password, "role": role}
    return accounts


def _load_file_police_accounts():
    if not os.path.exists(POLICE_USERS_FILE):
        return {}
    try:
        with open(POLICE_USERS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, dict):
            return raw
        return {}
    except Exception:
        return {}


def _save_file_police_accounts(accounts):
    os.makedirs(os.path.dirname(POLICE_USERS_FILE), exist_ok=True)
    with open(POLICE_USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(accounts, f, indent=2, ensure_ascii=False)

LINK_CATEGORIES = [
    "Username Intelligence",
    "Email Intelligence",
    "Infrastructure Intelligence",
    "Threat Intelligence",
    "Metadata Analysis",
    "DFIR",
    "Malware Analysis",
    "Reconnaissance",
]

OTHER_LINKS_FILE = os.getenv("OTHER_LINKS_FILE", os.path.join(_APP_DIR, "data", "other_links.json"))


def _load_other_links():
    if not os.path.exists(OTHER_LINKS_FILE):
        return []
    try:
        with open(OTHER_LINKS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, list):
            return raw
    except Exception:
        pass
    return []


def _save_other_links(links):
    os.makedirs(os.path.dirname(OTHER_LINKS_FILE), exist_ok=True)
    with open(OTHER_LINKS_FILE, "w", encoding="utf-8") as f:
        json.dump(links, f, indent=2, ensure_ascii=False)


def _verify_password(stored_password, provided_password):
    if isinstance(stored_password, str) and ":" in stored_password:
        try:
            return check_password_hash(stored_password, provided_password)
        except Exception:
            return False
    return stored_password == provided_password


@app.before_request
def _bootstrap_integrated_session():
    """
    The OSINT module is embedded in the main product flow, so it no longer
    maintains its own login/logout boundary. Seed a stable internal identity
    for audit trails and admin-only UI/actions.
    """
    session["authorized"] = True
    session.setdefault("police_email", PORTAL_DEFAULT_USER)
    session.setdefault("police_role", PORTAL_DEFAULT_ROLE)


@app.context_processor
def _portal_template_helpers():
    base = (request.script_root or "").rstrip("/")

    def portal_url(path: str = ""):
        if not path:
            return base or "/"
        normalized = path if path.startswith("/") else f"/{path}"
        return f"{base}{normalized}" if base else normalized

    return {
        "osint_base": base,
        "portal_url": portal_url,
    }


def _is_admin():
    return (session.get("police_role") or PORTAL_DEFAULT_ROLE) == "admin"


_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_.]{1,20}$')


def _validate_username(username: str):
    """Return (ok, error_message). username should already be stripped."""
    if not username:
        return False, "Username is required."
    if len(username) > 20:
        return False, "Username must be 20 characters or fewer."
    if not _USERNAME_RE.match(username):
        return False, ("Username may only contain letters, numbers, underscores (_), "
                       "and dots (.). No spaces allowed.")
    return True, ""


def _validate_password_strength(password: str):
    """Return (ok, error_message)."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters."
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number."
    if not re.search(r'[^a-zA-Z0-9]', password):
        return False, "Password must contain at least one special character (e.g. @, #, !, _)."
    return True, ""


def _write_audit_log(action, status="success", details=None):
    details = details or {}
    os.makedirs(os.path.dirname(AUDIT_LOG_PATH), exist_ok=True)
    entry = {
        "timestamp_utc": datetime.now(dt_timezone.utc).isoformat(),
        "action": action,
        "status": status,
        "user_email": session.get("police_email"),
        "user_role": session.get("police_role"),
        "remote_addr": request.headers.get("X-Forwarded-For", request.remote_addr),
        "details": details,
    }
    with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

@app.route('/login', methods=['GET', 'POST'])
def login():
    return redirect(url_for("index"))


@app.route('/logout')
def logout():
    return redirect(url_for("index"))


@app.route('/web-links')
def web_links():
    return redirect(url_for('other_links'))


@app.route('/commercial-links')
def commercial_links():
    return redirect(url_for('other_links'))


@app.route('/other-links', methods=['GET', 'POST'])
def other_links():
    if not _is_authorized():
        return redirect(url_for('login'))

    error = None
    success = None
    links = _load_other_links()

    if request.method == 'POST':
        if request.form.get('action') == 'delete':
            if not _is_admin():
                _write_audit_log("other_links_delete_attempt", "failed", {"reason": "not_admin"})
                return redirect(url_for("other_links"))
            try:
                index = int(request.form.get('link_index', -1))
                if 0 <= index < len(links):
                    deleted = links.pop(index)
                    _save_other_links(links)
                    success = "Link deleted successfully."
                    _write_audit_log("other_links_delete", "success", {
                        "title": deleted.get("title", ""), "url": deleted.get("url", "")
                    })
                else:
                    error = "Invalid link index."
            except (ValueError, TypeError):
                error = "Invalid request."
        else:
            if not _is_admin():
                _write_audit_log("other_links_add_attempt", "failed", {"reason": "not_admin"})
                return redirect(url_for("other_links"))
            title       = request.form.get('title', '').strip()
            url         = request.form.get('url', '').strip()
            category    = request.form.get('category', '').strip()
            free_paid   = request.form.get('free_paid', 'Free').strip()
            description = request.form.get('description', '').strip()
            if not title or not url or not category:
                error = "Title, URL, and Category are required."
            else:
                if not re.match(r'https?://', url):
                    url = 'https://' + url
                links.append({
                    "title":       title,
                    "url":         url,
                    "category":    category,
                    "free_paid":   free_paid,
                    "description": description,
                    "added_by":    session.get("police_email", "unknown"),
                    "added_at":    datetime.now(dt_timezone.utc).isoformat()
                })
                _save_other_links(links)
                success = f"Link '{title}' added successfully."
                _write_audit_log("other_links_add", "success", {
                    "title": title, "url": url, "category": category
                })

    # Stamp each link with its flat-list index so the template can build delete forms correctly.
    for i, link in enumerate(links):
        link['_idx'] = i

    grouped = {cat: [] for cat in LINK_CATEGORIES}
    for link in links:
        cat = link.get("category", "")
        if cat in grouped:
            grouped[cat].append(link)
        else:
            grouped.setdefault("Other", []).append(link)

    return render_template(
        'other_links.html',
        grouped=grouped,
        categories=LINK_CATEGORIES,
        links=links,
        error=error,
        success=success,
        police_email=session.get("police_email", ""),
        police_role=session.get("police_role", "")
    )


def _is_authorized():
    return True


@app.route('/brand-logo')
def brand_logo():
    if os.path.exists(BRAND_LOGO_PATH):
        return send_file(BRAND_LOGO_PATH)
    return "", 404


@app.route('/admin/users', methods=['GET', 'POST'])
def admin_users():
    if not _is_admin():
        _write_audit_log("admin_users_access", "failed", {"reason": "not_admin"})
        return redirect(url_for("index"))

    error = None
    success = None

    # Load file accounts and permanently migrate any legacy email-format keys
    raw_accounts = _load_file_police_accounts()
    accounts = _migrate_email_keys(raw_accounts)
    if accounts != raw_accounts:
        _save_file_police_accounts(accounts)

    if request.method == 'POST':
        action = request.form.get("action", "").strip()
        target_username = request.form.get("username", "").strip().lower()

        if action == "create_or_update":
            password = request.form.get("password", "").strip()
            role = request.form.get("role", "officer").strip().lower() or "officer"

            valid_u, err_u = _validate_username(target_username)
            if not valid_u:
                error = err_u
            elif not password:
                error = "Password is required."
            elif role not in {"admin", "officer", "analyst"}:
                error = "Role must be admin, officer, or analyst."
            else:
                valid_p, err_p = _validate_password_strength(password)
                if not valid_p:
                    error = err_p
                else:
                    # Case-insensitive uniqueness check for new accounts
                    existing_lower = [k.lower() for k in accounts]
                    if target_username not in accounts and target_username in existing_lower:
                        error = "A user with that username already exists."
                    else:
                        accounts[target_username] = {
                            "password": generate_password_hash(password),
                            "role": role,
                        }
                        _save_file_police_accounts(accounts)
                        success = f"Account saved for '{target_username}'."
                        _write_audit_log("admin_user_upsert", "success",
                                         {"target_username": target_username, "role": role})

        elif action == "delete":
            if target_username in accounts:
                del accounts[target_username]
                _save_file_police_accounts(accounts)
                success = f"Account removed for '{target_username}'."
                _write_audit_log("admin_user_delete", "success", {"target_username": target_username})
            else:
                error = "Account not found."

    rows = [
        {"username": uname, "role": info.get("role", "officer"), "source": "file"}
        for uname, info in sorted(accounts.items())
    ]
    return render_template(
        "admin_users.html",
        users=rows,
        error=error,
        success=success,
        police_email=session.get("police_email", ""),
        police_role=session.get("police_role", "")
    )


@app.route('/', methods=['GET', 'POST'])
def index():
    if not _is_authorized():
        return redirect(url_for("login"))

    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        username = request.form.get('username', '').strip()
        phone = request.form.get('phone', '').strip()
        selected_tools = request.form.getlist('tools')
        if not selected_tools:
            selected_tools = ["holehe"]

        needs_email = any(tool in EMAIL_BASED_TOOLS for tool in selected_tools)
        needs_username = any(tool in USERNAME_BASED_TOOLS for tool in selected_tools)
        needs_phone = any(tool in PHONE_BASED_TOOLS for tool in selected_tools)

        if needs_email and not hc.is_email(email):
            return render_template(
                'index.html',
                error="Please enter a valid email address.",
                available_tools=AVAILABLE_TOOLS,
                selected_tools=selected_tools,
                email=email,
                username=username,
                phone=phone
            )

        if needs_username and not username:
            username = email.split("@")[0].strip().lower() if hc.is_email(email) else ""

        if needs_username and not username:
            return render_template(
                'index.html',
                error="Please enter a username for username footprint checks.",
                available_tools=AVAILABLE_TOOLS,
                selected_tools=selected_tools,
                email=email,
                username=username,
                phone=phone
            )

        if needs_phone and not phone:
            return render_template(
                'index.html',
                error="Please enter a phone number for phone intelligence checks.",
                available_tools=AVAILABLE_TOOLS,
                selected_tools=selected_tools,
                email=email,
                username=username,
                phone=phone
            )

        # All tools now run asynchronously via SSE/AJAX — page renders immediately.
        _write_audit_log(
            "scan_run",
            "success",
            {
                "selected_tools": selected_tools,
                "input_email": bool(email),
                "input_username": bool(username),
                "input_phone": bool(phone),
            }
        )

        return render_template(
            'index.html',
            email=email,
            username=username,
            phone=phone,
            police_email=session.get("police_email", ""),
            police_role=session.get("police_role", ""),
            selected_tools=selected_tools,
            available_tools=AVAILABLE_TOOLS,
        )
    return render_template(
        'index.html',
        available_tools=AVAILABLE_TOOLS,
        selected_tools=["holehe"],
        email="",
        username="",
        phone="",
        police_email=session.get("police_email", ""),
        police_role=session.get("police_role", "")
    )


@app.route('/tools/<tool_type>', methods=['GET', 'POST'])
def tools_page(tool_type):
    return redirect(url_for("index"))


@app.route('/api/stream/scan')
def stream_scan():
    """
    Server-Sent Events endpoint for real-time scan results.
    Streams results as they're discovered to avoid user waiting.
    """
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    
    scan_type = request.args.get('type', 'email')
    query = request.args.get('query', '').strip()
    
    if not query:
        return jsonify({"error": "Query required"}), 400
    
    def generate():
        try:
            scanner_service = get_scanner_service()
            for event in scanner_service.scan_streaming(scan_type, query):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
    
    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'  # Disable nginx buffering
        }
    )


@app.route('/api/stream/sherlock')
def stream_sherlock():
    """
    Server-Sent Events endpoint for real-time Sherlock scan results.
    """
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    
    username = request.args.get('username', '').strip().lower()
    if not username:
        return jsonify({"error": "Username required"}), 400
    
    def generate():
        found_count = 0
        checked_count = 0
        process = None

        try:
            import shutil
            import importlib.util

            # 1. Prefer the sherlock executable on PATH — same binary that works from CMD
            sherlock_exe = shutil.which('sherlock')

            # 2. If not on PATH, look in the Scripts folder next to sys.executable
            if not sherlock_exe:
                scripts_dir = os.path.join(os.path.dirname(sys.executable), 'Scripts')
                for name in ('sherlock.exe', 'sherlock'):
                    candidate = os.path.join(scripts_dir, name)
                    if os.path.isfile(candidate):
                        sherlock_exe = candidate
                        break

            if sherlock_exe:
                cmd = [sherlock_exe, username, '--print-found', '--no-color']
            else:
                # 3. Fall back to python -m sherlock_project.sherlock
                if importlib.util.find_spec('sherlock_project') is None:
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Sherlock not found. Install: pip install sherlock-project'})}\n\n"
                    return
                cmd = [sys.executable, '-u', '-m', 'sherlock_project.sherlock', username, '--print-found', '--no-color']

            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            env['PYTHONIOENCODING'] = 'utf-8'

            # Signal to the frontend that scanning has started
            yield f"data: {json.dumps({'type': 'progress', 'message': 'Sherlock started', 'checked': 0})}\n\n"

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True,
                env=env
            )

            # Stream stdout line by line — URLs arrive as sherlock finds them
            for line in iter(process.stdout.readline, ''):
                line = line.strip()
                if not line:
                    continue

                urls = re.findall(r'https?://[^\s\]>)]+', line)
                for url in urls:
                    url = url.rstrip('.,;')
                    found_count += 1
                    checked_count += 1
                    yield f"data: {json.dumps({'type': 'result', 'url': url, 'found_count': found_count, 'checked': checked_count})}\n\n"

                if not urls:
                    checked_count += 1
                    if checked_count % 15 == 0:
                        yield f"data: {json.dumps({'type': 'progress', 'checked': checked_count})}\n\n"

            process.stdout.close()
            stderr_out = process.stderr.read().strip()
            process.wait()

            if process.returncode != 0 and found_count == 0 and stderr_out:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Sherlock error (exit {process.returncode}): {stderr_out[:400]}'})}\n\n"
                return

            yield f"data: {json.dumps({'type': 'complete', 'found_count': found_count, 'checked_count': checked_count})}\n\n"

        except GeneratorExit:
            pass
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Sherlock stream error: {str(exc)}'})}\n\n"
        finally:
            if process and process.poll() is None:
                process.kill()
                process.wait()
    
    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@app.route('/api/stream/maigret')
def stream_maigret():
    """
    Server-Sent Events endpoint for real-time Maigret scan results.
    """
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    
    username = request.args.get('username', '').strip().lower()
    if not username:
        return jsonify({"error": "Username required"}), 400
    
    def generate():
        found_count = 0
        checked_count = 0
        process = None

        try:
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"

            cmd = [sys.executable, "-m", "maigret", username, "--no-color", "--no-progressbar"]

            try:
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True,
                    env=env
                )
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Maigret failed to start: {str(e)}'})}\n\n"
                return

            # Stream output line by line
            for line in iter(process.stdout.readline, ''):
                line = line.strip()
                if not line:
                    continue

                # Check for URLs in output
                urls = re.findall(r"https?://[^\s)>\]]+", line)
                for url in urls:
                    found_count += 1
                    yield f"data: {json.dumps({'type': 'result', 'url': url, 'found_count': found_count})}\n\n"

                checked_count += 1
                if checked_count % 10 == 0:
                    yield f"data: {json.dumps({'type': 'progress', 'checked': checked_count})}\n\n"

            process.wait()
            yield f"data: {json.dumps({'type': 'complete', 'found_count': found_count})}\n\n"

        except GeneratorExit:
            pass
        finally:
            if process and process.poll() is None:
                process.kill()
                process.wait()
    
    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@app.route('/download/<fmt>')
def download_results(fmt):
    if not _is_authorized():
        return redirect(url_for("login"))

    payload = session.get("last_export")
    if not payload:
        return redirect(url_for("index"))

    if fmt == "json":
        _write_audit_log("download_results", "success", {"format": "json"})
        content = json.dumps(payload, indent=2, ensure_ascii=False)
        return Response(
            content,
            mimetype="application/json",
            headers={"Content-Disposition": "attachment; filename=osint_results.json"}
        )

    if fmt == "csv":
        _write_audit_log("download_results", "success", {"format": "csv"})
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["section", "key", "value"])
        writer.writerow(["meta", "email", payload.get("email", "")])
        writer.writerow(["meta", "username", payload.get("username", "")])
        writer.writerow(["meta", "phone", payload.get("phone", "")])
        writer.writerow(["meta", "selected_tools", ", ".join(payload.get("selected_tools", []))])

        for idx, item in enumerate(payload.get("results", []), start=1):
            writer.writerow([f"holehe_{idx}", "domain", item.get("domain", "")])
            writer.writerow([f"holehe_{idx}", "exists", item.get("exists", "")])
            writer.writerow([f"holehe_{idx}", "emailrecovery", item.get("emailrecovery", "")])
            writer.writerow([f"holehe_{idx}", "phoneNumber", item.get("phoneNumber", "")])
            others = item.get("others", {})
            if isinstance(others, dict):
                for key, value in others.items():
                    writer.writerow([f"holehe_{idx}", f"others.{key}", value])

        for section in ["domain_result", "gravatar_result", "disposable_result", "mx_security_result", "phone_result", "sherlock_result", "maigret_result", "userdeep_result", "whois_result", "email_pivots_result"]:
            value = payload.get(section)
            if isinstance(value, dict):
                for key, val in value.items():
                    writer.writerow([section, key, json.dumps(val, ensure_ascii=False) if isinstance(val, (list, dict)) else val])

        username_result = payload.get("username_result")
        if isinstance(username_result, dict):
            writer.writerow(["username_result", "username", username_result.get("username", "")])
            for platform in username_result.get("platforms", []):
                writer.writerow(["username_result", platform.get("name", ""), platform.get("url", "")])

        csv_data = stream.getvalue()
        stream.close()
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=osint_results.csv"}
        )

    if fmt == "pdf":
        try:
            from services.pdf_report_service import generate_dashboard_pdf
            pdf_bytes = generate_dashboard_pdf(
                payload,
                officer_email=session.get('police_email', ''),
                officer_role=session.get('police_role', ''),
            )
            _write_audit_log("download_results", "success", {"format": "pdf"})
            return Response(
                pdf_bytes,
                mimetype="application/pdf",
                headers={"Content-Disposition": "attachment; filename=osint_investigation_report.pdf"}
            )
        except Exception as exc:
            import traceback
            print(f"Dashboard PDF Error: {exc}\n{traceback.format_exc()}")
            _write_audit_log("download_results", "error", {"format": "pdf", "error": str(exc)})
            return f"PDF generation failed: {exc}. Try JSON or CSV instead.", 500

    return redirect(url_for("index"))


@app.route('/infra-intel/download/pdf')
def infra_intel_download_pdf():
    if not _is_authorized():
        return redirect(url_for('login'))

    saved = session.get('last_infra_scan')
    if not saved:
        return "No infrastructure scan data available. Run a scan first.", 404

    try:
        from services.pdf_report_service import generate_infra_pdf
        pdf_bytes = generate_infra_pdf(
            saved['result'],
            query=saved.get('query', ''),
            officer_email=session.get('police_email', ''),
            officer_role=session.get('police_role', ''),
        )
        _write_audit_log("download_infra_pdf", "success",
                         {"query": saved.get('query', '')})
        target = saved['result'].get('host_info', {}).get('ip', 'host')
        filename = f"infra_intel_{target.replace('.', '_')}.pdf"
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as exc:
        import traceback
        print(f"Infra PDF Error: {exc}\n{traceback.format_exc()}")
        _write_audit_log("download_infra_pdf", "error", {"error": str(exc)})
        return f"PDF generation failed: {exc}", 500


@app.route('/ask-ai/download/pdf')
def ask_ai_download_pdf():
    if not _is_authorized():
        return redirect(url_for('login'))

    saved = session.get('last_ask_ai')
    if not saved:
        return "No AI analysis data available. Run an Ask AI query first.", 404

    try:
        from services.pdf_report_service import generate_ask_ai_pdf
        pdf_bytes = generate_ask_ai_pdf(
            saved['query'],
            saved['result'],
            officer_email=session.get('police_email', ''),
            officer_role=session.get('police_role', ''),
        )
        _write_audit_log("download_ask_ai_pdf", "success",
                         {"query_preview": saved['query'][:100]})
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": "attachment; filename=ai_investigation_report.pdf"}
        )
    except Exception as exc:
        import traceback
        print(f"Ask AI PDF Error: {exc}\n{traceback.format_exc()}")
        _write_audit_log("download_ask_ai_pdf", "error", {"error": str(exc)})
        return f"PDF generation failed: {exc}", 500

def run_holehe(email):
    args = Args()
    modules = hc.import_submodules("Sam.modules")
    websites = hc.get_functions(modules, args)
    timeout = args.timeout
    client = httpx.AsyncClient(timeout=timeout)
    out = []

    async def run_checks():
        async with trio.open_nursery() as nursery:
            for website in websites:
                nursery.start_soon(hc.launch_module, website, email, client, out)
        await client.aclose()

    trio.run(run_checks)
    out = sorted(out, key=lambda i: i['name'])
    return out


def run_gravatar_check(email):
    normalized_email = email.strip().lower()
    email_hash = hashlib.md5(normalized_email.encode("utf-8")).hexdigest()
    avatar_url = f"https://www.gravatar.com/avatar/{email_hash}?d=404"
    profile_url = f"https://gravatar.com/{quote(normalized_email)}"

    try:
        response = httpx.get(avatar_url, timeout=8)
        exists = response.status_code == 200
    except Exception:
        exists = False

    return {
        "email_hash": email_hash,
        "avatar_url": avatar_url,
        "profile_url": profile_url,
        "exists": exists
    }


def run_domain_intelligence(email):
    domain = email.split("@")[-1].strip().lower()
    a_records = []
    ip_records = []
    mx_records = []

    try:
        _, _, ip_list = socket.gethostbyname_ex(domain)
        ip_records = sorted(set(ip_list))
    except Exception:
        ip_records = []

    try:
        addr_info = socket.getaddrinfo(domain, None)
        a_records = sorted({entry[4][0] for entry in addr_info if entry and entry[4]})
    except Exception:
        a_records = ip_records

    try:
        proc = subprocess.run(
            ["nslookup", "-type=mx", domain],
            capture_output=True,
            text=True,
            timeout=8
        )
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        for line in output.splitlines():
            low = line.lower()
            if "mail exchanger" in low:
                parts = line.split("=")
                if len(parts) > 1:
                    mx_records.append(parts[-1].strip().rstrip("."))
        mx_records = sorted(set([mx for mx in mx_records if mx]))
    except Exception:
        mx_records = []

    return {
        "domain": domain,
        "a_records": a_records,
        "ip_records": ip_records,
        "mx_records": mx_records
    }


def run_username_footprint(username):
    username = username.strip().lower()
    found_platforms = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
    }
    negative_markers = (
        "not found", "page doesn't exist", "page not found", "sorry, this page isn't available",
        "couldn't find", "404", "does not exist", "not available", "profile not found",
        "blocked", "whoa there, pardner"
    )

    with httpx.Client(headers=headers, follow_redirects=True, timeout=6) as client:
        for platform in USERNAME_PLATFORMS:
            url = platform["url"].format(username=quote(username))
            try:
                response = client.get(url)
                body = response.text.lower()
                final_url = str(response.url).lower()
                is_found = (
                    response.status_code == 200
                    and not any(marker in body for marker in negative_markers)
                    and "404" not in final_url
                    and quote(username).lower() in final_url
                )
                if is_found:
                    found_platforms.append({"name": platform["name"], "url": url})
            except Exception:
                continue

    return {"username": username, "platforms": found_platforms}


def run_disposable_check(email):
    domain = email.split("@")[-1].strip().lower()
    known_disposable_domains = {
        "10minutemail.com", "temp-mail.org", "guerrillamail.com", "mailinator.com",
        "yopmail.com", "sharklasers.com", "tempmail.com", "throwawaymail.com",
        "getnada.com", "moakt.com"
    }
    is_disposable = domain in known_disposable_domains
    risk_level = "High" if is_disposable else "Low"
    return {
        "domain": domain,
        "is_disposable": is_disposable,
        "risk_level": risk_level
    }


def _resolve_txt_records(target):
    records = []
    try:
        proc = subprocess.run(
            ["nslookup", "-type=txt", target],
            capture_output=True,
            text=True,
            timeout=8
        )
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        for line in output.splitlines():
            stripped = line.strip()
            if "text =" in stripped.lower():
                parts = stripped.split("=", 1)
                if len(parts) > 1:
                    records.append(parts[1].strip().strip('"'))
        return records
    except Exception:
        return []


def run_mx_security_check(email):
    domain = email.split("@")[-1].strip().lower()
    spf_records = [record for record in _resolve_txt_records(domain) if "v=spf1" in record.lower()]
    dmarc_records = [record for record in _resolve_txt_records(f"_dmarc.{domain}") if "v=dmarc1" in record.lower()]
    return {
        "domain": domain,
        "spf_present": len(spf_records) > 0,
        "dmarc_present": len(dmarc_records) > 0,
        "spf_records": spf_records,
        "dmarc_records": dmarc_records
    }


def run_phone_intelligence(phone):
    phone = phone.strip()
    try:
        parsed = phonenumbers.parse(phone, None if phone.startswith("+") else "IN")
    except Exception:
        return {"input": phone, "valid": False, "error": "Unable to parse phone number."}

    is_valid = phonenumbers.is_valid_number(parsed)
    is_possible = phonenumbers.is_possible_number(parsed)
    e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    international = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
    national = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
    region = geocoder.description_for_number(parsed, "en")
    carrier_name = carrier.name_for_number(parsed, "en")
    timezones = list(pn_timezone.time_zones_for_number(parsed))

    num_type = number_type(parsed)
    type_map = {
        PhoneNumberType.MOBILE: "Mobile",
        PhoneNumberType.FIXED_LINE: "Fixed Line",
        PhoneNumberType.FIXED_LINE_OR_MOBILE: "Fixed Line or Mobile",
        PhoneNumberType.TOLL_FREE: "Toll Free",
        PhoneNumberType.VOIP: "VoIP",
        PhoneNumberType.PREMIUM_RATE: "Premium Rate",
        PhoneNumberType.UNKNOWN: "Unknown",
    }

    search_links = [
        {"name": "Google Search", "url": f"https://www.google.com/search?q=%22{quote(e164)}%22"},
        {"name": "Bing Search", "url": f"https://www.bing.com/search?q=%22{quote(e164)}%22"},
        {"name": "Truecaller Search", "url": f"https://www.truecaller.com/search/in/{quote(e164.replace('+', ''))}"},
        {"name": "Sync.me Search", "url": f"https://sync.me/search/?number={quote(e164)}"},
    ]

    return {
        "input": phone,
        "valid": is_valid,
        "possible": is_possible,
        "e164": e164,
        "international": international,
        "national": national,
        "region": region or "Unknown",
        "carrier": carrier_name or "Unknown",
        "number_type": type_map.get(num_type, "Other"),
        "timezones": timezones,
        "search_links": search_links,
    }


def run_sherlock_scan(username):
    username = username.strip().lower()
    if not username:
        return {"enabled": False, "error": "Username not provided.", "found_profiles": []}

    result = {
        "enabled": True,
        "installed": False,
        "command": "",
        "found_profiles": [],
        "error": None
    }

    # Try known module entry points across package versions.
    module_candidates = ["sherlock", "sherlock_project.sherlock"]
    for module_name in module_candidates:
        cmd = [sys.executable, "-m", module_name, username, "--print-found", "--no-color"]
        result["command"] = " ".join(cmd)
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            output = (proc.stdout or "") + "\n" + (proc.stderr or "")
            if f"No module named {module_name.split('.')[0]}" in output:
                continue

            result["installed"] = True
            urls = set(re.findall(r"https?://[^\s)>\]]+", output))
            result["found_profiles"] = sorted(urls)
            if not result["found_profiles"] and proc.returncode != 0:
                result["error"] = "Sherlock ran but no confirmed profiles were returned."
            return result
        except Exception:
            continue

    result["installed"] = False
    result["error"] = "Sherlock is not installed. Run: python -m pip install sherlock-project"
    return result


def run_maigret_scan(username):
    username = username.strip().lower()
    if not username:
        return {"enabled": False, "error": "Username not provided.", "found_profiles": []}

    result = {
        "enabled": True,
        "installed": False,
        "command": "",
        "found_profiles": [],
        "error": None
    }

    # Set environment to handle UTF-8 encoding on Windows
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    
    cmd = [sys.executable, "-m", "maigret", username, "--no-color", "--no-progressbar"]
    result["command"] = " ".join(cmd)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        # Check specifically for "No module named" error
        if "No module named" in output and "maigret" in output:
            result["installed"] = False
            result["error"] = "Maigret is not installed. Run: python -m pip install maigret"
            return result

        result["installed"] = True
        urls = set(re.findall(r"https?://[^\s)>\]]+", output))
        result["found_profiles"] = sorted(urls)
        if not result["found_profiles"] and proc.returncode != 0:
            result["error"] = "Maigret ran but no confirmed profiles were returned."
        return result
    except Exception as exc:
        result["error"] = f"Maigret execution failed: {exc}"
        return result


def merge_username_deep_results(username, sherlock_result, maigret_result):
    sherlock_profiles = sherlock_result.get("found_profiles", []) if isinstance(sherlock_result, dict) else []
    maigret_profiles = maigret_result.get("found_profiles", []) if isinstance(maigret_result, dict) else []
    merged = sorted(set(sherlock_profiles + maigret_profiles))
    return {
        "username": username,
        "total_profiles": len(merged),
        "profiles": merged,
        "sherlock_installed": bool(isinstance(sherlock_result, dict) and sherlock_result.get("installed")),
        "maigret_installed": bool(isinstance(maigret_result, dict) and maigret_result.get("installed")),
        "sherlock_count": len(sherlock_profiles),
        "maigret_count": len(maigret_profiles),
    }


def run_domain_whois_recon(email):
    domain = email.split("@")[-1].strip().lower()
    whois_text = ""
    ns_records = []
    txt_records = _resolve_txt_records(domain)

    if shutil.which("whois"):
        try:
            proc = subprocess.run(["whois", domain], capture_output=True, text=True, timeout=15)
            whois_text = (proc.stdout or "").strip()
        except Exception:
            whois_text = ""

    # Fallback via nslookup for NS records.
    try:
        proc = subprocess.run(["nslookup", "-type=ns", domain], capture_output=True, text=True, timeout=10)
        output = (proc.stdout or "") + "\n" + (proc.stderr or "")
        for line in output.splitlines():
            if "nameserver" in line.lower() or "nameserver =" in line.lower():
                parts = line.split("=")
                if len(parts) > 1:
                    ns_records.append(parts[-1].strip().rstrip("."))
        ns_records = sorted(set([r for r in ns_records if r]))
    except Exception:
        ns_records = []

    summary = {
        "domain": domain,
        "whois_available": bool(whois_text),
        "whois_preview": whois_text[:1200] if whois_text else "WHOIS command not available on host.",
        "ns_records": ns_records,
        "txt_records": txt_records[:20],
    }
    return summary


def run_email_pivots(email):
    normalized = email.strip().lower()
    quoted = quote(normalized)
    pivots = [
        {"name": "HaveIBeenPwned (manual check)", "url": f"https://haveibeenpwned.com/unifiedsearch/{quoted}"},
        {"name": "DeHashed Search", "url": f"https://www.dehashed.com/search?query={quoted}"},
        {"name": "IntelX Search", "url": f"https://intelx.io/?s={quoted}"},
        {"name": "Google Dork", "url": f"https://www.google.com/search?q=%22{quoted}%22"},
        {"name": "Bing Dork", "url": f"https://www.bing.com/search?q=%22{quoted}%22"},
    ]
    return {"email": normalized, "pivots": pivots}

@app.route('/api/stream/holehe')
def stream_holehe():
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    email = request.args.get('email', '').strip()
    if not email or not hc.is_email(email):
        return jsonify({"error": "Valid email required"}), 400

    def generate():
        try:
            yield f"data: {json.dumps({'type': 'progress', 'message': 'Scanning 123 modules…'})}\n\n"
            results = run_holehe(email)
            results = [r for r in results if r['exists']]
            for r in results:
                yield f"data: {json.dumps({'type': 'result', 'data': r})}\n\n"
            yield f"data: {json.dumps({'type': 'complete', 'found_count': len(results)})}\n\n"
        except GeneratorExit:
            pass
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/stream/username-footprint')
def stream_username_footprint():
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    username = request.args.get('username', '').strip().lower()
    if not username:
        return jsonify({"error": "Username required"}), 400

    def generate():
        found_count = 0
        headers_ua = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
        }
        negative_markers = (
            "not found", "page doesn't exist", "page not found",
            "sorry, this page isn't available", "couldn't find", "404",
            "does not exist", "not available", "profile not found",
            "blocked", "whoa there, pardner"
        )
        try:
            yield f"data: {json.dumps({'type': 'progress', 'checked': 0, 'total': len(USERNAME_PLATFORMS)})}\n\n"
            with httpx.Client(headers=headers_ua, follow_redirects=True, timeout=6) as client:
                for i, platform in enumerate(USERNAME_PLATFORMS):
                    url = platform["url"].format(username=quote(username))
                    try:
                        resp = client.get(url)
                        body = resp.text.lower()
                        final_url = str(resp.url).lower()
                        is_found = (
                            resp.status_code == 200
                            and not any(m in body for m in negative_markers)
                            and "404" not in final_url
                            and quote(username).lower() in final_url
                        )
                        if is_found:
                            found_count += 1
                            yield f"data: {json.dumps({'type': 'result', 'name': platform['name'], 'url': url, 'found_count': found_count})}\n\n"
                    except Exception:
                        pass
                    if (i + 1) % 3 == 0:
                        yield f"data: {json.dumps({'type': 'progress', 'checked': i + 1, 'total': len(USERNAME_PLATFORMS)})}\n\n"
            yield f"data: {json.dumps({'type': 'complete', 'found_count': found_count})}\n\n"
        except GeneratorExit:
            pass
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/results/phone')
def api_phone_result():
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    phone = request.args.get('phone', '').strip()
    if not phone:
        return jsonify({"error": "Phone required"}), 400
    return jsonify(run_phone_intelligence(phone))


@app.route('/api/results/disposable')
def api_disposable_result():
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    email_q = request.args.get('email', '').strip()
    if not email_q:
        return jsonify({"error": "Email required"}), 400
    return jsonify(run_disposable_check(email_q))


@app.route('/api/results/email-pivots')
def api_email_pivots_result():
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    email_q = request.args.get('email', '').strip()
    if not email_q:
        return jsonify({"error": "Email required"}), 400
    return jsonify(run_email_pivots(email_q))


@app.route('/api/osint/tools')
def api_tools_list():
    """Return the list of available OSINT tools."""
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({
        "tools": AVAILABLE_TOOLS,
        "categories": [
            {"id": "email", "label": "Email Intelligence", "tools": ["holehe", "user_scanner", "disposable", "emailpivots"]},
            {"id": "username", "label": "Username Intelligence", "tools": ["sherlock", "maigret", "userdeep"]},
            {"id": "phone", "label": "Phone Intelligence", "tools": ["phone"]},
        ]
    })


@app.route('/api/infra-intel', methods=['POST'])
def api_infra_intel():
    """JSON API for infrastructure intelligence."""
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    query = data.get('query', '').strip()
    if not query:
        return jsonify({"error": "Query required"}), 400

    try:
        resolved_ip, display_target = _resolve_infra_target(query)
        host_raw = _query_shodan(resolved_ip)
        result = _parse_shodan(host_raw, display_target, resolved_ip)
        _write_audit_log(
            "infra_intel_scan", "success",
            {"query": query, "resolved_ip": resolved_ip}
        )
        return jsonify({"host": result["host"], "services": result.get("services", []), "ssl": result.get("ssl"), "geo": result.get("geo")})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Scan failed: {exc}"}), 500


# ─── Infrastructure Intel — Shodan-powered module ────────────────────────────

def _resolve_infra_target(raw_input):
    """Parse URL / domain / IP → (resolved_ip, display_target)."""
    target = raw_input.strip()
    if '://' in target:
        target = urlparse(target).hostname or target
    target = target.split('/')[0].split('?')[0].strip()
    if ':' in target and not target.startswith('['):
        target = target.split(':')[0]
    target = re.sub(r'^www\.', '', target)
    parts = target.split('.')
    if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
        return target, target
    try:
        ip = socket.gethostbyname(target)
        return ip, target
    except socket.gaierror:
        raise ValueError(f"Could not resolve '{target}' to an IP address.")


def _query_shodan(ip_str):
    """Call Shodan REST API — key stays server-side only."""
    api_key = os.getenv('SHODAN_API_KEY', '')
    if not api_key:
        raise ValueError("SHODAN_API_KEY not set in server environment.")
    resp = httpx.get(
        f"https://api.shodan.io/shodan/host/{ip_str}",
        params={"key": api_key},
        timeout=30
    )
    if resp.status_code == 401:
        raise ValueError("Shodan API key is invalid or expired.")
    if resp.status_code == 404:
        raise ValueError(f"No Shodan data found for {ip_str}. The host may not be indexed yet.")
    if resp.status_code != 200:
        raise ValueError(f"Shodan returned HTTP {resp.status_code}.")
    return resp.json()


def _parse_shodan(host, query, resolved_ip):
    """Normalise raw Shodan JSON into structured intel sections."""
    host_info = {
        "ip":       host.get("ip_str", resolved_ip),
        "query":    query,
        "org":      host.get("org") or "—",
        "isp":      host.get("isp") or "—",
        "asn":      host.get("asn") or "—",
        "country":  host.get("country_name") or "—",
        "country_code": host.get("country_code", ""),
        "city":     host.get("city") or "—",
        "hostnames": host.get("hostnames", []),
        "domains":  host.get("domains", []),
        "tags":     host.get("tags", []),
        "last_update": host.get("last_update", ""),
    }

    geo = {
        "lat": host.get("latitude"),
        "lng": host.get("longitude"),
    }

    services = []
    technologies = {}
    ssl_info = None
    screenshots = []

    for item in host.get("data", []):
        port      = item.get("port")
        transport = item.get("transport", "tcp")
        module    = item.get("_shodan", {}).get("module", "")
        product   = item.get("product", "")
        version   = item.get("version", "")
        cpe       = item.get("cpe23", item.get("cpe", []))
        if isinstance(cpe, str):
            cpe = [cpe]

        services.append({
            "port":      port,
            "transport": transport,
            "service":   module,
            "product":   product,
            "version":   version,
            "cpe":       cpe,
            "banner":    (item.get("data", "") or "")[:300].strip(),
        })

        if product:
            key = product.lower()
            if key not in technologies:
                technologies[key] = {"name": product, "version": version or ""}

        # SSL — take first occurrence
        if "ssl" in item and ssl_info is None:
            ssl_raw  = item["ssl"]
            cert     = ssl_raw.get("cert", {})
            subject  = cert.get("subject", {})
            issuer   = cert.get("issuer", {})

            san_domains = []
            for ext in cert.get("extensions", []):
                if ext.get("name") == "subjectAltName":
                    raw = ext.get("data", "")
                    san_domains = [s.strip().replace("DNS:", "").replace("IP Address:", "")
                                   for s in raw.split(",") if s.strip()]

            tls_vers = [v for v in ssl_raw.get("versions", []) if not v.startswith("-")]

            ssl_info = {
                "subject_cn":  subject.get("CN", ""),
                "issuer_cn":   issuer.get("CN", ""),
                "issuer_org":  issuer.get("O", ""),
                "issued":      cert.get("issued", ""),
                "expires":     cert.get("expires", ""),
                "sha256":      cert.get("fingerprint", {}).get("sha256", ""),
                "san_domains": san_domains[:20],
                "tls_versions": tls_vers,
                "cipher":      ssl_raw.get("cipher", {}).get("name", ""),
            }

        if item.get("screenshot"):
            sc = item["screenshot"]
            if sc.get("data") and len(screenshots) < 3:
                screenshots.append({
                    "data": sc["data"],
                    "mime": sc.get("mime", "image/png"),
                    "port": port,
                })

    services.sort(key=lambda x: x.get("port") or 0)

    vulns = []
    for cve_id, vdata in host.get("vulns", {}).items():
        try:
            cvss = float(vdata.get("cvss", 0) or 0)
        except (TypeError, ValueError):
            cvss = 0.0
        if cvss >= 9.0:
            severity, badge = "Critical", "danger"
        elif cvss >= 7.0:
            severity, badge = "High", "warning"
        elif cvss >= 4.0:
            severity, badge = "Medium", "info"
        else:
            severity, badge = "Low", "secondary"

        vulns.append({
            "cve":      cve_id,
            "cvss":     cvss,
            "severity": severity,
            "badge":    badge,
            "summary":  (vdata.get("summary") or "")[:300],
        })
    vulns.sort(key=lambda x: x["cvss"], reverse=True)

    return {
        "host_info":    host_info,
        "geo":          geo,
        "services":     services,
        "technologies": sorted(technologies.values(), key=lambda t: t["name"].lower()),
        "ssl_info":     ssl_info,
        "vulns":        vulns,
        "screenshots":  screenshots,
        "total_ports":  len(set(s["port"] for s in services if s["port"])),
    }


@app.route('/infra-intel', methods=['GET', 'POST'])
def infra_intel():
    if not _is_authorized():
        return redirect(url_for('login'))

    result = None
    error  = None
    query  = ""

    if request.method == 'POST':
        query = request.form.get('query', '').strip()
        if not query:
            error = "Please enter a domain, IP address, or URL."
        else:
            try:
                resolved_ip, display_target = _resolve_infra_target(query)
                host_raw = _query_shodan(resolved_ip)
                result   = _parse_shodan(host_raw, display_target, resolved_ip)
                session['last_infra_scan'] = {'result': result, 'query': query}
                _write_audit_log(
                    "infra_intel_scan", "success",
                    {"query": query, "resolved_ip": resolved_ip}
                )
            except ValueError as exc:
                error = str(exc)
            except Exception as exc:
                error = f"Scan failed: {exc}"

    return render_template(
        'infrastructure_intel.html',
        query=query,
        result=result,
        error=error,
        police_email=session.get('police_email', ''),
        police_role=session.get('police_role', ''),
    )


@app.route('/ai-investigation-assistant')
def ai_investigation_assistant():
    if not _is_authorized():
        return redirect(url_for('login'))
    return render_template('ai_assistant.html',
                         police_email=session.get('police_email'),
                         police_role=session.get('police_role'))


# ─── Ask AI — OpenAI-powered investigation copilot ───────────────────────────

_AI_SYSTEM_PROMPT = (
    "You are an expert OSINT, DFIR, and cybersecurity investigator AI assistant serving law "
    "enforcement at Hyderabad Commissionerate Police (Telangana State Police), India. Guide "
    "investigators in conducting structured, professional open-source intelligence investigations.\n\n"
    "Given an investigation scenario or target, respond with ONLY a valid JSON object — no markdown "
    "fences, no extra text, no comments:\n\n"
    "{\n"
    '  "summary": "2–3 sentence overview of the approach and what intelligence can be gathered",\n'
    '  "tools": [\n'
    "    {\n"
    '      "name": "Tool Name",\n'
    '      "free_paid": "Free" or "Paid" or "Free/Paid",\n'
    '      "input": "What the investigator must provide (e.g. email, username, IP, hash)",\n'
    '      "output": "What intelligence this tool produces",\n'
    '      "url": "https://direct-link-to-tool",\n'
    '      "category": "One of: Username Intelligence, Email Intelligence, Infrastructure Intelligence, '
    'Threat Intelligence, Metadata Analysis, DFIR, Malware Analysis, Reconnaissance"\n'
    "    }\n"
    "  ],\n"
    '  "investigation_flow": ["Step 1: ...", "Step 2: ..."],\n'
    '  "notes": "Legal/ethical caveats or pro tips — empty string if none"\n'
    "}\n\n"
    "Rules:\n"
    "- Output ONLY the raw JSON, nothing else\n"
    "- Include 4–8 relevant tools — quality over quantity\n"
    "- investigation_flow: 4–8 numbered steps\n"
    "- Prefer free tools; include paid only when meaningfully superior\n"
    "- Every URL must be a real, working, direct link to the tool\n"
    "- Tailor all recommendations to a law enforcement context\n"
    "- Focus on open-source, web-accessible tools that require no installation"
)


@app.route('/ask-ai')
def ask_ai():
    if not _is_authorized():
        return redirect(url_for('login'))
    return render_template('ask_ai.html',
                           police_email=session.get('police_email', ''),
                           police_role=session.get('police_role', ''))


@app.route('/api/ask-ai', methods=['POST'])
def api_ask_ai():
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    query = data.get('query', '').strip()
    if not query:
        return jsonify({"error": "Query is required."}), 400
    if len(query) > 3000:
        return jsonify({"error": "Query too long (max 3000 characters)."}), 400

    api_key = os.getenv('OPENAI_API_KEY', '')
    if not api_key:
        return jsonify({"error": "AI service not configured. Contact your system administrator."}), 503

    try:
        resp = httpx.post(
            'https://api.openai.com/v1/chat/completions',
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": _AI_SYSTEM_PROMPT},
                    {"role": "user", "content": query}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
                "max_tokens": 2000
            },
            timeout=30
        )
    except Exception as exc:
        return jsonify({"error": f"AI service unreachable: {str(exc)}"}), 502

    if resp.status_code == 401:
        return jsonify({"error": "AI service authentication failed. Check the API key."}), 502
    if resp.status_code == 429:
        return jsonify({"error": "AI rate limit reached. Please try again in a moment."}), 429
    if resp.status_code != 200:
        return jsonify({"error": f"AI service returned HTTP {resp.status_code}."}), 502

    try:
        content = resp.json()['choices'][0]['message']['content']
        result = json.loads(content)
    except (KeyError, json.JSONDecodeError) as exc:
        return jsonify({"error": f"AI returned an unparseable response: {str(exc)}"}), 502

    session['last_ask_ai'] = {'query': query, 'result': result}
    _write_audit_log("ask_ai", "success", {"query_preview": query[:200]})
    return jsonify(result)


@app.route('/master-prompt')
def master_prompt():
    if not _is_authorized():
        return redirect(url_for('login'))
    return render_template(
        'master_prompt.html',
        police_email=session.get('police_email', ''),
        police_role=session.get('police_role', ''),
    )


@app.route('/api/export/dashboard-pdf', methods=['POST'])
def export_dashboard_pdf():
    """
    Accept collected SSE results as a JSON body from the browser and
    generate a professional PDF report using the shared PDF service.
    Called by the Download PDF Report button on the Main Dashboard.
    """
    if not _is_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}

    # Map browser-collected payload to the shape generate_dashboard_pdf() expects
    payload = {
        "email":    data.get("email", ""),
        "username": data.get("username", ""),
        "phone":    data.get("phone", ""),
        "selected_tools": data.get("selected_tools", []),
        # Holehe: list of {domain, exists, emailrecovery, phoneNumber}
        "results": data.get("holehe", []),
        # Other tool results
        "disposable_result":   data.get("disposable_result"),
        "email_pivots_result": data.get("email_pivots_result"),
        "phone_result":        data.get("phone_result"),
        "sherlock_result": {
            "installed": True,
            "found_profiles": data.get("sherlock_profiles", []),
        } if data.get("sherlock_profiles") else None,
        "maigret_result": {
            "installed": True,
            "found_profiles": data.get("maigret_profiles", []),
        } if data.get("maigret_profiles") else None,
        "userdeep_result": {
            "profiles": data.get("userdeep_profiles", []),
        } if data.get("userdeep_profiles") else None,
        "username_result": data.get("username_footprint_result"),
        # User-Scanner found results (email and username modes)
        "user_scanner_email":    data.get("user_scanner_email", []),
        "user_scanner_username": data.get("user_scanner_username", []),
    }

    try:
        from services.pdf_report_service import generate_dashboard_pdf
        pdf_bytes = generate_dashboard_pdf(
            payload,
            officer_email=session.get('police_email', ''),
            officer_role=session.get('police_role', ''),
        )
        _write_audit_log("download_dashboard_pdf", "success", {
            "email": data.get("email", ""),
            "username": data.get("username", ""),
        })
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={"Content-Disposition": "attachment; filename=osint_dashboard_report.pdf"}
        )
    except Exception as exc:
        import traceback
        print(f"Dashboard PDF export error: {exc}\n{traceback.format_exc()}")
        _write_audit_log("download_dashboard_pdf", "error", {"error": str(exc)})
        return jsonify({"error": f"PDF generation failed: {exc}"}), 500


if __name__ == '__main__':
    # threaded=True is required so SSE streams (Sherlock, Maigret, user-scanner)
    # do not block concurrent requests from other users.
    app.run(host='0.0.0.0', port=8000, debug=False, threaded=True)
