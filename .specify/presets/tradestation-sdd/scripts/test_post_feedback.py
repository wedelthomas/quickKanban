# scripts/test_post_feedback.py
import importlib.util
import json
import os
import pathlib
import urllib.error

import pytest

_PATH = pathlib.Path(__file__).with_name("post-feedback.py")


def _load():
    spec = importlib.util.spec_from_file_location("post_feedback", _PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pf = _load()


@pytest.fixture(autouse=True)
def isolate(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    for k in ("SDD_TELEMETRY_URL", "SDD_TELEMETRY_DISABLE", "SDD_TELEMETRY_NO_BROWSER"):
        monkeypatch.delenv(k, raising=False)
    yield


def test_portal_base_default_and_override(monkeypatch):
    assert pf.portal_base() == "https://portal.ai.tradestation.io"
    monkeypatch.setenv("SDD_TELEMETRY_URL", "http://localhost:3000/")
    assert pf.portal_base() == "http://localhost:3000"  # trailing slash stripped


def test_telemetry_disabled(monkeypatch):
    assert pf.telemetry_disabled() is False
    monkeypatch.setenv("SDD_TELEMETRY_DISABLE", "1")
    assert pf.telemetry_disabled() is True


def test_config_dir_is_created_700(tmp_path):
    d = pf.config_dir()
    assert d.is_dir()
    assert oct(d.stat().st_mode & 0o777) == "0o700"
    assert pf.token_path() == d / "token.json"
    assert pf.spool_dir() == d / "spool"
    assert pf.spool_dir().is_dir()


def test_spool_dir_is_created_700():
    assert oct(pf.spool_dir().stat().st_mode & 0o777) == "0o700"


def test_save_then_load_token_roundtrip():
    pf.save_token("sddt_abc", "https://portal.example")
    assert pf.load_token("https://portal.example") == "sddt_abc"
    assert oct(pf.token_path().stat().st_mode & 0o777) == "0o600"


def test_load_token_none_when_missing():
    assert pf.load_token("https://portal.example") is None


def test_load_token_invalidated_on_portal_mismatch():
    pf.save_token("sddt_abc", "https://portal.one")
    assert pf.load_token("https://portal.two") is None


def test_clear_token():
    pf.save_token("sddt_abc", "https://portal.example")
    pf.clear_token()
    assert pf.load_token("https://portal.example") is None
    pf.clear_token()  # idempotent, no raise


def test_save_token_is_private_under_loose_umask():
    import os as _os
    old = _os.umask(0o000)
    try:
        pf.save_token("sddt_secret", "https://portal.example")
        assert oct(pf.token_path().stat().st_mode & 0o777) == "0o600"
    finally:
        _os.umask(old)


def test_enqueue_and_oldest_first_ordering():
    p1 = pf.enqueue("https://portal.example", {"phase": "specify", "n": 1})
    p2 = pf.enqueue("https://portal.example", {"phase": "plan", "n": 2})
    files = pf.spool_files()
    assert files == sorted([p1, p2])  # oldest first
    item = json.loads(p1.read_text())
    assert item["url"] == "https://portal.example"
    assert item["payload"]["n"] == 1


def test_spool_cap_drops_oldest(monkeypatch):
    monkeypatch.setattr(pf, "SPOOL_CAP", 3)
    paths = [pf.enqueue("u", {"phase": "specify", "n": i}) for i in range(5)]
    remaining = pf.spool_files()
    assert len(remaining) == 3
    assert paths[0] not in remaining and paths[1] not in remaining
    assert paths[4] in remaining


def test_post_ingest_sends_bearer_and_returns_status(monkeypatch):
    seen = {}

    def fake(method, url, headers, body):
        seen["method"] = method
        seen["url"] = url
        seen["headers"] = headers
        seen["body"] = json.loads(body)
        return 201, b'{"id":"row-1"}'

    monkeypatch.setattr(pf, "_http_request", fake)
    status = pf.post_ingest("https://portal.example", "sddt_x", {"phase": "specify"})
    assert status == 201
    assert seen["method"] == "POST"
    assert seen["url"] == "https://portal.example/api/telemetry/ingest"
    assert seen["headers"]["Authorization"] == "Bearer sddt_x"
    assert seen["body"] == {"phase": "specify"}  # payload unchanged


def test_exchange_code_returns_token(monkeypatch):
    monkeypatch.setattr(pf, "_http_request",
                        lambda *a, **k: (200, b'{"token":"sddt_new"}'))
    assert pf.exchange_code("https://portal.example", "code-1") == "sddt_new"


def test_exchange_code_none_on_error(monkeypatch):
    monkeypatch.setattr(pf, "_http_request",
                        lambda *a, **k: (400, b'{"error":"invalid_grant"}'))
    assert pf.exchange_code("https://portal.example", "bad") is None


def test_flush_spool_deletes_on_201_in_order(monkeypatch):
    pf.enqueue("https://portal.example", {"phase": "specify", "n": 1})
    pf.enqueue("https://portal.example", {"phase": "plan", "n": 2})
    posted = []

    def fake(method, url, headers, body):
        posted.append(json.loads(body)["n"])
        return 201, b'{"id":"x"}'

    monkeypatch.setattr(pf, "_http_request", fake)
    pf.flush_spool("sddt_x")
    assert posted == [1, 2]            # oldest-first
    assert pf.spool_files() == []      # all drained


def test_flush_spool_stops_and_clears_token_on_401(monkeypatch):
    pf.save_token("sddt_x", "https://portal.example")
    pf.enqueue("https://portal.example", {"phase": "specify", "n": 1})
    pf.enqueue("https://portal.example", {"phase": "plan", "n": 2})
    monkeypatch.setattr(pf, "_http_request", lambda *a, **k: (401, b'{}'))
    pf.flush_spool("sddt_x")
    assert len(pf.spool_files()) == 2  # nothing drained
    assert pf.load_token("https://portal.example") is None  # token cleared


def test_flush_spool_stops_on_network_error(monkeypatch):
    pf.enqueue("https://portal.example", {"phase": "specify", "n": 1})

    def boom(*a, **k):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(pf, "_http_request", boom)
    pf.flush_spool("sddt_x")
    assert len(pf.spool_files()) == 1  # retained for next run


def test_flush_spool_drops_poison_pill_on_400(monkeypatch):
    pf.enqueue("https://portal.example", {"phase": "specify", "n": 1})
    monkeypatch.setattr(pf, "_http_request", lambda *a, **k: (400, b'{}'))
    pf.flush_spool("sddt_x")
    assert pf.spool_files() == []  # unrecoverable client error dropped


def test_flush_spool_noop_without_token():
    pf.enqueue("https://portal.example", {"phase": "specify", "n": 1})
    pf.flush_spool(None)
    assert len(pf.spool_files()) == 1


def _write_payload(tmp_path, payload):
    p = tmp_path / "specify.json"
    p.write_text(json.dumps(payload))
    return str(p)


def test_cmd_post_disabled_does_nothing(tmp_path, monkeypatch):
    monkeypatch.setenv("SDD_TELEMETRY_DISABLE", "1")
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    called = {"n": 0}
    monkeypatch.setattr(pf, "_http_request",
                        lambda *a, **k: called.__setitem__("n", called["n"] + 1) or (201, b"{}"))
    assert pf.cmd_post(path, None) == 0
    assert called["n"] == 0
    assert not pf.token_path().exists()
    assert pf.spool_files() == []


def test_cmd_post_201_when_token_present(tmp_path, monkeypatch):
    pf.save_token("sddt_x", pf.portal_base())
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "_http_request", lambda *a, **k: (201, b'{"id":"r1"}'))
    assert pf.cmd_post(path, None) == 0
    assert pf.spool_files() == []


def test_cmd_post_spools_when_no_token(tmp_path, monkeypatch):
    monkeypatch.setenv("SDD_TELEMETRY_NO_BROWSER", "1")  # no auto-auth without a browser
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "_http_request", lambda *a, **k: (201, b"{}"))
    assert pf.cmd_post(path, None) == 0
    assert len(pf.spool_files()) == 1  # queued, not sent


