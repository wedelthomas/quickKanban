# scripts/test_check_update.py
import json
import os
import pathlib
import shutil
import subprocess
import time

import pytest

SCRIPT = pathlib.Path(__file__).with_name("check-update.sh")
META_REL = ".specify/presets/tradestation-sdd/.install-meta.json"


def _git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _commit(repo, fname, content, msg):
    (repo / fname).write_text(content)
    _git(repo, "add", "-A")
    _git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", msg)


def _sha(repo):
    return subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"],
                          capture_output=True, text=True).stdout.strip()


@pytest.fixture
def world(tmp_path):
    """A fake remote, a clone of it, and a project installed from the clone."""
    remote = tmp_path / "remote.git"
    # -b main makes this independent of the host's init.defaultBranch config
    # (AIP-238) -- without it, a bare repo's HEAD symref can point at a
    # branch the seed/clone side (which always pushes to "main") never fills.
    _git(tmp_path, "init", "--bare", "-b", "main", str(remote))

    seed = tmp_path / "seed"
    seed.mkdir()
    _git(seed, "init", "-b", "main")
    # Minimal install.sh in the clone that records what it was asked to install.
    _commit(seed, "install.sh",
            '#!/usr/bin/env bash\nset -euo pipefail\n'
            'TARGET="${1:?}"\n'
            'echo "$(git -C "$(dirname "$0")" rev-parse HEAD)" > "$TARGET/.installed-from"\n',
            "seed")
    _git(seed, "remote", "add", "origin", str(remote))
    _git(seed, "push", "-u", "origin", "main")

    clone = tmp_path / "clone"
    _git(tmp_path, "clone", str(remote), str(clone))

    project = tmp_path / "project"
    (project / ".specify/presets/tradestation-sdd").mkdir(parents=True)

    def write_meta(installed_sha=None, last_check_epoch=0):
        meta = {
            "source_clone": str(clone),
            "installed_sha": installed_sha if installed_sha is not None else _sha(clone),
            "last_check": last_check_epoch,
        }
        (project / META_REL).write_text(json.dumps(meta))

    return dict(remote=remote, seed=seed, clone=clone, project=project,
                write_meta=write_meta)


def _run(project, env_extra=None):
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    return subprocess.run(["bash", str(SCRIPT), str(project)],
                          capture_output=True, text=True, env=env)


def _meta(project):
    return json.loads((project / META_REL).read_text())


def test_missing_meta_is_noop(tmp_path):
    bare = tmp_path / "noproj"
    bare.mkdir()
    r = _run(bare)
    assert r.returncode == 0
    assert r.stdout == ""


def test_disabled_exits_immediately(world):
    world["write_meta"](installed_sha="deadbeef", last_check_epoch=0)
    r = _run(world["project"], {"SDD_UPDATE_DISABLE": "1"})
    assert r.returncode == 0
    # installed_sha untouched -> no re-install attempted
    assert _meta(world["project"])["installed_sha"] == "deadbeef"


def test_within_throttle_window_skips(world):
    world["write_meta"](installed_sha="deadbeef", last_check_epoch=int(time.time()))
    r = _run(world["project"])
    assert r.returncode == 0
    assert _meta(world["project"])["installed_sha"] == "deadbeef"


def test_clone_behind_remote_pulls_and_reinstalls(world):
    # Project is in sync with the clone's current HEAD...
    world["write_meta"]()
    # ...but the remote moves ahead.
    _commit(world["seed"], "new.txt", "x", "advance")
    _git(world["seed"], "push", "origin", "main")
    new_sha = _sha(world["seed"])

    r = _run(world["project"])
    assert r.returncode == 0
    # clone fast-forwarded
    assert _sha(world["clone"]) == new_sha
    # re-install ran (install.sh wrote .installed-from)
    assert (world["project"] / ".installed-from").read_text().strip() == new_sha
    # meta updated to new sha and last_check advanced
    m = _meta(world["project"])
    assert m["installed_sha"] == new_sha
    assert float(m["last_check"]) > 0


def test_in_sync_does_not_reinstall(world):
    world["write_meta"]()  # installed_sha == clone HEAD, remote unchanged
    r = _run(world["project"])
    assert r.returncode == 0
    assert not (world["project"] / ".installed-from").exists()


def test_offline_fetch_failure_is_silent_but_throttle_written(world):
    world["write_meta"](installed_sha="deadbeef", last_check_epoch=0)
    # Break the remote so fetch fails.
    _git(world["clone"], "remote", "set-url", "origin", str(world["clone"]) + "/nope.git")
    r = _run(world["project"])
    assert r.returncode == 0
    assert r.stdout == ""
    # throttle timestamp was written despite the failure
    assert float(_meta(world["project"])["last_check"]) > 0


