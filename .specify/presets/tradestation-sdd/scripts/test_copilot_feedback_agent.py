# scripts/test_copilot_feedback_agent.py
"""Guard tests: the Copilot feedback agent must source telemetry from Copilot's
own session-state, never Claude Code's transcript path."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
AGENT = (ROOT / "copilot-agents" / "speckit.feedback.agent.md").read_text()


def test_session_minutes_uses_copilot_session_state():
    # The Claude-only session_minutes wording must be gone.
    assert "the current Claude Code JSONL session" not in AGENT
    assert "$HOME/.copilot/session-state" in AGENT


def test_ai_authorship_uses_copilot_tool_events():
    assert ".claude/projects" not in AGENT          # no Claude transcript path anywhere
    assert "tool.execution_start" in AGENT          # reads Copilot tool events
    assert '.data.toolName == "create"' in AGENT
    assert '.data.toolName == "edit"' in AGENT


def test_tool_stamp_present_in_both_payloads():
    claude = (ROOT / "commands" / "speckit.feedback.md").read_text()
    assert '"tool": "copilot"' in AGENT
    assert '"tool": "claude"' in claude
