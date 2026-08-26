# scripts/test_manifest_injection.py
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = REPO / "templates" / "plan-template.md"

ROW = "| Integration | Cross-repo contract surface (dependency manifest) | |"
NA_WORDING = "N/A — no dependency manifest (single-codebase feature)"


def test_template_has_cross_repo_arch_review_row():
    text = TEMPLATE.read_text(encoding="utf-8")
    assert ROW in text, "Architecture Review table missing the cross-repo row"
    # The row lives in the Integration block: after the last existing
    # Integration row, before the first Data row
    assert (
        text.index("| Integration | Contract evolution strategy | |")
        < text.index(ROW)
        < text.index("| Data | PII")
    ), "row must sit with the Integration rows"


def test_template_has_cross_repo_context_section():
    text = TEMPLATE.read_text(encoding="utf-8")
    assert "## Cross-Repo Context" in text, "missing Cross-Repo Context section"
    # Conditional like Test Strategy: delete-when-absent + canonical N/A wording
    assert NA_WORDING in text, "missing canonical N/A wording for single-codebase features"
    assert "dependency-manifest.md" in text
    # Trust rules are stated in the section's fill instructions
    lower = text.lower()
    assert "possible, unconfirmed" in lower, "trust rules: medium/low rendering missing"
    assert "scanned_at" in text, "contract citations must carry scanned_at"
    assert "upgrade a confidence tier" in lower, "trust rules: tier-upgrade prohibition missing"
    # Section sits after Technical Context and before the Architecture
    # Review table whose cross-repo row points at it
    assert text.index("## Technical Context") < text.index("## Cross-Repo Context") < text.index("## Architecture Review")


SPECIFY_CMD = REPO / "commands" / "speckit.specify.md"
SPECIFY_AGENT = REPO / "copilot-agents" / "speckit.specify.agent.md"


def _check_specify_manifest_carry(path):
    text = path.read_text(encoding="utf-8")
    lower = text.lower()
    assert "dependency-manifest.md" in text, f"{path.name}: adopt mode never mentions the manifest"
    assert "coordination artifact" in lower, f"{path.name}: must state what the manifest is"
    # Copy destination is the feature dir; content is not edited
    assert "specs/<feature-id>/dependency-manifest.md" in text, f"{path.name}: missing canonical destination"
    assert "do not edit its content" in lower, f"{path.name}: manifest must be carried unmodified"
    # Single-codebase handoffs skip silently
    assert "skip silently" in lower, f"{path.name}: absent-manifest path must be silent"


def test_specify_command_carries_manifest():
    _check_specify_manifest_carry(SPECIFY_CMD)


def test_specify_agent_carries_manifest():
    _check_specify_manifest_carry(SPECIFY_AGENT)


PLAN_CMD = REPO / "commands" / "speckit.plan.md"
PLAN_AGENT = REPO / "copilot-agents" / "speckit.plan.agent.md"


def _check_plan_manifest_consumption(path):
    text = path.read_text(encoding="utf-8")
    lower = text.lower()
    assert "specs/<feature-id>/dependency-manifest.md" in text, f"{path.name}: missing canonical path"
    assert "## Cross-Repo Context" in text, f"{path.name}: never references the plan section"
    # Root fallback with epic-title match before moving
    assert "repo root" in lower and "matches the active feature" in lower, \
        f"{path.name}: root fallback / epic-match guard missing"
    # Freshness protocol: availability-gated, offered re-scan, never blocking
    assert "get_deep_scan" in text and "request_deep_scan" in text, f"{path.name}: freshness tools missing"
    assert "force=true" in text, f"{path.name}: re-scan offer must use force=true"
    assert "treated as static" in lower, f"{path.name}: connector-absent fallback wording missing"
    assert "never block" in lower, f"{path.name}: must state planning never blocks on the graph"
    # Write-back: offer-only, human-confirmed
    assert "confirm_edge" in text and "reject_edge" in text, f"{path.name}: write-back tools missing"
    assert "never automatic" in lower, f"{path.name}: write-back must be offer-only"
    # Trust rules
    assert "possible, unconfirmed" in lower, f"{path.name}: trust rules missing"
    # The PM-side relative pointer is documented as cosmetic
    assert "../../dependency-manifest.md" in text, f"{path.name}: stale spec pointer not documented"


