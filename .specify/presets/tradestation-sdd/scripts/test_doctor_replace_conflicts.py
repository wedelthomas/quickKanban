# scripts/test_doctor_replace_conflicts.py
import json
import sys
import tempfile
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))
import doctor  # noqa: E402

REPLACE_PRESET = textwrap.dedent("""\
    schema_version: "1.0"
    preset:
      id: "{pid}"
      name: "{pid}"
      version: "1.0.0"
      description: "test preset"
      author: "test"
      license: MIT
    provides:
      commands:
        - {{ type: "command", name: "speckit.implement", file: "commands/speckit.implement.md", strategy: "replace" }}
    """)

APPEND_PRESET = textwrap.dedent("""\
    schema_version: "1.0"
    preset:
      id: "{pid}"
      name: "{pid}"
      version: "1.0.0"
      description: "test preset"
      author: "test"
      license: MIT
    provides:
      commands:
        - {{ type: "command", name: "speckit.implement", file: "commands/speckit.implement.md", strategy: "append" }}
    """)


def _install(project, pid, manifest_text):
    dest = project / ".specify" / "presets" / pid
    dest.mkdir(parents=True)
    (dest / "preset.yml").write_text(manifest_text.format(pid=pid))


def _write_registry(project, preset_ids):
    reg_dir = project / ".specify" / "presets"
    reg_dir.mkdir(parents=True, exist_ok=True)
    (reg_dir / ".registry").write_text(
        json.dumps({"presets": {pid: {} for pid in preset_ids}})
    )


def test_two_replace_on_same_file_warns_and_names_both():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        _install(project, "observability-sdd", REPLACE_PRESET)
        _install(project, "security-sdd", REPLACE_PRESET)
        _write_registry(project, ["observability-sdd", "security-sdd"])

        result = doctor.check_replace_conflicts(project)
        assert result["status"] == doctor.WARN, result
        assert result["id"] not in doctor.HARD_IDS, (
            "a structural replace-collision is advisory, not a hard block"
        )
        assert "commands/speckit.implement.md" in result["detail"]
        assert "observability-sdd" in result["detail"]
        assert "security-sdd" in result["detail"]


def test_replace_plus_append_on_same_file_passes():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        _install(project, "observability-sdd", REPLACE_PRESET)
        _install(project, "security-sdd", APPEND_PRESET)
        _write_registry(project, ["observability-sdd", "security-sdd"])

        result = doctor.check_replace_conflicts(project)
        assert result["status"] == doctor.PASS, result


def test_two_append_on_same_file_passes():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        _install(project, "observability-sdd", APPEND_PRESET)
        _install(project, "security-sdd", APPEND_PRESET)
        _write_registry(project, ["observability-sdd", "security-sdd"])

        result = doctor.check_replace_conflicts(project)
        assert result["status"] == doctor.PASS, result


def test_no_presets_installed_skips_rather_than_fails():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        (project / ".specify" / "presets").mkdir(parents=True)

        result = doctor.check_replace_conflicts(project)
        assert result["status"] != doctor.FAIL, result
        assert result["status"] != doctor.WARN, (
            "no presets installed is not itself a conflict signal"
        )


def test_single_preset_replace_passes():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        _install(project, "persona-routing-sdd", REPLACE_PRESET)
        _write_registry(project, ["persona-routing-sdd"])

        result = doctor.check_replace_conflicts(project)
        assert result["status"] == doctor.PASS, result
