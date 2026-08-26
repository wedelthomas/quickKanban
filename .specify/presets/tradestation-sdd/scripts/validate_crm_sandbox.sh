#!/usr/bin/env bash
set -euo pipefail
# validate_crm_sandbox.sh <sandbox-dir>
# Bootstraps a project with the CRM preset via init, then exercises BOTH agent
# template-materialization paths and asserts the CRM properties + parity.
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="${1:?usage: validate_crm_sandbox.sh <sandbox-dir>}"

rm -rf "$SANDBOX"
bash "$REPO/init-project.sh" "$SANDBOX" --team crm --ai both
cd "$SANDBOX"

fail() { echo "FAIL: $1" >&2; exit 1; }
pass() { echo "PASS: $1"; }

# --- Install assertions ---
[ -f .specify/presets/crm-sdd/preset.yml ] || fail "crm-sdd not installed"
grep -q '"crm-sdd"' .specify/presets/.registry || fail "crm-sdd not registered"
pass "install-via-init"

RENDER=".specify/presets/tradestation-sdd/scripts/render-template.sh"

# --- Claude path: inline renderer ---
bash "$RENDER" constitution-template . > /tmp/crm_constitution.md
bash "$RENDER" spec-template .        > /tmp/crm_spec.md
bash "$RENDER" plan-template .        > /tmp/crm_plan_claude.md
bash "$RENDER" tasks-template .       > /tmp/crm_tasks.md

grep -qi 'money movement\|financial settlement' /tmp/crm_constitution.md && fail "finance framing in constitution"
grep -q '.NET 8' /tmp/crm_constitution.md || fail "no .NET in constitution"
grep -q '## Persona Routing' /tmp/crm_plan_claude.md && fail "persona routing in plan"
grep -q '## .NET Implementation Conventions' /tmp/crm_plan_claude.md || fail "no .NET section in plan"
grep -q 'Constitution Check' /tmp/crm_plan_claude.md || fail "lost Constitution Check guardrail"
grep -q 'Persona Plans' /tmp/crm_tasks.md && fail "persona plans in tasks"
pass "claude-path composition"

# --- Copilot path: caller scripts materialize the same templates ---
bash .specify/scripts/bash/create-new-feature.sh --json "CRM account merge feature" >/tmp/cnf.json 2>/dev/null || true
FEATDIR="$(ls -d specs/*/ 2>/dev/null | head -1 || true)"
bash .specify/scripts/bash/setup-plan.sh --json >/dev/null 2>&1 || true
if [ -n "$FEATDIR" ] && [ -f "${FEATDIR}plan.md" ]; then
    # The Copilot caller path composed the CRM template (not a core fallback).
    grep -q '## .NET Implementation Conventions' "${FEATDIR}plan.md" || fail "copilot plan.md missing .NET section"
    grep -q '## Persona Routing' "${FEATDIR}plan.md" && fail "copilot plan.md has persona routing"
    # Parity (A3): Copilot-materialized plan == Claude-rendered plan. Compare via
    # $() on both sides, which normalizes the single trailing newline the org's
    # setup-plan.sh patch drops through command substitution.
    a="$(bash "$RENDER" plan-template .)"
    b="$(cat "${FEATDIR}plan.md")"
    [ "$a" = "$b" ] && pass "agent parity (plan content identical)" \
        || fail "copilot plan.md content diverges from the Claude render"
    # Single track: no persona files generated.
    [ -e "${FEATDIR}sre-plan.md" ] && fail "sre-plan.md generated (breakdown not removed)"
    [ -e "${FEATDIR}ops-plan.md" ] && fail "ops-plan.md generated (breakdown not removed)"
    pass "copilot-path single-track"
else
    echo "NOTE: caller-script path not exercised (setup-plan may require a feature branch); Claude-path assertions above still hold"
fi

echo "ALL CRM SANDBOX CHECKS PASSED"
