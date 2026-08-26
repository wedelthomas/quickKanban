# scripts/test_multirepo_scaffolding.py
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCAFFOLDING = REPO_ROOT / "capability-presets" / "multirepo-sdd" / "scaffolding"
PRESET_DIR = REPO_ROOT / "capability-presets" / "multirepo-sdd"


def test_sub_repo_stamps_exist():
    assert (SCAFFOLDING / "sub-repo-claude.md").exists()
    assert (SCAFFOLDING / "sub-repo-copilot.md").exists()


def test_sub_repo_stamps_document_credential_rule_and_tasks_targeting():
    for name in ["sub-repo-claude.md", "sub-repo-copilot.md"]:
        text = (SCAFFOLDING / name).read_text()
        assert "credential" in text.lower()
        assert "tasks.md" in text
        assert "this repo" in text.lower()


def test_workspace_schema_is_valid_json_and_covers_real_hosts():
    import json
    schema = json.loads((SCAFFOLDING / "workspace.schema.json").read_text())
    assert schema["required"] == ["project_name", "github_org", "repos"]
    hosts = schema["properties"]["repos"]["items"]["properties"]["host"]["enum"]
    assert set(hosts) == {"github", "azure-devops", "gitlab"}


def test_preset_readme_exists_and_documents_install():
    text = (PRESET_DIR / "README.md").read_text()
    assert "specify preset add --dev" in text
    assert "scaffolding/" in text
