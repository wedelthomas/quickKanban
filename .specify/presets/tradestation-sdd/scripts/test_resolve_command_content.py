# scripts/test_resolve_command_content.py
import json
import subprocess
import tempfile
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _run_resolve_command(name, project_root):
    script = textwrap.dedent(f"""
        set -e
        cd "{project_root}"
        source "{REPO_ROOT}/scripts/_portable.sh"
        source "{REPO_ROOT}/scripts/render-lib.sh"
        resolve_command_content "{name}" "{project_root}"
    """)
    result = subprocess.run(
        ["bash", "-c", script], capture_output=True, text=True
    )
    return result


def test_two_presets_compose_onto_same_command():
    """Org preset owns speckit.plan (replace/base); a second preset
    contributes an append fragment to the SAME command name. Both must
    appear in the resolved output -- this is the exact gap section 4a of
    the design doc identifies: today only one preset can ever own a
    command.
    """
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        specify_dir = project / ".specify"
        presets_dir = specify_dir / "presets"
        (presets_dir / "org-sdd" / "commands").mkdir(parents=True)
        (presets_dir / "team-sdd" / "commands").mkdir(parents=True)

        (presets_dir / "org-sdd" / "commands" / "speckit.plan.md").write_text(
            "ORG-BASE-CONTENT\n"
        )
        (presets_dir / "org-sdd" / "preset.yml").write_text(textwrap.dedent("""\
            schema_version: "1.0"
            preset:
              id: "org-sdd"
              name: "Org"
              version: "1.0.0"
              description: "test"
              author: "test"
            requires:
              speckit_version: ">=0.5.0"
            provides:
              templates:
                - type: "command"
                  name: "speckit.plan"
                  file: "commands/speckit.plan.md"
            """))

        (presets_dir / "team-sdd" / "commands" / "speckit.plan.md").write_text(
            "TEAM-APPENDED-CONTENT\n"
        )
        (presets_dir / "team-sdd" / "preset.yml").write_text(textwrap.dedent("""\
            schema_version: "1.0"
            preset:
              id: "team-sdd"
              name: "Team"
              version: "1.0.0"
              description: "test"
              author: "test"
            requires:
              speckit_version: ">=0.5.0"
            provides:
              templates:
                - type: "command"
                  name: "speckit.plan"
                  file: "commands/speckit.plan.md"
                  strategy: "append"
            """))

        (presets_dir / ".registry").write_text(json.dumps({
            "presets": {
                "team-sdd": {"priority": 0, "name": "Team"},
                "org-sdd": {"priority": 1, "name": "Org"},
            }
        }))

        result = _run_resolve_command("speckit.plan", project)
        assert result.returncode == 0, result.stderr
        assert "ORG-BASE-CONTENT" in result.stdout, (
            "org's base content missing from composed output -- "
            "team's append must not have replaced it"
        )
        assert "TEAM-APPENDED-CONTENT" in result.stdout, (
            "team's appended content missing from composed output"
        )
