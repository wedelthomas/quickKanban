#!/usr/bin/env bash
set -euo pipefail
# add-bundle.sh <bundle-id> [project-root] [--source <clone>]
#
# Install a bundle: the org baseline (if not already present) plus every
# capability preset listed in <clone>/bundles/<bundle-id>.yaml, at the
# priority each declares. Delegates each member's install to add-preset.sh
# so registration/priority/meta logic lives in exactly one place. Replaces
# install-bundle.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/_portable.sh"

BUNDLE_ID="${1:?usage: add-bundle.sh <bundle-id> [project-root] [--source <clone>]}"
shift
TARGET="."
SOURCE=""
while [ $# -gt 0 ]; do
    case "$1" in
        --source) SOURCE="${2:?--source needs a path}"; shift 2 ;;
        --source=*) SOURCE="${1#--source=}"; shift ;;
        *) TARGET="$1"; shift ;;
    esac
done
[ -z "$SOURCE" ] && SOURCE="$REPO_ROOT"

BUNDLE_FILE="$SOURCE/bundles/$BUNDLE_ID.yaml"
if [ ! -f "$BUNDLE_FILE" ]; then
    echo "ERROR: no such bundle '$BUNDLE_ID' (expected $BUNDLE_FILE)" >&2
    echo "Available bundles:" >&2
    ls -1 "$SOURCE/bundles/"*.yaml 2>/dev/null | xargs -n1 basename | sed 's/\.yaml$//' | sed 's/^/  /' >&2 || echo "  (none)" >&2
    exit 1
fi

TARGET="$(cd "$TARGET" && pwd)"
if [ ! -d "$TARGET/.specify" ]; then
    echo "ERROR: $TARGET is not a speckit project (no .specify/ directory)" >&2
    exit 1
fi

# 1. Org baseline first, only if not already present. Fresh bootstrap --
#    nothing to detect yet, so use install.sh's own default (both).
if [ ! -d "$TARGET/.specify/presets/tradestation-sdd" ]; then
    bash "$SOURCE/install.sh" "$TARGET"
fi

# 2. Read the bundle manifest's capability list (id + priority).
BUNDLE_JSON="$(sdd_py -c "
import json, sys, yaml
with open('$(sdd_winpath "$BUNDLE_FILE")') as f:
    data = yaml.safe_load(f)
print(json.dumps(data))
")"
CAPABILITIES="$(printf '%s' "$BUNDLE_JSON" | sdd_py -c "
import json, sys
data = json.load(sys.stdin)
for cap in data['capabilities']:
    print(f\"{cap['id']}\t{cap['priority']}\")
")"

# 3. Install each member via add-preset.sh.
count=0
while IFS=$'\t' read -r cap_id cap_priority; do
    [ -n "$cap_id" ] || continue
    bash "$SCRIPT_DIR/add-preset.sh" "$cap_id" "$TARGET" --source "$SOURCE" --priority "$cap_priority"
    count=$((count + 1))
done <<< "$CAPABILITIES"

# 4. Re-run install.sh so the command-composition loop materializes every
#    newly-registered capability's contribution. Detect which AI mode(s)
#    are already installed and refresh exactly that.
bash "$SOURCE/install.sh" "$TARGET" --ai "$(sdd_detect_ai_mode "$TARGET")"

# 5. Stamp the bundle's own install metadata (kind: "bundle") plus its
#    member list, so check-update.sh can detect if bundles/<id>.yaml's
#    membership itself changes later, not just individual presets' content.
DEST="$TARGET/.specify/presets/$BUNDLE_ID"
mkdir -p "$DEST"
SHA="$(git -C "$SOURCE" rev-parse HEAD 2>/dev/null || echo unknown)"
sdd_py - "$(sdd_winpath "$DEST/.install-meta.json")" "$SOURCE" "$SHA" "$BUNDLE_JSON" <<'PY'
import json, sys
path, clone, sha, bundle_json = sys.argv[1:5]
data = json.loads(bundle_json)
members = [{"id": c["id"], "priority": c["priority"]} for c in data["capabilities"]]
json.dump({"source_clone": clone, "installed_sha": sha, "last_check": 0,
           "kind": "bundle", "members": members},
          open(path, "w"), indent=2)
PY

# Git-ignore the bundle's own machine-specific meta file (once). Its
# directory holds nothing else -- members are committed individually, each
# already git-ignoring its own meta file via add-preset.sh above.
GITIGNORE="$TARGET/.gitignore"
META_IGNORE=".specify/presets/$BUNDLE_ID/.install-meta.json"
if ! { [ -f "$GITIGNORE" ] && grep -qxF "$META_IGNORE" "$GITIGNORE"; }; then
    printf '\n# sdd-preset machine-specific install metadata\n%s\n' "$META_IGNORE" >> "$GITIGNORE"
    echo "Added $META_IGNORE to .gitignore"
fi

echo ""
echo "Bundle '$BUNDLE_ID' installed: org baseline + $count capability preset(s)."
