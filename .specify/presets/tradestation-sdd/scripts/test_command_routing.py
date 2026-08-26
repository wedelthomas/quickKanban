from pathlib import Path
REPO = Path(__file__).resolve().parent.parent

def _cmd(name): return (REPO / "commands" / f"speckit.{name}.md").read_text()

def test_specify_command_routes():
    b = _cmd("specify")
    assert "render-template.sh spec-template" in b
    assert "templates/spec-template.md" not in b

def test_tasks_command_routes():
    b = _cmd("tasks")
    assert "render-template.sh tasks-template" in b
    assert "templates/tasks-template.md" not in b

def test_constitution_command_routes():
    b = _cmd("constitution")
    assert "render-template.sh constitution-template" in b
    assert "templates/constitution-template.md" not in b

def _agent(name): return (REPO / "copilot-agents" / f"speckit.{name}.agent.md").read_text()

def test_tasks_agent_routes():
    b = _agent("tasks")
    assert "render-template.sh tasks-template" in b

def test_constitution_agent_routes():
    b = _agent("constitution")
    assert "render-template.sh constitution-template" in b
    # reference-only reads for alignment are intentionally preserved:
    assert "plan-template.md" in b and "spec-template.md" in b

def test_checklist_agent_routes():
    b = _agent("checklist")
    assert "render-template.sh checklist-template" in b
