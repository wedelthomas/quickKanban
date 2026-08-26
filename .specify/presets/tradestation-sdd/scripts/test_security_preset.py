# scripts/test_security_preset.py
import yaml
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PRESET_DIR = REPO_ROOT / "capability-presets" / "security-sdd"


def test_preset_yml_valid_and_targets_implement():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    names_types = [(t["name"], t["type"]) for t in manifest["provides"]["templates"]]
    assert ("speckit.implement", "command") in names_types


def test_fragment_recommends_wiz_scan_and_notes_ci_is_the_gate():
    text = (PRESET_DIR / "commands" / "speckit.implement.md").read_text()
    assert "security-wiz-scan" in text
    assert "ci" in text.lower()


def test_fragment_recommends_wiring_up_ci_scan_if_missing():
    text = (PRESET_DIR / "commands" / "speckit.implement.md").read_text().lower()
    assert "github actions" in text or "gitlab" in text
    assert "wire" in text or "wiring" in text


def test_fragment_uses_append_strategy():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    entry = next(t for t in manifest["provides"]["templates"] if t["name"] == "speckit.implement")
    assert entry["strategy"] == "append"


def test_agent_fragment_exists_and_recommends_wiz_scan():
    text = (PRESET_DIR / "agents" / "speckit.implement.agent.md").read_text()
    assert "security-wiz-scan" in text
    assert "ci" in text.lower()


def test_agent_fragment_recommends_wiring_up_ci_scan_if_missing():
    text = (PRESET_DIR / "agents" / "speckit.implement.agent.md").read_text().lower()
    assert "github actions" in text or "gitlab" in text
    assert "wire" in text or "wiring" in text


def test_preset_yml_has_agent_entry_for_implement():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    names_types = [(t["name"], t["type"]) for t in manifest["provides"]["templates"]]
    assert ("speckit.implement.agent", "agent") in names_types