def test_cmd_post_401_clears_token_and_spools(tmp_path, monkeypatch):
    pf.save_token("sddt_x", pf.portal_base())
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "_http_request", lambda *a, **k: (401, b"{}"))
    assert pf.cmd_post(path, None) == 0
    assert pf.load_token(pf.portal_base()) is None
    assert len(pf.spool_files()) == 1


def test_cmd_post_spools_on_network_error(tmp_path, monkeypatch):
    pf.save_token("sddt_x", pf.portal_base())
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})

    def boom(*a, **k):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(pf, "_http_request", boom)
    assert pf.cmd_post(path, None) == 0
    assert len(pf.spool_files()) == 1


def test_cmd_post_never_raises_on_enqueue_failure(tmp_path, monkeypatch):
    monkeypatch.setenv("SDD_TELEMETRY_NO_BROWSER", "1")  # skip auto-auth; exercise the spool path
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(pf, "enqueue", boom)
    assert pf.cmd_post(path, None) == 0


# --- first-run auto-authorization -------------------------------------------

def test_cmd_post_auto_authorizes_on_first_run_when_browser_available(tmp_path, monkeypatch):
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "browser_available", lambda: True)
    monkeypatch.setattr(pf, "run_loopback_auth", lambda base: "sddt_auto")
    sent = []
    monkeypatch.setattr(pf, "_http_request",
                        lambda m, u, h, b: (sent.append(u) or (201, b'{"id":"r1"}')))
    assert pf.cmd_post(path, None) == 0
    assert pf.load_token(pf.portal_base()) == "sddt_auto"  # token cached
    assert pf.spool_files() == []                          # current payload sent, not queued
    assert sent and sent[-1].endswith("/api/telemetry/ingest")
    assert pf.auth_already_attempted() is True             # marker set


