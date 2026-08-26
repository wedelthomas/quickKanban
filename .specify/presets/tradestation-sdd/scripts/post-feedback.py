#!/usr/bin/env python3
"""Post SDD feedback telemetry to the AI Portal backend.

Modes:
  post-feedback.py <payload.json> [--md <path>]   # transmit (never blocks)
  post-feedback.py --auth                          # authorize (interactive)

Environment:
  SDD_TELEMETRY_URL       portal base URL (default: production portal)
  SDD_TELEMETRY_DISABLE   =1 to write nothing and send nothing
  SDD_TELEMETRY_NO_BROWSER=1 to force the manual (paste-back) auth path
"""
import json
import os
import secrets
import sys
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import parse_qs, urlencode, urlparse

DEFAULT_PORTAL = "https://portal.ai.tradestation.io"
SPOOL_CAP = 500
LOOPBACK_TIMEOUT_SEC = 120
HTTP_TIMEOUT_SEC = 15


def portal_base() -> str:
    return (os.environ.get("SDD_TELEMETRY_URL") or DEFAULT_PORTAL).rstrip("/")


def telemetry_disabled() -> bool:
    return os.environ.get("SDD_TELEMETRY_DISABLE") == "1"


def config_dir() -> Path:
    d = Path.home() / ".config" / "sdd"
    d.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(d, 0o700)
    return d


def token_path() -> Path:
    return config_dir() / "token.json"


def spool_dir() -> Path:
    d = config_dir() / "spool"
    d.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(d, 0o700)
    return d


def _write_private(path: Path, text: str) -> None:
    """Write text to path, creating it atomically with 0600 permissions."""
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.chmod(path, 0o600)  # ensure 0600 even if the file pre-existed with looser perms


def save_token(token: str, portal_url: str) -> None:
    data = {
        "token": token,
        "portal_url": portal_url,
        "obtained_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    _write_private(token_path(), json.dumps(data, indent=2) + "\n")


def load_token(portal_url: str) -> Optional[str]:
    p = token_path()
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text())
    except (ValueError, OSError):
        return None
    if data.get("portal_url") != portal_url:
        return None
    tok = data.get("token")
    return tok if isinstance(tok, str) and tok else None


def clear_token() -> None:
    try:
        token_path().unlink()
    except FileNotFoundError:
        pass


def auth_marker_path() -> Path:
    return config_dir() / "auth_attempted"


def auth_already_attempted() -> bool:
    return auth_marker_path().exists()


def mark_auth_attempted() -> None:
    """Record that the first-run auto-auth has been tried, so we never
    re-prompt. Best-effort: a write failure just means we may retry once more."""
    try:
        auth_marker_path().touch(mode=0o600, exist_ok=True)
    except OSError:
        pass


