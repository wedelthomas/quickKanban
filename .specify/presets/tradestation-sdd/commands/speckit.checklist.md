---
description: "Generate a domain-specific quality checklist for the active feature, then auto-trigger feedback"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.checklist

Generate a quality / review checklist scoped to the active feature.

## Workflow

1. Read the active feature's `spec.md` (and `plan.md` if helpful).
2. Generate `specs/<feature-id>/checklist.md` with categories driven
   by the user's instruction (e.g., financial correctness, security
   review).
3. Each item MUST be specific, falsifiable, and tied to spec/plan
   content — no generic "Is the code clean?" entries.

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

After checklist.md is written, automatically invoke
`/speckit.feedback checklist` so any friction from this step is
captured while it is fresh. The user can decline by passing empty
answers; the loop runs by default. If `/speckit.feedback` is
unavailable, note it in the response and continue — never block.
<!-- END AO-MANDATORY: feedback -->
