# All 9 real source commands/agents (everything except doctor and
# feedback themselves) carry the AO-MANDATORY feedback marker, so a
# replace-strategy capability layer can't silently drop the mandatory
# feedback-trigger hook. See docs/superpowers/specs/
# 2026-08-06-feedback-governance-design.md.
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

NAMES = ["analyze", "checklist", "plan", "review", "constitution",
         "implement", "verify-spec", "specify", "tasks"]

OPEN_MARKER = "<!-- AO-MANDATORY: feedback -->"
CLOSE_MARKER = "<!-- END AO-MANDATORY: feedback -->"


def test_all_nine_claude_commands_carry_the_marker():
    for name in NAMES:
        text = (REPO_ROOT / "commands" / f"speckit.{name}.md").read_text()
        assert OPEN_MARKER in text, f"speckit.{name}.md missing opening marker"
        assert CLOSE_MARKER in text, f"speckit.{name}.md missing closing marker"


def test_doctor_and_feedback_commands_are_not_marked():
    for name in ("doctor", "feedback"):
        text = (REPO_ROOT / "commands" / f"speckit.{name}.md").read_text()
        assert OPEN_MARKER not in text, f"speckit.{name}.md should not carry the marker"


def test_all_nine_copilot_agents_carry_the_marker():
    for name in NAMES:
        text = (REPO_ROOT / "copilot-agents" / f"speckit.{name}.agent.md").read_text()
        assert OPEN_MARKER in text, f"speckit.{name}.agent.md missing opening marker"
        assert CLOSE_MARKER in text, f"speckit.{name}.agent.md missing closing marker"


def test_doctor_and_feedback_agents_are_not_marked():
    for name in ("doctor", "feedback"):
        text = (REPO_ROOT / "copilot-agents" / f"speckit.{name}.agent.md").read_text()
        assert OPEN_MARKER not in text, f"speckit.{name}.agent.md should not carry the marker"


def test_implement_agent_marks_the_substantive_trigger_not_the_generic_summary():
    """Copilot's implement agent has TWO feedback-related sections -- the
    substantive trigger logic and a later generic closing summary. The
    marker must wrap the substantive one (matching what's marked in
    Claude's version of the same command), not the generic boilerplate
    every other Copilot agent also carries unmarked-by-comparison."""
    text = (REPO_ROOT / "copilot-agents" / "speckit.implement.agent.md").read_text()
    start = text.index(OPEN_MARKER)
    end = text.index(CLOSE_MARKER)
    span = text[start:end]
    assert "Feedback Trigger (MANDATORY)" in span
    assert "end-of-feature" in span
    assert "invoke the `speckit.feedback` agent with" not in span, (
        "marker wrapped the generic closing summary instead of the "
        "substantive trigger section"
    )
