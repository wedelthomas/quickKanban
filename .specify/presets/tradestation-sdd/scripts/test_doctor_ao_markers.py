# scripts/test_doctor_ao_markers.py
import sys
import tempfile
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))
import doctor  # noqa: E402

MARKED_CONSTITUTION = textwrap.dedent("""\
    # Project Constitution

    <!-- AO-MANDATORY: security-first -->
    ## Principle I: Security-First Development
    No credential of any kind ever gets committed.
    <!-- END AO-MANDATORY: security-first -->

    <!-- AO-MANDATORY: integration-anti-patterns -->
    ## Principle II: Composable
    No database-to-database connectivity.
    <!-- END AO-MANDATORY: integration-anti-patterns -->

    <!-- AO-MANDATORY: data-protection -->
    ## Principle VIII: Compliant
    Data MUST be encrypted at rest and in transit.
    <!-- END AO-MANDATORY: data-protection -->

    <!-- AO-MANDATORY: quality-gates -->
    ## Quality Gates
    Coverage MUST be >=90%.
    <!-- END AO-MANDATORY: quality-gates -->

    ## Principle III: Something Else
    Team-specific content.
    """)

STRIPPED_CONSTITUTION = textwrap.dedent("""\
    # Project Constitution

    ## Principle II: Something Else
    Team-specific content, no security section at all.
    """)


def _write_project(tmp, constitution_text):
    # _find_constitution (doctor.py) searches for any file literally named
    # constitution.md anywhere under the project root -- matching the same
    # convention check_speckit/check_preset already rely on.
    project = Path(tmp)
    (project / ".specify" / "memory").mkdir(parents=True)
    (project / ".specify" / "memory" / "constitution.md").write_text(constitution_text)
    return project


def test_ao_marker_present_passes():
    with tempfile.TemporaryDirectory() as tmp:
        project = _write_project(tmp, MARKED_CONSTITUTION)
        result = doctor.check_ao_markers(project)
        assert result["status"] == doctor.PASS, result


def test_ao_marker_missing_fails_blocking():
    with tempfile.TemporaryDirectory() as tmp:
        project = _write_project(tmp, STRIPPED_CONSTITUTION)
        result = doctor.check_ao_markers(project)
        assert result["status"] == doctor.FAIL, result
        assert result["id"] in doctor.HARD_IDS, (
            "AO-marker check must be a hard/blocking rule, not advisory"
        )
        assert "security-first" in result["detail"], (
            "failure detail must name which AO section is missing"
        )


def test_no_constitution_skips_rather_than_fails():
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        (project / ".specify").mkdir()
        result = doctor.check_ao_markers(project)
        assert result["status"] != doctor.FAIL, (
            "no constitution.md yet (pre-/speckit.constitution) must not "
            "be reported as a governance failure"
        )


FOUR_MARKER_CONSTITUTION = textwrap.dedent("""\
    # Project Constitution

    <!-- AO-MANDATORY: security-first -->
    ## I. Secure
    No credential of any kind ever gets committed.
    <!-- END AO-MANDATORY: security-first -->

    ## II. Composable
    <!-- AO-MANDATORY: integration-anti-patterns -->
    No database-to-database connectivity.
    <!-- END AO-MANDATORY: integration-anti-patterns -->

    ## VIII. Compliant
    <!-- AO-MANDATORY: data-protection -->
    Data MUST be encrypted at rest and in transit.
    <!-- END AO-MANDATORY: data-protection -->

    <!-- AO-MANDATORY: quality-gates -->
    ## Quality Gates
    Coverage MUST be >=90%.
    <!-- END AO-MANDATORY: quality-gates -->
    """)

MISSING_ONE_OF_FOUR = textwrap.dedent("""\
    # Project Constitution

    <!-- AO-MANDATORY: security-first -->
    ## I. Secure
    No credential of any kind ever gets committed.
    <!-- END AO-MANDATORY: security-first -->

    ## II. Composable
    No database-to-database connectivity, but the marker got dropped.

    ## VIII. Compliant
    <!-- AO-MANDATORY: data-protection -->
    Data MUST be encrypted at rest and in transit.
    <!-- END AO-MANDATORY: data-protection -->

    <!-- AO-MANDATORY: quality-gates -->
    ## Quality Gates
    Coverage MUST be >=90%.
    <!-- END AO-MANDATORY: quality-gates -->
    """)


def test_all_four_markers_present_passes():
    with tempfile.TemporaryDirectory() as tmp:
        project = _write_project(tmp, FOUR_MARKER_CONSTITUTION)
        result = doctor.check_ao_markers(project)
        assert result["status"] == doctor.PASS, result


def test_missing_one_of_four_fails_and_names_it():
    with tempfile.TemporaryDirectory() as tmp:
        project = _write_project(tmp, MISSING_ONE_OF_FOUR)
        result = doctor.check_ao_markers(project)
        assert result["status"] == doctor.FAIL, result
        assert "integration-anti-patterns" in result["detail"]
        # the three markers that ARE present must not be reported missing
        assert "security-first" not in result["detail"].split("missing required AO section(s): ")[1]
