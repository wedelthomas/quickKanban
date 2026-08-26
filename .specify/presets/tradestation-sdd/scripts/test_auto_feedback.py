# scripts/test_auto_feedback.py
"""Guard tests for the Copilot-CLI auto-feedback mechanism.

GitHub Copilot CLI does NOT support the `handoffs:` agent-frontmatter field
(it is a VS Code Copilot-Chat feature). At runtime the CLI ignores it and
prints "agent uses unsupported fields: ... handoffs". A `send: true` handoff
therefore never fires `speckit.feedback` — auto-firing must be driven by each
agent's prose. These tests guard that reality:

  1. No Copilot agent declares `handoffs:` in its frontmatter (removed — it
     only produced the warning and never fired).
  2. Every phase agent still carries a MANDATORY, phase-named instruction to
     invoke `speckit.feedback <phase>` (the real, prose-driven trigger).
  3. `speckit.doctor` still does NOT auto-fire feedback.
  4. No agent prose references the removed handoff buttons/mechanism (only the
     unrelated PM "epic handoff ZIP" / dependency-manifest sense is allowed).
  5. The README no longer claims the feedback loop runs "via a send: true
     handoff".
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
AGENTS = ROOT / "copilot-agents"
COMMANDS = ROOT / "commands"

# agent stem -> the feedback phase(s) it MUST fire by name
PHASE_AGENTS = {
    "speckit.constitution": ["constitution"],
    "speckit.specify": ["specify"],
    "speckit.verify-spec": ["verify-spec"],
    "speckit.plan": ["plan"],
    "speckit.tasks": ["tasks"],
    "speckit.checklist": ["checklist"],
    "speckit.analyze": ["analyze"],
    "speckit.review": ["review"],
    "speckit.implement": ["story-complete", "session-end", "end-of-feature"],
}

# "handoff" appears legitimately only in the PM epic-handoff-ZIP /
# dependency-manifest sense — never as an agent handoff button.
ALLOWED_HANDOFF_SUBSTRINGS = (
    "epic handoffs",
    "single-codebase handoffs",
    "handoffs: a coordination artifact",
)


def _frontmatter(text):
    parts = text.split("---", 2)
    assert len(parts) >= 3, "expected YAML frontmatter delimited by ---"
    return parts[1]


def test_no_agent_declares_handoffs_in_frontmatter():
    offenders = []
    for path in sorted(AGENTS.glob("*.agent.md")):
        if "handoffs:" in _frontmatter(path.read_text()):
            offenders.append(path.name)
    assert not offenders, (
        f"these agents still declare `handoffs:` (Copilot CLI ignores it and "
        f"warns 'unsupported fields: handoffs'): {offenders}"
    )


def test_phase_agents_have_mandatory_named_feedback_trigger():
    for stem, phases in PHASE_AGENTS.items():
        text = (AGENTS / f"{stem}.agent.md").read_text()
        assert "MANDATORY" in text, f"{stem}: feedback trigger no longer marked MANDATORY"
        for phase in phases:
            assert f"speckit.feedback {phase}" in text, (
                f"{stem}: missing explicit `speckit.feedback {phase}` invocation"
            )


def test_doctor_does_not_autofire_feedback():
    text = (AGENTS / "speckit.doctor.agent.md").read_text()
    assert "Do not auto-invoke" in text and "speckit.feedback" in text, (
        "doctor should explicitly say it does not auto-invoke feedback"
    )
    for phase in ("constitution", "specify", "plan", "tasks", "review"):
        assert f"speckit.feedback {phase}" not in text, (
            f"doctor must not carry a phase-named feedback trigger ({phase})"
        )


def test_no_stale_handoff_prose_in_agents():
    offenders = []
    for path in sorted(AGENTS.glob("*.agent.md")):
        for i, line in enumerate(path.read_text().splitlines(), 1):
            if "handoff" not in line.lower():
                continue
            if any(a in line for a in ALLOWED_HANDOFF_SUBSTRINGS):
                continue
            offenders.append(f"{path.name}:{i}: {line.strip()}")
    assert not offenders, "stale handoff references remain:\n" + "\n".join(offenders)


def test_readme_does_not_claim_handoff_autofire():
    readme = (ROOT / "README.md").read_text()
    assert "send: true` handoff" not in readme
    assert "via a `send: true`" not in readme


# --- Claude Code parity: the slash commands never had handoffs, but they drive
# --- feedback by the same prose mechanism, so hold them to the same bar. ---

def test_commands_have_no_stale_handoff_prose():
    offenders = []
    for path in sorted(COMMANDS.glob("speckit.*.md")):
        for i, line in enumerate(path.read_text().splitlines(), 1):
            if "handoff" not in line.lower():
                continue
            if any(a in line for a in ALLOWED_HANDOFF_SUBSTRINGS):
                continue
            offenders.append(f"{path.name}:{i}: {line.strip()}")
    assert not offenders, "stale handoff refs in Claude commands:\n" + "\n".join(offenders)


def test_commands_name_feedback_phase():
    for stem, phases in PHASE_AGENTS.items():
        text = (COMMANDS / f"{stem}.md").read_text()
        for phase in phases:
            assert f"/speckit.feedback {phase}" in text, (
                f"{stem}.md (Claude command): missing `/speckit.feedback {phase}`"
            )


# --- Delivery hardening: once feedback fires, the payload must actually be
# --- transmitted. Guards against two observed non-deterministic behaviors:
# --- the agent self-setting SDD_TELEMETRY_DISABLE, and skipping the POST when
# --- a prior on-disk feedback record already exists (both suppress delivery).

FEEDBACK_FILES = (AGENTS / "speckit.feedback.agent.md", COMMANDS / "speckit.feedback.md")


def _collapsed(path):
    """File text with all whitespace runs collapsed to single spaces, so
    substring checks are robust to markdown line-wrapping."""
    return " ".join(path.read_text().split())


def test_feedback_forbids_agent_self_disabling_telemetry():
    for path in FEEDBACK_FILES:
        text = _collapsed(path)
        assert "developer-controlled" in text and "MUST NOT set it" in text, (
            f"{path.name}: must frame SDD_TELEMETRY_DISABLE as a developer-only opt-out "
            f"the agent MUST NOT set itself"
        )


def test_feedback_requires_transmit_even_if_record_exists():
    for path in FEEDBACK_FILES:
        text = _collapsed(path)
        assert "even when a feedback record already exists" in text, (
            f"{path.name}: must require transmitting even if a prior record exists"
        )
        assert "NOT proof of delivery" in text, (
            f"{path.name}: must state that an on-disk artifact is not proof of delivery"
        )
