"""Tests for the persona-routing-sdd capability preset.

Verifies the org baseline is fully generic (no persona-routing concept
anywhere) and the persona-routing-sdd preset carries the complete,
unmodified persona-routing content that the org baseline used to have.
"""
import re
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
PRESET_DIR = REPO_ROOT / "capability-presets" / "persona-routing-sdd"

PERSONA_PATTERN = re.compile(
    r"persona|\[sre\]|\[ops\]|sre-plan|ops-plan|sre-tasks|ops-tasks",
    re.IGNORECASE,
)

BASELINE_FILES = [
    REPO_ROOT / "templates" / "spec-template.md",
    REPO_ROOT / "templates" / "plan-template.md",
    REPO_ROOT / "templates" / "tasks-template.md",
    REPO_ROOT / "commands" / "speckit.specify.md",
    REPO_ROOT / "commands" / "speckit.plan.md",
    REPO_ROOT / "commands" / "speckit.tasks.md",
    REPO_ROOT / "commands" / "speckit.analyze.md",
    REPO_ROOT / "commands" / "speckit.verify-spec.md",
    REPO_ROOT / "commands" / "speckit.checklist.md",
    REPO_ROOT / "commands" / "speckit.implement.md",
    REPO_ROOT / "commands" / "speckit.feedback.md",
    REPO_ROOT / "copilot-agents" / "speckit.plan.agent.md",
    REPO_ROOT / "copilot-agents" / "speckit.tasks.agent.md",
    REPO_ROOT / "copilot-agents" / "speckit.analyze.agent.md",
    REPO_ROOT / "copilot-agents" / "speckit.verify-spec.agent.md",
    REPO_ROOT / "copilot-agents" / "speckit.feedback.agent.md",
]


def test_org_baseline_has_no_persona_content():
    for path in BASELINE_FILES:
        text = path.read_text(encoding="utf-8")
        matches = PERSONA_PATTERN.findall(text)
        assert not matches, f"{path} still has persona content: {matches}"


def test_preset_manifest_has_sixteen_replace_entries():
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text(encoding="utf-8"))
    entries = manifest["provides"]["templates"]
    assert len(entries) == 16
    for entry in entries:
        assert entry["strategy"] == "replace", entry


def test_preset_templates_have_persona_content():
    for name in ("spec-template.md", "plan-template.md", "tasks-template.md"):
        text = (PRESET_DIR / "templates" / name).read_text(encoding="utf-8")
        assert PERSONA_PATTERN.search(text), f"{name} is missing persona content"


def test_preset_commands_have_persona_content():
    for name in (
        "speckit.specify.md",
        "speckit.plan.md",
        "speckit.tasks.md",
        "speckit.analyze.md",
        "speckit.verify-spec.md",
        "speckit.checklist.md",
        "speckit.implement.md",
        "speckit.feedback.md",
    ):
        text = (PRESET_DIR / "commands" / name).read_text(encoding="utf-8")
        assert PERSONA_PATTERN.search(text), f"{name} is missing persona content"


def test_preset_agents_have_persona_content():
    for name in (
        "speckit.plan.agent.md",
        "speckit.tasks.agent.md",
        "speckit.analyze.agent.md",
        "speckit.verify-spec.agent.md",
        "speckit.feedback.agent.md",
    ):
        text = (PRESET_DIR / "agents" / name).read_text(encoding="utf-8")
        assert PERSONA_PATTERN.search(text), f"{name} is missing persona content"


def test_verify_spec_has_six_blocking_checks_in_baseline():
    """The org-baseline verify-spec must have renumbered B1-B6, no gaps."""
    for path in (
        REPO_ROOT / "commands" / "speckit.verify-spec.md",
        REPO_ROOT / "copilot-agents" / "speckit.verify-spec.agent.md",
    ):
        text = path.read_text(encoding="utf-8")
        ids = re.findall(r"\*\*B(\d)\.", text)
        assert sorted(set(ids)) == ["1", "2", "3", "4", "5", "6"], (path, ids)
