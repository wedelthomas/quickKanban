# scripts/test_add_bundle.py
#
# add-bundle.sh installs every capability preset listed in a bundle
# definition, at the priorities it declares, delegating each member's
# install to add-preset.sh. Replaces install-bundle.sh; bundles/ replaces
# team-bundles/ ("team preset" is retired as a concept -- it was always
# really a bundle).
import json
import pathlib
import subprocess

import pytest
import yaml

REPO = pathlib.Path(__file__).resolve().parent.parent
BUNDLE_DIR = REPO / "bundles"
ADD_BUNDLE = REPO / "scripts" / "add-bundle.sh"


def test_crm_bundle_yaml_lists_expected_capabilities():
    bundle = yaml.safe_load((BUNDLE_DIR / "crm.yaml").read_text())
    assert bundle["org"] == "tradestation-sdd"
    ids = {c["id"] for c in bundle["capabilities"]}
    assert ids == {"multirepo-sdd", "observability-sdd", "security-sdd", "city-plan-sdd"}


def test_crm_bundle_priorities_are_distinct_and_below_org():
    bundle = yaml.safe_load((BUNDLE_DIR / "crm.yaml").read_text())
    priorities = [c["priority"] for c in bundle["capabilities"]]
    assert len(set(priorities)) == len(priorities)
    assert all(p < 1 for p in priorities)


@pytest.fixture
def project(tmp_path):
    p = tmp_path / "proj"
    (p / ".specify").mkdir(parents=True)
    return p


def test_add_bundle_installs_org_and_every_listed_capability(project):
    r = subprocess.run(
        ["bash", str(ADD_BUNDLE), "crm", str(project), "--source", str(REPO)],
        capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr

    registry = json.loads((project / ".specify" / "presets" / ".registry").read_text())
    presets = registry["presets"]
    assert "tradestation-sdd" in presets
    for cap in ["multirepo-sdd", "observability-sdd", "security-sdd", "city-plan-sdd"]:
        assert cap in presets, cap
        assert (project / ".specify" / "presets" / cap / "preset.yml").exists()
        meta = json.loads((project / ".specify" / "presets" / cap / ".install-meta.json").read_text())
        assert meta["kind"] == "preset"

    bundle_meta = json.loads((project / ".specify" / "presets" / "crm" / ".install-meta.json").read_text())
    assert bundle_meta["kind"] == "bundle"
    assert {m["id"] for m in bundle_meta["members"]} == {
        "multirepo-sdd", "observability-sdd", "security-sdd", "city-plan-sdd"}

    plan_cmd = (project / ".claude" / "commands" / "speckit.plan.md").read_text()
    assert "workspace.json" in plan_cmd
    assert "ts-sdd-city-planning-integrations" in plan_cmd

    implement_cmd = (project / ".claude" / "commands" / "speckit.implement.md").read_text()
    assert "dd-observability" in implement_cmd
    assert "abs-sdd-observability" not in implement_cmd
    assert "security-wiz-scan" in implement_cmd

    # A fresh bundle install bootstraps the org baseline with install.sh's
    # own default (both AI modes) -- Copilot agents must compose too, not
    # just Claude commands (regression: install.sh used to be re-run with
    # a hardcoded --ai claude, silently skipping Copilot entirely).
    plan_agent = (project / ".github" / "agents" / "speckit.plan.agent.md").read_text()
    assert "ts-sdd-city-planning-integrations" in plan_agent

    implement_agent = (project / ".github" / "agents" / "speckit.implement.agent.md").read_text()
    assert "dd-observability" in implement_agent
    assert "abs-sdd-observability" not in implement_agent
    assert "security-wiz-scan" in implement_agent

    gitignore = (project / ".gitignore").read_text()
    assert ".specify/presets/crm/.install-meta.json" in gitignore
    for cap in ["multirepo-sdd", "observability-sdd", "security-sdd", "city-plan-sdd"]:
        assert f".specify/presets/{cap}/.install-meta.json" in gitignore


def test_unknown_bundle_name_fails_clearly(project):
    r = subprocess.run(
        ["bash", str(ADD_BUNDLE), "nonexistent-bundle", str(project), "--source", str(REPO)],
        capture_output=True, text=True)
    assert r.returncode != 0
    assert "nonexistent-bundle" in (r.stdout + r.stderr)
