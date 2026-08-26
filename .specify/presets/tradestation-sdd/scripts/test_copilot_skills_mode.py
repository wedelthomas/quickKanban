# scripts/test_copilot_skills_mode.py
#
# AIP-247. install.sh's Copilot block only ever wrote the legacy
# .github/agents/ + .github/prompts/ surface, never .github/skills/ -- so
# in Copilot skills mode (specify init --integration-options="--skills"),
# TS-exclusive commands (doctor, verify-spec, review, feedback,
# capabilities -- no core skill counterpart) never surfaced as top-level
# /speckit-<name> commands like core's own speckit-plan/speckit-specify/etc
# do; they were only reachable as nested agents via /agent speckit.doctor.
#
# Detection is structural: presence of an existing .github/skills/speckit-*
# entry (written by `specify init` in skills mode). No new flag. When no
# such entry exists (legacy mode, or org baseline installed before
# `specify init` ever ran), behavior is unchanged -- .github/skills/ is
# never created.
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _run_install(project, extra_setup=None):
    project.mkdir(parents=True, exist_ok=True)
    (project / ".specify").mkdir(exist_ok=True)
    if extra_setup:
        extra_setup(project)
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "install.sh"), str(project), "--ai", "copilot"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result


def _seed_skills_mode(project):
    """Simulate a prior `specify init --integration-options="--skills"` --
    core already wrote its own speckit-plan skill (composed org content
    must NOT be forced into this file; that's a separate, deeper problem
    this fix does not attempt)."""
    core_skill = project / ".github" / "skills" / "speckit-plan"
    core_skill.mkdir(parents=True)
    (core_skill / "SKILL.md").write_text(
        "---\nname: \"speckit-plan\"\ndescription: \"core\"\n---\n\nCORE-PLAN-BODY\n"
    )


def test_skills_mode_gets_ts_exclusive_commands_as_top_level_skills():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "proj"
        _run_install(project, extra_setup=_seed_skills_mode)

        doctor_skill = project / ".github" / "skills" / "speckit-doctor" / "SKILL.md"
        assert doctor_skill.is_file(), "TS-exclusive command must get a top-level skill entry"
        text = doctor_skill.read_text()
        assert text.startswith("---\n")
        assert 'name: "speckit-doctor"' in text
        assert "description:" in text
        # The composed agent content (not just a stub) must be present
        assert "Verify this developer's Spec-Driven Development setup" in text

        for name in ("verify-spec", "review", "feedback"):
            skill = project / ".github" / "skills" / f"speckit-{name}" / "SKILL.md"
            assert skill.is_file(), f"speckit-{name} must also get a top-level skill entry"


def test_skills_mode_never_overwrites_a_core_owned_skill():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "proj"
        _run_install(project, extra_setup=_seed_skills_mode)

        # speckit-plan has a core skill counterpart (seeded above) --
        # this fix is scoped to TS-exclusive commands only; a core-owned
        # skill file must survive untouched.
        core_plan = project / ".github" / "skills" / "speckit-plan" / "SKILL.md"
        assert "CORE-PLAN-BODY" in core_plan.read_text()


def test_legacy_mode_creates_no_skills_directory():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp) / "proj"
        _run_install(project)  # no .github/skills/ seeded -> legacy mode

        assert not (project / ".github" / "skills").exists(), \
            "must not create .github/skills/ when skills mode was never detected"
        # legacy surface is unaffected
        assert (project / ".github" / "agents" / "speckit.doctor.agent.md").is_file()
        assert (project / ".github" / "prompts" / "speckit.doctor.prompt.md").is_file()
