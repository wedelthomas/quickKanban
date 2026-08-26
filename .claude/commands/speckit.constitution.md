---
description: "Generate or amend the project constitution from the preset's constitution-template.md, then auto-trigger feedback"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.constitution

Generate or amend the project constitution per spec-kit conventions.
Project-scope (one constitution per project), not feature-scope.

## Workflow

1. Locate the constitution file (typically `memory/constitution.md`).
2. Obtain the constitution template by running
   `bash .specify/presets/tradestation-sdd/scripts/render-template.sh constitution-template`
   and use its (composed) stdout as the template. Do NOT read the preset `.md`
   directly — the composed output already applies any override or team-layer preset.
3. Fill in placeholders: `[PROJECT_NAME]`, `[RATIFICATION_DATE]`,
   `[LAST_AMENDED_DATE]`. Apply user-provided customizations
   (extra principles, tightened gates, custom workflow rules).
4. If the file already exists, treat the user input as an amendment
   and bump the version per the constitution's own Versioning
   policy (PATCH/MINOR/MAJOR).
5. Write the file. Commit per project conventions.

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

After the constitution is written or amended, automatically invoke
`/speckit.feedback constitution` so any friction from this step is
captured while it is fresh. The user can decline by passing empty
answers; the loop runs by default. If `/speckit.feedback` is
unavailable, note it in the response and continue — never block.
<!-- END AO-MANDATORY: feedback -->
