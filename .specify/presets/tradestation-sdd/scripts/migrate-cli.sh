#!/usr/bin/env bash
# scripts/migrate-cli.sh — OPT-IN, consented upgrade of the GLOBAL specify CLI (uv tool).
# NEVER run automatically or by the self-update. Does NOT modify any project's .specify/.
set -euo pipefail
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_portable.sh"          # sdd_speckit_version

TARGET_VER="v0.12.8"
FROM="git+https://github.com/github/spec-kit.git@${TARGET_VER}"
ROLLBACK_VER="v0.5.0"

ASSUME_YES=0
for a in "$@"; do case "$a" in --yes|-y) ASSUME_YES=1;; esac; done

current="$(sdd_speckit_version)"; [ -n "$current" ] || current="unknown"

# Already on the target? Nothing to migrate — don't prompt for a pointless
# uninstall/reinstall. Normalize the leading 'v' away for the compare:
# sdd_speckit_version reports e.g. 0.12.8, while TARGET_VER is v0.12.8.
if [ "${current#v}" = "${TARGET_VER#v}" ]; then
    cat <<EOF
Spec Kit CLI migration (GLOBAL, per-machine)
  current : ${current}
  target  : ${TARGET_VER}

Already on the target version — nothing to migrate.
EOF
    exit 0
fi

cat <<EOF
Spec Kit CLI migration (GLOBAL, per-machine)
  current : ${current}
  target  : ${TARGET_VER}

This uninstalls + reinstalls the global 'specify' CLI. It does NOT change any
existing project's .specify/ files, commands, or templates. New projects created
after this use the 'specify init --integration <agent>' syntax.

Rollback (any time):
  uv tool uninstall specify-cli && uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@${ROLLBACK_VER}
EOF

if [ "$ASSUME_YES" -ne 1 ]; then
    printf '\nProceed with the upgrade? [y/N] '
    read -r ans || ans=""
    case "$ans" in
        y|Y|yes|YES) ;;
        *) echo "Aborted — no changes made."; exit 0 ;;
    esac
fi

printf '%s\n' "$current" > "$HOME/.sdd-cli-prev-version" 2>/dev/null || true   # rollback aid
uv tool uninstall specify-cli 2>/dev/null || true
uv tool install specify-cli --from "$FROM"
echo "Installed: $(sdd_speckit_version)"
echo "Verify with your project's doctor (R9). Rollback command is printed above."
