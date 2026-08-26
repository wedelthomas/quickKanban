# scripts/test_doctor.py
import json
import pathlib
import ssl
import sys
import time
import urllib.error

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import doctor  # noqa: E402


def _write_settings(project, data, name="settings.json"):
    d = project / ".claude"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(json.dumps(data))


def test_config_checks_pass_when_settings_correct(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "HOME", tmp_path / "home")
    (tmp_path / "home" / ".claude").mkdir(parents=True)
    (tmp_path / "home" / ".claude" / "settings.json").write_text(json.dumps({
        "model": "opus[1m]",
        "effortLevel": "high",
        "enabledPlugins": {"superpowers@claude-plugins-official": True},
    }))
    s = doctor._merged_settings(tmp_path / "project")
    assert doctor.check_model(s)["status"] == doctor.PASS
    assert doctor.check_effort(s)["status"] == doctor.PASS
    assert doctor.check_superpowers(s)["status"] == doctor.PASS


def test_config_checks_fail_with_fixes_when_unset(tmp_path):
    s = {}
    for fn in (doctor.check_model, doctor.check_effort, doctor.check_superpowers):
        r = fn(s)
        assert r["status"] == doctor.FAIL
        assert isinstance(r["fix"], str) and r["fix"]


def test_project_local_overrides_user(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "HOME", tmp_path / "home")
    (tmp_path / "home" / ".claude").mkdir(parents=True)
    (tmp_path / "home" / ".claude" / "settings.json").write_text(json.dumps({"effortLevel": "low"}))
    project = tmp_path / "project"
    _write_settings(project, {"effortLevel": "high"}, "settings.local.json")
    s = doctor._merged_settings(project)
    assert doctor.check_effort(s)["status"] == doctor.PASS


def test_preset_check_passes_with_dir_registry_and_symlinks(tmp_path):
    project = tmp_path / "project"
    preset = project / ".specify" / "presets" / "tradestation-sdd"
    (preset / "commands").mkdir(parents=True)
    (project / ".specify" / "presets" / ".registry").write_text(
        json.dumps({"presets": {"tradestation-sdd": {"priority": 1}}}))
    cmd_dir = project / ".claude" / "commands"
    cmd_dir.mkdir(parents=True)
    for i in range(10):
        target = preset / "commands" / f"speckit.cmd{i}.md"
        target.write_text("x")
        (cmd_dir / f"speckit.cmd{i}.md").symlink_to(target)
    r = doctor.check_preset(project)
    assert r["status"] == doctor.PASS


def test_preset_check_fails_when_not_installed(tmp_path):
    r = doctor.check_preset(tmp_path / "empty")
    assert r["status"] == doctor.FAIL
    assert r["fix"]


def test_speckit_check_fails_without_cli(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "_specify_available", lambda: False)
    r = doctor.check_speckit(tmp_path / "project")
    assert r["status"] == doctor.FAIL
    assert "specify CLI" in r["detail"]


def test_speckit_check_passes_with_cli_and_constitution(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "_specify_available", lambda: True)
    project = tmp_path / "project"
    (project / ".specify" / "memory").mkdir(parents=True)
    (project / ".specify" / "memory" / "constitution.md").write_text("# constitution")
    r = doctor.check_speckit(project)
    assert r["status"] == doctor.PASS


def test_speckit_check_fails_without_constitution(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "_specify_available", lambda: True)
    r = doctor.check_speckit(tmp_path / "project")
    assert r["status"] == doctor.FAIL
    assert "constitution.md" in r["detail"]
    assert "specify CLI" not in r["detail"]


def test_specify_available_uses_path_lookup_not_spawn(monkeypatch):
    """Availability must be decided by resolving `specify` on PATH (shutil.which),
    NOT by spawning `specify version` — that subcommand makes a GitHub API call,
    so a slow network under the old subprocess timeout false-reported it missing.
    Resolving a path here returns True without running anything."""
    monkeypatch.setattr(
        doctor.shutil, "which",
        lambda name: r"C:\tools\specify.exe" if name == "specify" else None)
    assert doctor._specify_available() is True


def test_specify_available_false_when_not_on_path(monkeypatch):
    monkeypatch.setattr(doctor.shutil, "which", lambda name: None)
    assert doctor._specify_available() is False


class _FakePF:
    """Stand-in for post-feedback.py's helpers — no network."""
    def __init__(self, token=None, disabled=False, response=(200, b'{}')):
        self._token = token
        self._disabled = disabled
        self._response = response
        self.last_url = None

    def telemetry_disabled(self):
        return self._disabled

    def portal_base(self):
        return "https://portal.example"

    def load_token(self, base):
        return self._token

    def _http_request(self, method, url, headers, body):
        self.last_url = url
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


