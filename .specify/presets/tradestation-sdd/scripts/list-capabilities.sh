#!/usr/bin/env bash
set -euo pipefail
# list-capabilities.sh <project-root> [--source <clone>]
#
# Discovers every capability preset and bundle available in a local
# sdd-preset clone, and reports whether each is already installed in the
# target project. Shared by check-update.sh (counting, for the capability
# notice) and speckit.capabilities (listing, for the interactive picker).
# Prints JSON to stdout: {"bundles": [...], "presets": [...]}, each entry
# {id, name, description, installed}.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/_portable.sh"

TARGET="${1:?usage: list-capabilities.sh <project-root> [--source <clone>]}"
shift
SOURCE=""
while [ $# -gt 0 ]; do
    case "$1" in
        --source) SOURCE="${2:?--source needs a path}"; shift 2 ;;
        --source=*) SOURCE="${1#--source=}"; shift ;;
        *) shift ;;
    esac
done

TARGET="$(cd "$TARGET" && pwd)"
PRESETS_DIR="$TARGET/.specify/presets"

# Resolve the clone: --source, else source_clone from the org meta (same
# pattern add-preset.sh already uses).
if [ -z "$SOURCE" ]; then
    META_ORG="$PRESETS_DIR/tradestation-sdd/.install-meta.json"
    if [ -f "$META_ORG" ]; then
        SOURCE="$(sdd_py -c "import json,sys;print(json.load(open(sys.argv[1])).get('source_clone',''))" "$(sdd_winpath "$META_ORG")" 2>/dev/null || true)"
    fi
fi
if [ -z "$SOURCE" ] || [ ! -d "$SOURCE" ]; then
    echo '{"error": "cannot resolve the preset clone"}'
    exit 1
fi

# Fail loudly (AIP-236) rather than let a bare `import yaml` crash below
# with a raw traceback that every caller either discards (check-update.sh
# redirects stderr, silently never writing the capability notice) or has
# no good way to present (speckit.capabilities parses stdout as JSON).
if ! sdd_py -c "import yaml" >/dev/null 2>&1; then
    echo '{"error": "PyYAML not available to the resolved python3 (python3 -> python -> py). Install it (e.g. python3 -m pip install pyyaml) and try again."}'
    exit 1
fi

sdd_py -c "
import json, os, sys
import yaml

source = sys.argv[1]
presets_dir = sys.argv[2]


def installed_ids():
    ids = set()
    reg_path = os.path.join(presets_dir, '.registry')
    if os.path.isfile(reg_path):
        try:
            with open(reg_path) as f:
                reg = json.load(f)
            ids.update(reg.get('presets', {}).keys())
        except Exception:
            pass
    if os.path.isdir(presets_dir):
        for name in os.listdir(presets_dir):
            meta = os.path.join(presets_dir, name, '.install-meta.json')
            if os.path.isfile(meta):
                try:
                    with open(meta) as f:
                        m = json.load(f)
                    if m.get('kind') == 'bundle':
                        ids.add(name)
                except Exception:
                    pass
    return ids


installed = installed_ids()

presets = []
cp_dir = os.path.join(source, 'capability-presets')
if os.path.isdir(cp_dir):
    for pid in sorted(os.listdir(cp_dir)):
        manifest = os.path.join(cp_dir, pid, 'preset.yml')
        if not os.path.isfile(manifest):
            continue
        try:
            with open(manifest) as f:
                m = yaml.safe_load(f) or {}
        except Exception:
            m = {}
        p = m.get('preset', {}) or {}
        presets.append({
            'id': pid,
            'name': p.get('name', pid),
            'description': p.get('description', ''),
            'installed': pid in installed,
        })

bundles = []
b_dir = os.path.join(source, 'bundles')
if os.path.isdir(b_dir):
    for fname in sorted(os.listdir(b_dir)):
        if not (fname.endswith('.yaml') or fname.endswith('.yml')):
            continue
        bid = fname.rsplit('.', 1)[0]
        try:
            with open(os.path.join(b_dir, fname)) as f:
                m = yaml.safe_load(f) or {}
        except Exception:
            m = {}
        b = m.get('bundle', {}) or {}
        bundles.append({
            'id': bid,
            'name': b.get('name', bid),
            'description': b.get('description', ''),
            'installed': bid in installed,
        })

print(json.dumps({'bundles': bundles, 'presets': presets}))
" "$SOURCE" "$PRESETS_DIR"
