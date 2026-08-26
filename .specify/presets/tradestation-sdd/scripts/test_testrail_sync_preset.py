import yaml
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PRESET_DIR = REPO_ROOT / "capability-presets" / "testrail-sync-sdd"

PHASES = ["specify", "plan", "tasks"]
CONDITIONAL_PHASES = ["plan", "tasks"]


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


def test_command_fragments_name_the_skill():
    for phase in PHASES:
        text = (PRESET_DIR / "commands" / f"speckit.{phase}.md").read_text()
        assert "spec-testrail-sync" in text


def test_agent_fragments_name_the_skill():
    for phase in PHASES:
        text = (PRESET_DIR / "agents" / f"speckit.{phase}.agent.md").read_text()
        assert "spec-testrail-sync" in text


def test_conditional_phases_describe_their_trigger_and_never_block():
    for phase in CONDITIONAL_PHASES:
        text = (PRESET_DIR / "commands" / f"speckit.{phase}.md").read_text()
        assert "gap" in text.lower() or "unsynced" in text.lower()
        assert "never block" in text.lower()


def test_specify_is_unconditional_and_never_blocks():
    text = (PRESET_DIR / "commands" / "speckit.specify.md").read_text()
    assert "never block" in text.lower()


def test_no_clarify_hook_but_plan_fragment_covers_it_in_wording():
    """speckit.clarify has no org-baseline command file for install.sh's
    composition loop to compose onto -- the loop only iterates the org's
    own command names, not every name a capability preset might declare.
    Dropped the clarify hook rather than fix that shared machinery here;
    the plan-phase pre-check explicitly covers "clarify ran but scenarios
    still unsynced" in its own wording instead."""
    assert not (PRESET_DIR / "commands" / "speckit.clarify.md").exists()
    assert not (PRESET_DIR / "agents" / "speckit.clarify.agent.md").exists()
    text = (PRESET_DIR / "commands" / "speckit.plan.md").read_text().lower()
    assert "clarify" in text


def test_no_fragment_distinguishes_first_sync_from_gap_closing():
    """Every fragment recommends the same action (run spec-testrail-sync)
    -- the skill's own idempotent diff decides internally whether a run
    creates the whole suite or closes a few gaps. No fragment should talk
    about "creating the test suite" as a distinct first-time action."""
    for phase in PHASES:
        text = (PRESET_DIR / "commands" / f"speckit.{phase}.md").read_text().lower()
        assert "create the test suite" not in text
        assert "first sync" not in text
        assert "first-time sync" not in text