def test_telemetry_warns_when_no_token():
    r = doctor.check_telemetry(_FakePF(token=None))
    assert r["status"] == doctor.WARN
    assert "post-feedback.sh --auth" in r["fix"]


def test_telemetry_pass_with_submissions():
    body = b'{"authorized":true,"userEmail":"a@b.com","submissionCount":3,"lastSubmissionAt":"2026-06-02T00:00:00Z"}'
    pf = _FakePF(token="t", response=(200, body))
    r = doctor.check_telemetry(pf)
    assert r["status"] == doctor.PASS
    assert "3 submissions" in r["detail"]
    assert pf.last_url.endswith("/api/telemetry/status")


def test_telemetry_pass_with_zero_submissions():
    body = b'{"authorized":true,"userEmail":"a@b.com","submissionCount":0,"lastSubmissionAt":null}'
    r = doctor.check_telemetry(_FakePF(token="t", response=(200, body)))
    assert r["status"] == doctor.PASS
    assert "no telemetry sent yet" in r["detail"]


def test_telemetry_warns_on_401():
    r = doctor.check_telemetry(_FakePF(token="t", response=(401, b'{"authorized":false}')))
    assert r["status"] == doctor.WARN


def test_telemetry_info_when_disabled():
    r = doctor.check_telemetry(_FakePF(disabled=True))
    assert r["status"] == doctor.INFO


def test_telemetry_warns_when_portal_unreachable():
    r = doctor.check_telemetry(_FakePF(token="t", response=urllib.error.URLError("down")))
    assert r["status"] == doctor.WARN
    assert "down" in r["detail"]


def test_telemetry_unreachable_detail_distinguishes_cert_errors():
    """A cert-verification failure must be distinguishable from a generic
    outage in the detail message -- collapsing every URLError/OSError into
    the same "portal unreachable" text (with no reason) is exactly what
    cost real debugging time in Slack (AIP-248): a local machine's missing
    CA bundle looked identical to an actual portal outage."""
    cert_err = ssl.SSLCertVerificationError("certificate verify failed")
    r = doctor.check_telemetry(_FakePF(token="t", response=cert_err))
    assert r["status"] == doctor.WARN
    assert "SSLCertVerificationError" in r["detail"]


def _good_checks():
    return [
        doctor._result("R1", "Model", doctor.PASS, "ok"),
        doctor._result("R2", "Effort", doctor.PASS, "ok"),
        doctor._result("R3", "Superpowers", doctor.PASS, "ok"),
        doctor._result("R5", "Spec-Kit", doctor.PASS, "ok"),
        doctor._result("R6", "Preset", doctor.PASS, "ok"),
        doctor._result("R7", "Telemetry", doctor.WARN, "not authenticated", "fix"),
    ]


def test_summarize_counts_hard_and_warnings():
    s = doctor.summarize(_good_checks())
    assert s == {"hard_passed": 5, "hard_total": 5, "warnings": 1}


def test_has_hard_fail_ignores_warnings():
    assert doctor._has_hard_fail(_good_checks()) is False
    bad = _good_checks()
    bad[0] = doctor._result("R1", "Model", doctor.FAIL, "no", "fix")
    assert doctor._has_hard_fail(bad) is True


