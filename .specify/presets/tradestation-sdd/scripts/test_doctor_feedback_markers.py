import sys
import tempfile
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))
import doctor  # noqa: E402

MARKED_BODY = textwrap.dedent("""\
    # Some Command

    <!-- AO-MANDATORY: feedback -->
    ## Auto-feedback (MANDATORY)
    Invoke feedback here.
    <!-- END AO-MANDATORY: feedback -->
    """)

UNMARKED_BODY = textwrap.dedent("""\
    # Some Command

    ## Auto-feedback (MANDATORY)
    Invoke feedback here, but the marker got dropped.
    """)


def _write_project(tmp, claude_files=None, copilot_files=None):
    project = Path(tmp)
    if claude_files is not None:
        d = project / ".claude" / "commands"
        d.mkdir(parents=True)
        for name, body in claude_files.items():
            (d / f"speckit.{name}.md").write_text(body)
    if copilot_files is not None:
        d = project / ".github" / "agents"
        d.mkdir(parents=True)
        for name, body in copilot_files.items():
            (d / f"speckit.{name}.agent.md").write_text(body)
    return project


def test_all_nine_marked_on_both_sides_passes():
    with tempfile.TemporaryDirectory() as tmp:
        names = ["analyze", "checklist", "plan", "review", "constitution",
                 "implement", "verify-spec", "specify", "tasks"]
        project = _write_project(
            tmp,
            claude_files={n: MARKED_BODY for n in names},
            copilot_files={n: MARKED_BODY for n in names},
        )
        result = doctor.check_feedback_markers(project)
        assert result["status"] == doctor.PASS, result


def test_one_missing_marker_fails_and_names_it():
    with tempfile.TemporaryDirectory() as tmp:
        names = ["analyze", "checklist", "plan", "review", "constitution",
                 "implement", "verify-spec", "specify", "tasks"]
        claude_files = {n: MARKED_BODY for n in names}
        claude_files["plan"] = UNMARKED_BODY  # drop the marker on one
        project = _write_project(tmp, claude_files=claude_files)
        result = doctor.check_feedback_markers(project)
        assert result["status"] == doctor.FAIL, result
        assert result["id"] in doctor.HARD_IDS, (
            "feedback-marker check must be a hard/blocking rule, not advisory"
        )
        assert "speckit.plan.md" in result["detail"]


def test_doctor_and_feedback_files_never_checked():
    with tempfile.TemporaryDirectory() as tmp:
        claude_files = {"doctor": UNMARKED_BODY, "feedback": UNMARKED_BODY}
        project = _write_project(tmp, claude_files=claude_files)
        result = doctor.check_feedback_markers(project)
        # neither doctor.md nor feedback.md carry the marker, and neither
        # is one of the 9 checked names, and no other command file exists
        # at all here -- INFO (nothing to check), not FAIL.
        assert result["status"] != doctor.FAIL, result


def test_claude_only_project_does_not_demand_copilot_markers():
    with tempfile.TemporaryDirectory() as tmp:
        names = ["analyze", "checklist", "plan", "review", "constitution",
                 "implement", "verify-spec", "specify", "tasks"]
        project = _write_project(tmp, claude_files={n: MARKED_BODY for n in names})
        # no .github/agents directory at all
        result = doctor.check_feedback_markers(project)
        assert result["status"] == doctor.PASS, result


def test_no_ai_tool_installed_yet_is_info_not_fail():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        (project / ".specify").mkdir()
        result = doctor.check_feedback_markers(project)
        assert result["status"] != doctor.FAIL, (
            "no .claude/commands or .github/agents yet must not be a "
            "governance failure"
        )
