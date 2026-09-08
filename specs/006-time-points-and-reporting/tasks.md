---
description: "Task list for Time, Points and Iteration Reporting (slice 6)"
---

# Tasks: Time, Points and Iteration Reporting

**Input**: Design documents from `/specs/006-time-points-and-reporting/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)

**Tests are MANDATORY** (constitution Principle IV). The spec defines 36
Behavior Pathways with 36 verification rows; every one gets a task below,
and every test task precedes the implementation task it covers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependencies
- **[Story]**: US1…US6, mapping each task to a user story

## Phase ordering note

Priorities in `spec.md` are US1/US2 (P1), US3/US4/US5 (P2), US6 (P3) — but
US2's own acceptance scenarios need points to exist (its second scenario
states "the points and share… subject to the unpointed rule"), and US4/US5
need points too. **US3 (points import) is built third, ahead of finishing
US2's points half**, the same way slice 3 built its P2 mapping story first
because everything else consulted it. Concretely: US1 (time) → US3 (points)
→ US2 (the invisible-work split, now both halves exist) → US4 (commitment)
→ US5 (burndown, needs US4's commitment) → US6 (summary period, independent,
built last as the spec itself frames it).

---

## Phase 1: Setup

- [X] T501 Confirm the current baseline is green before changing anything:
  `npm run typecheck`, `npm run test:unit`, `npm run lint`. Record the
  counts; a failure here predates this slice.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema and shared plumbing every story reads or writes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T502 [P] Migration `src/server/db/migrations/024_card_points.sql` —
  per data-model.md: `cards.points` and `cards.jira_points`, both nullable
  integer, both `>= 0` when present.
- [X] T503 [P] Migration `src/server/db/migrations/025_card_blocked_events.sql`
  — per data-model.md: append-only `card_blocked_events`, same
  `ON DELETE RESTRICT` shape as `card_events` (Principle II).
- [X] T504 [P] Migration `src/server/db/migrations/026_iteration_commitments.sql`
  — per data-model.md: `iteration_commitments`, `ordinal_name` PK
  referencing `iterations`, immutable once inserted.
- [X] T505 [P] Extend `src/shared/types.ts`: `Card` gains `points: number |
  null` and `pointsDivergesFromJira: boolean`; add `IterationCommitment`;
  `SummaryPeriod` gains `'iteration'`.
- [X] T506 Extend `src/server/repositories/card-repository.ts` and
  `board-row.ts` to read/write `points`/`jira_points` and project
  `pointsDivergesFromJira` (`jira_points !== null && jira_points !==
  points`) — mirrors `blockedDivergesFromJira`'s existing shape exactly.
- [X] T507 Extend `src/server/services/card-service.ts`'s `update` path: a
  change to `blocked` writes one row to `card_blocked_events` (old value ≠
  new value only — setting it to its current value writes nothing).
- [X] T508 [P] `src/server/repositories/commitment-repository.ts` — read the
  commitment for an ordinal; insert one `ON CONFLICT (ordinal_name) DO
  NOTHING`, mirroring `iterations`' own write-once shape.
- [X] T509 `src/server/services/commitment-service.ts` —
  `CommitmentService.observe(currentIteration)`: on a new ordinal never
  seen before, sum the points of pointed cards currently in Iteration
  Items, In Progress, Test or PO Review and insert that as the commitment.
  Mirrors `CarryOverService`'s existing boundary-detection pattern (R-4).
- [X] T510 Wire `CommitmentService.observe(...)` into
  `IterationService.current()` alongside the existing
  `carryOver?.observe(...)` call, same failure-swallowing treatment (a
  failed commitment write must not cost the user their banner).
- [X] T511 [P] `src/server/repositories/event-repository.ts` (or a small
  sibling) gains a read returning a card's `card_events` and
  `card_blocked_events` rows together, ordered by `occurred_at` — the input
  shape `elapsed-time.ts` consumes.

**Checkpoint**: schema exists, points and blocked-interval data are being
written, commitment snapshots itself at iteration start. No report reads
anything yet.

---

## Phase 3: User Story 1 — I can see where my iteration went (Priority: P1) 🎯 MVP

**Goal**: Elapsed time per card, derived entirely from the movement history,
attributable per iteration.

**Independent Test**: Move a card through In Progress, Test and Done across
known times; read the iteration report; confirm the elapsed figure matches
the working hours those movements span (SC-501, SC-502).

### Tests for User Story 1 — write first, confirm they FAIL

- [X] T512 [P] [US1] `tests/unit/elapsed-time.test.ts` — every permutation:
  time from movements alone (BH-501), Test/PO Review counted (BH-502),
  only working hours counted across a weekend (BH-503), blocked periods
  excluded (BH-504), an overnight-and-blocked overlap excluded exactly
  once and never negative (BH-505), repeat In-Progress passes accumulate
  (BH-506), reopening a Done card resumes the clock (BH-507), a corrected
  working-hours config changes historical figures (BH-508), time spanning
  a boundary splits and the parts sum to the whole (BH-509), an in-progress
  card reports time to date without implying completion (BH-510).
- [X] T513 [P] [US1] `tests/contract/iteration-report.test.ts` — `GET
  /api/iterations/:ordinalName/report`: 404 `ITERATION_NOT_FOUND` for an
  unobserved ordinal; 200 with time broken down both `byCard` and
  `byProject`, with local cards grouped as their own project (BH-527); an
  archived card still contributes its time (BH-511); a period partly
  predating recorded history is marked `incomplete` (BH-531, FR-542).

### Implementation for User Story 1

- [X] T514 [US1] `src/domain/elapsed-time.ts` — pure. Takes ordered
  movement + blocked-interval events, the working-days/hours config and
  `now`; returns working seconds per iteration span it is asked to clip
  against (research.md R-1). No I/O, no clock read internally.
- [X] T515 [US1] `src/domain/iteration-report.ts` — pure. Assembles
  `IterationReport.time` (`byCard`, `byProject`, shares) from
  `elapsed-time.ts`'s output joined against card metadata (source, Jira
  project key parsed from `issueKey`). Points section is `{ withheld: true,
  reason: "…" }` until US3 lands — correct today, since no card can carry
  points yet.
- [X] T516 [US1] `src/server/services/report-service.ts` —
  `ReportService.iterationReport(ordinalName)`: reads the iteration,
  commitment (may be absent pre-US4), every card's events, and calls
  `iteration-report.ts`. Throws `ITERATION_NOT_FOUND` for an unobserved
  ordinal.
- [X] T517 [US1] `src/server/routes/reports.ts` — `GET
  /api/iterations/:ordinalName/report`, registered in `app.ts`.
- [X] T518 [P] [US1] `src/web/reports/` — a report view (dialog or panel,
  matching `SummaryDialog`'s existing pattern) showing per-card and
  per-project elapsed time for the current iteration.

**Checkpoint**: `GET /api/iterations/:ordinalName/report` answers real
elapsed time. **Run the Story-Complete Review Gate.**

---

## Phase 4: User Story 3 — Estimates reach the board (Priority: P2, built third)

**Goal**: Story points import from Jira, stay locally editable, and are
never written back.

**Independent Test**: Import an issue carrying a point value, confirm the
card shows it, override it locally, confirm Jira is never written to.

### Tests for User Story 3 — write first, confirm they FAIL

- [X] T519 [P] [US3] `tests/unit/no-jira-writes.test.ts` — extend the
  existing structural assertion (BH-514/FR-517): the adapter's source
  contains no write touching a story-points field, by absence of
  capability rather than by behaviour, matching how slice 2 proved the
  same thing for status.
- [X] T520 [P] [US3] `tests/features/points-import.feature` + steps —
  a Jira issue carrying a point value imports onto the card (BH-512); a
  local override is used and its divergence from the imported value is
  visible on the card (BH-513); an empty field imports as unpointed and a
  zero field imports as pointed-at-zero (BH-515); a secondary estimate
  field ("Testing Points") is never read as the story estimate (BH-518).
- [X] T521 [P] [US3] `tests/e2e/card-points.spec.ts` — the points field is
  reachable and editable by keyboard alone in the card dialog, and the
  divergence marker is visible without opening a second view.

### Implementation for User Story 3

- [X] T522 [US3] Extend `src/server/jira/jira-adapter.ts` (or the sync
  read path) to read `settings.jiraFieldStoryPoints` from each imported
  issue into `jira_points`; leave `points` untouched on an existing card
  (FR-518 — local always wins) and set both equal on first import.
- [X] T523 [US3] Extend `PATCH /api/cards/:id` (`src/server/routes/cards.ts`,
  `card-service.ts`) to accept `points: number | null`; `0` and `null` are
  both valid and distinct (FR-519). Never issues a Jira request (FR-517).
- [X] T524 [P] [US3] `src/web/cards/CardDialog.tsx` — a points field,
  keyboard-reachable, showing the local value and the imported value's
  divergence when they differ.

**Checkpoint**: points import, override locally, and never write to Jira.
**Run the Story-Complete Review Gate.**

---

## Phase 5: User Story 2 — I can say how much of my work is invisible (Priority: P1)

**Goal**: The share of an iteration's hours and points spent on work no
Jira board would ever show.

**Independent Test**: Work a mix of local and Jira-sourced cards through an
iteration; confirm the report states each one's share of hours and of
points.

### Tests for User Story 2 — write first, confirm they FAIL

- [X] T525 [P] [US2] `tests/unit/iteration-report.test.ts` — the local and
  Jira shares of time and of points are stated and sum to 1 (BH-528); a
  zero share reads as zero, not omitted (FR-539); an iteration whose work
  is entirely Jira-sourced reports a local share of zero (spec.md US2
  scenario 3); unpointed cards are excluded from the points figures and
  counted (BH-516); an iteration with no pointed cards withholds the
  points figure with a reason rather than reporting zero (BH-517).
- [X] T526 [P] [US2] `tests/contract/iteration-report.test.ts` — extend:
  `points.localShare`/`jiraShare` present once points exist;
  `excludedUnpointed` count matches a mixed fixture.

### Implementation for User Story 2

- [X] T527 [US2] Extend `src/domain/iteration-report.ts`: assemble the
  `points` section for real now that US3 supplies `points`/`jira_points` —
  completed points this iteration split by source, unpointed cards
  excluded and counted, the whole figure withheld only when literally no
  card carries points.
- [X] T528 [P] [US2] `src/web/reports/` — extend the report view with the
  local-versus-Jira share for both time and points.

**Checkpoint**: the report states the invisible-work number the whole
product exists to answer. **Run the Story-Complete Review Gate.**

---

## Phase 6: User Story 4 — I can see what I committed to against what I finished (Priority: P2)

**Goal**: Commitment, completion and scope change reported as three
distinct figures.

**Independent Test**: Commit cards to an iteration, add another
mid-iteration, complete some, confirm the report separates commitment,
scope change and completion.

### Tests for User Story 4 — write first, confirm they FAIL

- [X] T529 [P] [US4] `tests/unit/commitment.test.ts` (or extend
  `carry-over.test.ts`'s sibling) — commitment is snapshotted once at
  iteration start and does not move as cards are added or removed
  (BH-519); commitment ignores Jira sprint membership entirely, reading
  only this board's columns (BH-535, FR-547).
- [X] T530 [P] [US4] `tests/unit/iteration-report.test.ts` — a mid-iteration
  addition reports as scope added, not commitment (BH-520); velocity
  counts local and Jira-sourced cards alike (BH-521); commitment,
  completion and scope change report as three distinct figures (BH-522).
- [X] T531 [P] [US4] `tests/contract/iteration-report.test.ts` — extend:
  `points.committed`, `points.completed`, `points.scopeAdded` present and
  distinct for a fixture that adds a card mid-iteration.

### Implementation for User Story 4

- [X] T532 [US4] Extend `src/domain/iteration-report.ts`: scope
  added/removed derived from `card_events` — a pointed card entering a
  working column for the first time after `committed_at` is scope added;
  one leaving every working column after being part of the commitment is
  scope removed (research.md R-5). Completion is the sum of points on
  cards reaching Done within the iteration's span (velocity, FR-528).
- [X] T533 [P] [US4] `src/web/reports/` — extend the report view with
  commitment, completion and scope change as three distinct figures.

**Checkpoint**: overcommitment is now an observable fact, not a guess.
**Run the Story-Complete Review Gate.**

---

## Phase 7: User Story 5 — I can watch the iteration burn down (Priority: P2)

**Goal**: A burndown showing committed points outstanding at the close of
each working day, attributing every movement to its cause.

**Independent Test**: Advance an iteration day by day with work completed
on some days and scope added on others; confirm the chart attributes each
movement to the right cause.

### Tests for User Story 5 — write first, confirm they FAIL

- [X] T534 [P] [US5] `tests/unit/burndown.test.ts` — outstanding points at
  the close of each working day (BH-523); a day of completed work
  attributes its fall to completion (BH-524); a day of scope addition
  attributes its rise to scope, distinguishable from an absence of
  progress (BH-524); a running iteration's burndown covers only elapsed
  days (BH-525); a completed iteration's burndown covers its full span
  (BH-526).
- [X] T535 [P] [US5] `tests/contract/burndown.test.ts` — `GET
  /api/iterations/:ordinalName/burndown`: 404 `ITERATION_NOT_FOUND` for an
  unobserved ordinal; 200 with one point per elapsed working day.

### Implementation for User Story 5

- [X] T536 [US5] `src/domain/burndown.ts` — pure. Takes the commitment,
  the same `card_events`-derived scope/completion facts
  `iteration-report.ts` computes, the working-days config and `now`;
  returns one `BurndownPoint` per elapsed working day of the iteration.
- [X] T537 [US5] Extend `report-service.ts` with `burndown(ordinalName)`,
  and `src/server/routes/reports.ts` with `GET
  /api/iterations/:ordinalName/burndown`.
- [X] T538 [P] [US5] `src/web/reports/` — a burndown chart, distinguishing
  completion-caused and scope-caused movement (FR-532), reachable by
  keyboard and legible to a screen reader (FR-545).

**Checkpoint**: progress is visible mid-flight, not only in hindsight.
**Run the Story-Complete Review Gate.**

---

## Phase 8: User Story 6 — My standup summary knows about the iteration (Priority: P3)

**Goal**: The generated summary accepts the iteration as a reporting
period.

**Independent Test**: Generate a summary for the iteration period; confirm
it covers the iteration's boundaries, carries the time figures, and copies
as plain text.

### Tests for User Story 6 — write first, confirm they FAIL

- [X] T539 [P] [US6] `tests/unit/summary.test.ts` — extend `periodBounds`'s
  test for the new `'iteration'` case: bounds equal the iteration's own
  `starts_on`/`ends_on` rather than a computed window (BH-529).
- [X] T540 [P] [US6] `tests/contract/board-payload.test.ts` (or a new
  `summary-period.test.ts`) — `GET /api/summary?period=iteration` returns
  404 `ITERATION_NOT_FOUND` when no iteration can be established, 200
  bounded by the iteration's dates otherwise.
- [X] T541 [P] [US6] `tests/e2e/summary.spec.ts` — extend: the iteration
  option is selectable in the summary dialog and copies as plain text
  (BH-530).

### Implementation for User Story 6

- [X] T542 [US6] Extend `SummaryPeriod`'s handling in
  `src/server/services/summary-service.ts`'s `periodBounds` (research.md
  R-7): `period === 'iteration'` reads the current iteration from
  `IterationRepository` and bounds the summary by its dates; throws
  `ITERATION_NOT_FOUND` when none exists.
- [X] T543 [US6] Extend `src/server/routes/summary.ts`'s query validation
  to accept `period=iteration`.
- [X] T544 [P] [US6] `src/web/summary/SummaryDialog.tsx` — add the
  iteration option alongside daily/weekly.

**Checkpoint**: the standup update the product started with now covers the
iteration too. **Run the Story-Complete Review Gate.**

---

## Phase 9: Polish & Cross-Cutting

- [X] T545 [P] `tests/unit/elapsed-time.test.ts` — the archived-card and
  blocked-history-predates-this-feature cases: an archived card still
  contributes its time (BH-511, already tested in T512's file — confirm
  coverage here rather than duplicate); time predating the blocked record
  is reported as an upper bound and the report says why (BH-536, FR-548).
- [X] T546 [P] `tests/unit/iteration-report.test.ts` — no reported figure
  combines time and points into one score (BH-532, FR-543).
- [X] T547 [P] `tests/unit/elapsed-time.test.ts` — derivation is pure across
  every permutation of movements and configuration, exercised with no
  external dependency (BH-533, FR-544).
- [X] T548 [P] `tests/e2e/reports.spec.ts` — reports are keyboard-reachable,
  legible to a screen reader, and producing one never blocks board
  interaction (BH-534, FR-545, FR-546).
- [ ] T549 Run `quickstart.md` end to end against a running stack; record
  any deviation.
- [ ] T550 Duplicate-code review across `src/domain/elapsed-time.ts`,
  `iteration-report.ts` and `burndown.ts` before marking the slice
  complete (constitution, Development Workflow & Quality Gates).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — BLOCKS every user story
- **US1 (Phase 3)**: depends on Foundational only
- **US3 (Phase 4)**: depends on Foundational only — built before US2
  finishes, per the Phase ordering note above
- **US2 (Phase 5)**: depends on US1 (time) and US3 (points) both existing
- **US4 (Phase 6)**: depends on US3 (points) and Foundational's commitment
  plumbing
- **US5 (Phase 7)**: depends on US4 (needs the commitment/scope facts)
- **US6 (Phase 8)**: depends on Foundational only — independent of every
  other story, built last as the spec frames it
- **Polish (Phase 9)**: depends on every story above

### Within Each User Story

- Tests are written and MUST fail before the implementation tasks that
  follow them.
- Domain (pure) → service → route → web, in that order within a phase.

## Parallel Example: User Story 1

```bash
# Once Foundational (Phase 2) is complete, these two run together:
Task: "tests/unit/elapsed-time.test.ts — T512"
Task: "tests/contract/iteration-report.test.ts — T513"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational)
2. Complete Phase 3 (US1 — elapsed time)
3. **STOP and VALIDATE**: read `GET /api/iterations/:ordinalName/report`
   against a real iteration and confirm the time figure by hand
4. Everything else is additive on top of this MVP

### Incremental Delivery

Setup + Foundational → US1 (time) → US3 (points) → US2 (invisible-work
split) → US4 (commitment) → US5 (burndown) → US6 (summary period) → Polish.
Each checkpoint is independently demoable; nothing later breaks an earlier
story.