def test_json_output_and_exit_zero_when_clean(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(doctor, "run_checks", lambda project, pf=None, tool=None: _good_checks())
    rc = doctor.main(["doctor.py", "--json", "--project", str(tmp_path)])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["tool"] == "claude-code"
    assert out["hard_passed"] == 5
    assert len(out["checks"]) == 6


def test_exit_nonzero_on_hard_fail(tmp_path, monkeypatch):
    bad = _good_checks()
    bad[0] = doctor._result("R1", "Model", doctor.FAIL, "no", "fix")
    monkeypatch.setattr(doctor, "run_checks", lambda project, pf=None, tool=None: bad)
    rc = doctor.main(["doctor.py", "--project", str(tmp_path)])
    assert rc == 1


def test_preflight_always_exits_zero_even_on_hard_fail(tmp_path, monkeypatch):
    bad = _good_checks()
    bad[0] = doctor._result("R1", "Model", doctor.FAIL, "no", "fix")
    monkeypatch.setattr(doctor, "run_checks", lambda project, pf=None, tool=None: bad)
    rc = doctor.main(["doctor.py", "--preflight", "--project", str(tmp_path)])
    assert rc == 0


def _meta(project):
    p = project / ".specify" / "presets" / "tradestation-sdd" / ".install-meta.json"
    return json.loads(p.read_text())


def _seed_meta(project):
    d = project / ".specify" / "presets" / "tradestation-sdd"
    d.mkdir(parents=True, exist_ok=True)
    (d / ".install-meta.json").write_text(json.dumps(
        {"source_clone": "/x", "installed_sha": "abc", "last_check": 0}))


def test_preflight_quiet_on_clean_pass_and_stamps_marker(tmp_path, monkeypatch, capsys):
    _seed_meta(tmp_path)
    clean = [c for c in _good_checks() if c["id"] != "R7"]
    clean.append(doctor._result("R7", "Telemetry", doctor.PASS, "ok"))
    monkeypatch.setattr(doctor, "run_checks", lambda project, pf=None, tool=None: clean)
    rc = doctor.main(["doctor.py", "--preflight", "--project", str(tmp_path)])
    assert rc == 0
    assert capsys.readouterr().out == ""
    assert _meta(tmp_path)["doctor_last_check"] > 0
    assert _meta(tmp_path)["installed_sha"] == "abc"


def test_preflight_prints_failures_but_exits_zero(tmp_path, monkeypatch, capsys):
    _seed_meta(tmp_path)
    bad = _good_checks()
    bad[0] = doctor._result("R1", "Model", doctor.FAIL, "no", "set opus[1m]")
    monkeypatch.setattr(doctor, "run_checks", lambda project, pf=None, tool=None: bad)
    rc = doctor.main(["doctor.py", "--preflight", "--project", str(tmp_path)])
    assert rc == 0
    out = capsys.readouterr().out
    assert "setup issues" in out
    assert "set opus[1m]" in out


# ── Copilot tool-awareness ───────────────────────────────────────────────────

def _write_copilot_settings(home, data):
    d = home / ".copilot"
    d.mkdir(parents=True, exist_ok=True)
    (d / "settings.json").write_text(json.dumps(data))


def test_copilot_settings_read_from_copilot_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "HOME", tmp_path / "home")
    _write_copilot_settings(tmp_path / "home", {"model": "claude-opus-4.6", "effortLevel": "high"})
    s = doctor._settings_for("copilot", tmp_path / "project")
    assert s["model"] == "claude-opus-4.6"
    assert s["effortLevel"] == "high"


def test_copilot_model_passes_for_opus_4_6_and_later(tmp_path):
    assert doctor.check_model({"model": "claude-opus-4.6"}, "copilot")["status"] == doctor.PASS
    assert doctor.check_model({"model": "claude-opus-4.8"}, "copilot")["status"] == doctor.PASS
    assert doctor.check_model({"model": "claude-opus-5.0"}, "copilot")["status"] == doctor.PASS


def test_copilot_model_fails_below_4_6(tmp_path):
    r = doctor.check_model({"model": "claude-opus-4.1"}, "copilot")
    assert r["status"] == doctor.FAIL
    assert ".copilot/settings.json" in r["fix"]
    assert "4.6" in r["fix"]


def test_copilot_model_fails_for_non_opus_with_copilot_fix(tmp_path):
    r = doctor.check_model({"model": "claude-sonnet-4.6"}, "copilot")
    assert r["status"] == doctor.FAIL
    assert ".copilot/settings.json" in r["fix"]


def test_claude_model_passes_for_opus_1m_alias(tmp_path):
    assert doctor.check_model({"model": "opus[1m]"}, "claude")["status"] == doctor.PASS


def test_claude_model_passes_for_explicit_opus_4_8_and_later(tmp_path):
    assert doctor.check_model({"model": "claude-opus-4-8"}, "claude")["status"] == doctor.PASS
    assert doctor.check_model({"model": "claude-opus-4-9"}, "claude")["status"] == doctor.PASS


def test_claude_model_fails_for_opus_below_4_8(tmp_path):
    r = doctor.check_model({"model": "claude-opus-4-6"}, "claude")
    assert r["status"] == doctor.FAIL
    assert "4.8" in r["fix"]


def test_copilot_effort_uses_same_key_but_copilot_fix(tmp_path):
    assert doctor.check_effort({"effortLevel": "high"}, "copilot")["status"] == doctor.PASS
    r = doctor.check_effort({}, "copilot")
    assert r["status"] == doctor.FAIL
    assert ".copilot/settings.json" in r["fix"]


