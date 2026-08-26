# scripts/test_combined_capability_install.py
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CAPABILITIES = REPO_ROOT / "capability-presets"


def _register_and_copy(project, preset_id, source_dir, priority):
    registry_path = project / ".specify" / "presets" / ".registry"
    registry = json.loads(registry_path.read_text())
    registry.setdefault("presets", {})[preset_id] = {"priority": priority, "name": preset_id}
    registry_path.write_text(json.dumps(registry))

    dest = project / ".specify" / "presets" / preset_id
    if (source_dir / "templates").is_dir():
        shutil.copytree(source_dir / "templates", dest / "templates")
    if (source_dir / "commands").is_dir():
        shutil.copytree(source_dir / "commands", dest / "commands")
    shutil.copy(source_dir / "preset.yml", dest / "preset.yml")


def test_org_plus_all_four_capabilities_compose_cleanly():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "proj"
        project.mkdir()
        subprocess.run(
            ["specify", "init", ".", "--integration", "claude", "--here", "--force"],
            cwd=project, check=True, capture_output=True,
        )
        subprocess.run(
            ["bash", str(REPO_ROOT / "install.sh"), str(project), "--ai", "claude"],
            check=True, capture_output=True,
        )

        # Priorities must be strictly lower than org's default (1, set by
        # install.sh) or a tie lets org's `replace` win outright regardless
        # of these presets' own `append`/`prepend` strategies.
        for i, name in enumerate(
            ["multirepo-sdd", "observability-sdd", "security-sdd", "city-plan-sdd"]
        ):
            _register_and_copy(project, name, CAPABILITIES / name, priority=-i)

        # Re-run install.sh so the command-composition loop materializes
        # every registered preset's contribution (mirrors how
        # add-team-preset.sh + a re-run of install.sh works in practice).
        result = subprocess.run(
            ["bash", str(REPO_ROOT / "install.sh"), str(project), "--ai", "claude"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr

        plan_cmd = (project / ".claude" / "commands" / "speckit.plan.md").read_text()
        assert "Auto-feedback" in plan_cmd, "org content missing from speckit.plan"
        assert "workspace.json" in plan_cmd, "multirepo content missing from speckit.plan"
        assert "ts-sdd-city-planning-integrations" in plan_cmd, "city-plan content missing from speckit.plan"

        implement_cmd = (project / ".claude" / "commands" / "speckit.implement.md").read_text()
        # implement's own org content uses "Feedback trigger (MANDATORY)"
        # with multi-trigger logic (end-of-feature/story-complete/session-end),
        # not the single "Auto-feedback" heading plan/specify/etc. use --
        # "/speckit.feedback" is the marker actually shared by both forms.
        assert "/speckit.feedback" in implement_cmd, "org content missing from speckit.implement"
        assert "workspace.json" in implement_cmd, "multirepo content missing from speckit.implement"
        assert "dd-observability" in implement_cmd, "observability content missing from speckit.implement"
        assert "abs-sdd-observability" not in implement_cmd, "old observability skill name leaked into speckit.implement"
        assert "security-wiz-scan" in implement_cmd, "security content missing from speckit.implement"

        resolved_plan_template = subprocess.run(
            ["bash", str(REPO_ROOT / "scripts" / "render-template.sh"), "plan-template", str(project)],
            capture_output=True, text=True, check=True,
        ).stdout
        assert "Repos Involved" in resolved_plan_template, "multirepo template content missing"


def test_project_without_any_capability_preset_is_unaffected():
    """No regression: a project that installs only the org baseline gets
    exactly the org's own content, nothing from the capability presets."""
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "proj"
        project.mkdir()
        subprocess.run(
            ["specify", "init", ".", "--integration", "claude", "--here", "--force"],
            cwd=project, check=True, capture_output=True,
        )
        subprocess.run(
            ["bash", str(REPO_ROOT / "install.sh"), str(project), "--ai", "claude"],
            check=True, capture_output=True,
        )
        plan_cmd = (project / ".claude" / "commands" / "speckit.plan.md").read_text()
        assert "Auto-feedback" in plan_cmd
        assert "workspace.json" not in plan_cmd
        assert "dd-observability" not in plan_cmd
