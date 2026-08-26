#!/usr/bin/env bash
set -euo pipefail
# add-preset.sh <preset-id> [project-root] [--source <clone>] [--priority N]
#
# Install a capability preset (authored under <clone>/capability-presets/<id>/)
# into a project: copy it in, register it in .registry, and write
# .install-meta.json (kind: "preset") so check-update.sh can refresh it
# later. Idempotent. Replaces add-team-preset.sh -- "team preset" is
# retired as a concept; a named group of presets is now a bundle
# (see add-bundle.sh).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/_portable.sh"

PRESET_ID="${1:?usage: add-preset.sh <preset-id> [project-root] [--source <clone>] [--priority N]}"
shift
TARGET="."
SOURCE=""
PRIORITY=""
while [ $# -gt 0 ]; do
    case "$1" in
        --source) SOURCE="${2:?--source needs a path}"; shift 2 ;;
        --source=*) SOURCE="${1#--source=}"; shift ;;
        --priority) PRIORITY="${2:?--priority needs a number}"; shift 2 ;;
        --priority=*) PRIORITY="${1#--priority=}"; shift ;;
        *) TARGET="$1"; shift ;;
    esac
done

TARGET="$(cd "$TARGET" && pwd)"
PRESETS_DIR="$TARGET/.specify/presets"
REGISTRY="$PRESETS_DIR/.registry"

# Resolve the preset clone: --source, else source_clone from the org meta.
if [ -z "$SOURCE" ]; then
    META_ORG="$PRESETS_DIR/tradestation-sdd/.install-meta.json"
    if [ -f "$META_ORG" ]; then
        SOURCE="$(sdd_py -c "import json,sys;print(json.load(open(sys.argv[1])).get('source_clone',''))" "$(sdd_winpath "$META_ORG")" 2>/dev/null || true)"
    fi
fi
if [ -z "$SOURCE" ] || [ ! -d "$SOURCE" ]; then
    echo "ERROR: cannot resolve the preset clone. Pass --source <clone>, or run install.sh first." >&2
    exit 1
fi

SRC_PRESET="$SOURCE/capability-presets/$PRESET_ID"
if [ ! -d "$SRC_PRESET" ]; then
    echo "ERROR: capability preset '$PRESET_ID' not found at $SRC_PRESET" >&2
    echo "Available capability presets:" >&2
    ls -1 "$SOURCE/capability-presets" 2>/dev/null | sed 's/^/  /' >&2 || echo "  (none)" >&2
    exit 1
fi

# Copy the preset in (idempotent refresh).
DEST="$PRESETS_DIR/$PRESET_ID"
mkdir -p "$DEST"
cp -R "$SRC_PRESET/." "$DEST/"
echo "Installed capability preset '$PRESET_ID' into $DEST"

# Register in .registry. Auto-assign the next slot below the current lowest
# priority when --priority is omitted -- a plain install can never collide
# with anything already installed, including the org baseline. A refresh
# (preset already registered, no --priority given) keeps its existing slot.
# Explicit --priority is honored and rejected on collision. stdlib json only.
REGISTRY_PY="$(sdd_winpath "$REGISTRY")"
MANIFEST_PY="$(sdd_winpath "$DEST/preset.yml")"
prio="$(sdd_py - "$REGISTRY_PY" "$PRESET_ID" "$MANIFEST_PY" "$PRIORITY" <<'PY'
import json, os, sys
reg_path, preset_id, manifest, explicit = sys.argv[1:5]
name = preset_id
try:
    import yaml
    with open(manifest) as f:
        m = yaml.safe_load(f) or {}
    name = (m.get("preset") or {}).get("name", preset_id)
except Exception:
    pass
reg = {}
if os.path.exists(reg_path):
    with open(reg_path) as f:
        reg = json.load(f)
presets = reg.setdefault("presets", {})
existing_others = {k: v.get("priority", 10) for k, v in presets.items()
                    if isinstance(v, dict) and k != preset_id}
if explicit:
    prio = int(explicit)
    if prio in existing_others.values():
        print(f"ERROR: priority {prio} already used by another installed preset", file=sys.stderr)
        sys.exit(1)
elif preset_id in presets and isinstance(presets[preset_id], dict) and "priority" in presets[preset_id]:
    prio = presets[preset_id]["priority"]
else:
    prio = (min(existing_others.values()) - 1) if existing_others else 0
presets[preset_id] = {"priority": prio, "name": name}
with open(reg_path, "w") as f:
    json.dump(reg, f, indent=2)
print(prio)
PY
)"
echo "Registered '$PRESET_ID' in .registry at priority $prio"

# Stamp install metadata (kind: "preset") so check-update.sh can refresh it.
SHA="$(git -C "$SOURCE" rev-parse HEAD 2>/dev/null || echo unknown)"
sdd_py - "$(sdd_winpath "$DEST/.install-meta.json")" "$SOURCE" "$SHA" <<'PY'
import json, sys
path, clone, sha = sys.argv[1], sys.argv[2], sys.argv[3]
json.dump({"source_clone": clone, "installed_sha": sha, "last_check": 0,
           "kind": "preset"}, open(path, "w"), indent=2)
PY

# Git-ignore this preset's machine-specific meta file (once), same as
# install.sh does for the org baseline's.
GITIGNORE="$TARGET/.gitignore"
META_IGNORE=".specify/presets/$PRESET_ID/.install-meta.json"
if ! { [ -f "$GITIGNORE" ] && grep -qxF "$META_IGNORE" "$GITIGNORE"; }; then
    printf '\n# sdd-preset machine-specific install metadata\n%s\n' "$META_IGNORE" >> "$GITIGNORE"
    echo "Added $META_IGNORE to .gitignore"
fi

# Re-run install.sh so the command-composition loop materializes this
# capability's command/agent contribution into .claude/commands/ and/or
# .github/agents/ -- registering it in .registry alone doesn't do that.
# Detect which AI mode(s) are already installed and refresh exactly that
# -- never silently add Copilot support to a Claude-only project or vice
# versa. Idempotent; safe to re-run.
bash "$SOURCE/install.sh" "$TARGET" --ai "$(sdd_detect_ai_mode "$TARGET")"