def _spool_name(phase: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    safe = "".join(c if (c.isalnum() or c in "._-") else "_" for c in phase)
    return f"{ts}__{safe}__{secrets.token_hex(2)}.json"


def spool_files() -> List[Path]:
    return sorted(spool_dir().glob("*.json"))


def _enforce_cap() -> None:
    files = spool_files()
    excess = len(files) - SPOOL_CAP
    for p in files[: max(0, excess)]:
        try:
            p.unlink()
        except FileNotFoundError:
            pass


def enqueue(url: str, payload: dict) -> Path:
    phase = str(payload.get("phase", "unknown"))
    p = spool_dir() / _spool_name(phase)
    _write_private(p, json.dumps({"url": url, "payload": payload}, indent=2) + "\n")
    _enforce_cap()
    return p


def _http_request(method: str, url: str, headers: dict,
                  body: Optional[bytes]) -> Tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:
            return resp.getcode(), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    # urllib.error.URLError / OSError propagate to the caller (transient).


def post_ingest(base: str, token: str, payload: dict) -> int:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    status, _ = _http_request("POST", base + "/api/telemetry/ingest", headers, body)
    return status


def exchange_code(base: str, code: str) -> Optional[str]:
    body = json.dumps({"code": code}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    status, resp = _http_request(
        "POST", base + "/api/telemetry/token/exchange", headers, body)
    if status != 200:
        return None
    try:
        tok = json.loads(resp).get("token")
    except ValueError:
        return None
    return tok if isinstance(tok, str) and tok else None


def _safe_unlink(p: Path) -> None:
    """Delete a spool file, ignoring any OS error (best-effort)."""
    try:
        p.unlink()
    except OSError:
        pass


def flush_spool(token: Optional[str]) -> None:
    if not token:
        return
    for p in spool_files():
        try:
            item = json.loads(p.read_text())
            payload = item["payload"]
            url = item.get("url") or portal_base()
            assert isinstance(payload, dict)
        except (ValueError, OSError, KeyError, AssertionError):
            _safe_unlink(p)  # corrupt entry — drop it
            continue
        try:
            status = post_ingest(url, token, payload)
        except (urllib.error.URLError, OSError):
            return  # transient — stop, retry next run
        if status == 201:
            _safe_unlink(p)
        elif status == 401:
            clear_token()
            return  # need re-auth; leave the rest queued
        elif 400 <= status < 500:
            _safe_unlink(p)  # unrecoverable client error — drop poison pill
        else:
            return  # 5xx / unexpected — stop, retry next run


def cmd_post(payload_path: str, md_path: Optional[str]) -> int:
    if telemetry_disabled():
        return 0
    try:
        payload = json.loads(Path(payload_path).read_text())
    except (ValueError, OSError) as e:
        print("sdd telemetry: cannot read payload %s: %s" % (payload_path, e),
              file=sys.stderr)
        return 0

    base = portal_base()
    # Telemetry must never fail or block the workflow. Any unexpected error
    # (e.g. OSError from a full disk while spooling) is swallowed here.
    try:
        flush_spool(load_token(base))
        token = load_token(base)  # flush may have cleared it on 401

        if not token:
            token = maybe_auto_authorize(base)
        if not token:
            enqueue(base, payload)
            print("sdd telemetry queued (not authorized). "
                  "Run: post-feedback.py --auth")
            return 0

        try:
            status = post_ingest(base, token, payload)
        except (urllib.error.URLError, OSError):
            enqueue(base, payload)
            return 0

        if status == 201:
            print("sdd telemetry sent.")
        elif status == 401:
            clear_token()
            enqueue(base, payload)
            print("sdd telemetry token expired — run post-feedback.py --auth "
                  "to re-authorize.")
        else:
            enqueue(base, payload)

        if md_path:
            print("local copy: %s" % md_path)
    except Exception as e:  # noqa: BLE001 - telemetry must never break the workflow
        print("sdd telemetry: skipped (%s)" % e, file=sys.stderr)
    return 0


def browser_available() -> bool:
    if os.environ.get("SDD_TELEMETRY_NO_BROWSER") == "1":
        return False
    if sys.platform == "darwin":
        return True  # `open` is always present on macOS
    if os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"):
        return True
    try:
        webbrowser.get()
        return True
    except webbrowser.Error:
        return False


class _CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (stdlib casing)
        parsed = urlparse(self.path)
        if parsed.path != "/cb":
            self.send_response(404)
            self.end_headers()
            return
        qs = parse_qs(parsed.query)
        self.server.captured = {  # type: ignore[attr-defined]
            "code": (qs.get("code") or [""])[0],
            "state": (qs.get("state") or [""])[0],
        }
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(
            b"<html><body style='font-family:sans-serif'>"
            b"<h2>&#10003; Authorized</h2>"
            b"<p>You can close this tab and return to your terminal.</p>"
            b"</body></html>"
        )

    def log_message(self, *args):  # silence the default stderr logging
        pass


def run_loopback_auth(base: str) -> Optional[str]:
    state = secrets.token_urlsafe(16)
    server = HTTPServer(("127.0.0.1", 0), _CallbackHandler)
    server.captured = None  # type: ignore[attr-defined]
    server.timeout = LOOPBACK_TIMEOUT_SEC
    port = server.server_address[1]
    redirect_uri = "http://127.0.0.1:%d/cb" % port
    authorize = base + "/api/telemetry/authorize?" + urlencode(
        {"redirect_uri": redirect_uri, "state": state})
    print("Opening your browser to authorize SDD telemetry...")
    print("  " + authorize)
    try:
        webbrowser.open(authorize)
    except Exception:  # noqa: BLE001 - browser launch is best-effort; URL is printed above
        pass
    server.handle_request()  # one request, or returns after the timeout
    captured = getattr(server, "captured", None)
    server.server_close()
    if not captured or not captured.get("code"):
        print("Authorization timed out or failed.", file=sys.stderr)
        return None
    if captured.get("state") != state:
        print("State mismatch — aborting for safety.", file=sys.stderr)
        return None
    return exchange_code(base, captured["code"])


def manual_auth(base: str) -> Optional[str]:
    # state is sent to the portal in the URL; in this headless flow the user
    # pastes only the code (the browser never reaches our loopback), so there is
    # no local callback to validate state against — that is expected, not a bug.
    state = secrets.token_urlsafe(16)
    authorize = base + "/api/telemetry/authorize?" + urlencode(
        {"redirect_uri": "http://127.0.0.1/cb", "state": state})
    print(
        "No browser detected. To authorize SDD telemetry:\n"
        "  1. Open this URL in any browser:\n     " + authorize + "\n"
        "  2. After signing in, the browser will try to load a 127.0.0.1 page\n"
        "     and fail to connect — that is expected.\n"
        "  3. Copy the 'code' value from the address bar.\n"
    )
    try:
        code = input("Paste the code: ").strip()
    except EOFError:
        code = ""
    if not code:
        print("No code entered — aborting.", file=sys.stderr)
        return None
    return exchange_code(base, code)


def maybe_auto_authorize(base: str) -> Optional[str]:
    """First-run convenience: authorize inline so the developer never has to
    run --auth by hand. Only the browser loopback path is used (it needs no
    stdin, so it works even when the feedback command runs non-interactively).

    Guards:
      - prompts at most once ever (an `auth_attempted` marker is set on the
        first try, win or lose), so a declined/ignored prompt never recurs;
      - skipped entirely when no browser is available (headless/CI, or
        SDD_TELEMETRY_NO_BROWSER=1) — those fall back to the manual --auth flow;
      - best-effort: any failure returns None and the caller spools as usual.
    """
    if auth_already_attempted() or not browser_available():
        return None
    try:
        mark_auth_attempted()
        print("sdd telemetry: first run — opening your browser to authorize "
              "(one time).")
        token = run_loopback_auth(base)
    except Exception:  # noqa: BLE001 - auth is best-effort; fall back to spooling
        return None
    if token:
        save_token(token, base)
        flush_spool(token)
        print("sdd telemetry authorized.")
    return token


def cmd_auth() -> int:
    if telemetry_disabled():
        print("SDD_TELEMETRY_DISABLE=1 — telemetry is off; nothing to authorize.")
        return 0
    base = portal_base()
    token = run_loopback_auth(base) if browser_available() else manual_auth(base)
    if not token:
        print("Authorization failed.", file=sys.stderr)
        return 1
    save_token(token, base)
    print("Authorized. Telemetry token cached.")
    flush_spool(token)
    return 0


def main(argv: List[str]) -> int:
    args = argv[1:]
    if "--auth" in args:
        return cmd_auth()
    payload_path = None  # type: Optional[str]
    md_path = None       # type: Optional[str]
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--md" and i + 1 < len(args):
            md_path = args[i + 1]
            i += 2
            continue
        if not a.startswith("-") and payload_path is None:
            payload_path = a
            i += 1
            continue
        i += 1
    if not payload_path:
        print("usage: post-feedback.py <payload.json> [--md <path>]\n"
              "       post-feedback.py --auth", file=sys.stderr)
        return 2
    return cmd_post(payload_path, md_path)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