def test_nonnumeric_window_is_silent(world):
    world["write_meta"](installed_sha="deadbeef", last_check_epoch=int(time.time()) - 10)
    r = _run(world["project"], {"SDD_UPDATE_WINDOW_HOURS": "abc"})
    assert r.returncode == 0
    assert r.stderr == ""


def test_dirty_clone_skips_pull_no_clobber(world):
    world["write_meta"]()
    _commit(world["seed"], "new.txt", "x", "advance")
    _git(world["seed"], "push", "origin", "main")
    # Make the clone dirty.
    (world["clone"] / "dirty.txt").write_text("uncommitted")
    before = _sha(world["clone"])
    r = _run(world["project"])
    assert r.returncode == 0
    # clone HEAD unchanged (no pull), working file preserved
    assert _sha(world["clone"]) == before
    assert (world["clone"] / "dirty.txt").read_text() == "uncommitted"


@pytest.fixture
def notice_project(tmp_path):
    """A minimal project + a minimal local "clone" dir (no git needed --
    update_capability_notice only reads source_clone and calls
    list-capabilities.sh from it, it never fetches/pulls) with one fake
    capability preset, for testing the capability-notice step in
    isolation from the per-entry git-fetch/throttle mechanics the other
    tests in this file exercise via the `world` fixture's fake remote."""
    clone = tmp_path / "clone"
    (clone / "capability-presets" / "fake-cap").mkdir(parents=True)
    (clone / "capability-presets" / "fake-cap" / "preset.yml").write_text(
        'preset:\n  id: "fake-cap"\n  name: "Fake Capability"\n'
        '  description: "For testing."\n'
    )
    (clone / "bundles").mkdir()
    (clone / "scripts").mkdir()
    shutil.copy(SCRIPT.parent / "list-capabilities.sh", clone / "scripts" / "list-capabilities.sh")
    (clone / "scripts" / "list-capabilities.sh").chmod(0o755)
    shutil.copy(SCRIPT.parent / "_portable.sh", clone / "scripts" / "_portable.sh")

    project = tmp_path / "project"
    (project / ".specify/presets/tradestation-sdd").mkdir(parents=True)
    (project / META_REL).write_text(json.dumps({
        "source_clone": str(clone),
        "installed_sha": "n/a",
        "last_check": 0,
    }))
    return project


def _notice_path(project):
    return project / ".specify" / "presets" / "tradestation-sdd" / ".capability-notice.json"


def test_writes_capability_notice_with_available_count(notice_project):
    r = _run(notice_project, {"SDD_UPDATE_WINDOW_HOURS": "0"})
    assert r.returncode == 0
    notice_path = _notice_path(notice_project)
    assert notice_path.is_file()
    notice = json.loads(notice_path.read_text())
    assert notice["available_count"] == 1  # the one fake-cap preset, uninstalled
    assert notice["dismissed"] is False
    assert notice["last_checked"] > 0


def test_capability_notice_preserves_dismissed_across_runs(notice_project):
    notice_path = _notice_path(notice_project)
    notice_path.write_text(json.dumps(
        {"available_count": 99, "dismissed": True, "last_checked": 1}))
    r = _run(notice_project, {"SDD_UPDATE_WINDOW_HOURS": "0"})
    assert r.returncode == 0
    notice = json.loads(notice_path.read_text())
    assert notice["dismissed"] is True  # preserved, not reset
    assert notice["available_count"] == 1  # recomputed fresh, not left at 99


def test_check_update_works_without_python3(world, tmp_path):
    """Simulates the Windows case: only `python` (not `python3`) on PATH.
    A curated bin dir exposes exactly the external tools check-update.sh and
    _portable.sh need, plus a `python` shim. If any stray `python3` literal
    remained, meta I/O would silently fail and no reinstall would happen."""
    world["write_meta"]()
    _commit(world["seed"], "new.txt", "x", "advance")
    _git(world["seed"], "push", "origin", "main")
    new_sha = _sha(world["seed"])

    bindir = tmp_path / "curated-bin"
    bindir.mkdir()
    for tool in ("bash", "git", "date", "uname", "dirname"):
        src = shutil.which(tool)
        assert src, f"required tool not found on host: {tool}"
        os.symlink(src, bindir / tool)
    py3 = shutil.which("python3")
    assert py3
    (bindir / "python").write_text(f'#!/bin/sh\nexec "{py3}" "$@"\n')
    (bindir / "python").chmod(0o755)

    env = dict(os.environ)
    env["PATH"] = str(bindir)

    # Sanity: python3 really is absent from this PATH (bash's view).
    seen = subprocess.run([str(bindir / "bash"), "-c",
                           "command -v python3 || true"],
                          capture_output=True, text=True, env=env)
    assert seen.stdout.strip() == ""

    r = subprocess.run([str(bindir / "bash"), str(SCRIPT), str(world["project"])],
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0
    assert (world["project"] / ".installed-from").read_text().strip() == new_sha
    assert _meta(world["project"])["installed_sha"] == new_sha
