---
description: "Browse and install optional SDD capability presets/bundles on top of the org baseline, right here in chat"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.capabilities

Always available, any time — not gated by whether the capability-onboarding
nudge in `/speckit.feedback` has been shown or dismissed. Lets a team
discover and install capabilities/bundles conversationally instead of
reading documentation and running commands by hand.

## Workflow

1. Read `source_clone` from `.specify/presets/tradestation-sdd/.install-meta.json`
   in this project. If the file is missing, or the path it names isn't a
   valid `sdd-preset` clone (no `install.sh` and no `capability-presets/`
   directory there), tell the user:

   ```
   I can't find a local sdd-preset clone to install capabilities from.
   Clone it, then try again:
     git clone git@gitlab.com:tradestation/brokerage-services/ai-poc-projects/spec-kit/sdd-preset.git
   ```

   and stop.

2. Run `bash "<clone>/scripts/list-capabilities.sh" "$(pwd)" --source "<clone>"`
   and parse its JSON output.

3. Present the entries where `"installed": false` conversationally —
   bundles first (grouped as "install several capabilities together"),
   then individual presets, each with its `name` and `description`. Skip
   entries already installed; mention them only if the user asks what's
   already active. Explain in plain language, don't just dump the raw
   list — the user can ask questions before deciding.

4. Ask which to install. Accept natural-language answers (e.g. "the CRM
   bundle", "observability and security", "all of them").

5. For each pick:
   - Bundle: `bash "<clone>/scripts/add-bundle.sh" <id> "$(pwd)" --source "<clone>"`
   - Individual preset: `bash "<clone>/scripts/add-preset.sh" <id> "$(pwd)" --source "<clone>"`

   Report success/failure per item as it happens. On failure, show the
   error, then offer to retry that one or move on to the rest — one bad
   pick must never abort the others.

6. After all picks are processed, re-run
   `bash "<clone>/scripts/list-capabilities.sh" "$(pwd)" --source "<clone>"`,
   save its JSON output to a temp file (e.g. `/tmp/sdd-listing.json`), then
   refresh the notice file's `available_count` (preserving `dismissed`,
   refreshing `last_checked`) using this codebase's own heredoc idiom for
   `sdd_py` (the same pattern `add-preset.sh`/`add-bundle.sh` already use —
   avoids shell-quoting problems entirely):

   ```bash
   . .specify/presets/tradestation-sdd/scripts/_portable.sh
   sdd_py - "$(sdd_winpath "$(pwd)/.specify/presets/tradestation-sdd/.capability-notice.json")" /tmp/sdd-listing.json <<'PY'
   import json, sys, time
   notice_path, listing_path = sys.argv[1], sys.argv[2]
   listing = json.load(open(listing_path))
   available = sum(1 for p in listing.get("presets", []) if not p.get("installed")) \
             + sum(1 for b in listing.get("bundles", []) if not b.get("installed"))
   dismissed = False
   try:
       dismissed = bool(json.load(open(notice_path)).get("dismissed", False))
   except Exception:
       pass
   json.dump({"available_count": available, "dismissed": dismissed, "last_checked": int(time.time())},
             open(notice_path, "w"))
   PY
   ```

   This keeps the `/speckit.feedback` nudge from showing a stale count
   until the next throttled self-update cycle.

7. Summarize what's now installed.
