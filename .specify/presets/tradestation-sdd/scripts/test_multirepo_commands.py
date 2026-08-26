# scripts/test_multirepo_commands.py
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MULTIREPO = REPO_ROOT / "capability-presets" / "multirepo-sdd"
PHASES = ["specify", "plan", "tasks", "implement"]
# "clarify" was dropped: modern `specify init` emits /speckit-clarify as a
# skill, not a .claude/commands/*.md file, so there was never a base file
# for multirepo's append-strategy entry to land on -- it silently never
# materialized. See capability-presets/multirepo-sdd/README.md.


def test_command_fragments_exist_for_all_four_phases():
    for phase in PHASES:
        assert (MULTIREPO / "commands" / f"speckit.{phase}.md").exists()


def test_each_fragment_forbids_branch_creation_and_mentions_workspace_json():
    for phase in PHASES:
        text = (MULTIREPO / "commands" / f"speckit.{phase}.md").read_text()
        assert "workspace.json" in text
        assert "branch" in text.lower()


def test_preset_yml_declares_command_entries_with_append_strategy():
    # NOT prepend: the generic resolver strategies aren't frontmatter-aware
    # (see render-lib.sh), so a raw prepend lands before the command's YAML
    # frontmatter entirely, corrupting the file. append is the safe choice
    # until/unless the resolver grows frontmatter-aware insertion.
    import yaml
    manifest = yaml.safe_load((MULTIREPO / "preset.yml").read_text())
    commands = {t["name"]: t for t in manifest["provides"]["templates"] if t["type"] == "command"}
    for phase in PHASES:
        name = f"speckit.{phase}"
        assert name in commands, name
        assert commands[name]["strategy"] == "append", name


def test_all_declared_command_files_exist():
    import yaml
    manifest = yaml.safe_load((MULTIREPO / "preset.yml").read_text())
    for t in manifest["provides"]["templates"]:
        if t["type"] != "command":
            continue
        assert (MULTIREPO / t["file"]).exists(), t["file"]


def test_composed_plan_command_has_org_and_multirepo_content():
    """End-to-end: org + multirepo-sdd both installed, speckit.plan resolves
    with both contributions present -- proves §4a's mechanism applied to a
    real capability preset, not just the synthetic Task 1/2 fixtures."""
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

        # Register multirepo-sdd the way add-team-preset.sh would (into
        # Manideep's own .registry, not the native `specify preset` system --
        # those are two separate mechanisms, see design doc §4a).
        import json, shutil
        registry_path = project / ".specify" / "presets" / ".registry"
        registry = json.loads(registry_path.read_text())
        registry.setdefault("presets", {})["multirepo-sdd"] = {"priority": 0, "name": "MultiRepo"}
        registry_path.write_text(json.dumps(registry))

        dest = project / ".specify" / "presets" / "multirepo-sdd"
        shutil.copytree(MULTIREPO / "templates", dest / "templates")
        shutil.copytree(MULTIREPO / "commands", dest / "commands")
        shutil.copy(MULTIREPO / "preset.yml", dest / "preset.yml")

        # Re-run install.sh so the command-composition loop picks up the
        # newly-registered preset (mirrors add-team-preset.sh's real flow,
        # which registers first then lets install.sh materialize commands).
        subprocess.run(
            ["bash", str(REPO_ROOT / "install.sh"), str(project), "--ai", "claude"],
            check=True, capture_output=True,
        )

        resolved = (project / ".claude" / "commands" / "speckit.plan.md").read_text()
        assert "Auto-feedback" in resolved, "org's telemetry content must survive composition"
        assert "workspace.json" in resolved, "multirepo's directive must be present"
