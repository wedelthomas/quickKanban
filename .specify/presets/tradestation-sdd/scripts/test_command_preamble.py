# scripts/test_command_preamble.py
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
COMMANDS = sorted((REPO / "commands").glob("speckit.*.md"))
AGENTS = sorted((REPO / "copilot-agents").glob("speckit.*.agent.md"))
MARKER = "sdd-preset: self-update check"
INVOCATION = 'bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"'


def test_all_commands_present():
    assert len(COMMANDS) == 12


def test_every_command_has_preamble_after_frontmatter():
    for cmd in COMMANDS:
        text = cmd.read_text()
        assert MARKER in text, f"{cmd.name} missing preamble marker"
        assert INVOCATION in text, f"{cmd.name} missing invocation"
        # front matter closes, THEN the preamble, THEN the H1 heading
        second_fence = text.index("---", text.index("---") + 3)
        assert text.index(MARKER) > second_fence, f"{cmd.name} preamble before front matter"
        assert text.index(MARKER) < text.index("\n# /"), f"{cmd.name} preamble after heading"


def test_all_copilot_agents_present():
    assert len(AGENTS) == 12


def test_every_copilot_agent_has_selfupdate_preamble():
    # Copilot CLI has no self-update trigger unless the agents run check-update
    # themselves — so every agent carries the same preamble the commands do.
    for agent in AGENTS:
        text = agent.read_text()
        assert MARKER in text, f"{agent.name} missing self-update preamble marker"
        assert INVOCATION in text, f"{agent.name} missing check-update invocation"
        # preamble must sit AFTER the front matter closes, not inside it
        second_fence = text.index("---", text.index("---") + 3)
        assert text.index(MARKER) > second_fence, f"{agent.name} preamble inside/before front matter"


def test_specify_has_doctor_preflight():
    text = (REPO / "commands" / "speckit.specify.md").read_text()
    invocation = "doctor.sh --preflight"
    assert invocation in text, "speckit.specify.md missing doctor preflight"
    # preflight comes after the self-update preamble (its invocation), before the H1 heading
    assert text.index(invocation) > text.index(MARKER)
    assert text.index(invocation) > text.index("check-update.sh")
    assert text.index(invocation) < text.index("\n# /")
