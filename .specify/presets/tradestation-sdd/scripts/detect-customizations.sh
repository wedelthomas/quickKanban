#!/usr/bin/env bash
# scripts/detect-customizations.sh
#
# Preflight: surface team customizations that install.sh would overwrite/delete,
# BEFORE it does. Dry-run by default; exits non-zero if anything is AT RISK so a
# human/CI can gate on it. NEVER auto-moves files. Baseline = this preset clone.
set -euo pipefail
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_portable.sh"          # sdd_is_windows
CLONE="$(cd "$SCRIPT_DIR/.." && pwd)" # the preset clone = baseline

DO_BACKUP=false; DO_APPLY=false; TARGET="."
for arg in "$@"; do
    case "$arg" in
        --backup) DO_BACKUP=true ;;
        --apply)  DO_APPLY=true ;;
        --*)      echo "unknown flag: $arg" >&2; exit 2 ;;
        *)        TARGET="$arg" ;;
    esac
done
TARGET="$(cd "$TARGET" && pwd)"
PRESET="$TARGET/.specify/presets/tradestation-sdd"
risk=0
note() { printf '  %s\n' "$1"; }

# Baseline must be a real preset CLONE (has install.sh + copilot-agents/). When
# this script is the copy install.sh placed inside a project, CLONE points at the
# installed preset itself — useless as a baseline. Recover the real clone from the
# stamped .install-meta.json source_clone; if none is usable, FAIL LOUD rather than
# silently reporting "clean" (a false negative from a safety tool).
if [ ! -f "$CLONE/install.sh" ] || [ ! -d "$CLONE/copilot-agents" ]; then
    meta="$SCRIPT_DIR/../.install-meta.json"
    src=""
    [ -f "$meta" ] && src="$(sdd_py -c "import json,sys;print(json.load(open(sys.argv[1])).get('source_clone',''))" "$(sdd_winpath "$meta")" 2>/dev/null || true)"
    if [ -n "$src" ] && [ -f "$src/install.sh" ] && [ -d "$src/copilot-agents" ]; then
        CLONE="$(cd "$src" && pwd)"
    else
        echo "ERROR: no baseline to compare against here (this looks like the in-project copy)." >&2
        echo "Run detect-customizations.sh from the sdd-preset CLONE, e.g.:" >&2
        echo "  bash /path/to/sdd-preset/scripts/detect-customizations.sh \"$TARGET\"" >&2
        exit 2
    fi
fi

echo "== AT RISK (install.sh will overwrite/delete) =="
# 1 + 2: installed templates/commands that differ from baseline, or are team-added
for sub in templates commands; do
    for f in "$PRESET/$sub"/*.md; do
        [ -e "$f" ] || continue
        base="$CLONE/$sub/$(basename "$f")"
        if [ ! -f "$base" ]; then
            note "team-added (not in baseline): $f"; risk=1
        elif ! diff -q "$f" "$base" >/dev/null 2>&1; then
            note "locally edited: $f"; risk=1
        fi
    done
done
# (Former check 3 — "plain file where a symlink is expected" — removed:
# .claude/commands/*.md are composed/materialized by the resolver now
# (see docs/superpowers/specs/2026-07-28-multirepo-preset-architecture-design.md
# §4a), not symlinks to a single preset's raw file, so a real file there is
# the expected shape, not a risk signal.)
# 4: skills that collide with a command (install.sh rm -rf's these)
for s in "$TARGET"/.claude/skills/speckit-*; do
    [ -d "$s" ] || continue
    cmd="$(basename "$s")"; cmd="${cmd/-/.}"
    [ -e "$TARGET/.claude/commands/$cmd.md" ] && { note "skill will be rm -rf'd: $s"; risk=1; }
done
# 5: edited copilot agents
for a in "$TARGET"/.github/agents/speckit.*.agent.md; do
    [ -e "$a" ] || continue
    base="$CLONE/copilot-agents/$(basename "$a")"
    [ -f "$base" ] && ! diff -q "$a" "$base" >/dev/null 2>&1 && { note "edited copilot agent: $a"; risk=1; }
done

echo "== SAFE (preserved / win over preset) =="
for o in "$TARGET"/.specify/templates/overrides/*.md; do
    [ -e "$o" ] && note "override (survives, wins): $o"
done
[ "$risk" -eq 0 ] && echo "  none detected."

# Optional backup (never automatic; requires --apply to actually write)
if [ "$DO_BACKUP" = true ]; then
    if [ "$DO_APPLY" = true ]; then
        ts="$(date +%Y%m%d-%H%M%S)"
        dest="$TARGET/.sdd-backups/$ts"
        for p in .specify .claude/commands .github/agents; do
            if [ -e "$TARGET/$p" ]; then
                mkdir -p "$dest/$(dirname "$p")"
                cp -R "$TARGET/$p" "$dest/$p"
            fi
        done
        echo "Backup written to $dest"
    else
        echo "(--backup) would snapshot .specify/, .claude/commands, .github/agents (pass --apply to perform)"
    fi
fi

exit "$risk"
