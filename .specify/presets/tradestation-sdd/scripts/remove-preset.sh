#!/usr/bin/env bash
set -euo pipefail
# remove-preset.sh <preset-id> [project-root]
# remove-preset.sh --bundle <bundle-id> [project-root]
# remove-preset.sh --all [project-root]
#
# Undo what add-preset.sh / add-bundle.sh did: drop a capability preset's
# .registry entry and .specify/presets/<id>/ directory, then recompose so
# its content disappears from the composed command/agent files. --bundle
# removes every member of a named bundle plus the bundle's own meta
# directory; --all removes every installed preset and bundle, leaving pure
# org baseline. Never touches the org baseline itself (tradestation-sdd) --
# there is no "remove the org baseline" operation.
#
# Safe to run: templates are resolved fresh from the current registry on
# every render-template.sh call (nothing to clean up there), and every
# composed command/agent file is rebuilt from org baseline's own file list
# on every install.sh run -- so dropping a preset's registry entry and
# re-running install.sh is a complete, correct removal for everything the
# composition system actually materializes today.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/_portable.sh"

MODE="single"
PRESET_ID=""
BUNDLE_ID=""
TARGET="."
while [ $# -gt 0 ]; do
    case "$1" in
        --all) MODE="all"; shift ;;
        --bundle) MODE="bundle"; BUNDLE_ID="${2:?--bundle needs a bundle id}"; shift 2 ;;
        --bundle=*) MODE="bundle"; BUNDLE_ID="${1#--bundle=}"; shift ;;
        -*) echo "ERROR: unknown flag '$1'" >&2; exit 1 ;;
        *)
            if [ "$MODE" = "single" ] && [ -z "$PRESET_ID" ]; then
                PRESET_ID="$1"
            else
                TARGET="$1"
            fi
            shift
            ;;
    esac
done
if [ "$MODE" = "single" ] && [ -z "$PRESET_ID" ]; then
    echo "usage: remove-preset.sh <preset-id> [project-root]" >&2
    echo "       remove-preset.sh --bundle <bundle-id> [project-root]" >&2
    echo "       remove-preset.sh --all [project-root]" >&2
    exit 1
fi

TARGET="$(cd "$TARGET" && pwd)"
PRESETS_DIR="$TARGET/.specify/presets"
REGISTRY="$PRESETS_DIR/.registry"

if [ ! -f "$REGISTRY" ]; then
    echo "ERROR: no .registry found at $REGISTRY -- nothing installed to remove" >&2
    exit 1
fi

ORG_ID="tradestation-sdd"

# _drop_one <id>: delete its .specify/presets/<id>/ dir, strip its
# .registry entry (if any -- bundle meta dirs aren't registered there),
# and strip its .gitignore line. Does not recompose; callers do that once.
_drop_one() {
    local id="$1"
    if [ "$id" = "$ORG_ID" ]; then
        echo "ERROR: refusing to remove the org baseline ('$ORG_ID')." >&2
        echo "There is no 'remove the org baseline' operation -- install.sh manages it." >&2
        exit 1
    fi

    rm -rf "$PRESETS_DIR/$id"

    REGISTRY_PY="$(sdd_winpath "$REGISTRY")"
    sdd_py - "$REGISTRY_PY" "$id" <<'PY'
import json, os, sys
reg_path, preset_id = sys.argv[1:3]
if os.path.exists(reg_path):
    with open(reg_path) as f:
        reg = json.load(f)
    presets = reg.get("presets") or {}
    if preset_id in presets:
        del presets[preset_id]
        with open(reg_path, "w") as f:
            json.dump(reg, f, indent=2)
PY

    GITIGNORE="$TARGET/.gitignore"
    META_IGNORE=".specify/presets/$id/.install-meta.json"
    if [ -f "$GITIGNORE" ]; then
        sdd_py - "$(sdd_winpath "$GITIGNORE")" "$META_IGNORE" <<'PY'
import sys
path, line = sys.argv[1:3]
with open(path) as f:
    lines = f.readlines()
kept = [l for l in lines if l.rstrip("\n") != line]
if kept != lines:
    with open(path, "w") as f:
        f.writelines(kept)
PY
    fi

    echo "Removed '$id'"
}

# _bundle_members <bundle-id>: print each member preset id, one per line,
# or nothing (and a non-zero exit) if it isn't an installed bundle.
_bundle_members() {
    local bid="$1"
    local meta="$PRESETS_DIR/$bid/.install-meta.json"
    [ -f "$meta" ] || return 1
    sdd_py -c "
import json, sys
d = json.load(open(sys.argv[1]))
if d.get('kind') != 'bundle':
    sys.exit(1)
for m in d.get('members', []):
    print(m['id'])
" "$(sdd_winpath "$meta")"
}

case "$MODE" in
    single)
        REG_JSON="$(cat "$REGISTRY")"
        IS_REGISTERED="$(printf '%s' "$REG_JSON" | sdd_py -c "
import json, sys
d = json.load(sys.stdin)
print('$PRESET_ID' in (d.get('presets') or {}))
")"
        HAS_DIR=false
        [ -d "$PRESETS_DIR/$PRESET_ID" ] && HAS_DIR=true
        if [ "$IS_REGISTERED" != "True" ] && [ "$HAS_DIR" = false ]; then
            echo "ERROR: '$PRESET_ID' is not installed in $TARGET" >&2
            echo "Installed presets:" >&2
            printf '%s' "$REG_JSON" | sdd_py -c "
import json, sys
d = json.load(sys.stdin)
for pid in sorted((d.get('presets') or {}).keys()):
    print('  ' + pid)
" >&2
            exit 1
        fi

        # Note (not blocking) if a bundle claims this preset as a member --
        # its own membership record won't be updated by this script.
        for d in "$PRESETS_DIR"/*/; do
            bid="$(basename "$d")"
            [ "$bid" = "$PRESET_ID" ] && continue
            members="$(_bundle_members "$bid" 2>/dev/null || true)"
            if printf '%s\n' "$members" | grep -qxF "$PRESET_ID"; then
                echo "NOTE: '$PRESET_ID' is a member of installed bundle '$bid' -- its recorded membership will no longer match reality." >&2
            fi
        done

        _drop_one "$PRESET_ID"
        ;;

    bundle)
        MEMBERS="$(_bundle_members "$BUNDLE_ID")" || {
            echo "ERROR: '$BUNDLE_ID' is not an installed bundle in $TARGET" >&2
            exit 1
        }
        while IFS= read -r m; do
            [ -n "$m" ] || continue
            _drop_one "$m"
        done <<< "$MEMBERS"
        _drop_one "$BUNDLE_ID"
        ;;

    all)
        for d in "$PRESETS_DIR"/*/; do
            id="$(basename "$d")"
            [ "$id" = "$ORG_ID" ] && continue
            _drop_one "$id"
        done
        ;;
esac

# Recompose once so the removed preset's/bundle's content disappears from
# the composed command/agent files. Detect which AI mode(s) are already
# installed and refresh exactly that.
bash "$REPO_ROOT/install.sh" "$TARGET" --ai "$(sdd_detect_ai_mode "$TARGET")"

echo ""
echo "Done."
