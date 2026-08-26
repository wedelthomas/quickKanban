# scripts/test_constitution_template_content.py
#
# templates/constitution-template.md is the Layer 2 org baseline every TS
# team installs. This sub-project curated it into an AO-sanctioned version
# covering all 11 TradeStation Guiding Principles (checked live against
# the AO's own Confluence page, not just the two prior source documents),
# replacing the generic engineering-craft-only version. See
# docs/superpowers/specs/2026-08-04-layer2-constitution-merge-design.md.
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = REPO_ROOT / "templates" / "constitution-template.md"
TEXT = TEMPLATE.read_text(encoding="utf-8")
# The Sync Impact Report is a history/changelog comment, not constitution
# content -- it legitimately narrates things like "City Plan System
# Identity ... destined for their own future capability" as an explicit
# out-of-scope note. Content checks below apply to the actual document
# body, after that comment block closes.
BODY = TEXT.split("-->", 1)[1]

AO_PILLARS_IN_ORDER = [
    "Secure", "Composable", "Available", "Resilient", "Manageable",
    "Monitored", "Deployable", "Compliant", "Reproducible", "Testable",
    "Documented",
]


def test_all_eleven_ao_pillars_present_in_order():
    positions = [TEXT.index(pillar) for pillar in AO_PILLARS_IN_ORDER]
    assert positions == sorted(positions), (
        "AO pillars must appear in the AO's own canonical order: "
        + ", ".join(AO_PILLARS_IN_ORDER)
    )


def test_engineering_practice_principles_present():
    for name in ("Simplicity First", "Lean Footprint", "Maintainability"):
        assert name in TEXT, f"missing engineering practice principle: {name}"


def test_maintainability_comes_after_all_ao_pillars():
    assert TEXT.index("Documented") < TEXT.index("Maintainability")


def test_four_ao_mandatory_markers_present():
    for marker in ("security-first", "integration-anti-patterns",
                   "data-protection", "quality-gates"):
        assert f"<!-- AO-MANDATORY: {marker} -->" in TEXT
        assert f"<!-- END AO-MANDATORY: {marker} -->" in TEXT


def test_integration_anti_patterns_marker_does_not_wrap_whole_composable():
    """The marker must scope to the prohibited-patterns list only, not the
    whole Composable principle -- a team must still be able to override
    the REST/gRPC/pub-sub guidance without touching the AO-mandated
    anti-patterns list."""
    start = TEXT.index("<!-- AO-MANDATORY: integration-anti-patterns -->")
    end = TEXT.index("<!-- END AO-MANDATORY: integration-anti-patterns -->")
    span = TEXT[start:end]
    assert "Database-to-database" in span
    assert "gRPC" not in span, "marker span leaked outside the anti-patterns list"


def test_data_protection_marker_does_not_wrap_whole_compliant():
    start = TEXT.index("<!-- AO-MANDATORY: data-protection -->")
    end = TEXT.index("<!-- END AO-MANDATORY: data-protection -->")
    span = TEXT[start:end]
    assert "encrypt" in span.lower()
    assert "regulatory audits" not in span.lower(), (
        "marker span leaked outside the data-protection paragraph into "
        "Compliant's own intro sentence"
    )


def test_no_detailed_city_plan_system_identity_content():
    """The System Identity section/table (zone declaration, Zone Owner
    field, the multi-paragraph Domain API boundary rules) is dropped
    entirely -- but a brief one-line forward-reference to a future
    City-Plan capability is intentional (per the design spec's explicit
    decision) and must NOT be flagged by this test."""
    for token in ("System Identity", "Zone Owner", "Actors Served",
                  "Customer-Facing?", "City Plan Zone (Box)"):
        assert token not in BODY, f"detailed City-Plan content leaked in: {token!r}"
    # the brief forward-reference itself is expected and fine:
    assert "City-Plan capability" in BODY


def test_no_hardcoded_skill_names():
    assert "abs-sdd-" not in TEXT
    assert "ts-sdd-" not in TEXT


def test_version_bumped_to_2_0_0_with_sync_impact_report():
    assert "**Version**: 2.0.0" in TEXT
    assert "Sync Impact Report" in TEXT
    assert "1.6.0" in TEXT.split("Sync Impact Report")[1].split("\n\n")[0], (
        "Sync Impact Report must state the version change, e.g. '1.6.0 -> 2.0.0'"
    )