def test_cmd_post_no_auto_auth_without_browser(tmp_path, monkeypatch):
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "browser_available", lambda: False)
    monkeypatch.setattr(pf, "run_loopback_auth",
                        lambda base: pytest.fail("must not auth without a browser"))
    assert pf.cmd_post(path, None) == 0
    assert len(pf.spool_files()) == 1               # spooled, as before
    assert pf.load_token(pf.portal_base()) is None
    assert pf.auth_already_attempted() is False     # no attempt → no marker


def test_cmd_post_auto_auth_only_prompts_once(tmp_path, monkeypatch):
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "browser_available", lambda: True)
    pf.mark_auth_attempted()  # simulate a prior attempt
    monkeypatch.setattr(pf, "run_loopback_auth",
                        lambda base: pytest.fail("must not re-prompt after first attempt"))
    assert pf.cmd_post(path, None) == 0
    assert len(pf.spool_files()) == 1               # falls back to spooling


def test_cmd_post_auto_auth_failure_falls_back_to_spool(tmp_path, monkeypatch):
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "browser_available", lambda: True)
    monkeypatch.setattr(pf, "run_loopback_auth", lambda base: None)  # declined / timed out
    assert pf.cmd_post(path, None) == 0
    assert len(pf.spool_files()) == 1               # payload preserved
    assert pf.load_token(pf.portal_base()) is None
    assert pf.auth_already_attempted() is True      # marked, so it won't re-prompt


def test_cmd_post_auto_auth_never_raises_and_still_spools(tmp_path, monkeypatch):
    path = _write_payload(tmp_path, {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "browser_available", lambda: True)

    def boom(base):
        raise RuntimeError("browser exploded")

    monkeypatch.setattr(pf, "run_loopback_auth", boom)
    assert pf.cmd_post(path, None) == 0
    assert len(pf.spool_files()) == 1               # still preserved
    assert pf.auth_already_attempted() is True      # marked even on error → no re-prompt


def test_auth_marker_roundtrip():
    assert pf.auth_already_attempted() is False
    pf.mark_auth_attempted()
    assert pf.auth_already_attempted() is True
    pf.mark_auth_attempted()  # idempotent, no raise


def test_browser_available_forced_off(monkeypatch):
    monkeypatch.setenv("SDD_TELEMETRY_NO_BROWSER", "1")
    assert pf.browser_available() is False


def test_manual_auth_exchanges_pasted_code(monkeypatch):
    monkeypatch.setattr("builtins.input", lambda *_: "  code-xyz  ")
    monkeypatch.setattr(pf, "exchange_code",
                        lambda base, code: "sddt_manual" if code == "code-xyz" else None)
    assert pf.manual_auth("https://portal.example") == "sddt_manual"


def test_manual_auth_aborts_on_empty(monkeypatch):
    monkeypatch.setattr("builtins.input", lambda *_: "")
    assert pf.manual_auth("https://portal.example") is None


def test_cmd_auth_caches_token_and_flushes(monkeypatch):
    pf.enqueue(pf.portal_base(), {"phase": "specify", "project": "x"})
    monkeypatch.setattr(pf, "browser_available", lambda: False)
    monkeypatch.setattr(pf, "manual_auth", lambda base: "sddt_new")
    sent = []
    monkeypatch.setattr(pf, "_http_request",
                        lambda m, u, h, b: (sent.append(u) or (201, b'{"id":"x"}')))
    assert pf.cmd_auth() == 0
    assert pf.load_token(pf.portal_base()) == "sddt_new"
    assert pf.spool_files() == []  # drained after auth


def test_cmd_auth_returns_1_on_failure(monkeypatch):
    monkeypatch.setattr(pf, "browser_available", lambda: False)
    monkeypatch.setattr(pf, "manual_auth", lambda base: None)
    assert pf.cmd_auth() == 1
    assert pf.load_token(pf.portal_base()) is None


def test_main_routes_auth(monkeypatch):
    monkeypatch.setattr(pf, "cmd_auth", lambda: 0)
    monkeypatch.setattr(pf, "cmd_post",
                        lambda *a: pytest.fail("should not post in auth mode"))
    assert pf.main(["post-feedback.py", "--auth"]) == 0


def test_main_routes_post_with_md(monkeypatch):
    seen = {}
    monkeypatch.setattr(pf, "cmd_post",
                        lambda p, m: seen.update(payload=p, md=m) or 0)
    rc = pf.main(["post-feedback.py", "feedback/specify.json",
                  "--md", "feedback/specify.md"])
    assert rc == 0
    assert seen == {"payload": "feedback/specify.json", "md": "feedback/specify.md"}


def test_main_usage_error_without_payload(monkeypatch):
    monkeypatch.setattr(pf, "cmd_post", lambda *a: pytest.fail("no payload given"))
    assert pf.main(["post-feedback.py"]) == 2
