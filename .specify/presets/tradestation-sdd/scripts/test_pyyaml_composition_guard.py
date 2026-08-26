# scripts/test_pyyaml_composition_guard.py
#
# AIP-236: without PyYAML, render-lib.sh silently defaults every installed
# preset's composition strategy to "replace", so the last preset processed
# clobbers earlier presets' content with no error surfaced. install.sh now
# calls sdd_require_pyyaml_for_composition (scripts/_portable.sh) before
# doing any composition work, so this failure mode becomes a loud,
# actionable error instead. add-preset.sh/add-bundle.sh both delegate their
# actual composition step to install.sh, so exercising install.sh directly
# covers all three entry points.
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
INSTALL = REPO_ROOT / "install.sh"


def _curated_bin_without_pyyaml(tmp_path):
    """A bin dir where python3 resolves, but `python3 -c "import yaml"`
    fails -- exactly the scenario Gerson reproduced (a python3 first on
    PATH that lacks PyYAML). Every other python invocation (json parsing,
    etc.) is delegated to the real python3 unchanged."""
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
        f'if [ "$1" = "-c" ] && [ "$2" = "import yaml" ]; then exit 1; fi\n'
        f'exec "{real_python3}" "$@"\n'
    )
    stub.chmod(0o755)
    return bindir


def _env_with_path(bindir):
    env = dict(os.environ)
    env["PATH"] = str(bindir)
    return env


def test_fresh_org_install_without_pyyaml_still_succeeds(tmp_path):
    """No .registry yet -- nothing to clobber, so the guard is a no-op."""
    project = tmp_path / "proj"
    (project / ".specify").mkdir(parents=True)
    env = _env_with_path(_curated_bin_without_pyyaml(tmp_path))

    r = subprocess.run(
        ["bash", str(INSTALL), str(project), "--ai", "claude"],
        capture_output=True, text=True, env=env,
    )
    assert r.returncode == 0, r.stderr
    assert (project / ".specify" / "presets" / "tradestation-sdd").is_dir()


def test_second_install_without_pyyaml_fails_loudly(tmp_path):
    """A project that already has a preset registered (composition risk
    exists) must fail loudly, not silently clobber, when PyYAML is
    unavailable to the resolved python3."""
    project = tmp_path / "proj"
    (project / ".specify").mkdir(parents=True)

    # First install with a normal (real) python3 -- establishes a
    # registered preset, matching the state Gerson's repro starts from.
    r = subprocess.run(
        ["bash", str(INSTALL), str(project), "--ai", "claude"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr
    assert (project / ".specify" / "presets" / ".registry").is_file()

    # Re-run (e.g. the self-update / add-preset.sh delegation path) with a
    # PyYAML-less python3 first on PATH.
    env = _env_with_path(_curated_bin_without_pyyaml(tmp_path))
    r = subprocess.run(
        ["bash", str(INSTALL), str(project), "--ai", "claude"],
        capture_output=True, text=True, env=env,
    )
    assert r.returncode != 0
    assert "PyYAML" in r.stderr
    assert "silently" in r.stderr


@pytest.mark.parametrize("has_pyyaml", [True])
def test_normal_path_with_pyyaml_is_unaffected(tmp_path, has_pyyaml):
    """Sanity check: the guard must not false-positive-block the ordinary
    path where PyYAML is available and a preset is already registered."""
    project = tmp_path / "proj"
    (project / ".specify").mkdir(parents=True)

    r = subprocess.run(
        ["bash", str(INSTALL), str(project), "--ai", "claude"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr

    r = subprocess.run(
        ["bash", str(INSTALL), str(project), "--ai", "claude"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr
