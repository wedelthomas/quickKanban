import subprocess
from pathlib import Path
REPO = Path(__file__).resolve().parent.parent
TOOL = REPO / "scripts" / "detect-customizations.sh"

def _install_clean(tmp_path, ai="claude"):
    """Install the preset into a minimal target, return target path."""
    t = tmp_path / "proj"
    (t / ".specify" / "scripts" / "bash").mkdir(parents=True)
    (t / ".specify" / "templates").mkdir(parents=True)
    (t / ".specify" / "scripts" / "bash" / "common.sh").write_text("# stub\n")
    subprocess.run(["bash", str(REPO / "install.sh"), str(t), "--ai", ai],
                   capture_output=True, text=True, cwd=str(REPO), check=True)
    return t

def _run(target, *args):
    return subprocess.run(["bash", str(TOOL), str(target), *args], capture_output=True, text=True)

def test_clean_project_exit_zero(tmp_path):
    t = _install_clean(tmp_path)
    r = _run(t); assert r.returncode == 0, r.stdout + r.stderr
    assert "none detected" in r.stdout

def test_edited_template_flagged(tmp_path):
    t = _install_clean(tmp_path)
    (t / ".specify/presets/tradestation-sdd/templates/plan-addendum.md").write_text("HACKED\n")
    r = _run(t); assert r.returncode != 0
    assert "locally edited" in r.stdout

def test_team_added_file_flagged(tmp_path):
    t = _install_clean(tmp_path)
    (t / ".specify/presets/tradestation-sdd/templates/team-extra.md").write_text("x\n")
    r = _run(t); assert r.returncode != 0
    assert "team-added" in r.stdout

def test_orphan_skill_flagged(tmp_path):
    t = _install_clean(tmp_path)
    d = t / ".claude/skills/speckit-plan"; d.mkdir(parents=True)
    (d / "SKILL.md").write_text("x\n")
    r = _run(t); assert r.returncode != 0
    assert "rm -rf" in r.stdout

def test_override_reported_safe_not_risk(tmp_path):
    t = _install_clean(tmp_path)
    od = t / ".specify/templates/overrides"; od.mkdir(parents=True)
    (od / "plan-template.md").write_text("my override\n")
    r = _run(t)
    assert "override (survives, wins)" in r.stdout
    assert r.returncode == 0            # an override alone is SAFE, not a risk

def test_backup_apply_snapshots(tmp_path):
    t = _install_clean(tmp_path)
    r = _run(t, "--backup", "--apply")
    backups = list((t / ".sdd-backups").glob("*/.specify"))
    assert backups, r.stdout + r.stderr
    # originals intact
    assert (t / ".specify/presets/tradestation-sdd/preset.yml").is_file()

def test_non_preset_core_command_not_flagged(tmp_path):
    """A plain-file core command the preset does NOT provide is not a symlink risk."""
    t = _install_clean(tmp_path)
    # a core command the preset does not ship (no clone-baseline commands/ entry)
    (t / ".claude/commands/speckit.clarify.md").write_text("core clarify command\n")
    r = _run(t)
    assert "speckit.clarify.md" not in r.stdout      # not flagged
    assert r.returncode == 0                          # no other risk => clean

def test_hijacked_command_content_not_flagged_known_gap(tmp_path):
    """Commands are composed/materialized real files now (docs/superpowers/specs/
    2026-07-28-multirepo-preset-architecture-design.md §4a), not symlinks to a
    single preset's raw file -- there's no longer a symlink-vs-plain-file
    distinction to check, so a locally-edited materialized command is
    currently NOT detected as a risk here. This is a known, accepted gap
    (not a silent regression): catching drift in materialized content would
    require re-resolving and diffing against what a fresh install would
    produce, which is out of scope for the composition change itself.
    """
    t = _install_clean(tmp_path)
    cmd = t / ".claude/commands/speckit.plan.md"       # preset provides plan
    cmd.write_text("hijacked\n")
    r = _run(t)
    assert "speckit.plan.md" not in r.stdout
    assert r.returncode == 0

def test_edited_copilot_agent_flagged(tmp_path):
    """Category 5: an edited installed copilot agent is flagged (run from the clone)."""
    t = _install_clean(tmp_path, ai="both")
    agents = sorted((t / ".github" / "agents").glob("speckit.*.agent.md"))
    assert agents, "install --ai both should have placed copilot agents"
    agents[0].write_text(agents[0].read_text() + "\nEDITED\n")
    r = _run(t)                       # _run invokes the CLONE copy (correct baseline)
    assert "edited copilot agent" in r.stdout
    assert r.returncode != 0

def test_installed_copy_resolves_baseline_from_meta(tmp_path):
    """Fix A: the in-project copy resolves the real baseline via .install-meta.json."""
    import subprocess as sp
    t = _install_clean(tmp_path)      # installs preset; stamps .install-meta.json (source_clone=REPO)
    tmpl = t / ".specify/presets/tradestation-sdd/templates/plan-addendum.md"
    tmpl.write_text(tmpl.read_text() + "\nEDITED\n")
    installed_copy = t / ".specify/presets/tradestation-sdd/scripts/detect-customizations.sh"
    r = sp.run(["bash", str(installed_copy), str(t)], capture_output=True, text=True)
    assert "locally edited" in r.stdout          # baseline resolved -> edit detected
    assert r.returncode == 1
