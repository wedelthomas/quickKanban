# scripts/test_init_project_bundle.py
#
# init-project.sh parses --bundle (renamed from --team) and, after running
# install.sh for the org baseline, calls add-bundle.sh to layer it. Full
# init runs `specify init` (network) -- this asserts the plumbing statically.
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parent.parent
SRC = (REPO / "init-project.sh").read_text()


def test_no_longer_parses_team_flag():
    assert "--team" not in SRC


def test_parses_bundle_flag():
    assert "--bundle=" in SRC
    assert re.search(r'prev_arg.*==.*--bundle', SRC) or '"--bundle"' in SRC


def test_calls_add_bundle_when_set():
    assert "add-bundle.sh" in SRC
    assert "BUNDLE" in SRC
