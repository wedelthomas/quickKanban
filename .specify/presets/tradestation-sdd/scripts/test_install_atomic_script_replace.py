# scripts/test_install_atomic_script_replace.py
#
# Regression guard for the single most dangerous failure mode in the whole
# rollout: check-update.sh replacing ITSELF mid-execution.
#
# The auto-update path is:
#   a project's OWN check-update.sh  ->  runs install.sh  ->  install.sh
#   rewrites that same check-update.sh  ->  control returns to the still-
#   running old script.
#
# bash reads a script incrementally from a file descriptor, by byte offset.
# `cp` (and any in-place rewrite) truncates and rewrites the SAME inode, so
# the running shell resumes at its old offset inside the NEW file's bytes --
# executing garbage. Observed for real on the day-1 upgrade path: the old
# script jumped into the new script's process_entry() body and died with
# "kind: unbound variable" (set -u), exit 1, visible on stderr -- on every
# existing project's first slash command after the merge.
#
# Replacing via a temp file + mv (rename(2)) gives the new content a NEW
# inode; the running shell's fd still points at the old inode, so it reads
# its own original bytes to completion. That is what these tests pin.
import os
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _install(project: Path):
    project.mkdir(parents=True, exist_ok=True)
    (project / ".specify").mkdir(exist_ok=True)
    r = subprocess.run(
        ["bash", str(REPO_ROOT / "install.sh"), str(project), "--ai", "claude"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stdout + r.stderr
    return r


def test_reinstall_replaces_scripts_with_a_new_inode():
    """A second install must not rewrite the previous script file in place --
    anything holding it open (a running check-update.sh) would otherwise
    start executing the new bytes at its own stale offset."""
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "proj"
        _install(project)

        target = project / ".specify" / "presets" / "tradestation-sdd" / "scripts" / "check-update.sh"
        assert target.is_file()
        inode_before = os.stat(target).st_ino

        _install(project)  # simulates the auto-update re-install
        inode_after = os.stat(target).st_ino

        assert inode_before != inode_after, (
            "check-update.sh kept the same inode across re-install: it was "
            "rewritten in place, which corrupts a copy of itself that is "
            "still running (the auto-update path). Replace via temp + mv."
        )


def test_running_script_survives_install_replacing_it():
    """End-to-end proof of the real hazard: a script that invokes install.sh
    (which rewrites that very script) must still execute its own remaining
    lines afterward, silently and with exit 0."""
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "proj"
        _install(project)

        scripts_dir = project / ".specify" / "presets" / "tradestation-sdd" / "scripts"
        victim = scripts_dir / "check-update.sh"

        # Stand-in for check-update.sh's real shape: do work, trigger the
        # re-install that overwrites this file, then keep going. Written INTO
        # the same directory install.sh rewrites, under the same name, so the
        # replacement genuinely targets the running file.
        victim.write_text(
            "#!/usr/bin/env bash\n"
            "set -u\n"
            "trap 'exit 0' ERR\n"
            "echo PHASE-1\n"
            f"bash {REPO_ROOT / 'install.sh'} \"$1\" --ai claude >/dev/null 2>&1\n"
            "echo PHASE-2\n"
            "echo PHASE-3\n"
        )
        os.chmod(victim, 0o755)

        r = subprocess.run(["bash", str(victim), str(project)],
                           capture_output=True, text=True)

        assert r.returncode == 0, (
            f"running script died (rc={r.returncode}) after install.sh "
            f"replaced it. stderr: {r.stderr}"
        )
        assert not r.stderr.strip(), (
            f"running script emitted stderr after being replaced: {r.stderr!r}"
        )
        out = r.stdout.split()
        assert out == ["PHASE-1", "PHASE-2", "PHASE-3"], (
            f"running script did not finish its own body after being "
            f"replaced; got {out!r}. This is the day-1 auto-update failure."
        )
