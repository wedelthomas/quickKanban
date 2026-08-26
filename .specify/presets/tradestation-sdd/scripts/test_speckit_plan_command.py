from pathlib import Path

CMD = Path(__file__).resolve().parent.parent / "commands" / "speckit.plan.md"


def test_plan_command_uses_render_template():
    body = CMD.read_text()
    assert "render-template.sh plan-template" in body
    # must NOT instruct reading the raw preset template file directly
    assert "presets/tradestation-sdd/templates/plan-template.md" not in body
