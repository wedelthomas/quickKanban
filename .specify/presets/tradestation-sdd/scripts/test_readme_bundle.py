# scripts/test_readme_bundle.py
#
# README documents the capability/bundle install path, not the retired
# team-preset one.
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
README = (REPO / "README.md").read_text()


def test_readme_documents_bundle_install():
    assert "init-project.sh my-crm-app --bundle crm" in README
    assert "add-bundle.sh crm" in README
    assert "bundles/crm.yaml" in README or "bundles/" in README


def test_readme_documents_single_capability_install():
    assert "add-preset.sh" in README


def test_readme_no_longer_mentions_team_preset():
    assert "--team" not in README
    assert "team-preset" not in README.lower()
    assert "add-team-preset.sh" not in README
