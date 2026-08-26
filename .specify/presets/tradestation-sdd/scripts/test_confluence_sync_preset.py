import yaml
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PRESET_DIR = REPO_ROOT / "capability-presets" / "confluence-sync-sdd"

PHASES = ["specify", "plan", "implement"]


def _manifest():
    return yaml.safe_load((PRESET_DIR / "preset.yml").read_text())


def test_preset_yml_valid_and_targets_all_three_phases():
    manifest = _manifest()
    names_types = [(t["name"], t["type"]) for t in manifest["provides"]["templates"]]
    for phase in PHASES:
        assert (f"speckit.{phase}", "command") in names_types
        assert (f"speckit.{phase}.agent", "agent") in names_types


def test_every_entry_uses_append_strategy():
    manifest = _manifest()
    for entry in manifest["provides"]["templates"]:
        assert entry["strategy"] == "append", entry


def test_command_fragments_recommend_the_skill_and_dont_block():
    for phase in PHASES:
        text = (PRESET_DIR / "commands" / f"speckit.{phase}.md").read_text()
        assert "docs-confluence-sync" in text
        assert "recommend" in text.lower() or "note" in text.lower()


def test_agent_fragments_recommend_the_skill_and_dont_block():
    for phase in PHASES:
        text = (PRESET_DIR / "agents" / f"speckit.{phase}.agent.md").read_text()
        assert "docs-confluence-sync" in text
        assert "recommend" in text.lower() or "note" in text.lower()


def test_implement_fragment_is_explicitly_advisory():
    text = (PRESET_DIR / "commands" / "speckit.implement.md").read_text()
    assert "not a blocker" in text.lower() or "not blocking" in text.lower()


def test_specify_and_plan_fragments_never_block():
    for phase in ("specify", "plan"):
        text = (PRESET_DIR / "commands" / f"speckit.{phase}.md").read_text()
        assert "never block" in text.lower()
