# scripts/test_install_meta.py
import json
import pathlib
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parent.parent
INSTALL = REPO / "install.sh"
META_REL = ".specify/presets/tradestation-sdd/.install-meta.json"


def _git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


@pytest.fixture
def project(tmp_path):
    p = tmp_path / "proj"
    (p / ".specify").mkdir(parents=True)
    return p


def test_install_stamps_meta_and_gitignore(project):
    r = subprocess.run(["bash", str(INSTALL), str(project)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr

    meta_path = project / META_REL
    assert meta_path.exists()
    meta = json.loads(meta_path.read_text())

    # source_clone points at the real preset repo, sha is a 40-char hash or "unknown"
    assert meta["source_clone"] == str(REPO)
    assert meta["installed_sha"]
    # last_check absent or 0 so the first command triggers a check
    assert float(meta.get("last_check", 0)) == 0

    gitignore = (project / ".gitignore").read_text()
    assert META_REL in gitignore


def test_install_persists_ai_mode(project):
    r = subprocess.run(["bash", str(INSTALL), str(project), "--ai", "copilot"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    meta = json.loads((project / META_REL).read_text())
    assert meta["ai_mode"] == "copilot"


def test_reinstall_without_flag_honors_persisted_mode(project):
    # A copilot-only install must NOT create Claude command files.
    subprocess.run(["bash", str(INSTALL), str(project), "--ai", "copilot"],
                   check=True, capture_output=True)
    assert not (project / ".claude" / "commands").exists()

    # check-update.sh re-runs `install.sh <project>` with NO --ai flag. That
    # must preserve copilot-only, not silently widen the project to "both".
    subprocess.run(["bash", str(INSTALL), str(project)],
                   check=True, capture_output=True)
    meta = json.loads((project / META_REL).read_text())
    assert meta["ai_mode"] == "copilot"
    assert not (project / ".claude" / "commands").exists(), \
        "flag-less re-install widened a copilot-only project to include Claude commands"


def test_reinstall_infers_mode_when_meta_lacks_ai_mode(project):
    # A project installed by an OLDER install.sh has no `ai_mode` in its meta.
    subprocess.run(["bash", str(INSTALL), str(project), "--ai", "copilot"],
                   check=True, capture_output=True)
    meta_path = project / META_REL
    meta = json.loads(meta_path.read_text())
    del meta["ai_mode"]                      # simulate pre-ai_mode meta
    meta_path.write_text(json.dumps(meta))
    assert not (project / ".claude" / "commands").exists()

    # Flag-less re-install must INFER copilot from the on-disk layout
    # (.github/agents present, .claude/commands absent), not widen to both.
    subprocess.run(["bash", str(INSTALL), str(project)],
                   check=True, capture_output=True)
    assert not (project / ".claude" / "commands").exists(), \
        "flag-less re-install of a pre-ai_mode copilot project widened it to both"


def test_install_is_idempotent_for_gitignore(project):
    subprocess.run(["bash", str(INSTALL), str(project)], check=True,
                   capture_output=True)
    subprocess.run(["bash", str(INSTALL), str(project)], check=True,
                   capture_output=True)
    gitignore = (project / ".gitignore").read_text()
    # the meta path appears exactly once
    assert gitignore.count(META_REL) == 1
