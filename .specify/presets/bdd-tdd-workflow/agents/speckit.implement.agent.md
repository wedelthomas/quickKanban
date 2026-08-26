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
