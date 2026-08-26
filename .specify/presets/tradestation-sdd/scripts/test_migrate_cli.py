import os
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MIGRATE = REPO / "scripts" / "migrate-cli.sh"

def _fake_uv(bindir, calls):
    """Fake `uv`: logs its argv to `calls`, stubs `uv tool list`."""
    bindir.mkdir(parents=True, exist_ok=True)
    uv = bindir / "uv"
    uv.write_text(
        "#!/usr/bin/env bash\n"
        f'printf "%s\\n" "$*" >> "{calls}"\n'
        'if [ "$1 $2" = "tool list" ]; then echo "specify-cli v0.5.0"; fi\n'
        "exit 0\n")
    uv.chmod(0o755)

def _fake_uv_no_speckit(bindir, calls):
    """Fake uv where `uv tool list` succeeds but lists no specify-cli."""
    bindir.mkdir(parents=True, exist_ok=True)
    uv = bindir / "uv"
    uv.write_text(
        "#!/usr/bin/env bash\n"
        f'printf "%s\\n" "$*" >> "{calls}"\n'
        'if [ "$1 $2" = "tool list" ]; then echo "ruff v0.1.0"; fi\n'
        "exit 0\n")
    uv.chmod(0o755)

def test_runs_when_speckit_not_in_uv_list(tmp_path):
    bindir = tmp_path / "bin"; calls = tmp_path / "calls.txt"; calls.write_text("")
    _fake_uv_no_speckit(bindir, calls)
    env = dict(os.environ, PATH=f"{bindir}:{os.environ['PATH']}", HOME=str(tmp_path))
    r = subprocess.run(["bash", str(MIGRATE)], input="n\n", capture_output=True, text=True, env=env)
    assert r.returncode == 0                          # no set -e abort
    assert "current : unknown" in r.stdout            # fallback fired
    assert "spec-kit.git@v0.5.0" in r.stdout          # rollback still shown
    assert "Aborted" in r.stdout

def _fake_uv_at_target(bindir, calls):
    """Fake uv where `uv tool list` reports specify-cli already at the target."""
    bindir.mkdir(parents=True, exist_ok=True)
    uv = bindir / "uv"
    uv.write_text(
        "#!/usr/bin/env bash\n"
        f'printf "%s\\n" "$*" >> "{calls}"\n'
        'if [ "$1 $2" = "tool list" ]; then echo "specify-cli v0.12.8"; fi\n'
        "exit 0\n")
    uv.chmod(0o755)

def test_already_on_target_short_circuits(tmp_path):
    bindir = tmp_path / "bin"; calls = tmp_path / "calls.txt"; calls.write_text("")
    _fake_uv_at_target(bindir, calls)
    env = dict(os.environ, PATH=f"{bindir}:{os.environ['PATH']}", HOME=str(tmp_path))
    # No stdin: were it to prompt, `read` would hit EOF — but it must exit first.
    r = subprocess.run(["bash", str(MIGRATE)], input="", capture_output=True, text=True, env=env)
    logged = calls.read_text()
    assert r.returncode == 0
    assert "Already on the target version" in r.stdout
    assert "Proceed with the upgrade?" not in r.stdout          # no prompt
    assert "tool uninstall" not in logged and "tool install" not in logged

def test_already_on_target_ignores_yes(tmp_path):
    # --yes must not force a reinstall of the same version.
    bindir = tmp_path / "bin"; calls = tmp_path / "calls.txt"; calls.write_text("")
    _fake_uv_at_target(bindir, calls)
    env = dict(os.environ, PATH=f"{bindir}:{os.environ['PATH']}", HOME=str(tmp_path))
    r = subprocess.run(["bash", str(MIGRATE), "--yes"], capture_output=True, text=True, env=env)
    assert r.returncode == 0
    assert "Already on the target version" in r.stdout
    assert "tool install" not in calls.read_text()

def _run(tmp_path, *args, answer=None):
    bindir = tmp_path / "bin"; calls = tmp_path / "calls.txt"; calls.write_text("")
    _fake_uv(bindir, calls)
    env = dict(os.environ, PATH=f"{bindir}:{os.environ['PATH']}", HOME=str(tmp_path))
    r = subprocess.run(["bash", str(MIGRATE), *args], input=answer,
                       capture_output=True, text=True, env=env)
    return r, calls.read_text()

def test_declining_makes_zero_changes(tmp_path):
    r, calls = _run(tmp_path, answer="n\n")
    assert r.returncode == 0
    assert "Aborted" in r.stdout
    assert "tool uninstall" not in calls and "tool install" not in calls

def test_empty_answer_declines(tmp_path):
    r, calls = _run(tmp_path, answer="\n")
    assert r.returncode == 0 and "tool install" not in calls

def test_yes_upgrades_to_target(tmp_path):
    r, calls = _run(tmp_path, "--yes")
    assert r.returncode == 0
    assert "tool uninstall specify-cli" in calls
    assert "spec-kit.git@v0.12.8" in calls
    assert (tmp_path / ".sdd-cli-prev-version").read_text().strip() == "0.5.0"

def test_rollback_command_printed(tmp_path):
    r, _ = _run(tmp_path, answer="n\n")
    assert "spec-kit.git@v0.5.0" in r.stdout          # rollback target shown before prompt

def test_only_migrate_cli_installs_the_cli():
    # B2: the self-update / install path must never upgrade the global CLI.
    assert "uv tool install specify-cli" not in (REPO / "scripts" / "check-update.sh").read_text()
    assert "uv tool install specify-cli" not in (REPO / "install.sh").read_text()
    assert "uv tool install specify-cli" in MIGRATE.read_text()
