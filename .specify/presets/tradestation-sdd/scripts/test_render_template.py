import os
import shutil as _shutil
import subprocess
import textwrap
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent          # preset repo scripts/
PORTABLE = SCRIPTS / "_portable.sh"
RENDER_LIB = SCRIPTS / "render-lib.sh"
RENDER_TMPL = SCRIPTS / "render-template.sh"
REPO = SCRIPTS.parent                              # preset repo root


def _make_project(tmp_path, *, strategy, addendum_body, core_body="CORE-BODY",
                  template_name="plan-template", addendum_name="plan-addendum.md"):
    """Build a minimal .specify/ with one preset layer + core, return repo root."""
    root = tmp_path / "proj"
    (root / ".specify" / "templates").mkdir(parents=True)
    (root / ".specify" / "templates" / f"{template_name}.md").write_text(core_body)
    preset = root / ".specify" / "presets" / "tradestation-sdd"
    (preset / "templates").mkdir(parents=True)
    (preset / "templates" / addendum_name).write_text(addendum_body)
    (preset / "preset.yml").write_text(textwrap.dedent(f"""\
        schema_version: "1.0"
        preset: {{ id: "tradestation-sdd", name: "TS", version: "1.0.0" }}
        provides:
          templates:
            - type: "template"
              name: "{template_name}"
              file: "templates/{addendum_name}"
              strategy: "{strategy}"
        """))
    (root / ".specify" / "presets" / ".registry").write_text(
        '{"presets": {"tradestation-sdd": {"priority": 1, "name": "TS"}}}')
    return root


def _resolve(root, template_name="plan-template"):
    """Source _portable.sh + render-lib.sh and call the resolver; return (rc, out, err)."""
    script = f'. "{PORTABLE}"; . "{RENDER_LIB}"; resolve_template_content "{template_name}" "{root}"'
    p = subprocess.run(["bash", "-c", script], capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def test_wrap_composes_header_core_footer(tmp_path):
    root = _make_project(
        tmp_path, strategy="wrap",
        addendum_body="ORG-HEADER\n{CORE_TEMPLATE}\nORG-FOOTER\n")
    rc, out, err = _resolve(root)
    assert rc == 0, err
    assert "{CORE_TEMPLATE}" not in out            # substituted, no literal leak
    assert out.index("ORG-HEADER") < out.index("CORE-BODY") < out.index("ORG-FOOTER")


def test_wrap_missing_placeholder_errors(tmp_path):
    root = _make_project(
        tmp_path, strategy="wrap",
        addendum_body="ORG-HEADER no placeholder ORG-FOOTER\n")
    rc, out, err = _resolve(root)
    assert rc == 1
    assert "CORE_TEMPLATE" in err                   # error surfaced on stderr


def test_entrypoint_composes_from_project_root(tmp_path):
    root = _make_project(
        tmp_path, strategy="wrap",
        addendum_body="ORG-HEADER\n{CORE_TEMPLATE}\nORG-FOOTER\n")
    # Call with explicit root, and also from inside the project (root auto-detect).
    p = subprocess.run(["bash", str(RENDER_TMPL), "plan-template", str(root)],
                       capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    assert "{CORE_TEMPLATE}" not in p.stdout
    assert "ORG-HEADER" in p.stdout and "CORE-BODY" in p.stdout and "ORG-FOOTER" in p.stdout

    p2 = subprocess.run(["bash", str(RENDER_TMPL), "plan-template"],
                        cwd=str(root / ".specify"), capture_output=True, text=True)
    assert p2.returncode == 0, p2.stderr
    assert p2.stdout == p.stdout            # root auto-detect == explicit root


def test_entrypoint_missing_template_exits_1(tmp_path):
    root = _make_project(
        tmp_path, strategy="wrap", addendum_body="H\n{CORE_TEMPLATE}\nF\n")
    p = subprocess.run(["bash", str(RENDER_TMPL), "does-not-exist", str(root)],
                       capture_output=True, text=True)
    assert p.returncode == 1


def test_real_preset_plan_wraps_core(tmp_path):
    """Use the actual preset.yml + plan-addendum.md against a fixture core."""
    root = tmp_path / "proj"
    (root / ".specify" / "templates").mkdir(parents=True)
    (root / ".specify" / "templates" / "plan-template.md").write_text("CORE-PLAN-BODY\n")
    preset = root / ".specify" / "presets" / "tradestation-sdd"
    (preset / "templates").mkdir(parents=True)
    _shutil.copy(REPO / "preset.yml", preset / "preset.yml")
    _shutil.copy(REPO / "templates" / "plan-addendum.md", preset / "templates" / "plan-addendum.md")
    (root / ".specify" / "presets" / ".registry").write_text(
        '{"presets": {"tradestation-sdd": {"priority": 1, "name": "TS"}}}')

    p = subprocess.run(["bash", str(RENDER_TMPL), "plan-template", str(root)],
                       capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    assert "{CORE_TEMPLATE}" not in p.stdout
    assert "CORE-PLAN-BODY" in p.stdout
    # org markers from the real addendum wrap the core body
    assert "TradeStation SDD" in p.stdout
    assert p.stdout.index("TradeStation SDD") < p.stdout.index("CORE-PLAN-BODY")
