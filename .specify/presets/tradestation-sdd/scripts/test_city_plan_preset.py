# scripts/test_city_plan_preset.py
import yaml
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PRESET_DIR = REPO_ROOT / "capability-presets" / "city-plan-sdd"


def test_preset_yml_valid_and_targets_plan():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    names_types = [(t["name"], t["type"]) for t in manifest["provides"]["templates"]]
    assert ("speckit.plan", "command") in names_types


def test_fragment_is_conditional_on_cross_box_integration():
    text = (PRESET_DIR / "commands" / "speckit.plan.md").read_text()
    assert "ts-sdd-city-planning-integrations" in text
    assert "if" in text.lower() or "determine whether" in text.lower()


def test_fragment_uses_append_strategy():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    entry = next(t for t in manifest["provides"]["templates"] if t["name"] == "speckit.plan")
    assert entry["strategy"] == "append"


def test_agent_fragment_exists_and_recommends_skill():
    text = (PRESET_DIR / "agents" / "speckit.plan.agent.md").read_text()
    assert "ts-sdd-city-planning-integrations" in text


def test_preset_yml_has_agent_entry_for_plan():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    names_types = [(t["name"], t["type"]) for t in manifest["provides"]["templates"]]
    assert ("speckit.plan.agent", "agent") in names_types
