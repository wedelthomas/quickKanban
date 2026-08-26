## Test-First Task Ordering for Behavior Pathways (BDD/TDD Workflow)

For any user story whose spec section has a `## Behavior Pathways` entry
(other than an explicit `no-behavior` line):

1. The **first task** generated for that story's phase MUST be: "Author
   or sync TestRail case(s) for `BH-###` via `spec-testrail-sync`" — this
   task has no `[P]` marker (it must complete before the tasks that
   follow it in the same story) and precedes every implementation task in
   that story's phase, not just the first one.
2. Every subsequent implementation task tied to that `BH-###` depends on
   the sync task above having completed, so `/speckit.implement` always
   sees a real `TEST-###` case before it starts writing the corresponding
   code.
3. Stories with no Behavior Pathways (or only `no-behavior` entries) are
   unaffected — normal task ordering applies.
