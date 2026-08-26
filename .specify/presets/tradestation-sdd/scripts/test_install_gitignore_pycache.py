# scripts/test_install_gitignore_pycache.py
#
# The preset's scripts (doctor.py, post-feedback.py, ...) run from the installed
# .specify/presets/tradestation-sdd/scripts/ dir, so CPython writes a
# __pycache__/ next to them in the consuming repo. install.sh must git-ignore
# that machine-local bytecode so it never clutters `git status` or gets staged.
import pathlib
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parent.parent
INSTALL = REPO / "install.sh"
PYCACHE_REL = ".specify/presets/tradestation-sdd/scripts/__pycache__/"


@pytest.fixture
def project(tmp_path):
    p = tmp_path / "proj"
    (p / ".specify").mkdir(parents=True)
    return p


def test_install_gitignores_script_pycache(project):
    r = subprocess.run(["bash", str(INSTALL), str(project)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr

    gitignore = (project / ".gitignore").read_text()
    assert PYCACHE_REL in gitignore


def test_pycache_ignore_is_idempotent(project):
    subprocess.run(["bash", str(INSTALL), str(project)], check=True,
                   capture_output=True)
    subprocess.run(["bash", str(INSTALL), str(project)], check=True,
                   capture_output=True)
    gitignore = (project / ".gitignore").read_text()
    # the pycache path appears exactly once after two installs
    assert gitignore.count(PYCACHE_REL) == 1