def test_copilot_superpowers_passes_when_skill_present(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "HOME", tmp_path / "home")
    (tmp_path / "home" / ".copilot" / "skills" / "superpowers").mkdir(parents=True)
    r = doctor.check_superpowers({}, tmp_path / "project", "copilot")
    assert r["status"] == doctor.PASS


def test_copilot_superpowers_fails_when_absent_with_install_fix(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "HOME", tmp_path / "home")
    (tmp_path / "home" / ".copilot" / "skills").mkdir(parents=True)
    r = doctor.check_superpowers({}, tmp_path / "project", "copilot")
    assert r["status"] == doctor.FAIL
    assert "copilot plugin install" in r["fix"]


def test_copilot_preset_passes_with_agent_files(tmp_path):
    project = tmp_path / "project"
    preset = project / ".specify" / "presets" / "tradestation-sdd"
    preset.mkdir(parents=True)
    (project / ".specify" / "presets" / ".registry").write_text(
        json.dumps({"presets": {"tradestation-sdd": {"priority": 1}}}))
    agents = project / ".github" / "agents"
    agents.mkdir(parents=True)
    for i in range(11):
        (agents / f"speckit.cmd{i}.agent.md").write_text("x")
    r = doctor.check_preset(project, "copilot")
    assert r["status"] == doctor.PASS
    assert "agent" in r["detail"]


def test_preset_check_passes_with_copied_commands(tmp_path):
    """Windows install copies command files instead of symlinking; R6 must
    still PASS when >=10 preset command files are present as plain copies."""
    project = tmp_path / "project"
    preset = project / ".specify" / "presets" / "tradestation-sdd"
    (preset / "commands").mkdir(parents=True)
    (project / ".specify" / "presets" / ".registry").write_text(
        json.dumps({"presets": {"tradestation-sdd": {"priority": 1}}}))
    cmd_dir = project / ".claude" / "commands"
    cmd_dir.mkdir(parents=True)
    for i in range(10):
        (preset / "commands" / f"speckit.cmd{i}.md").write_text("x")
        (cmd_dir / f"speckit.cmd{i}.md").write_text("x")  # copy, not symlink
    r = doctor.check_preset(project)
    assert r["status"] == doctor.PASS


def test_copilot_preset_fails_without_agents_with_copilot_fix(tmp_path):
    project = tmp_path / "project"
    (project / ".specify" / "presets" / "tradestation-sdd").mkdir(parents=True)
    (project / ".specify" / "presets" / ".registry").write_text(
        json.dumps({"presets": {"tradestation-sdd": {"priority": 1}}}))
    r = doctor.check_preset(project, "copilot")
    assert r["status"] == doctor.FAIL
    assert "--ai copilot" in r["fix"]


def test_detect_tool_copilot_from_agents(tmp_path):
    project = tmp_path / "project"
    agents = project / ".github" / "agents"
    agents.mkdir(parents=True)
    (agents / "speckit.specify.agent.md").write_text("x")
    assert doctor.detect_tool(project) == "copilot"


def test_detect_tool_claude_from_command_symlinks(tmp_path):
    project = tmp_path / "project"
    preset = project / ".specify" / "presets" / "tradestation-sdd" / "commands"
    preset.mkdir(parents=True)
    target = preset / "speckit.specify.md"
    target.write_text("x")
    cmd_dir = project / ".claude" / "commands"
    cmd_dir.mkdir(parents=True)
    (cmd_dir / "speckit.specify.md").symlink_to(target)
    assert doctor.detect_tool(project) == "claude"


def test_detect_tool_defaults_to_claude_when_unknown(tmp_path):
    assert doctor.detect_tool(tmp_path / "empty") == "claude"


def test_detect_tool_claude_from_copied_commands(tmp_path):
    """Windows copies (regular .md files) must count as a Claude install."""
    project = tmp_path / "project"
    cmd_dir = project / ".claude" / "commands"
    cmd_dir.mkdir(parents=True)
    (cmd_dir / "speckit.specify.md").write_text("x")  # copy, not symlink
    assert doctor.detect_tool(project) == "claude"


def test_detect_tool_claude_when_copies_and_agents_both_present(tmp_path):
    """Default --ai both on Windows: copies in .claude/commands AND agents in
    .github/agents. Must resolve to claude, not copilot."""
    project = tmp_path / "project"
    cmd_dir = project / ".claude" / "commands"
    cmd_dir.mkdir(parents=True)
    (cmd_dir / "speckit.specify.md").write_text("x")  # copy
    agents = project / ".github" / "agents"
    agents.mkdir(parents=True)
    (agents / "speckit.specify.agent.md").write_text("x")
    assert doctor.detect_tool(project) == "claude"


