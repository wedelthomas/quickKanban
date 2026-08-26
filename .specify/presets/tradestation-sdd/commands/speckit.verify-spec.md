---
description: "Verify spec.md quality before /speckit.plan; blocks the workflow if the spec doesn't meet standards"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.verify-spec

Verify that `specs/<feature-id>/spec.md` meets quality standards
**before** allowing `/speckit.plan` to run. This is a **blocking
gate**: if any required check fails, the workflow stops and the
developer is asked to re-run `/speckit.specify` (or edit `spec.md`
directly) until the spec passes.

## Workflow

1. Read the active feature's `spec.md`.
2. Run every check listed below. Record `PASS`/`FAIL` per blocking
   check and `PASS`/`WARN` per non-blocking warning.
3. Write `specs/<feature-id>/spec-verification.md` using the
   "Output format" template below.
4. **If any blocking check fails**: STOP. Tell the user the spec
   is not ready for planning, list the failing checks with short
   explanations and line references, and instruct them to re-run
   `/speckit.specify` (or edit `spec.md` directly) to address the
   gaps, then re-run `/speckit.verify-spec`. Do **NOT** allow
   `/speckit.plan` to proceed.
5. **If all blocking checks pass**: mark the verification
   `Result: PASS` and tell the user the spec is cleared for
   `/speckit.plan`.

## Checks

### Blocking (MUST pass before /speckit.plan)

- **B1. User stories present.** At least one `### User Story`
  heading exists in `spec.md`.
- **B2. Stories prioritized.** Every user story has a `P1`, `P2`,
  or `P3` (etc.) priority tag.
- **B3. Acceptance Scenarios well-formed.** Every user story has
  at least one Acceptance Scenario containing the keywords
  `Given`, `When`, and `Then` (case-insensitive).
- **B4. No unresolved clarifications.** No `[NEEDS CLARIFICATION`
  markers remain anywhere in `spec.md`.
- **B5. Success Criteria measurable.** Every Success Criteria
  bullet contains either a number, a percentage, a duration unit
  (ms / s / min / hr), or an explicit boolean condition. Vague
  terms like "fast", "robust", "scalable", "user-friendly",
  "intuitive" without an attached metric MUST fail.
- **B6. Spec is technology-agnostic.** No language names, framework
  names, library names, file paths, class names, table/column
  names, or vendor SDK names appear in `spec.md` outside of
  dedicated context blocks. Heuristic: scan for tokens like
  `react`, `dotnet`, `postgres`, `kafka`, `redis`, `lambda`,
  `kubernetes`, etc., and for file-path patterns (`src/`, `.py`,
  `.cs`, `.ts`).

### Non-blocking (warnings, not blockers)

- **W1. Stories independently testable.** Each story's Acceptance
  Scenarios reference only that story's setup, not another
  story's outcome. Heuristic — flag for human review when
  uncertain.
- **W2. Out-of-scope section present.** `spec.md` has an explicit
  `Out of scope` (or equivalent) block. Strongly recommended.
- **W3. No implementation phrasing.** No "we will use", "the
  system will call", "implement using", or similar
  implementation-style verbs.

## Output format

Write `specs/<feature-id>/spec-verification.md`:

```
# Spec Verification — <feature-id>

**Branch:** <branch>
**When:** <iso-timestamp>
**Result:** PASS | FAIL

## Blocking checks
- [PASS|FAIL] B1. User stories present
- [PASS|FAIL] B2. Stories prioritized
- [PASS|FAIL] B3. Acceptance Scenarios well-formed
- [PASS|FAIL] B4. No unresolved clarifications
- [PASS|FAIL] B5. Success Criteria measurable
- [PASS|FAIL] B6. Spec is technology-agnostic

## Non-blocking warnings
- [PASS|WARN] W1. Stories independently testable
- [PASS|WARN] W2. Out-of-scope section present
- [PASS|WARN] W3. No implementation phrasing

## Failing checks
<Only present when Result = FAIL.>
- B<N>: <one-sentence explanation, with line reference like (spec.md:42) where helpful>

## Next steps
<If PASS>: Spec is ready for /speckit.plan.
<If FAIL>: Re-run /speckit.specify (or edit spec.md) to address the
failing checks above, then re-run /speckit.verify-spec.
```

<!-- AO-MANDATORY: feedback -->
## Auto-feedback (MANDATORY)

After spec-verification.md is written, automatically invoke
`/speckit.feedback verify-spec` so any friction from this step is
captured while it is fresh. Fire the trigger **regardless** of PASS
or FAIL — a failed verification is itself a useful signal about
spec quality and friction. The user can decline by passing empty
answers; the loop runs by default. If `/speckit.feedback` is
unavailable, note it in the response and continue — never block.
<!-- END AO-MANDATORY: feedback -->
