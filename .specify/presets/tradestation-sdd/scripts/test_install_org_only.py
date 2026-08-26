# scripts/test_install_org_only.py
#
# A project that has only ever run install.sh (no --team flag -- retired --
# and no add-preset.sh/add-bundle.sh) must have zero capability-preset or
# bundle artifacts. Proves install.sh's org-baseline behavior is unchanged
# and the capability system is fully opt-in.
import json
import pathlib
import subprocess

REPO = pathlib.Path(__file__).resolve().parent.parent
INSTALL = REPO / "install.sh"


def test_org_only_install_has_no_capability_or_bundle_artifacts(tmp_path):
    project = tmp_path / "proj"
    (project / ".specify").mkdir(parents=True)
    r = subprocess.run(["bash", str(INSTALL), str(project), "--ai", "claude"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr

    presets_dir = project / ".specify" / "presets"
    entries = {p.name for p in presets_dir.iterdir() if p.is_dir()}
    assert entries == {"tradestation-sdd"}

    registry = json.loads((presets_dir / ".registry").read_text())
    assert set(registry["presets"].keys()) == {"tradestation-sdd"}
    assert "team" not in registry


def test_install_sh_no_longer_accepts_team_flag():
    src = INSTALL.read_text()
    assert "--team" not in src
    assert "add-team-preset.sh" not in src
