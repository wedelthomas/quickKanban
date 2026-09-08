# SDD feedback — end-of-feature — 005-iteration-and-board-restructure: live probing found what the suite could not

**Phase:** end-of-feature
**Branch:** 005-iteration-and-board-restructure
**Agent:** claude-opus-5[1m]
**When:** 2026-08-27T06:54:22Z

## What worked

- **Probing the running system over trusting the suite.** Every significant
  defect in this slice came from the live board or real Jira, never from
  reading code: a move into the retired column answering 200 and swallowing a
  card; Iteration Items unreachable because the move schema pinned toColumnId
  to 1..6; PATCH writing `blocked` and answering `false`; mapping payloads
  rejected outright; and the settings dialog rendering two columns while the
  stylesheet said three.
- **Red-first exposed weak tests, not just missing code.** TEST-433 passed
  before the migration existed — it asserted something already true, so it
  could never have caught the regression it guards. The no-live-services guard
  failed first time on two false positives of its own making, and was fixed
  rather than the tests it flagged, then verified to discriminate by planting a
  violation.
- **Measuring rather than reasoning.** The three-column layout was correct in
  CSS and rendering as two. Both causes were invisible to reading: a
  class-name collision with an existing `.dialog--wide`, and a grid track
  sizing to its content so a percentage width collapsed.

## What was friction

- **The same cucumber mistake three times.** Registering a step as both Given
  and When makes it ambiguous, because cucumber matches on the pattern rather
  than the keyword. Made in US1, again in US2, and again in US4 — each time
  caught only by running the suite.
- **Constants that assumed column ids matched board positions.** Four separate
  defects shared that one cause: a hardcoded `1..6` in the move schema and the
  mapping route, and four copies of a column-id map across the step files, three
  of which silently produced `undefined` or the wrong column. Nobody had ever
  needed a seventh column, so nothing had ever tested the assumption.

## What was wrong

Running the browser suite **destroyed the developer's real board**.
`tests/e2e/reset.ts` truncated `POSTGRES_DB` rather than a test database — the
acceptance suite has had its own since slice 1, the browser suite never did.
Twelve Jira cards returned on the next sync; one local card did not and is not
recoverable, which is exactly the irreplaceable data BRD v1's R-7 warned about.
Now guarded three ways: a separate database, every psql call naming it, and a
reset that refuses to run against anything else.

## Phase-specific

**Any constitution principle that got bent during implementation?** The ≥90%
coverage quality gate remains unmet and is recorded as a carried deviation —
unmeasured across all five slices, and now visible in `plan.md` rather than
implied by an unexecutable task.

## AI-authorship attestation

**Bucket:** all. Every line written by Claude in one session, with the developer
directing requirements, design choices and UI feedback throughout — including
several corrections made live against the running board.

## Telemetry

- phase: end-of-feature
- branch: 005-iteration-and-board-restructure
- tasks_completed: 81/86
- files_changed: 126
- test_files_count: 51
- remediation_tasks_added: 1
- gates_run: analyze=true, story_review=true
- coverage_report_present: false
