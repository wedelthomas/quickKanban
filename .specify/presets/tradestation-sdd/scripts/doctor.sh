#!/usr/bin/env bash
# Portable entry point for doctor.py. Resolves the Python launcher and converts
# the script path for native Windows Python when run under Git Bash. Callers
# (command/agent markdown) invoke `bash .../doctor.sh ...` so nothing they run
# contains a literal `python3`.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/_portable.sh"
sdd_py "$(sdd_winpath "$DIR/doctor.py")" "$@"
