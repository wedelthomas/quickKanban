# scripts/test_check_update_multi_entry.py
#
# check-update.sh loops over every installed entry (org, each preset, each
# bundle) instead of only the org baseline. A meta file with no "kind"
# field defaults to "org" for backward compatibility with already-installed
# projects. test_check_update.py (untouched) proves the single-org-entry
# case still behaves identically; this file proves the multi-entry loop and
# per-kind dispatch on top of that.
import json
import pathlib
import subprocess

import pytest

SCRIPT = pathlib.Path(__file__).with_name("check-update.sh")


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
    """One shared remote/clone (org, presets, and bundles all come from the
    same sdd-preset clone in real life) with fake installers that each just
    record what they were asked to do, so assertions can check dispatch
    without needing the real capability-presets/bundles machinery."""
    remote = tmp_path / "remote.git"
    # -b main makes this independent of the host's init.defaultBranch config
    # (AIP-238) -- without it, a bare repo's HEAD symref can point at a
    # branch the seed/clone side (which always pushes to "main") never fills.
    _git(tmp_path, "init", "--bare", "-b", "main", str(remote))

    seed = tmp_path / "seed"
    seed.mkdir()
    _git(seed, "init", "-b", "main")
    (seed / "scripts").mkdir()
    (seed / "install.sh").write_text(
        '#!/usr/bin/env bash\nset -euo pipefail\n'
        'TARGET="${1:?}"\n'
        'echo "org:$(git -C "$(dirname "$0")" rev-parse HEAD)" >> "$TARGET/.calls"\n')
    (seed / "scripts" / "add-preset.sh").write_text(
        '#!/usr/bin/env bash\nset -euo pipefail\n'
        'ID="$1"; TARGET="$2"; shift 2\n'
        'PRIO=""\n'
        'while [ $# -gt 0 ]; do\n'
        '  case "$1" in\n'
        '    --priority) PRIO="$2"; shift 2 ;;\n'
        '    --source) shift 2 ;;\n'
        '    *) shift ;;\n'
        '  esac\n'
        'done\n'
        'echo "preset:$ID:priority=$PRIO" >> "$TARGET/.calls"\n')
    (seed / "scripts" / "add-bundle.sh").write_text(
        '#!/usr/bin/env bash\nset -euo pipefail\n'
        'ID="$1"; TARGET="$2"\n'
        'echo "bundle:$ID" >> "$TARGET/.calls"\n')
    _git(seed, "add", "-A")
    _git(seed, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "fake installers")
    _git(seed, "remote", "add", "origin", str(remote))
    _git(seed, "push", "-u", "origin", "main")

    clone = tmp_path / "clone"
    _git(tmp_path, "clone", str(remote), str(clone))

    project = tmp_path / "project"
    presets_dir = project / ".specify" / "presets"
    for entry in ("tradestation-sdd", "widget", "mybundle"):
        (presets_dir / entry).mkdir(parents=True)

    def write_meta(entry, kind, installed_sha, priority=None):
        meta = {"source_clone": str(clone), "installed_sha": installed_sha, "last_check": 0}
        if kind is not None:
            meta["kind"] = kind
        (presets_dir / entry / ".install-meta.json").write_text(json.dumps(meta))
        if priority is not None:
            registry_path = presets_dir / ".registry"
            registry = {"presets": {}}
            if registry_path.exists():
                registry = json.loads(registry_path.read_text())
            registry["presets"][entry] = {"priority": priority, "name": entry}
            registry_path.write_text(json.dumps(registry))

    return dict(remote=remote, seed=seed, clone=clone, project=project, write_meta=write_meta)


def _run(project):
    return subprocess.run(["bash", str(SCRIPT), str(project)], capture_output=True, text=True)


def _calls(project):
    f = project / ".calls"
    return f.read_text().splitlines() if f.exists() else []


def test_only_stale_entry_reinstalls(world):
    current = _sha(world["clone"])
    world["write_meta"]("tradestation-sdd", None, current)          # no "kind" -> org, up to date
    world["write_meta"]("widget", "preset", current, priority=0)    # up to date
    world["write_meta"]("mybundle", "bundle", "deadbeef")           # stale

    r = _run(world["project"])
    assert r.returncode == 0, r.stderr
    assert _calls(world["project"]) == ["bundle:mybundle"]

    metas = {
        e: json.loads((world["project"] / ".specify" / "presets" / e / ".install-meta.json").read_text())
        for e in ("tradestation-sdd", "widget", "mybundle")
    }
    assert metas["tradestation-sdd"]["installed_sha"] == current
    assert metas["widget"]["installed_sha"] == current
    assert metas["mybundle"]["installed_sha"] == current


def test_missing_kind_defaults_to_org(world):
    world["write_meta"]("tradestation-sdd", None, "deadbeef")  # stale, no kind field at all
    r = _run(world["project"])
    assert r.returncode == 0, r.stderr
    assert _calls(world["project"]) == [f"org:{_sha(world['clone'])}"]


def test_preset_reinstall_passes_its_registered_priority(world):
    world["write_meta"]("widget", "preset", "deadbeef", priority=3)
    r = _run(world["project"])
    assert r.returncode == 0, r.stderr
    assert _calls(world["project"]) == ["preset:widget:priority=3"]


def test_one_entrys_failure_does_not_block_another(world):
    # "widget" points at a clone that doesn't exist -> its check fails silently...
    (world["project"] / ".specify" / "presets" / "widget" / ".install-meta.json").write_text(json.dumps({
        "source_clone": str(world["project"] / "nope"),
        "installed_sha": "deadbeef", "last_check": 0, "kind": "preset"}))
    # ...while "mybundle" (real, valid clone) still updates normally.
    world["write_meta"]("mybundle", "bundle", "deadbeef")

    r = _run(world["project"])
    assert r.returncode == 0, r.stderr
    assert _calls(world["project"]) == ["bundle:mybundle"]
