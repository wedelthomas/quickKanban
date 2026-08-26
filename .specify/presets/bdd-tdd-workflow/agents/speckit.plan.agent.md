## Behavior Pathways: Note the TestRail Sync Point (BDD/TDD Workflow)

If `spec.md` has a `## Behavior Pathways` section, add a line to `plan.md`
(near where test strategy is normally discussed) naming the point where
`/speckit.implement` will first touch TestRail for this story: the first
task in each story's phase that has a `BH-###`/`TEST-###` pair authors or
syncs that case via `spec-testrail-sync` *before* any implementation task
in the same story runs. This is informational for whoever reads `plan.md`
next (usually `/speckit.tasks`) — it does not change how `plan.md` itself
is structured otherwise.
