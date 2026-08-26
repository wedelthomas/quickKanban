# scripts/test_install_commands.py
#
# The preset installs /speckit.* commands into a project's .claude/commands/.
# As of the command-composition change (docs/superpowers/specs/
# 2026-07-28-multirepo-preset-architecture-design.md §4a), these are
# materialized files (the resolver's composed output), not symlinks back to
# a single preset's raw file — content may now be assembled from more than
# one installed preset, so a symlink to "the" source file no longer makes
# sense. The portability concern the old symlink tests guarded (fresh
# clone / different machine / devcontainer) is moot for a materialized
# file: there's no target path to dangle. What still matters is that the
# composed content is correct and that it survives a plain copy/move
# unchanged.
import pathlib
import shutil
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parent.parent
INSTALL = REPO / "install.sh"
CLAUDE_CMD_REL = ".claude/commands"

EXPECTED = sorted(p.name for p in (REPO / "commands").glob("speckit.*.md"))


@pytest.fixture
def project(tmp_path):
    p = tmp_path / "proj"
    (p / ".specify").mkdir(parents=True)
    subprocess.run(["bash", str(INSTALL), str(p), "--ai", "claude"],
                   check=True, capture_output=True, text=True)
    return p


def test_all_commands_installed_as_materialized_files(project):
    cmd_dir = project / CLAUDE_CMD_REL
    installed = sorted(f.name for f in cmd_dir.glob("speckit.*.md"))
    assert installed == EXPECTED
    for f in cmd_dir.glob("speckit.*.md"):
        assert not f.is_symlink(), (
            f"{f.name} is a symlink -- commands are composed/materialized "
            f"now, not symlinked to a single preset's raw file"
        )
        assert f.stat().st_size > 0, f"{f.name} is empty"


def test_materialized_command_content_matches_source(project):
    """No composition layer is installed here beyond the org preset itself,
    so the materialized content must equal the org preset's own source
    file verbatim (single-layer composition is a no-op passthrough)."""
    cmd_dir = project / CLAUDE_CMD_REL
    for name in EXPECTED:
        source = (REPO / "commands" / name).read_text()
        materialized = (cmd_dir / name).read_text()
        assert materialized == source, f"{name} content diverged from source"


def test_commands_survive_a_repo_move(project, tmp_path):
    """A materialized file (unlike a symlink) trivially survives a repo
    move/fresh-clone -- it's just file content, no target path to break."""
    moved = tmp_path / "elsewhere" / "proj-clone"
    moved.parent.mkdir(parents=True)
    shutil.copytree(project, moved)

    for name in EXPECTED:
        f = moved / CLAUDE_CMD_REL / name
        assert f.exists(), f"{name} missing after move"
        assert not f.is_symlink()
        assert f.stat().st_size > 0