def test_plan_command_consumes_manifest():
    _check_plan_manifest_consumption(PLAN_CMD)


def test_plan_agent_consumes_manifest():
    _check_plan_manifest_consumption(PLAN_AGENT)


def test_freshness_vocabulary_shared():
    # The static-fallback wording is a contract between the template's
    # Freshness line and the plan command/agent instruction text — drift
    # here strands an executing agent without a canonical phrase.
    shared = "contracts cited as of their scanned_at dates"
    for path in (TEMPLATE, PLAN_CMD, PLAN_AGENT):
        assert shared in path.read_text(encoding="utf-8"), f"{path.name}: freshness vocabulary drifted"


ANALYZE_CMD = REPO / "commands" / "speckit.analyze.md"
ANALYZE_AGENT = REPO / "copilot-agents" / "speckit.analyze.agent.md"


def _check_analyze_manifest_gate(path, blocking_word):
    text = path.read_text(encoding="utf-8")
    assert "dependency-manifest.md" in text, f"{path.name}: gate never checks for the manifest"
    assert "Cross-repo contract surface" in text, f"{path.name}: row name missing"
    assert blocking_word in text, f"{path.name}: manifest-present + N/A must be {blocking_word}"
    # The inverse stays legal
    assert "no dependency manifest (single-codebase feature)" in text, \
        f"{path.name}: must keep the single-codebase N/A path legal"


def test_analyze_command_gates_manifest():
    _check_analyze_manifest_gate(ANALYZE_CMD, "blocking")


def test_analyze_agent_gates_manifest():
    _check_analyze_manifest_gate(ANALYZE_AGENT, "CRITICAL")


FEEDBACK_CMD = REPO / "commands" / "speckit.feedback.md"
FEEDBACK_AGENT = REPO / "copilot-agents" / "speckit.feedback.agent.md"

PLAN_KEYS = (
    "dependency_manifest_present",
    "manifest_codebases",
    "manifest_boundaries",
    "manifest_stale_contracts",
    "manifest_freshness_checked",
)
ANALYZE_KEYS = ("dependency_manifest_present", "cross_repo_row_filled")


def _check_feedback_keys(path):
    text = path.read_text(encoding="utf-8")
    plan_block = text.split("#### `plan`")[1].split("#### `tasks`")[0]
    analyze_block = text.split("#### `analyze`")[1].split("#### `review`")[0]
    for key in PLAN_KEYS:
        assert key in plan_block, f"{path.name}: plan telemetry missing {key}"
    for key in ANALYZE_KEYS:
        assert key in analyze_block, f"{path.name}: analyze telemetry missing {key}"


def test_feedback_command_has_manifest_telemetry():
    _check_feedback_keys(FEEDBACK_CMD)


def test_feedback_agent_has_manifest_telemetry():
    _check_feedback_keys(FEEDBACK_AGENT)


def test_readme_mentions_manifest():
    # documented in the README or the relocated reference doc (docs/PRESET-REFERENCE.md)
    text = ((REPO / "README.md").read_text(encoding="utf-8")
            + (REPO / "docs" / "PRESET-REFERENCE.md").read_text(encoding="utf-8")).lower()
    assert "dependency-manifest" in text, "docs must mention multi-codebase manifests"


def test_stale_marker_vocabulary_shared():
    # `manifest_stale_contracts` (feedback) counts these markers in plan.md's
    # Cross-Repo Context; an agent writes them per the template entry-shape.
    # Producer (template) and consumer (feedback counter) must use identical
    # tokens — a rename on one side silently zeroes the telemetry.
    markers = ("STALE", "no deep scan available", "re-scan running")
    template = TEMPLATE.read_text(encoding="utf-8")
    for marker in markers:
        assert marker in template, f"plan-template missing stale marker {marker!r}"
        for path in (FEEDBACK_CMD, FEEDBACK_AGENT):
            assert marker in path.read_text(encoding="utf-8"), \
                f"{path.name}: stale-counter marker {marker!r} drifted from the template"
