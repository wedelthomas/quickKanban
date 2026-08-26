# scripts/test_multirepo_templates.py
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PRESET_DIR = REPO_ROOT / "capability-presets" / "multirepo-sdd"


def test_preset_yml_declares_all_five_templates():
    import yaml
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    names = {t["name"] for t in manifest["provides"]["templates"] if t["type"] == "template"}
    assert names == {
        "spec-template", "plan-template", "tasks-template",
        "checklist-template", "progress-template",
    }


def test_all_declared_template_files_exist():
    # Command-type entries are Task 5's scope (commands/*.md); this task
    # only covers the five type:"template" entries.
    import yaml
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    for t in manifest["provides"]["templates"]:
        if t["type"] != "template":
            continue
        assert (PRESET_DIR / t["file"]).exists(), t["file"]


def test_plan_fragment_has_repos_involved_table():
    text = (PRESET_DIR / "templates" / "plan-template.md").read_text()
    assert "Repos Involved" in text
    assert "Cross-Repo Integration Points" in text
    assert "Deployment Coordination" in text


def test_tasks_fragment_has_repo_branch_fields():
    text = (PRESET_DIR / "templates" / "tasks-template.md").read_text()
    assert "Repos Involved" in text
    assert "Cross-Repo Dependencies" in text


def test_spec_fragment_has_repos_affected_guidance():
    text = (PRESET_DIR / "templates" / "spec-template.md").read_text()
    assert "Repos Affected" in text


def test_checklist_fragment_has_cross_repo_and_deployment_items():
    text = (PRESET_DIR / "templates" / "checklist-template.md").read_text()
    assert "CHK-XR" in text
    assert "CHK-DC" in text


def test_progress_template_is_net_new_and_complete():
    text = (PRESET_DIR / "templates" / "progress-template.md").read_text()
    assert "Pull Requests" in text
    assert "Deployment Coordination" in text


def test_append_fragments_use_append_strategy_progress_replaces():
    import yaml
    manifest = yaml.safe_load((PRESET_DIR / "preset.yml").read_text())
    strategies = {t["name"]: t.get("strategy") for t in manifest["provides"]["templates"]}
    for name in ["spec-template", "plan-template", "tasks-template", "checklist-template"]:
        assert strategies[name] == "append", f"{name} should append onto the org base"
    assert strategies["progress-template"] == "replace", (
        "progress-template has no core equivalent to append onto"
    )