def test_tool_flag_overrides_detection_in_json(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(doctor, "run_checks", lambda project, pf=None, tool=None: _good_checks())
    rc = doctor.main(["doctor.py", "--json", "--tool", "copilot", "--project", str(tmp_path)])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["tool"] == "copilot-cli"


def test_preflight_throttled_is_noop(tmp_path, monkeypatch, capsys):
    d = tmp_path / ".specify" / "presets" / "tradestation-sdd"
    d.mkdir(parents=True)
    (d / ".install-meta.json").write_text(json.dumps({"doctor_last_check": int(time.time())}))
    called = {"n": 0}
    def _spy(project, pf=None, tool=None):
        called["n"] += 1
        return _good_checks()
    monkeypatch.setattr(doctor, "run_checks", _spy)
    rc = doctor.main(["doctor.py", "--preflight", "--project", str(tmp_path)])
    assert rc == 0
    assert called["n"] == 0
    assert capsys.readouterr().out == ""


# ── R8: Composition deps (PyYAML) ───────────────────────────────────────────

import importlib.util as _ilu
from pathlib import Path as _Path


def _load_doctor():
    spec = _ilu.spec_from_file_location("sdd_doctor", str(_Path(__file__).resolve().parent / "doctor.py"))
    mod = _ilu.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


def test_r8_pass_when_pyyaml_present(monkeypatch):
    d = _load_doctor()
    monkeypatch.setattr(d, "_resolve_python", lambda: ["python3"])
    class R: returncode = 0
    monkeypatch.setattr(d.subprocess, "run", lambda *a, **k: R())
    res = d.check_composition_deps()
    assert res["id"] == "R8" and res["status"] == d.PASS


def test_r8_fail_when_pyyaml_missing(monkeypatch):
    d = _load_doctor()
    monkeypatch.setattr(d, "_resolve_python", lambda: ["python3"])
    class R: returncode = 1
    monkeypatch.setattr(d.subprocess, "run", lambda *a, **k: R())
    res = d.check_composition_deps()
    assert res["id"] == "R8" and res["status"] == d.FAIL and res["fix"]


def test_r8_fail_when_no_python(monkeypatch):
    d = _load_doctor()
    monkeypatch.setattr(d, "_resolve_python", lambda: None)
    res = d.check_composition_deps()
    assert res["id"] == "R8" and res["status"] == d.FAIL


def test_r8_is_hard_and_in_checks(monkeypatch):
    d = _load_doctor()
    assert "R8" in d.HARD_IDS
    monkeypatch.setattr(d, "_load_pf", lambda: type("M", (), {
        "telemetry_disabled": staticmethod(lambda: True)})())
    ids = [c["id"] for c in d.run_checks(".")]
    assert "R8" in ids


# ── R9: CLI-version advisory (non-blocking) ─────────────────────────────────

def test_r9_warns_below_target(monkeypatch):
    monkeypatch.setattr(doctor, "_speckit_cli_version", lambda: (0, 5, 0))
    r = doctor.check_cli_version()
    assert r["id"] == "R9" and r["status"] == doctor.WARN and r["fix"]

def test_r9_pass_at_target(monkeypatch):
    monkeypatch.setattr(doctor, "_speckit_cli_version", lambda: (0, 12, 8))
    r = doctor.check_cli_version()
    assert r["id"] == "R9" and r["status"] == doctor.PASS

def test_r9_is_non_blocking(monkeypatch):
    assert "R9" not in doctor.HARD_IDS
    monkeypatch.setattr(doctor, "_speckit_cli_version", lambda: (0, 5, 0))
    assert not doctor._has_hard_fail([doctor.check_cli_version()])

def test_r9_in_run_checks(monkeypatch, tmp_path):
    monkeypatch.setattr(doctor, "_load_pf", lambda: type("M", (), {
        "telemetry_disabled": staticmethod(lambda: True)})())
    assert "R9" in [c["id"] for c in doctor.run_checks(str(tmp_path))]

def test_r5_fix_targets_0128_and_integration(tmp_path, monkeypatch):
    monkeypatch.setattr(doctor, "_specify_available", lambda: False)
    r = doctor.check_speckit(str(tmp_path))
    assert "v0.12.8" in r["fix"] and "--integration" in r["fix"]
    assert "v0.5.0" not in r["fix"] and "--ai" not in r["fix"]
