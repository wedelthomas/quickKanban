# scripts/_portable.sh
#
# Portable helpers for running the SDD preset under macOS, Linux, and native
# Windows (Git Bash / MSYS). This file is SOURCED, never executed directly,
# and is the ONLY place that knows about Windows. Keep it dependency-free
# (no non-builtin tools beyond `command`, `uname`, and optionally `cygpath`).

# Run Python portably: python3 -> python -> py -3. Falls through to `python3`
# if none resolve, so callers fail exactly as they did before (fail-open).
sdd_py() {
    if command -v python3 >/dev/null 2>&1; then
        python3 "$@"
    elif command -v python >/dev/null 2>&1; then
        python "$@"
    elif command -v py >/dev/null 2>&1; then
        py -3 "$@"
    else
        python3 "$@"
    fi
}

# True (0) under a Windows/MSYS shell, false (1) elsewhere.
sdd_is_windows() {
    case "${OS:-}|${MSYSTEM:-}|$(uname -s 2>/dev/null)" in
        *Windows_NT*|*MINGW*|*MSYS*|*CYGWIN*) return 0 ;;
        *) return 1 ;;
    esac
}

# Convert an MSYS path (/c/Users/x) to a native Windows path that Python's
# open() can resolve. Uses mixed mode (cygpath -m -> C:/Users/x): forward
# slashes embed safely in Python string literals and avoid backslash mangling.
# No-op (echoes the input unchanged) on macOS/Linux. No trailing newline.
#
# NB: this gates on $MSYSTEM + cygpath, while sdd_is_windows also accepts
# $OS=Windows_NT / uname. That asymmetry is intentional: conversion is only
# correct (and only needed) under an MSYS shell where cygpath exists. Git Bash
# — the supported target — sets both signals, so the two agree. Don't
# "harmonize" them: a bare Windows bash without cygpath must NOT convert.
sdd_winpath() {
    local path="${1:?sdd_winpath: path argument required}"
    if [ -n "${MSYSTEM:-}" ] && command -v cygpath >/dev/null 2>&1; then
        printf '%s' "$(cygpath -m "$path")"
    else
        printf '%s' "$path"
    fi
}

# Detect which AI mode(s) are already installed in a project, so a re-run
# of install.sh (from add-preset.sh / add-bundle.sh / check-update.sh)
# refreshes exactly what's there -- never silently adding Copilot support
# to a Claude-only project or vice versa. Echoes "claude", "copilot", or
# "both". Defaults to "claude" if neither marker is found (shouldn't
# happen post-install, but matches install.sh's own default-less-surprise
# fallback rather than erroring).
sdd_detect_ai_mode() {
    local target="${1:?sdd_detect_ai_mode: target path required}"
    local has_claude=0 has_copilot=0
    [ -d "$target/.claude/commands" ] && has_claude=1
    [ -d "$target/.github/agents" ] && has_copilot=1
    if [ "$has_claude" -eq 1 ] && [ "$has_copilot" -eq 1 ]; then
        echo "both"
    elif [ "$has_copilot" -eq 1 ] && [ "$has_claude" -eq 0 ]; then
        echo "copilot"
    else
        echo "claude"
    fi
}

# Guard against render-lib.sh's composition silently degrading every
# installed preset's strategy to "replace" when PyYAML isn't importable by
# whichever python `sdd_py` resolves (see AIP-236). A `replace` layer
# short-circuits everything below it, so the last preset processed clobbers
# every earlier preset's contribution with no error surfaced -- the existing
# in-function warning is stderr that every caller discards.
#
# A target with no presets registered yet has nothing to clobber, so this is
# a no-op there; it only fires once composition risk actually exists. Prints
# a loud, actionable error and returns 1 if PyYAML is unavailable while
# presets are registered; returns 0 otherwise (including "no registry yet").
sdd_require_pyyaml_for_composition() {
    local target="${1:?sdd_require_pyyaml_for_composition: target path required}"
    local registry="$target/.specify/presets/.registry"
    [ -f "$registry" ] || return 0

    local count
    count="$(sdd_py -c "
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
    print(len(data.get('presets', {})))
except Exception:
    print(0)
" "$(sdd_winpath "$registry")" 2>/dev/null)"
    case "$count" in ''|*[!0-9]*) return 0 ;; esac
    [ "$count" -gt 0 ] || return 0

    sdd_py -c "import yaml" >/dev/null 2>&1 && return 0

    echo "ERROR: PyYAML is not importable by the python that resolves on your" >&2
    echo "       PATH (python3 -> python -> py, in that order), but this project" >&2
    echo "       already has capability preset(s) registered." >&2
    echo "" >&2
    echo "       Without PyYAML, composition cannot read each preset's declared" >&2
    echo "       strategy and silently defaults every one to 'replace' -- the" >&2
    echo "       last preset processed clobbers earlier presets' content with" >&2
    echo "       no error." >&2
    echo "" >&2
    echo "       Fix: install PyYAML for that python (e.g. python3 -m pip install" >&2
    echo "       pyyaml) and try again." >&2
    return 1
}

# Print the installed spec-kit CLI version (e.g. 0.5.0) parsed from `uv tool list`,
# or nothing if uv / the tool is unavailable. OFFLINE — never runs `specify version`
# (that makes a GitHub API call and can hang). Used for non-blocking version advisories.
sdd_speckit_version() {
    command -v uv >/dev/null 2>&1 || return 0
    uv tool list 2>/dev/null | grep -iE '^specify-cli ' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true
}
