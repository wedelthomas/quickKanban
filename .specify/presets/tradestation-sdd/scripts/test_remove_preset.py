# scripts/test_remove_preset.py
#
# remove-preset.sh undoes add-preset.sh / add-bundle.sh: drops a capability
# preset's .registry entry and .specify/presets/<id>/ directory, then
# recomposes so its content disappears from the composed command/agent
# files. --bundle removes every member of a named bundle plus the bundle's
# own meta directory; --all resets a project back to pure org baseline.
import json
import pathlib
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parent.parent
INSTALL = REPO / "install.sh"
ADD_PRESET = REPO / "scripts" / "add-preset.sh"
ADD_BUNDLE = REPO / "scripts" / "add-bundle.sh"
REMOVE = REPO / "scripts" / "remove-preset.sh"


@pytest.fixture
def project(tmp_path):
    """A project with the org preset already installed (priority 1)."""
    p = tmp_path / "proj"
    (p / ".specify").mkdir(parents=True)
    subprocess.run(["bash", str(INSTALL), str(p), "--ai", "claude"],
                   check=True, capture_output=True, text=True)
    return p


def _add(project, preset_id, extra=None):
    cmd = ["bash", str(ADD_PRESET), preset_id, str(project), "--source", str(REPO)]
    if extra:
        cmd += extra
    r = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return r


def _add_bundle(project, bundle_id="crm"):
    r = subprocess.run(
        ["bash", str(ADD_BUNDLE), bundle_id, str(project), "--source", str(REPO)],
        check=True, capture_output=True, text=True,
    )
    return r


def _remove(project, *args):
    return subprocess.run(
        ["bash", str(REMOVE), *args, str(project)],
        capture_output=True, text=True,
    )


def _registry(project):
    return json.loads((project / ".specify" / "presets" / ".registry").read_text())


def test_removes_registry_entry_and_dir(project):
    _add(project, "observability-sdd")
    r = _remove(project, "observability-sdd")
    assert r.returncode == 0, r.stderr
    assert "observability-sdd" not in _registry(project)["presets"]
    assert not (project / ".specify" / "presets" / "observability-sdd").exists()


def test_recomposes_after_removal(project):
    _add(project, "observability-sdd")
    implement = (project / ".claude" / "commands" / "speckit.implement.md").read_text()
    assert "dd-observability" in implement

    r = _remove(project, "observability-sdd")
    assert r.returncode == 0, r.stderr
    implement = (project / ".claude" / "commands" / "speckit.implement.md").read_text()
    assert "dd-observability" not in implement


def test_removing_unregistered_preset_errors(project):
    r = _remove(project, "observability-sdd")
    assert r.returncode != 0
    assert "not installed" in (r.stderr + r.stdout).lower()


def test_refuses_to_remove_org_baseline(project):
    r = _remove(project, "tradestation-sdd")
    assert r.returncode != 0
    assert "org baseline" in (r.stderr + r.stdout).lower()
    assert (project / ".specify" / "presets" / "tradestation-sdd").exists()


def test_removes_gitignore_line(project):
    _add(project, "observability-sdd")
    assert ".specify/presets/observability-sdd/.install-meta.json" in (project / ".gitignore").read_text()

    _remove(project, "observability-sdd")
    assert ".specify/presets/observability-sdd/.install-meta.json" not in (project / ".gitignore").read_text()


def test_bundle_mode_removes_all_members_and_bundle_meta(project):
    _add_bundle(project, "crm")
    reg_before = _registry(project)["presets"]
    assert "observability-sdd" in reg_before  # sanity: bundle installed something

    r = _remove(project, "--bundle", "crm")
    assert r.returncode == 0, r.stderr
    reg_after = _registry(project)["presets"]
    assert set(reg_after.keys()) == {"tradestation-sdd"}
    assert not (project / ".specify" / "presets" / "crm").exists()
    for member_dir in ("observability-sdd", "security-sdd", "city-plan-sdd", "multirepo-sdd"):
        assert not (project / ".specify" / "presets" / member_dir).exists()


def test_bundle_mode_on_non_bundle_errors(project):
    _add(project, "observability-sdd")
    r = _remove(project, "--bundle", "observability-sdd")
    assert r.returncode != 0
    assert "not an installed bundle" in (r.stderr + r.stdout).lower()


def test_all_mode_resets_to_pure_org_baseline(project):
    _add(project, "observability-sdd")
    _add(project, "security-sdd")

    r = _remove(project, "--all")
    assert r.returncode == 0, r.stderr
    assert set(_registry(project)["presets"].keys()) == {"tradestation-sdd"}
    presets_dir = project / ".specify" / "presets"
    remaining = {p.name for p in presets_dir.iterdir() if p.is_dir()}
    assert remaining == {"tradestation-sdd"}

    implement = (project / ".claude" / "commands" / "speckit.implement.md").read_text()
    assert "dd-observability" not in implement
    assert "security-wiz-scan" not in implement


def test_all_mode_also_clears_bundle_meta(project):
    _add_bundle(project, "crm")
    r = _remove(project, "--all")
    assert r.returncode == 0, r.stderr
    presets_dir = project / ".specify" / "presets"
    remaining = {p.name for p in presets_dir.iterdir() if p.is_dir()}
    assert remaining == {"tradestation-sdd"}


def test_removing_a_bundle_member_individually_notes_the_bundle(project):
    _add_bundle(project, "crm")
    r = _remove(project, "observability-sdd")
    assert r.returncode == 0, r.stderr
    assert "crm" in r.stderr
    assert "member" in r.stderr.lower()


def test_copilot_only_project_recomposes_agents_not_claude(tmp_path):
    project = tmp_path / "proj"
    (project / ".specify").mkdir(parents=True)
    subprocess.run(["bash", str(INSTALL), str(project), "--ai", "copilot"],
                   check=True, capture_output=True, text=True)
    _add(project, "observability-sdd")

    r = _remove(project, "observability-sdd")
    assert r.returncode == 0, r.stderr
    agent_text = (project / ".github" / "agents" / "speckit.implement.agent.md").read_text()
    assert "dd-observability" not in agent_text
    assert not (project / ".claude").exists()
