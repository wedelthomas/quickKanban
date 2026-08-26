---
description: "Cross-check spec/plan/tasks for drift and gaps, then auto-trigger feedback"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.analyze

Cross-check `spec.md`, `plan.md`, and `tasks.md` for drift, gaps,
and ambiguity. MUST run after `/speckit.tasks` and before
`/speckit.implement`.

## Workflow

1. Read all artifacts: `spec.md`, `plan.md`, `tasks.md`.
2. Walk every Functional Requirement and Acceptance Scenario in
   `spec.md`. Flag any that lack a covering task.
3. Walk every task. Flag any that implements behavior not tied to
   an FR or scenario (scope creep).
4. Flag any `[NEEDS CLARIFICATION]` markers still present.
5. Verify Test Strategy alignment: every test file in `plan.md`
   appears as a task; tests precede implementation.
6. **Architecture Review gate**: read the `## Architecture Review`
   table in `plan.md`. For each row, the third column ("Decision or
   N/A reason") must be filled. The following are **blocking**:
   - Empty third column.
   - Cell containing only `N/A`, `N/A.`, `n/a`, or whitespace
     (a bare N/A with no reason).
   - Cell starting with `N/A` but with no `—` or `-` separator
     followed by a reason of at least 5 characters.

   Cells that contain a concrete Decision (any non-N/A text) pass.
   Cells of the form `N/A — <reason ≥ 5 chars>` (em-dash or hyphen)
   pass.

   **Manifest-aware check:** if `specs/<feature-id>/dependency-manifest.md`
   exists, the "Cross-repo contract surface" row must carry a concrete
   Decision — any N/A cell (reasoned or not) is **blocking**: a
   dependency manifest is present but unconsidered. The Decision should
   point at plan.md's `## Cross-Repo Context` section. The inverse is
   fine: with no manifest,
   `N/A — no dependency manifest (single-codebase feature)` passes
   like any reasoned N/A. If a planned split was later collapsed to
   single-codebase, state that as the concrete Decision and delete
   the stale manifest.
7. Write findings to `specs/<feature-id>/analysis.md`. Distinguish
   **blocking** (MUST fix before `/speckit.implement`) from
   **non-blocking** (track for later). `/speckit.implement` refuses
   to run until blocking findings are resolved.

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

After analysis.md is written, automatically invoke
`/speckit.feedback analyze` so any friction from this step is
captured while it is fresh. The user can decline by passing empty
answers; the loop runs by default. If `/speckit.feedback` is
unavailable, note it in the response and continue — never block.
<!-- END AO-MANDATORY: feedback -->
