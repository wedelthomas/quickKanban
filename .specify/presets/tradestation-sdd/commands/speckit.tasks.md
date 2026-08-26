---
description: "Generate tasks.md from tasks-template.md, then auto-trigger feedback"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.tasks

Generate `tasks.md` per spec-kit conventions.

## Workflow

1. Read the active feature's `spec.md` and `plan.md`.
2. Obtain the tasks template by running
   `bash .specify/presets/tradestation-sdd/scripts/render-template.sh tasks-template`
   and use its (composed) stdout as the template. Do NOT read the preset `.md`
   directly — the composed output applies any project override or team-layer preset.
3. Generate `specs/<feature-id>/tasks.md`. Phase ordering:
   Setup → Foundational (blocks all stories) → User Stories
   (by priority) → Polish. Within a story:
   Tests fail first → Models → Services → Endpoints → Integration.
4. Tests are MANDATORY when spec defines coverage, success criteria
   reference CI/tests, plan lists test files, or constitution
   mandates tests. Tests appear BEFORE implementation tasks.
5. Mark `[P]` aggressively where files do not overlap.

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

After tasks.md is written, automatically invoke
`/speckit.feedback tasks` so any friction
from this step is captured while it is fresh. The user can decline
by passing empty answers; the loop runs by default. If
`/speckit.feedback` is unavailable, note it in the response and
continue — never block.
<!-- END AO-MANDATORY: feedback -->
