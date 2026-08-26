import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent          # preset repo root
INSTALL = REPO / "install.sh"

ANCHOR = '    cp "$TEMPLATE" "$IMPL_PLAN"'
SETUP_PLAN_STUB = f"""#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${{BASH_SOURCE[0]}}")" && pwd)"
source "$SCRIPT_DIR/common.sh"
TEMPLATE="x"; IMPL_PLAN="y"; REPO_ROOT="z"
if [[ -n "$TEMPLATE" ]]; then
{ANCHOR}
    echo done
fi
"""


def _make_target(tmp_path):
    """Minimal speckit-looking project so install.sh proceeds."""
    t = tmp_path / "target"
    (t / ".specify" / "scripts" / "bash").mkdir(parents=True)
    (t / ".specify" / "templates").mkdir(parents=True)
    (t / ".specify" / "scripts" / "bash" / "common.sh").write_text("# stub\n")
    (t / ".specify" / "scripts" / "bash" / "setup-plan.sh").write_text(SETUP_PLAN_STUB)
    return t


def _install(target, *extra):
    return subprocess.run(["bash", str(INSTALL), str(target), "--ai", "claude", *extra],
                          capture_output=True, text=True, cwd=str(REPO))


def test_plain_install_proceeds_on_risk(tmp_path):
    # self-update safety: risk present must NOT block a plain install
    t = _make_target(tmp_path)
    assert _install(t).returncode == 0                       # first install
    # introduce risk: edit an installed template
    (t / ".specify/presets/tradestation-sdd/templates/plan-addendum.md").write_text("EDITED\n")
    r = _install(t)                                          # plain re-install
    assert r.returncode == 0                                 # proceeds (advisory only)

def test_check_refuses_on_risk_without_force(tmp_path):
    t = _make_target(tmp_path)
    assert _install(t).returncode == 0
    (t / ".specify/presets/tradestation-sdd/templates/plan-addendum.md").write_text("EDITED\n")
    r = _install(t, "--check")
    assert r.returncode != 0
    assert "at-risk" in (r.stdout + r.stderr).lower()

def test_check_with_force_proceeds(tmp_path):
    t = _make_target(tmp_path)
    assert _install(t).returncode == 0
    (t / ".specify/presets/tradestation-sdd/templates/plan-addendum.md").write_text("EDITED\n")
    r = _install(t, "--check", "--force")
    assert r.returncode == 0


def test_install_copies_manifest_and_scripts(tmp_path):
    t = _make_target(tmp_path)
    r = _install(t); assert r.returncode == 0, r.stderr
    preset = t / ".specify" / "presets" / "tradestation-sdd"
    assert (preset / "preset.yml").is_file()
    assert (preset / "scripts" / "render-template.sh").is_file()
    assert (preset / "scripts" / "render-lib.sh").is_file()


def test_install_patches_setup_plan_reversibly(tmp_path):
    t = _make_target(tmp_path)
    r = _install(t); assert r.returncode == 0, r.stderr
    sp = t / ".specify" / "scripts" / "bash" / "setup-plan.sh"
    body = sp.read_text()
    assert "BEGIN tradestation-sdd (composition)" in body
    assert "render-template.sh" in body
    assert '"plan-template"' in body                            # composes the right template
    assert '> "$IMPL_PLAN"' in body                             # writes to the right dest var
    assert (sp.parent / "setup-plan.sh.pre-sdd").is_file()      # backup kept
    assert ANCHOR in (sp.parent / "setup-plan.sh.pre-sdd").read_text()  # original intact


def test_install_is_idempotent(tmp_path):
    t = _make_target(tmp_path)
    assert _install(t).returncode == 0
    sp = t / ".specify" / "scripts" / "bash" / "setup-plan.sh"
    first = sp.read_text()
    assert _install(t).returncode == 0
    assert sp.read_text() == first                              # no double-patch


def test_install_fail_open_when_no_anchor(tmp_path):
    t = _make_target(tmp_path)
    sp = t / ".specify" / "scripts" / "bash" / "setup-plan.sh"
    sp.write_text("#!/usr/bin/env bash\nsource \"$SCRIPT_DIR/common.sh\"\necho hi\n")
    r = _install(t)
    assert r.returncode == 0                                    # install still succeeds
    assert "BEGIN tradestation-sdd (composition)" not in sp.read_text()
    assert "left unchanged" in (r.stdout + r.stderr)


CNF_ANCHOR = '    cp "$TEMPLATE" "$SPEC_FILE"'
CNF_STUB = f"""#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${{BASH_SOURCE[0]}}")" && pwd)"
source "$SCRIPT_DIR/common.sh"
TEMPLATE="x"; SPEC_FILE="y"; REPO_ROOT="z"
if [[ -n "$TEMPLATE" ]]; then
{CNF_ANCHOR}
    echo done
fi
"""

def _add_cnf(target):
    (target / ".specify" / "scripts" / "bash" / "create-new-feature.sh").write_text(CNF_STUB)

def test_install_patches_create_new_feature(tmp_path):
    t = _make_target(tmp_path); _add_cnf(t)
    r = _install(t); assert r.returncode == 0, r.stderr
    cnf = t / ".specify" / "scripts" / "bash" / "create-new-feature.sh"
    body = cnf.read_text()
    assert "BEGIN tradestation-sdd (composition)" in body
    assert "render-template.sh" in body                   # the _sdd_render path line
    assert '"spec-template"' in body                       # passed as the template name
    assert '> "$SPEC_FILE"' in body                       # writes to the right dest var
    assert (cnf.parent / "create-new-feature.sh.pre-sdd").is_file()

def test_install_cnf_idempotent(tmp_path):
    t = _make_target(tmp_path); _add_cnf(t)
    assert _install(t).returncode == 0
    cnf = t / ".specify" / "scripts" / "bash" / "create-new-feature.sh"
    first = cnf.read_text()
    assert _install(t).returncode == 0
    assert cnf.read_text() == first


import os as _os

def _fake_uv(bindir, version):
    """Put a fake `uv` on PATH that reports `specify-cli v<version>` for `uv tool list`."""
    bindir.mkdir(parents=True, exist_ok=True)
    uv = bindir / "uv"
    uv.write_text(
        "#!/usr/bin/env bash\n"
        'if [ "$1 $2" = "tool list" ]; then echo "specify-cli v%s"; fi\n'
        "exit 0\n" % version)
    uv.chmod(0o755)

def _install_with_uv(target, version):
    bindir = target.parent / "fakebin"
    _fake_uv(bindir, version)
    env = dict(_os.environ, PATH=f"{bindir}:{_os.environ['PATH']}")
    return subprocess.run(["bash", str(INSTALL), str(target), "--ai", "claude"],
                          capture_output=True, text=True, cwd=str(REPO), env=env)

def test_install_advises_when_cli_below_target(tmp_path):
    t = _make_target(tmp_path)
    r = _install_with_uv(t, "0.5.0")
    assert r.returncode == 0                                  # advisory NEVER blocks
    # match the advisory's distinctive line, not the bare filename (migrate-cli.sh
    # also appears in install.sh's "Scripts installed" listing once it exists).
    assert "NOTE: specify CLI is" in (r.stdout + r.stderr)    # nudged toward the upgrade

def test_install_no_advisory_at_target(tmp_path):
    t = _make_target(tmp_path)
    r = _install_with_uv(t, "0.12.8")
    assert r.returncode == 0
    assert "NOTE: specify CLI is" not in (r.stdout + r.stderr)  # already on target -> quiet
