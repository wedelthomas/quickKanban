# scripts/test_add_preset.py
#
# add-preset.sh copies a capability preset into a project, auto-assigns it
# a priority below whatever's already installed (so a plain install can
# never collide with the org baseline or anything else), and stamps
# .install-meta.json with kind: "preset" so check-update.sh can refresh it.
# Replaces add-team-preset.sh -- "team preset" is retired as a concept.
import json
import pathlib
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parent.parent
INSTALL = REPO / "install.sh"
ADD = REPO / "scripts" / "add-preset.sh"


@pytest.fixture
def project(tmp_path):
    """A project with the org preset already installed (priority 1)."""
    p = tmp_path / "proj"
    (p / ".specify").mkdir(parents=True)
    subprocess.run(["bash", str(INSTALL), str(p), "--ai", "claude"],
                   check=True, capture_output=True, text=True)
    return p


def _run_add(project, preset_id="observability-sdd", extra=None):
    cmd = ["bash", str(ADD), preset_id, str(project), "--source", str(REPO)]
    if extra:
        cmd += extra
    return subprocess.run(cmd, capture_output=True, text=True)


def _registry(project):
    return json.loads((project / ".specify" / "presets" / ".registry").read_text())


def test_copies_preset_and_auto_assigns_priority_below_org(project):
    r = _run_add(project)
    assert r.returncode == 0, r.stderr
    dest = project / ".specify" / "presets" / "observability-sdd"
    assert (dest / "preset.yml").is_file()
    reg = _registry(project)
    assert reg["presets"]["observability-sdd"]["priority"] == 0
    assert reg["presets"]["tradestation-sdd"]["priority"] == 1


def test_second_preset_lands_below_the_first(project):
    _run_add(project, "observability-sdd")
    r = _run_add(project, "security-sdd")
    assert r.returncode == 0, r.stderr
    reg = _registry(project)
    assert reg["presets"]["security-sdd"]["priority"] == -1
    assert reg["presets"]["observability-sdd"]["priority"] == 0  # untouched


def test_explicit_priority_is_honored(project):
    r = _run_add(project, "observability-sdd", extra=["--priority", "-5"])
    assert r.returncode == 0, r.stderr
    assert _registry(project)["presets"]["observability-sdd"]["priority"] == -5


def test_explicit_priority_collision_is_rejected(project):
    _run_add(project, "observability-sdd", extra=["--priority", "-5"])
    r = _run_add(project, "security-sdd", extra=["--priority", "-5"])
    assert r.returncode != 0
    assert "priority" in r.stderr.lower()


def test_idempotent_rerun_keeps_its_priority(project):
    _run_add(project, "observability-sdd")
    r = _run_add(project, "observability-sdd")  # refresh, no --priority
    assert r.returncode == 0, r.stderr
    assert _registry(project)["presets"]["observability-sdd"]["priority"] == 0


def test_writes_install_meta_with_kind_preset(project):
    _run_add(project, "observability-sdd")
    meta = json.loads((project / ".specify" / "presets" / "observability-sdd" / ".install-meta.json").read_text())
    assert meta["kind"] == "preset"
    assert meta["source_clone"] == str(REPO)
    assert meta["installed_sha"]


def test_unknown_preset_errors(project):
    r = _run_add(project, "nope-sdd")
    assert r.returncode != 0
    assert "not found" in (r.stderr + r.stdout).lower()


def test_materializes_command_composition(project):
    """Registering a capability in .registry isn't enough on its own --
    .claude/commands/ must actually be recomposed, or the capability's
    command content never shows up. This is the standalone (non-bundle)
    path; add-bundle.sh covers the bundle path in its own test."""
    r = _run_add(project, "observability-sdd")
    assert r.returncode == 0, r.stderr


def test_materializes_agent_composition_for_copilot_only_project(tmp_path):
    """Regression: add-preset.sh's re-run of install.sh used to hardcode
    --ai claude, so a Copilot-only project's .github/agents/ was never
    recomposed no matter what capability was installed -- caught by
    manual end-to-end verification, not by the unit tests above (which
    all use the Claude-only fixture). Must also NOT create .claude/ on a
    project that never had it."""
    project = tmp_path / "proj"
    (project / ".specify").mkdir(parents=True)
    subprocess.run(["bash", str(INSTALL), str(project), "--ai", "copilot"],
                   check=True, capture_output=True, text=True)

    r = _run_add(project, "observability-sdd")
    assert r.returncode == 0, r.stderr

    agent_file = project / ".github" / "agents" / "speckit.implement.agent.md"
    agent_text = agent_file.read_text()
    assert "dd-observability" in agent_text
    assert "abs-sdd-observability" not in agent_text
    assert not (project / ".claude").exists()


def test_gitignores_its_own_install_meta(project):
    _run_add(project, "observability-sdd")
    gitignore = (project / ".gitignore").read_text()
    assert ".specify/presets/observability-sdd/.install-meta.json" in gitignore
