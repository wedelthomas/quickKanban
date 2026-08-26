# scripts/test_install_agent_composition.py
#
# Same proof as test_install_command_composition.py's Claude case, for
# Copilot agents: org installs speckit.plan.agent.md (base), a second
# preset contributes an append fragment to the SAME agent -- install.sh
# must materialize BOTH contributions, not silently drop one.
import json
import subprocess
import tempfile
from pathlib import Path

import yaml as _yaml

REPO_ROOT = Path(__file__).resolve().parent.parent


def _make_preset(root, preset_id, plan_agent_content, strategy=None):
    d = root / preset_id
    (d / "commands").mkdir(parents=True)
    (d / "templates").mkdir(parents=True)
    (d / "scripts").mkdir(parents=True)
    (d / "copilot-agents").mkdir(parents=True)
    (d / "agents").mkdir(parents=True)
    (d / "agents" / "speckit.plan.agent.md").write_text(plan_agent_content)
    # install.sh's Copilot loop requires at least one org agent file to
    # exist and iterate over, and unconditionally globs templates/commands.
    (d / "copilot-agents" / "speckit.plan.agent.md").write_text(
        "---\nagent: speckit.plan\ndescription: test\n---\n\nORG-BASE\n"
    )
    (d / "templates" / "placeholder-template.md").write_text("placeholder\n")
    (d / "commands" / "placeholder.md").write_text("placeholder\n")
    (d / "install.sh").write_text((REPO_ROOT / "install.sh").read_text())
    for name in ["render-lib.sh", "render-template.sh", "_portable.sh", "detect-customizations.sh"]:
        (d / "scripts" / name).write_text((REPO_ROOT / "scripts" / name).read_text())
    (d / "scripts" / "placeholder.py").write_text("# placeholder\n")
    entry = {
        "type": "agent",
        "name": "speckit.plan.agent",
        "file": "agents/speckit.plan.agent.md",
    }
    if strategy:
        entry["strategy"] = strategy
    manifest = {
        "schema_version": "1.0",
        "preset": {
            "id": preset_id, "name": preset_id, "version": "1.0.0",
            "description": "test", "author": "test",
        },
        "requires": {"speckit_version": ">=0.5.0"},
        "provides": {"templates": [entry]},
    }
    (d / "preset.yml").write_text(_yaml.safe_dump(manifest, sort_keys=False))
    return d


def test_install_composes_org_and_team_onto_same_agent():
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        project = tmp_path / "proj"
        project.mkdir()
        (project / ".specify").mkdir()
        (project / ".github").mkdir()

        org_preset = _make_preset(tmp_path, "org-sdd", "ORG-BASE\n")
        team_preset = _make_preset(tmp_path, "team-sdd", "TEAM-APPEND\n", strategy="append")

        result = subprocess.run(
            ["bash", str(org_preset / "install.sh"), str(project), "--ai", "copilot"],
            cwd=str(org_preset), capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr

        resolved = project / ".github" / "agents" / "speckit.plan.agent.md"
        assert resolved.exists()
        assert "ORG-BASE" in resolved.read_text()

        registry_path = project / ".specify" / "presets" / ".registry"
        registry = json.loads(registry_path.read_text()) if registry_path.exists() else {"presets": {}}
        registry.setdefault("presets", {})["team-sdd"] = {"priority": 0, "name": "team-sdd"}
        registry_path.write_text(json.dumps(registry))

        team_dest = project / ".specify" / "presets" / "team-sdd"
        team_dest.mkdir(parents=True, exist_ok=True)
        (team_dest / "agents").mkdir(exist_ok=True)
        (team_dest / "agents" / "speckit.plan.agent.md").write_text("TEAM-APPEND\n")
        (team_dest / "preset.yml").write_text((team_preset / "preset.yml").read_text())

        result2 = subprocess.run(
            ["bash", str(org_preset / "install.sh"), str(project), "--ai", "copilot"],
            cwd=str(org_preset), capture_output=True, text=True,
        )
        assert result2.returncode == 0, result2.stdout + result2.stderr

        final_text = resolved.read_text()
        assert "ORG-BASE" in final_text, "org's base content must survive composition"
        assert "TEAM-APPEND" in final_text, "team's appended content must be present"


def test_real_org_preset_populates_agents_dir_and_declares_entries():
    """Regression: install.sh used to only copy commands/*.md into
    .specify/presets/tradestation-sdd/commands/, never copilot-agents/ into
    an agents/ counterpart, and root preset.yml declared zero type:"agent"
    entries. render-lib.sh's composition loop then had no pristine
    org-baseline layer for any agent file, silently falling back to
    "Priority 4: Core" -- which reads the file's own PREVIOUS composed
    output. Net effect: removing a capability's contribution from an agent
    file never actually reverted it; the stale content stuck around
    forever. See scripts/test_remove_preset.py for the end-to-end proof."""
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "proj"
        (project / ".specify").mkdir(parents=True)
        result = subprocess.run(
            ["bash", str(REPO_ROOT / "install.sh"), str(project), "--ai", "copilot"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr

        org_agents_dir = project / ".specify" / "presets" / "tradestation-sdd" / "agents"
        assert org_agents_dir.is_dir()
        assert (org_agents_dir / "speckit.plan.agent.md").is_file()
        assert (org_agents_dir / "speckit.implement.agent.md").is_file()

        manifest = _yaml.safe_load(
            (project / ".specify" / "presets" / "tradestation-sdd" / "preset.yml").read_text()
        )
        agent_names = {
            e["name"] for e in manifest["provides"]["templates"] if e.get("type") == "agent"
        }
        assert "speckit.plan.agent" in agent_names
        assert "speckit.implement.agent" in agent_names


def test_install_copilot_only_still_resolves_agent_content():
    """Regression guard for the exact bug this task fixes: render-lib.sh
    must be sourced even when --ai copilot runs alone (not "both"), or
    resolve_agent_content is undefined and the Copilot loop breaks."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        project = tmp_path / "proj"
        project.mkdir()
        (project / ".specify").mkdir()

        org_preset = _make_preset(tmp_path, "org-sdd", "ORG-BASE\n")
        result = subprocess.run(
            ["bash", str(org_preset / "install.sh"), str(project), "--ai", "copilot"],
            cwd=str(org_preset), capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        assert "command not found" not in result.stderr
        resolved = project / ".github" / "agents" / "speckit.plan.agent.md"
        assert "ORG-BASE" in resolved.read_text()
