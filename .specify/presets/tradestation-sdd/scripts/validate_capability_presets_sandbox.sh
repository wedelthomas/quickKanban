#!/usr/bin/env bash
set -euo pipefail
# validate_capability_presets_sandbox.sh <sandbox-dir>
#
# Human-runnable version of scripts/test_combined_capability_install.py --
# bootstraps a project with the org preset, then registers all four
# capability presets (multirepo-sdd, observability-sdd, security-sdd,
# city-plan-sdd) the way add-team-preset.sh registers a team preset (into
# .specify/presets/.registry, NOT via the native `specify preset add`,
# which is a separate, unrelated registry -- see docs/superpowers/specs/
# 2026-07-28-multirepo-preset-architecture-design.md §4a), and asserts the
# composed commands/templates carry every layer's contribution.
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="${1:?usage: validate_capability_presets_sandbox.sh <sandbox-dir>}"

fail() { echo "FAIL: $1" >&2; exit 1; }
pass() { echo "PASS: $1"; }

rm -rf "$SANDBOX"
mkdir -p "$SANDBOX"
cd "$SANDBOX"
specify init . --integration claude --here --force >/dev/null
bash "$REPO/install.sh" . --ai claude >/dev/null
pass "org baseline installed"

register_capability() {
    local name="$1" priority="$2" src="$REPO/capability-presets/$1"
    python3 -c "
import json
p = '.specify/presets/.registry'
d = json.load(open(p))
d['presets']['$name'] = {'priority': $priority, 'name': '$name'}
json.dump(d, open(p, 'w'))
"
    mkdir -p ".specify/presets/$name"
    [ -d "$src/templates" ] && cp -R "$src/templates" ".specify/presets/$name/"
    [ -d "$src/commands" ] && cp -R "$src/commands" ".specify/presets/$name/"
    cp "$src/preset.yml" ".specify/presets/$name/preset.yml"
}

register_capability multirepo-sdd 0
register_capability observability-sdd -1
register_capability security-sdd -2
register_capability city-plan-sdd -3
pass "all four capability presets registered"

# Re-run install.sh so the command-composition loop materializes every
# registered preset's contribution.
bash "$REPO/install.sh" . --ai claude >/dev/null
pass "install.sh re-run materialized composed commands"

PLAN=".claude/commands/speckit.plan.md"
IMPLEMENT=".claude/commands/speckit.implement.md"

grep -q "Auto-feedback" "$PLAN" || fail "org content missing from speckit.plan"
grep -q "workspace.json" "$PLAN" || fail "multirepo content missing from speckit.plan"
grep -q "ts-sdd-city-planning-integrations" "$PLAN" || fail "city-plan content missing from speckit.plan"
pass "speckit.plan composes org + multirepo + city-plan"

grep -q "/speckit.feedback" "$IMPLEMENT" || fail "org content missing from speckit.implement"
grep -q "workspace.json" "$IMPLEMENT" || fail "multirepo content missing from speckit.implement"
grep -q "abs-sdd-observability" "$IMPLEMENT" || fail "observability content missing from speckit.implement"
grep -q "abs-sdd-wiz-scan" "$IMPLEMENT" || fail "security content missing from speckit.implement"
pass "speckit.implement composes org + multirepo + observability + security"

# Captured to a variable and tested with bash's own substring match, not
# piped into `grep -q` -- `-q` exits the instant it matches, closing the
# pipe, which can SIGPIPE a still-writing upstream process; under
# `pipefail` that reports as a script failure even when the data was fine.
resolved_plan="$(bash "$REPO/scripts/render-template.sh" plan-template .)"
[[ "$resolved_plan" == *"Repos Involved"* ]] \
    || fail "multirepo template content missing from resolved plan-template"
pass "plan-template composes multirepo's Repos Involved table"

echo "ALL CAPABILITY-PRESET SANDBOX CHECKS PASSED"
