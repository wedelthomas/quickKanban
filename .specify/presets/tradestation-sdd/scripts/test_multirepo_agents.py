# scripts/test_multirepo_agents.py
#
# MultiRepo's Copilot agent fragments -- same substance as its existing
# Claude command fragments, restated for the agent context. No clarify
# fragment: Copilot has no speckit.clarify agent at all.
import pathlib

import yaml

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
PRESET_DIR = REPO_ROOT / "capability-presets" / "multirepo-sdd"


def test_agent_fragments_exist_for_four_commands():
    for name in ("specify", "plan", "tasks", "implement"):
        assert (PRESET_DIR / "agents" / f"speckit.{name}.agent.md").exists()
    assert not (PRESET_DIR / "agents" / "speckit.clarify.agent.md").exists()


def test_preset_yml_has_agent_entries_for_four_commands():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    agent_entries = {t["name"]: t for t in manifest["provides"]["templates"] if t["type"] == "agent"}
    assert set(agent_entries) == {
        "speckit.specify.agent", "speckit.plan.agent",
        "speckit.tasks.agent", "speckit.implement.agent",
    }
    for entry in agent_entries.values():
        assert entry["strategy"] == "append"


def test_plan_agent_mentions_workspace_json_and_no_branch_creation():
    text = (PRESET_DIR / "agents" / "speckit.plan.agent.md").read_text()
    assert "workspace.json" in text
    assert "setup-plan.sh" in text or "branch" in text.lower()


def test_implement_agent_mentions_cross_repo_and_progress_md():
    text = (PRESET_DIR / "agents" / "speckit.implement.agent.md").read_text()
    assert "workspace.json" in text
    assert "progress.md" in text
