#!/usr/bin/env bash
# sdd-preset self-update check. Silent, throttled, fail-open, per entry.
#   check-update.sh <project-root>
# Exits 0 in ALL cases so the calling slash command always proceeds.
#
# Loops over every installed entry under .specify/presets/*/.install-meta.json
# (the org baseline, each capability preset, each bundle) and refreshes each
# independently -- one entry's failure never blocks another or the calling
# command. A meta file with no "kind" field is treated as "org" (today's
# only shape), so every already-installed project keeps working unmodified.
#
# Env:
#   SDD_UPDATE_DISABLE=1        disable entirely
#   SDD_UPDATE_WINDOW_HOURS=N   throttle window (default 24)
set -u

trap 'exit 0' ERR

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/_portable.sh" 2>/dev/null || exit 0

[ "${SDD_UPDATE_DISABLE:-0}" = "1" ] && exit 0

PROJECT="${1:-}"
[ -n "$PROJECT" ] || exit 0

WINDOW_HOURS="${SDD_UPDATE_WINDOW_HOURS:-24}"
case "$WINDOW_HOURS" in *[!0-9]*|'') WINDOW_HOURS=24 ;; esac
NOW="$(date +%s)"

# Process one installed entry. $1 = entry id (its directory name under
# .specify/presets/), $2 = its .install-meta.json path. Every failure inside
# this function returns quietly -- bash's ERR trap is NOT inherited by
# functions unless `set -o errtrace` is on, which it isn't here -- so one
# entry's problem can never abort the loop or another entry's check.
process_entry() {
    local id="$1" meta="$2"
    local meta_py; meta_py="$(sdd_winpath "$meta")"

    read_meta() { sdd_py -c "import json,sys; print(json.load(open('$meta_py')).get('$1',''))" 2>/dev/null; }
    local clone installed_sha last_check kind
    clone="$(read_meta source_clone)"
    installed_sha="$(read_meta installed_sha)"
    last_check="$(read_meta last_check)"
    kind="$(read_meta kind)"
    [ -n "$kind" ] || kind="org"

    local last_epoch
    last_epoch="$(sdd_py -c "import sys; v='$last_check'.strip(); print(int(float(v)) if v and v[0].isdigit() else 0)" 2>/dev/null || echo 0)"
    if [ "$last_epoch" -gt 0 ] 2>/dev/null; then
        local elapsed=$(( NOW - last_epoch ))
        [ "$elapsed" -lt $(( WINDOW_HOURS * 3600 )) ] && return 0
    fi

    write_meta() { # $1 = new installed_sha (optional)
        sdd_py - "$meta_py" "$1" "$NOW" <<'PY' 2>/dev/null || true
import json, sys
path, sha, now = sys.argv[1], sys.argv[2], int(sys.argv[3])
d = json.load(open(path))
if sha:
    d["installed_sha"] = sha
d["last_check"] = now
json.dump(d, open(path, "w"))
PY
    }
    write_meta ""   # throttle stamp written before any network work

    [ -n "$clone" ] || return 0
    [ -d "$clone/.git" ] || return 0

    export GIT_TERMINAL_PROMPT=0
    export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=10}"

    local timeout_bin=""
    command -v timeout  >/dev/null 2>&1 && timeout_bin="timeout"
    command -v gtimeout >/dev/null 2>&1 && timeout_bin="gtimeout"
    if [ -n "$timeout_bin" ]; then
        "$timeout_bin" 10s git -C "$clone" fetch --quiet origin 2>/dev/null || return 0
    else
        git -C "$clone" fetch --quiet origin 2>/dev/null || return 0
    fi

    local local_sha remote_sha
    local_sha="$(git -C "$clone" rev-parse @ 2>/dev/null)" || return 0
    remote_sha="$(git -C "$clone" rev-parse origin/main 2>/dev/null)" || return 0

    if [ "$local_sha" != "$remote_sha" ]; then
        if [ -z "$(git -C "$clone" status --porcelain 2>/dev/null)" ]; then
            git -C "$clone" pull --ff-only --quiet 2>/dev/null || true
        fi
    fi

    local clone_sha
    clone_sha="$(git -C "$clone" rev-parse HEAD 2>/dev/null)" || return 0

    if [ "$clone_sha" != "$installed_sha" ]; then
        case "$kind" in
            org)
                bash "$clone/install.sh" "$PROJECT" >/dev/null 2>&1 || return 0
                ;;
            preset)
                local prio
                prio="$(sdd_py -c "
import json
reg = json.load(open('$(sdd_winpath "$PROJECT/.specify/presets/.registry")'))
print(reg.get('presets', {}).get('$id', {}).get('priority', 0))
" 2>/dev/null)"
                bash "$clone/scripts/add-preset.sh" "$id" "$PROJECT" --source "$clone" --priority "${prio:-0}" >/dev/null 2>&1 || return 0
                ;;
            bundle)
                bash "$clone/scripts/add-bundle.sh" "$id" "$PROJECT" --source "$clone" >/dev/null 2>&1 || return 0
                ;;
        esac
        write_meta "$clone_sha"
    fi
    return 0
}

for meta in "$PROJECT"/.specify/presets/*/.install-meta.json; do
    [ -f "$meta" ] || continue
    # Pure parameter expansion, not dirname/basename: this loop runs at the
    # script's top level (not inside a function), so an external command
    # that's missing on a restricted PATH (see
    # test_check_update_works_without_python3's curated-bin simulation of
    # Windows) would trip the top-level ERR trap and abort the whole script
    # before any entry is processed.
    entry_dir="${meta%/.install-meta.json}"
    entry_id="${entry_dir##*/}"
    process_entry "$entry_id" "$meta" || true
done

# Capability-notice refresh (best-effort, fail-open, same throttle cadence
# as the loop above -- no new network calls). Recomputes the uninstalled
# count fresh every run so it's never stale; the only thing that persists
# across runs is the user's own "dismissed" choice, preserved by the merge
# below. See docs/superpowers/specs/2026-08-19-aip-221-capability-onboarding-design.md.
update_capability_notice() {
    local org_meta="$PROJECT/.specify/presets/tradestation-sdd/.install-meta.json"
    [ -f "$org_meta" ] || return 0
    local clone
    clone="$(sdd_py -c "import json,sys;print(json.load(open(sys.argv[1])).get('source_clone',''))" "$(sdd_winpath "$org_meta")" 2>/dev/null || true)"
    [ -n "$clone" ] || return 0
    [ -f "$clone/scripts/list-capabilities.sh" ] || return 0

    local listing
    listing="$(bash "$clone/scripts/list-capabilities.sh" "$PROJECT" --source "$clone" 2>/dev/null)" || return 0
    [ -n "$listing" ] || return 0

    local notice="$PROJECT/.specify/presets/tradestation-sdd/.capability-notice.json"
    sdd_py -c "
import json, sys
listing = json.loads(sys.argv[1])
available = sum(1 for p in listing.get('presets', []) if not p.get('installed')) \
          + sum(1 for b in listing.get('bundles', []) if not b.get('installed'))
notice_path = sys.argv[2]
now = int(sys.argv[3])
dismissed = False
try:
    with open(notice_path) as f:
        dismissed = bool(json.load(f).get('dismissed', False))
except Exception:
    pass
json.dump({'available_count': available, 'dismissed': dismissed, 'last_checked': now},
          open(notice_path, 'w'))
" "$listing" "$(sdd_winpath "$notice")" "$NOW" 2>/dev/null || true
    return 0
}
update_capability_notice || true

exit 0
