# scripts/test_install_command_composition.py
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _make_preset(root, preset_id, plan_content, strategy=None):
    d = root / preset_id
    (d / "commands").mkdir(parents=True)
    (d / "templates").mkdir(parents=True)
    (d / "scripts").mkdir(parents=True)
    (d / "commands" / "speckit.plan.md").write_text(plan_content)
    # install.sh unconditionally globs templates/*.md -- an empty dir makes
    # the glob fail to expand and `cp` errors out under set -e.
    (d / "templates" / "placeholder-template.md").write_text("placeholder\n")
    # install.sh derives SCRIPT_DIR from its own path (dirname "$0"), not
    # cwd -- so the fixture must carry its own copy of install.sh plus every
    # script it sources, or it'll fall through to the real preset's files.
    (d / "install.sh").write_text((REPO_ROOT / "install.sh").read_text())
    for name in ["render-lib.sh", "render-template.sh", "_portable.sh", "detect-customizations.sh"]:
        (d / "scripts" / name).write_text((REPO_ROOT / "scripts" / name).read_text())
    # install.sh also globs scripts/*.py unconditionally.
    (d / "scripts" / "placeholder.py").write_text("# placeholder\n")
    # Build the whole dict and dump with yaml, rather than hand-splicing an
    # indented line into an f-string -- textwrap.dedent computes common
    # leading whitespace from the *template*, so a variable holding its own
    # embedded indentation silently breaks YAML nesting (this bit us once
    # already: PyYAML dropped a mis-indented `strategy` key entirely,
    # defaulting composition to "replace" and masking the real behavior).
    import yaml as _yaml
    entry = {
        "type": "command",
        "name": "speckit.plan",
        "file": "commands/speckit.plan.md",
    }
    if strategy:
        entry["strategy"] = strategy
    manifest = {
        "schema_version": "1.0",
        "preset": {
            "id": preset_id, "name": preset_id, "version": "1.0.0",
            "description": "test", "author": "test",
        },
        "requires": {"speckit_version": ">=0.5.0"},
        "provides": {"templates": [entry]},
    }
    (d / "preset.yml").write_text(_yaml.safe_dump(manifest, sort_keys=False))
    return d


def test_install_composes_org_and_team_onto_same_command():
    """End-to-end: org preset installs speckit.plan (base), a team preset
    installed afterward contributes an append fragment to the SAME
    command -- install.sh must materialize BOTH contributions, not
    silently drop one (the exact gap section 4a identifies).
    """
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        project = tmp_path / "proj"
        project.mkdir()
        (project / ".specify").mkdir()
        (project / ".claude").mkdir()

        org_preset = _make_preset(tmp_path, "org-sdd", "ORG-BASE\n")
        team_preset = _make_preset(
            tmp_path, "team-sdd", "TEAM-APPEND\n", strategy="append"
        )

        # Install org preset first (establishes the registry + base content).
        result = subprocess.run(
            ["bash", str(org_preset / "install.sh"), str(project), "--ai", "claude"],
            cwd=str(org_preset), capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr

        resolved = project / ".claude" / "commands" / "speckit.plan.md"
        assert resolved.exists()
        assert "ORG-BASE" in resolved.read_text()

        # Register the team preset directly in the registry (simulating
        # add-team-preset.sh's registration step) and re-run org's
        # install.sh, which should now compose both.
        registry_path = project / ".specify" / "presets" / ".registry"
        import json
        registry = json.loads(registry_path.read_text()) if registry_path.exists() else {"presets": {}}
        registry.setdefault("presets", {})["team-sdd"] = {"priority": 0, "name": "team-sdd"}
        registry_path.write_text(json.dumps(registry))

        team_dest = project / ".specify" / "presets" / "team-sdd"
        team_dest.mkdir(parents=True, exist_ok=True)
        (team_dest / "commands").mkdir(exist_ok=True)
        (team_dest / "commands" / "speckit.plan.md").write_text("TEAM-APPEND\n")
        (team_dest / "preset.yml").write_text((team_preset / "preset.yml").read_text())

        result2 = subprocess.run(
            ["bash", str(org_preset / "install.sh"), str(project), "--ai", "claude"],
            cwd=str(org_preset), capture_output=True, text=True,
        )
        assert result2.returncode == 0, result2.stdout + result2.stderr

        final_text = resolved.read_text()
        assert "ORG-BASE" in final_text, "org's base content must survive composition"
        assert "TEAM-APPEND" in final_text, "team's appended content must be present"
