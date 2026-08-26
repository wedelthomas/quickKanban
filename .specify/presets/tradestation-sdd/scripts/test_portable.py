# scripts/test_portable.py
import os
import shutil
import subprocess
from pathlib import Path

HELPER = Path(__file__).with_name("_portable.sh")
BASH = shutil.which("bash") or "/bin/bash"


def _run(script, env_extra=None, path=None):
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    if path is not None:
        env["PATH"] = path
    return subprocess.run([BASH, "-c", script], capture_output=True,
                          text=True, env=env)


def _fake_interp(d: Path, name: str):
    """A fake interpreter that prints exactly 'INTERP=<name>' and ignores args."""
    p = d / name
    p.write_text(f'#!/bin/sh\necho "INTERP={name}"\n')
    p.chmod(0o755)


def test_helper_file_exists():
    assert HELPER.is_file()


def test_sdd_py_prefers_python3(tmp_path):
    _fake_interp(tmp_path, "python3")
    _fake_interp(tmp_path, "python")
    r = _run(f'. "{HELPER}"; sdd_py -c ignored', path=str(tmp_path))
    assert r.stdout.strip() == "INTERP=python3"


def test_sdd_py_falls_back_to_python(tmp_path):
    _fake_interp(tmp_path, "python")  # no python3 on PATH
    r = _run(f'. "{HELPER}"; sdd_py -c ignored', path=str(tmp_path))
    assert r.stdout.strip() == "INTERP=python"


def test_sdd_py_falls_back_to_py_launcher(tmp_path):
    _fake_interp(tmp_path, "py")  # only the Windows `py` launcher
    r = _run(f'. "{HELPER}"; sdd_py -c ignored', path=str(tmp_path))
    # Confirms `py` is selected; the `-3` flag is not verified here because the
    # fake interpreter ignores all args (faking `py -3` behavior is impractical).
    assert r.stdout.strip() == "INTERP=py"


def test_sdd_winpath_is_noop_without_msystem():
    r = _run(f'unset MSYSTEM; . "{HELPER}"; sdd_winpath /c/Users/x/file.json')
    assert r.stdout == "/c/Users/x/file.json"  # no trailing newline (printf)


def test_sdd_is_windows_false_on_posix():
    r = _run(f'unset MSYSTEM OS; . "{HELPER}"; '
             f'sdd_is_windows && echo WIN || echo POSIX')
    assert r.stdout.strip() == "POSIX"


def test_sdd_is_windows_true_under_mingw():
    r = _run(f'MSYSTEM=MINGW64; . "{HELPER}"; '
             f'sdd_is_windows && echo WIN || echo POSIX')
    assert r.stdout.strip() == "WIN"


def test_sdd_py_forwards_args_with_spaces(tmp_path):
    p = tmp_path / "python3"
    p.write_text('#!/bin/sh\nfor a in "$@"; do echo "ARG=[$a]"; done\n')
    p.chmod(0o755)
    r = _run(f'. "{HELPER}"; sdd_py -c "a b" second', path=str(tmp_path))
    assert "ARG=[-c]" in r.stdout
    assert "ARG=[a b]" in r.stdout   # the space-containing arg stayed one token
    assert "ARG=[second]" in r.stdout
