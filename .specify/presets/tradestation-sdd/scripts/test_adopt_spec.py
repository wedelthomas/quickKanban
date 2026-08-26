# scripts/test_adopt_spec.py
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
CLAUDE = REPO / "commands" / "speckit.specify.md"
COPILOT = REPO / "copilot-agents" / "speckit.specify.agent.md"  # exercised by Task 2's test

DETECTION_ANCHORS = (
    "## User Scenarios & Testing",
    "## Requirements",
    "## Success Criteria",
)
CONFIRM_PROMPT = "This looks like a complete spec"


def _check_adopt_surface(path):
    text = path.read_text()
    lower = text.lower()
    # Adopt path is described, with the verbatim guarantee
    assert "adopt" in lower, f"{path.name}: no adopt path described"
    assert "verbatim" in lower, f"{path.name}: missing 'verbatim'"
    assert "byte-for-byte" in lower, f"{path.name}: missing byte-for-byte guarantee"
    # Detection references all three mandatory template anchors
    for anchor in DETECTION_ANCHORS:
        assert anchor in text, f"{path.name}: missing detection anchor {anchor!r}"
    # The confirm question is present and unconditional (no bypass)
    assert CONFIRM_PROMPT in text, f"{path.name}: missing confirm prompt"
    assert ("always ask" in lower) or ("no bypass" in lower), \
        f"{path.name}: confirm step not marked mandatory"
    # Adopt mode must not regenerate or add provenance
    assert "no provenance" in lower, f"{path.name}: must state no provenance marker"


def test_claude_command_describes_adopt_mode():
    _check_adopt_surface(CLAUDE)


def test_copilot_agent_describes_adopt_mode():
    _check_adopt_surface(COPILOT)


README = REPO / "README.md"


def test_readme_documents_adopt_path():
    # documented in the README or the relocated reference doc (docs/PRESET-REFERENCE.md)
    text = (README.read_text()
            + (REPO / "docs" / "PRESET-REFERENCE.md").read_text()).lower()
    assert "verbatim" in text, "README must document the adopt-verbatim path"
    assert "byte-for-byte" in text, "README must state the byte-for-byte guarantee"
    assert "external spec" in text, "README must mention external specs"
