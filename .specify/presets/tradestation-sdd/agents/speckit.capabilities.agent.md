---
description: Browse and install optional SDD capability presets/bundles on top of the org baseline, right here in chat.
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the agent workflow below.

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
   already active.

4. Ask which to install. Accept natural-language answers.

5. For each pick:
   - Bundle: `bash "<clone>/scripts/add-bundle.sh" <id> "$(pwd)" --source "<clone>"`
   - Individual preset: `bash "<clone>/scripts/add-preset.sh" <id> "$(pwd)" --source "<clone>"`

   Report success/failure per item; on failure, offer to retry or move on
   — one bad pick must never abort the others.

6. After all picks are processed, re-run `list-capabilities.sh` and update
   `.specify/presets/tradestation-sdd/.capability-notice.json`'s
   `available_count` (preserving `dismissed`, refreshing `last_checked`) so
   the `/speckit.feedback` nudge doesn't show a stale count.

7. Summarize what's now installed.
