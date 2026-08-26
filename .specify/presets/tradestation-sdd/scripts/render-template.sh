#!/usr/bin/env bash
# scripts/render-template.sh
#
# Single source of composition. Prints the composed content for a template
# NAME to stdout; exits 1 if it resolves to nothing (or a broken wrap). Both
# agents converge here: Copilot via patched setup-plan.sh, Claude via the
# /speckit.plan command. NOT run under `set -e` — the vendored resolver manages
# its own control flow and returns non-zero as a normal signal.
set -o pipefail

SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# sdd_py (Windows-safe Python launcher) + sdd_have_py + the resolver.
. "$SCRIPT_DIR/_portable.sh"
. "$SCRIPT_DIR/render-lib.sh"

TEMPLATE_NAME="${1:?usage: render-template.sh <template-name> [repo-root]}"

# Repo root: explicit $2, else walk up for .specify, else pwd. Self-contained
# so this never needs the project's common.sh.
_find_root() {
    local dir; dir="$(cd -- "${1:-$(pwd)}" 2>/dev/null && pwd)" || { pwd; return; }
    local prev=""
    while [ "$dir" != "/" ] && [ "$dir" != "$prev" ]; do
        [ -d "$dir/.specify" ] && { printf '%s' "$dir"; return; }
        prev="$dir"; dir="$(dirname "$dir")"
    done
    pwd
}
REPO_ROOT="${2:-$(_find_root)}"

resolve_template_content "$TEMPLATE_NAME" "$REPO_ROOT"
exit $?
