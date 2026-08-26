# scripts/test_bdd_tdd_workflow_preset.py
import pathlib
import subprocess
import tempfile

import yaml

REPO = pathlib.Path(__file__).resolve().parent.parent
PRESET_DIR = REPO / "capability-presets" / "bdd-tdd-workflow"
INSTALL = REPO / "install.sh"
ADD_PRESET = REPO / "scripts" / "add-preset.sh"


def test_preset_yml_declares_only_append_strategy():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    assert manifest["preset"]["id"] == "bdd-tdd-workflow"
    entries = manifest["provides"]["templates"]
    assert len(entries) > 0
    for entry in entries:
        assert entry["strategy"] == "append", entry["name"]


def test_all_declared_files_exist():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    for entry in manifest["provides"]["templates"]:
        assert (PRESET_DIR / entry["file"]).exists(), entry["file"]


def test_spec_template_has_behavior_pathways_and_verification_sections():
    text = (PRESET_DIR / "templates" / "spec-template.md").read_text()
    assert "## Behavior Pathways" in text
    assert "## Verification" in text
    assert "BH-###" in text or "BH-001" in text
    assert "TEST-###" in text or "TEST-001" in text
    assert "no-behavior" in text


def test_specify_fragment_covers_risk_tier_and_sections():
    for surface in ("commands/speckit.specify.md", "agents/speckit.specify.agent.md"):
        text = (PRESET_DIR / surface).read_text()
        assert "Risk Tier" in text
        assert "FULL" in text and "STANDARD" in text
        assert "money, orders, or positions" in text
        assert "Behavior Pathways" in text
        assert "adopted" in text.lower()  # preserve-if-adopted rule


def test_specify_command_and_agent_fragments_are_identical():
    cmd = (PRESET_DIR / "commands" / "speckit.specify.md").read_text()
    agent = (PRESET_DIR / "agents" / "speckit.specify.agent.md").read_text()
    assert cmd == agent


def test_verify_spec_fragment_defines_hard_fail_check():
    for surface in ("commands/speckit.verify-spec.md", "agents/speckit.verify-spec.agent.md"):
        text = (PRESET_DIR / surface).read_text()
        assert "Behavior Pathways" in text
        assert "Verification" in text
        assert "FULL" in text
        assert "STANDARD" in text
        assert "Pins" in text
        assert "orphan" in text.lower() or "resolve" in text.lower()


def test_verify_spec_command_and_agent_fragments_are_identical():
    cmd = (PRESET_DIR / "commands" / "speckit.verify-spec.md").read_text()
    agent = (PRESET_DIR / "agents" / "speckit.verify-spec.agent.md").read_text()
    assert cmd == agent


def test_plan_fragment_calls_out_testrail_sync_point():
    for surface in ("commands/speckit.plan.md", "agents/speckit.plan.agent.md"):
        text = (PRESET_DIR / surface).read_text()
        assert "Behavior Pathways" in text
        assert "spec-testrail-sync" in text
        assert "implement" in text.lower()


def test_plan_command_and_agent_fragments_are_identical():
    cmd = (PRESET_DIR / "commands" / "speckit.plan.md").read_text()
    agent = (PRESET_DIR / "agents" / "speckit.plan.agent.md").read_text()
    assert cmd == agent


def test_tasks_fragment_puts_testrail_sync_task_first():
    for surface in ("commands/speckit.tasks.md", "agents/speckit.tasks.agent.md"):
        text = (PRESET_DIR / surface).read_text()
        assert "Behavior Pathways" in text
        assert "spec-testrail-sync" in text
        assert "first task" in text.lower()


def test_tasks_command_and_agent_fragments_are_identical():
    cmd = (PRESET_DIR / "commands" / "speckit.tasks.md").read_text()
    agent = (PRESET_DIR / "agents" / "speckit.tasks.agent.md").read_text()
    assert cmd == agent


def test_implement_fragment_enforces_red_then_green_and_hard_stops():
    for surface in ("commands/speckit.implement.md", "agents/speckit.implement.agent.md"):
        text = (PRESET_DIR / surface).read_text()
        assert "red" in text.lower() and "green" in text.lower()
        assert "hard-stop" in text.lower() or "hard stop" in text.lower() or "STOP" in text
        assert "orphan" in text.lower()
        assert "add_result_for_case" in text or "add_results_for_cases" in text


def test_implement_command_and_agent_fragments_are_identical():
    cmd = (PRESET_DIR / "commands" / "speckit.implement.md").read_text()
    agent = (PRESET_DIR / "agents" / "speckit.implement.agent.md").read_text()
    assert cmd == agent


def test_installs_cleanly_and_composes_onto_org_baseline():
    with tempfile.TemporaryDirectory() as tmp:
        project = pathlib.Path(tmp) / "proj"
        (project / ".specify").mkdir(parents=True)
        r = subprocess.run(["bash", str(INSTALL), str(project), "--ai", "both"],
                            capture_output=True, text=True)
        assert r.returncode == 0, r.stderr

        r = subprocess.run(
            ["bash", str(ADD_PRESET), "bdd-tdd-workflow", str(project), "--source", str(REPO)],
            capture_output=True, text=True,
        )
        assert r.returncode == 0, r.stderr

        verify_spec = (project / ".claude" / "commands" / "speckit.verify-spec.md").read_text()
        assert "Behavior Pathways traceability" in verify_spec
        assert "<!-- AO-MANDATORY: feedback -->" in verify_spec  # org content survived

        verify_spec_agent = (project / ".github" / "agents" / "speckit.verify-spec.agent.md").read_text()
        assert "Behavior Pathways traceability" in verify_spec_agent
        assert "<!-- AO-MANDATORY: feedback -->" in verify_spec_agent

        implement = (project / ".claude" / "commands" / "speckit.implement.md").read_text()
        assert "Test-First Enforcement" in implement
        assert "Post-Implementation Hygiene Gate" in implement  # org content survived
