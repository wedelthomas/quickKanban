# scripts/test_observability_preset.py
import yaml
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PRESET_DIR = REPO_ROOT / "capability-presets" / "observability-sdd"


def test_preset_yml_valid_and_targets_implement():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    names_types = [(t["name"], t["type"]) for t in manifest["provides"]["templates"]]
    assert ("speckit.implement", "command") in names_types


def test_fragment_recommends_the_skill_not_blocking():
    text = (PRESET_DIR / "commands" / "speckit.implement.md").read_text()
    # "dd-observability" alone is a substring of the old "abs-sdd-observability"
    # name (the "sdd" ends in "dd") -- assert the old name is gone too, or this
    # check silently passes even against unrenamed content.
    assert "dd-observability" in text
    assert "abs-sdd-observability" not in text
    assert "recommend" in text.lower()
    assert "not a blocker" in text.lower() or "not blocking" in text.lower()


def test_fragment_uses_strong_recommendation_language():
    text = (PRESET_DIR / "commands" / "speckit.implement.md").read_text().lower()
    assert "not an optional" in text


def test_agent_fragment_uses_strong_recommendation_language():
    text = (PRESET_DIR / "agents" / "speckit.implement.agent.md").read_text().lower()
    assert "not an optional" in text


def test_fragment_mentions_signal_assessment():
    text = (PRESET_DIR / "commands" / "speckit.implement.md").read_text().lower()
    assert "assess" in text or "instrument" in text


def test_agent_fragment_mentions_signal_assessment():
    text = (PRESET_DIR / "agents" / "speckit.implement.agent.md").read_text().lower()
    assert "assess" in text or "instrument" in text


def test_fragment_uses_append_strategy():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    entry = next(t for t in manifest["provides"]["templates"] if t["name"] == "speckit.implement")
    assert entry["strategy"] == "append"


def test_agent_fragment_exists_and_recommends_skill():
    text = (PRESET_DIR / "agents" / "speckit.implement.agent.md").read_text()
    assert "dd-observability" in text
    assert "abs-sdd-observability" not in text


def test_preset_yml_has_agent_entry_for_implement():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    names_types = [(t["name"], t["type"]) for t in manifest["provides"]["templates"]]
    assert ("speckit.implement.agent", "agent") in names_types
