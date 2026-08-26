#!/usr/bin/env bash
# Back-compat shim + portable entry point. The SDD feedback client is
# post-feedback.py; this forwards all arguments to it through the portable
# Python launcher so it works under Git Bash on Windows too.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/_portable.sh"
sdd_py "$(sdd_winpath "$DIR/post-feedback.py")" "$@"
