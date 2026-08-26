# scripts/test_list_capabilities.py
#
# list-capabilities.sh discovers every capability preset and bundle in a
# local sdd-preset clone and reports whether each is already installed in
# the target project -- shared by check-update.sh's capability-notice
# count and speckit.capabilities' interactive picker.
import json
import os
import pathlib
import shutil
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parent.parent
INSTALL = REPO / "install.sh"
ADD_PRESET = REPO / "scripts" / "add-preset.sh"
LIST = REPO / "scripts" / "list-capabilities.sh"


@pytest.fixture
def project(tmp_path):
    """A project with the org preset already installed (priority 1)."""
    p = tmp_path / "proj"
    (p / ".specify").mkdir(parents=True)
    subprocess.run(["bash", str(INSTALL), str(p), "--ai", "claude"],
                   check=True, capture_output=True, text=True)
    return p


def _run_list(project):
    r = subprocess.run(
        ["bash", str(LIST), str(project), "--source", str(REPO)],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_lists_real_presets_as_not_installed(project):
    data = _run_list(project)
    by_id = {p["id"]: p for p in data["presets"]}
    assert "observability-sdd" in by_id
    assert "security-sdd" in by_id
    assert by_id["observability-sdd"]["installed"] is False
    assert by_id["observability-sdd"]["name"]  # non-empty
    assert by_id["observability-sdd"]["description"]  # non-empty


def test_lists_crm_bundle_with_filename_stem_id(project):
    data = _run_list(project)
    by_id = {b["id"]: b for b in data["bundles"]}
    assert "crm" in by_id  # filename stem, not the internal "crm-bundle"
    assert by_id["crm"]["installed"] is False
    assert by_id["crm"]["name"] == "CRM Team Bundle"


def test_marks_an_installed_preset(project):
    subprocess.run(
        ["bash", str(ADD_PRESET), "observability-sdd", str(project), "--source", str(REPO)],
        check=True, capture_output=True, text=True,
    )
    data = _run_list(project)
    by_id = {p["id"]: p for p in data["presets"]}
    assert by_id["observability-sdd"]["installed"] is True
    assert by_id["security-sdd"]["installed"] is False


def test_unresolvable_clone_reports_error(tmp_path):
    p = tmp_path / "proj"
    (p / ".specify" / "presets").mkdir(parents=True)
    r = subprocess.run(
        ["bash", str(LIST), str(p)],  # no --source, no org meta to read one from
        capture_output=True, text=True,
    )
    assert r.returncode != 0
    assert "error" in r.stdout


def test_missing_pyyaml_fails_loudly_instead_of_a_raw_traceback(project, tmp_path):
    """AIP-236 follow-up (found by Gerson while retesting the original fix):
    list-capabilities.sh does a bare `import yaml` with no guard, so a
    PyYAML-less python3 first on PATH used to crash with a raw traceback
    that check-update.sh's stderr redirect silently swallowed."""
    real_python3 = shutil.which("python3")
    assert real_python3, "required tool not found on host: python3"

    bindir = tmp_path / "no-pyyaml-bin"
    bindir.mkdir()
    for tool in (
        "bash", "git", "dirname", "basename", "mkdir", "cp", "mv", "rm",
        "ls", "cat", "grep", "sed", "chmod", "uname", "date", "find",
        "tr", "readlink", "env", "xargs",
    ):
        src = shutil.which(tool)
        assert src, f"required tool not found on host: {tool}"
        os.symlink(src, bindir / tool)

    stub = bindir / "python3"
    stub.write_text(
        "#!/bin/sh\n"
        'if [ "$1" = "-c" ] && [ "$2" = "import yaml" ]; then exit 1; fi\n'
        f'exec "{real_python3}" "$@"\n'
    )
    stub.chmod(0o755)

    env = dict(os.environ)
    env["PATH"] = str(bindir)
    r = subprocess.run(
        ["bash", str(LIST), str(project), "--source", str(REPO)],
        capture_output=True, text=True, env=env,
    )
    assert r.returncode != 0
    assert "Traceback" not in r.stdout
    error = json.loads(r.stdout)["error"]
    assert "PyYAML" in error
