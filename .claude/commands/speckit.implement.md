---
description: "Implement tasks from the task list with built-in hygiene and story-review gates"
---

<!-- sdd-preset: self-update check (silent, throttled, fail-open) -->
Before doing anything else, run this once and ignore its output:
`bash .specify/presets/tradestation-sdd/scripts/check-update.sh "$(pwd)"`
Then proceed with the command below.

# /speckit.implement

Implement the next uncompleted task(s) from the active tasks.md file.

## Workflow

1. **Pre-flight: confirm `/speckit.analyze` was run on this feature.** Look for
   `analysis.md` (or equivalent analyze output) in the feature directory. If
   it is missing, or its findings include unresolved inconsistencies between
   spec.md, plan.md, and tasks.md, **stop and ask the user to run
   `/speckit.analyze` first**. Do not begin implementation on a feature whose
   spec / plan / tasks have not been cross-checked.
2. Read the current `tasks.md`
3. Find the next unchecked task(s) — respect phase order and dependency constraints
4. Implement the task following the spec and plan
5. Run tests if they exist for the affected code
6. Mark the task as complete (`- [x]`) in tasks.md
7. **Run the Post-Implementation Hygiene Gate before moving to the next task**
8. **If the just-completed task was the last in a User Story phase (the next
   line is a `**Checkpoint**`), run the Story-Complete Review Gate from
   tasks.md before starting the next phase.** If gaps are found, add
   remediation tasks to the same story section and resolve them before the
   Checkpoint passes.
9. **End-of-invocation feedback trigger (MANDATORY).** Before handing
   control back to the user, fire exactly one `/speckit.feedback`
   invocation based on what happened in this run — see "Feedback trigger"
   below.

<!-- AO-MANDATORY: feedback -->
## Feedback trigger (MANDATORY)

`/speckit.feedback` is part of the default SDD loop, not an optional aside.
The full loop fires after every phase command (`/speckit.constitution`,
`/speckit.specify`, `/speckit.verify-spec`, `/speckit.plan`,
`/speckit.tasks`, `/speckit.checklist`, `/speckit.analyze`); each of those
commands triggers it for you. Inside `/speckit.implement`, exactly **one**
of three invocations fires at the end of every run, picked by what
happened — feedback fires after every working session, not only at story
boundaries:

- **End of feature** (final Checkpoint passed OR last Polish task
  checked off in this run) → `/speckit.feedback end-of-feature`. Highest
  priority — takes precedence over story-complete and session-end.
- **Story-Complete Review Gate passed in this run** →
  `/speckit.feedback story-complete`. Captures friction at the natural
  story boundary.
- **One or more tasks completed but no checkpoint hit** →
  `/speckit.feedback session-end`. Captures friction at the working-session
  boundary so the developer doesn't have to wait for the next checkpoint
  to surface problems.
- **No tasks completed** (e.g., stopped on a question, blocker, or
  pre-flight failure) → skip the trigger entirely. Nothing useful to
  record.

The agent SHOULD invoke `/speckit.feedback` automatically without waiting
for the user to ask. The user can decline (just hit enter through the
prompts) but the loop runs by default. If `/speckit.feedback` is
unavailable in the current session (command not installed), note it in
the response and continue — do not block on it.
<!-- END AO-MANDATORY: feedback -->

## Post-Implementation Hygiene Gate (MANDATORY)

Before marking implementation complete:

- [ ] No commented-out code blocks remain
- [ ] No unused imports, variables, or functions
- [ ] No TODO/FIXME/HACK markers left unresolved
- [ ] No debug logging (console.log, print, debugger statements)
- [ ] No files exceeding 300 lines without justification
- [ ] No functionality beyond what spec.md requires
- [ ] No unnecessary dependencies added

If any issues found, fix them before completing implementation.

## Story-Complete Review Gate

Defined in `tasks.md` under "Story-Complete Review Gate (MANDATORY)". Triggered
at every User Story Checkpoint. Reviews spec alignment, design, error handling,
tests, security, and integration to catch gaps the per-task hygiene checklist
cannot see (e.g., premature abstraction, missing edge cases, weak assertions).
Gaps become remediation tasks in the same story section — never deferred to
Polish.


## Test-First Enforcement for Behavior Pathways (BDD/TDD Workflow)

**Narrate every step of this loop out loud in the response** — don't let
the red→green cycle happen silently inside tool calls. Before
implementing a task tied to a `BH-###`/`TEST-###` pair:

1. **Confirm the test case exists and is genuinely red.** Its TestRail
   case should exist (from the sync task that precedes it — see
   `/speckit.tasks`'s ordering rule, and `spec-testrail-sync`'s own
   narration of that step) and should not already be marked `Passed`. If
   the case is missing entirely, or its `TEST-###` in `spec.md`'s
   `## Verification` table is orphaned (its `Pins` points at a `BH-###`
   that no longer exists in `## Behavior Pathways`): **STOP**. Tell the
   developer the chain is broken and ask them to fix it (re-run
   `spec-testrail-sync`, or restate the `BH-###`) before continuing this
   task. This is the same hard-fail posture `/speckit.verify-spec`
   already applies at spec-verification time — discovering the break
   later, mid-implementation, does not make it any less blocking.
2. **Write the failing test(s) for this `BH-###` and run them.**
   Announce before running (e.g. "🔴 Running `test_x` — expect FAIL,
   nothing implements this yet") and state the actual result. A test
   that unexpectedly passes before implementation exists is itself a
   finding — stop and tell the developer why before continuing.
3. **Implement the task.** Announce what's being implemented and which
   `BH-###` it satisfies (e.g. "🟢 Implementing `cancel_order()` to
   satisfy BH-001").
4. **Run the test(s) tied to that `BH-###` again.** Announce before
   running (e.g. "🟢 Running `test_x` again — expect PASS") and confirm
   they now pass (green). If they don't, say so plainly and keep working
   the task — do not mark it complete on a still-red test.
5. **Record the result to TestRail** via the MCP's `add_result_for_case`
   (single case) or `add_results_for_cases` (multiple cases in one run) —
   both already work today, no wrapper changes needed for this step.
   Announce the outcome (e.g. "✅ TEST-001 recorded as Passed in
   TestRail").
6. Continue with the rest of the normal per-task workflow (hygiene gate,
   checkpoint handling, etc.) — this section only adds the steps above
   around the existing "implement the task" step, it doesn't replace any
   of the surrounding workflow.