---
description: "Generate a feature spec from spec-template.md, then auto-trigger feedback"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

<!-- sdd-preset: setup preflight (advisory, throttled, no browser) -->
Then run the setup preflight:
`bash .specify/presets/tradestation-sdd/scripts/doctor.sh --preflight --tool claude`
If it prints a "setup issues" block, show that block to the user verbatim and
continue — it is advisory and MUST NOT block. If it prints nothing, say nothing.

# /speckit.specify

Generate a feature spec.md per spec-kit conventions. Creates a new
feature directory and seeds it with the spec.

## Detect input type FIRST (before any generation)

Before running the Workflow below, classify the user's input:

- **Complete external spec** if EITHER:
  - the argument is (or contains) a path to an existing file whose contents
    carry spec-template headings; OR
  - the pasted text contains all three mandatory template headings
    (`## User Scenarios & Testing`, `## Requirements`, `## Success Criteria`)
    and the body spans multiple sections, not a one-line description.
- **Feature description** otherwise (a short sentence or paragraph with no
  template structure).
- **When detection is ambiguous, err toward treating it as a complete spec and
  ask** — an extra question is cheaper than silently rebuilding an authored spec.

When the input looks like a **complete external spec**, STOP and ask the user
exactly one question before doing anything else:

> This looks like a complete spec. Adopt it verbatim, or treat it as a
> description to expand?

**Always ask this question when a complete spec is detected — there is no
bypass.** Do not generate, summarize, rewrite, restructure, or run the
clarification loop while waiting for the answer.

- If the user chooses **adopt** → follow "Adopt mode (verbatim)" below and do
  NOT run the generation Workflow.
- If the user chooses **expand/describe** (or the input was a plain
  description) → run the generation Workflow below as normal.
- Treat any affirmative reply ("yes", "adopt", "go ahead") as **adopt**; if the
  reply is unclear, ask once more rather than guessing.

### Adopt mode (verbatim)

1. Create the feature branch and `specs/<feature-id>/` directory exactly as
   Workflow steps 1–2 (mechanical infrastructure only).
2. Write the external spec to `specs/<feature-id>/spec.md` **byte-for-byte**.
   If the source was a file path, copy its contents exactly. **No provenance
   marker, frontmatter, or any other added content.** Do NOT change headings,
   wording, or ordering. Do NOT run the clarification or quality-rewrite loop.
3. **Carry the dependency manifest, if one came with the spec.** Multi-codebase
   epic handoffs (pm-spec ZIPs) ship a `dependency-manifest.md` beside the
   spec — at the unzip root, with the spec under `specs/###-epic-name/`. If a
   `dependency-manifest.md` exists next to the source spec file or at the repo
   root, copy it to `specs/<feature-id>/dependency-manifest.md` (mechanical
   infrastructure, like step 1 — the spec itself stays byte-for-byte). It is a
   coordination artifact consumed by `/speckit.plan`; do not edit its content.
   If none exists, skip silently — single-codebase handoffs have no manifest.
4. Proceed to the verify-spec gate. `/speckit.verify-spec` is the single quality
   check for adopted specs; if it fails, the user edits `spec.md` directly and
   re-runs it. Then run the **Auto-feedback (MANDATORY)** step below as usual.

## Workflow

1. Determine the next feature ID (`###-feature-name`) per the
   constitution's branch-naming convention.
2. Create `specs/<feature-id>/` and the feature branch.
3. Obtain the spec template by running
   `bash .specify/presets/tradestation-sdd/scripts/render-template.sh spec-template`
   and use its (composed) stdout as the template. Do NOT read the preset `.md`
   directly — the composed output applies any project override or team-layer preset.
4. Generate `specs/<feature-id>/spec.md`. User stories MUST be
   prioritized (P1, P2, …) per the spec-template rules. Acceptance
   Scenarios in Given/When/Then form. Mark unclear requirements with
   `[NEEDS CLARIFICATION: ...]`.
5. Keep the spec technology-agnostic.

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

After spec.md is written, automatically invoke
`/speckit.feedback specify` so any friction from this step is
captured while it is fresh. The user can decline by passing empty
answers; the loop runs by default. If `/speckit.feedback` is
unavailable, note it in the response and continue — never block.
<!-- END AO-MANDATORY: feedback -->
