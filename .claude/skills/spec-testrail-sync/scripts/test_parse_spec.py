import json
import subprocess
import sys
import textwrap
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "parse_spec.py"

LEGACY_SPEC = textwrap.dedent("""\
    # Feature Specification: BOSS Event Consumer Logic

    **JIRA**: [CRM-13228](https://example.atlassian.net/browse/CRM-13228)

    ### User Story 1 - Process Client CREATE Events (Priority: P1)

    As an integration engineer, I need CREATE events processed reliably.

    **Why this priority**: Core data flow, blocks everything downstream.

    **Independent Test**: Can be tested by sending a single CREATE event
    and confirming it lands in the target system.

    **Repos Affected**: `boss-integration-app-boss-eventconsumer`

    **Acceptance Scenarios**:

    1. **Given** a valid CREATE event, **When** it is consumed, **Then** the record is persisted.
    """)


def _run_parser(spec_text: str, tmp_path: Path) -> dict:
    spec_file = tmp_path / "spec.md"
    spec_file.write_text(spec_text)
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(spec_file)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_legacy_format_parses_exactly_as_before(tmp_path):
    data = _run_parser(LEGACY_SPEC, tmp_path)
    assert data["feature_title"] == "BOSS Event Consumer Logic"
    assert data["jira_ref"] == "CRM-13228"
    assert "format" not in data  # legacy shape has no format discriminator key
    story = data["user_stories"][0]
    assert story["number"] == 1
    assert story["priority"] == "P1"
    scenario = story["scenarios"][0]
    assert scenario["key"] == "us1-s1"
    assert scenario["given"] == "a valid CREATE event"
    assert scenario["when"] == "it is consumed"
    assert scenario["then"] == "the record is persisted."


def test_has_verification_table_is_false_for_legacy_spec():
    sys.path.insert(0, str(SCRIPT.parent))
    import parse_spec as module
    assert module.has_verification_table(LEGACY_SPEC) is False


BH_TEST_SPEC = textwrap.dedent("""\
    # Feature Specification: Order Cancellation Flow

    **JIRA**: [CRM-14001](https://example.atlassian.net/browse/CRM-14001)

    **Risk Tier:** FULL

    ## Behavior Pathways *(mandatory at FULL tier)*

    - **BH-001** (satisfies FR-001): Cancel a pending order
      - **Given** an order in PENDING status
      - **When** the customer requests cancellation
      - **Then** the order moves to CANCELLED and no charge is made
    - **BH-002**: no-behavior -- pure internal refactor, no observable change

    ## Verification *(mandatory at FULL tier)*

    | ID | Test name | Pins |
    |---|---|---|
    | TEST-001 | cancelling a pending order voids the charge | BH-001 |
    """)


def test_bh_test_format_is_detected():
    sys.path.insert(0, str(SCRIPT.parent))
    import parse_spec as module
    assert module.has_verification_table(BH_TEST_SPEC) is True


def test_bh_test_format_parses_pathways_and_verification(tmp_path):
    data = _run_parser(BH_TEST_SPEC, tmp_path)
    assert data["format"] == "bh_test"
    assert data["jira_ref"] == "CRM-14001"

    pathways = {p["id"]: p for p in data["behavior_pathways"]}
    assert pathways["BH-001"]["satisfies"] == ["FR-001"]
    assert pathways["BH-001"]["no_behavior"] is False
    assert pathways["BH-001"]["given"] == "an order in PENDING status"
    assert pathways["BH-001"]["when"] == "the customer requests cancellation"
    assert pathways["BH-001"]["then"] == "the order moves to CANCELLED and no charge is made"

    assert pathways["BH-002"]["no_behavior"] is True
    assert "pure internal refactor" in pathways["BH-002"]["reason"]

    verification = data["verification"]
    assert len(verification) == 1
    assert verification[0]["id"] == "TEST-001"
    assert verification[0]["pins"] == "BH-001"
    assert "voids the charge" in verification[0]["name"]


BH_TEST_SPEC_WITH_ORPHAN = BH_TEST_SPEC.replace(
    "| TEST-001 | cancelling a pending order voids the charge | BH-001 |",
    "| TEST-001 | cancelling a pending order voids the charge | BH-999 |",
)


BH_TEST_SPEC_WITH_WRAPPED_THEN = textwrap.dedent("""\
    # Feature Specification: Order Cancellation Flow

    **JIRA**: [CRM-14001](https://example.atlassian.net/browse/CRM-14001)

    **Risk Tier:** FULL

    ## Behavior Pathways *(mandatory at FULL tier)*

    - **BH-001** (satisfies FR-001): Cancel a pending order
      - **Given** an order in PENDING status
      - **When** the customer requests cancellation
      - **Then** the order moves to CANCELLED and no charge is made
    - **BH-002** (satisfies FR-003): Reject cancellation of a shipped order
      - **Given** an order in SHIPPED status
      - **When** the customer requests cancellation
      - **Then** the system rejects the request and explains that shipped
        orders can't be cancelled this way

    ## Verification *(mandatory at FULL tier)*

    | ID | Test name | Pins |
    |---|---|---|
    | TEST-001 | cancelling a pending order voids the charge | BH-001 |
    | TEST-002 | cancelling a shipped order is rejected with a clear reason | BH-002 |
    """)


def test_wrapped_multiline_then_clause_is_captured_in_full(tmp_path):
    """A Given/When/Then clause that wraps onto a continuation line in the
    source markdown must not be truncated at the first newline."""
    data = _run_parser(BH_TEST_SPEC_WITH_WRAPPED_THEN, tmp_path)
    pathways = {p["id"]: p for p in data["behavior_pathways"]}
    assert pathways["BH-002"]["given"] == "an order in SHIPPED status"
    assert pathways["BH-002"]["when"] == "the customer requests cancellation"
    assert pathways["BH-002"]["then"] == (
        "the system rejects the request and explains that shipped "
        "orders can't be cancelled this way"
    )


def test_orphaned_pins_reference_is_visible_in_output(tmp_path):
    """The parser doesn't validate Pins itself (that's verify-spec's job) --
    but it must faithfully report whatever Pins value is in the table, even
    when nothing in behavior_pathways matches it, so the caller can detect
    the orphan."""
    data = _run_parser(BH_TEST_SPEC_WITH_ORPHAN, tmp_path)
    bh_ids = {p["id"] for p in data["behavior_pathways"]}
    verification_pins = {v["pins"] for v in data["verification"]}
    assert verification_pins - bh_ids == {"BH-999"}
