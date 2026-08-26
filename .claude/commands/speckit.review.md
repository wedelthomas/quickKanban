---
description: "Independent second-pass code review of the working branch's diff vs main; complements — does not replace — human review"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.review

Run a structured, **independent second-pass review** of the code on the
current branch before opening a PR. This complements human review — it
does not replace it. The point is to surface issues the agent that
wrote the code is most likely to have missed: drift from spec,
Architecture Review decisions that turned out wrong, missing failure
modes, weak tests, undocumented behavior.

This command does NOT modify code. It reads the diff and writes
`specs/<feature-id>/code-review.md`.

## When to invoke

- Before opening a PR (recommended; the Polish phase has a task for it).
- When `/speckit.implement` reports `end-of-feature` and the Polish
  phase is complete.
- Ad hoc, any time you want a structured second look at the diff.

## Reviewer mindset

Review **as if you have not seen this work before**. Treat the diff as
a stranger's pull request. Be skeptical:

- Do not assume the implementer's choices are correct just because
  they are documented in the plan.
- Do not assume tests cover what the spec requires until you have
  walked the spec → tests mapping yourself.
- A decision marked `N/A — <reason>` in the Architecture Review must
  hold up against the actual code. If the code shows auth handling and
  the table says auth is N/A, that is a finding.
- The plan can be wrong. If the diff diverges from the plan in a way
  that is *better*, note it and recommend updating the plan rather
  than reverting the code.

## Workflow

1. **Locate context.**
   ```bash
   feature_dir=$(ls -d specs/*/ 2>/dev/null | tail -1)
   feature_id=$(basename "$feature_dir")
   ```
   Read `spec.md`, `plan.md`, `tasks.md`, `analysis.md` (if present),
   and the constitution at `.specify/memory/constitution.md`.

2. **Compute the diff.**
   ```bash
   base="$(git merge-base HEAD main 2>/dev/null \
            || git merge-base HEAD master 2>/dev/null || echo HEAD)"
   git diff --stat "$base" HEAD
   ```
   If the diff is empty, abort with a note that there is nothing to
   review and skip the rest of the workflow.

3. **Walk the diff against the dimensions below.** For each finding,
   record the file path, line range (when applicable), the dimension
   it failed, and a **suggested fix** (not just a complaint). A
   finding without a suggested fix is incomplete.

   ### Spec alignment
   - Every Acceptance Scenario in `spec.md` is exercised by code or
     tests reachable from the diff.
   - Every Functional Requirement (`FR-NNN`) is implemented.
   - No code in the diff implements behavior not tied to a FR or
     scenario (scope creep).

   ### Architecture Review reconciliation
   For every row in `plan.md`'s `## Architecture Review` table:
   - **Decision row**: does the code in the diff match that decision?
     Note any drift.
   - **`N/A — <reason>` row**: does the code introduce something that
     contradicts the N/A claim? (e.g., "Idempotency: N/A — read-only
     endpoint" but the diff adds a POST handler with state changes.)
   - **Missing row**: a cross-cutting concern visible in the diff that
     is not in the table at all is a finding — recommend adding the
     row to `plan.md`.

   ### Constitution compliance
   - Walk each Core Principle in `.specify/memory/constitution.md` and
     confirm the diff complies.
   - Flag any constitution Quality Gate not yet satisfied (coverage
     thresholds, dependency justification, binary-size growth, etc.).

   ### Design & structure
   - Single responsibility per module / function; no god objects.
   - No premature abstraction (interface with one implementation, no
     planned second caller).
   - No missed abstraction (3+ near-duplicate blocks).
   - Names readable cold.
   - No file > 300 lines without an inline justification comment.

   ### Error handling & failure modes
   - I/O, network, parsing, and user-input boundaries handle failure.
   - Errors propagate with enough context to debug.
   - Idempotency, retries, timeouts present where the Architecture
     Review row demanded them.
   - Edge cases from the spec (empty, max, null, concurrent, replay)
     are covered.

   ### Tests
   - Every test file listed in `plan.md` exists.
   - Tests assert behavior, not implementation (no over-mocking, no
     internals leaking into asserts).
   - Mutation-test mentally: would a plausibly-faulty implementation
     still pass these tests? If yes, the test is weak.
   - Coverage target met if spec defines one (`coverage_report_present`
     true; if a parser is available, also confirm the percentage).

   ### Security & data
   - Untrusted input validated at the boundary it enters.
   - No secrets in code, logs, fixtures, or test data.
   - Authorization checks present where the spec requires them.
   - PII handling matches the `Data` row of the Architecture Review.

   ### Integration
   - Diff does not break existing tests or clients.
   - Contract evolution is backward compatible — or, if not, the
     breaking change is explicit and documented.

   ### Documentation
   - README still gets a new developer running end-to-end.
   - Public APIs, CLI flags, env vars documented where developers will
     look (not buried in code comments).
   - The PR description scaffold below is filled or explicitly stubbed.

4. **Invoke complementary skills (best-effort, non-blocking).** If the
   following Claude Code skills are available, run them and fold their
   findings into the review under a `## Skill output` section:
   - `review` — generic PR review
   - `security-review` — security pass on the diff

   If a skill is unavailable, note it as `unavailable` and continue.
   Skills augment this command; they are not required.

5. **Write `specs/<feature-id>/code-review.md`** in this format:

   ```
   # Code review — <feature-id>

   **Branch:** <branch>
   **Base:** <base-ref>
   **Reviewer:** <agent-model>
   **When:** <iso-timestamp>
   **Diff stats:** <files> files, +<add> -<del>

   ## Summary

   <2–3 sentences: what this feature does, what was reviewed, overall
   recommendation (ship / fix-then-ship / rework).>

   ## Blocking findings

   <Numbered list. Each entry:
     `<file>:<line> — <dimension> — <issue>. Suggested fix: <fix>.`
   Blocking = must be addressed before merge. If none, write "None.">

   ## Non-blocking findings

   <Same format. Non-blocking = nice to have, track for follow-up.>

   ## Skill output

   - `review` skill: <one-line fold-in, or "unavailable">
   - `security-review` skill: <one-line fold-in, or "unavailable">

   ## PR description scaffold

   <A markdown block the developer can paste into the PR description:
   what changed, what was reviewed by this command, what was NOT
   tested (e.g., load tests, prod-like data), follow-ups deferred.>
   ```

6. **Print blocking-finding count to stdout** along with the path to
   `code-review.md`. Example:
   ```
   2 blocking findings, 5 non-blocking.
   See: specs/004-cancel-order/code-review.md
   ```
   Do NOT auto-fix. The developer (or a follow-up `/speckit.implement`
   invocation scoped to the findings) addresses them.

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

After `code-review.md` is written, automatically invoke
`/speckit.feedback review` so any friction from this step is captured
while it is fresh. The user can decline by passing empty answers; the
loop runs by default. If `/speckit.feedback` is unavailable, note it
and continue — never block.
<!-- END AO-MANDATORY: feedback -->

## What this command does NOT do

- It does not edit code. Findings are advisory.
- It does not block merge. Use it as a gate in your PR template or
  CI if you want enforcement; the preset itself does not enforce.
- It does not replace human review. The constitution's Quality Gate
  on code review still requires a second human pair of eyes — this
  command makes that human's job easier, it does not eliminate it.
