# Tasks: Iteration and Board Restructure

**Input**: Design documents from `/specs/005-iteration-and-board-restructure/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md
**Pre-implementation gate**: `/speckit.analyze` MUST be run after this file is
generated and before `/speckit.implement` begins.

**Tests**: MANDATORY. The constitution requires ≥90% line and branch coverage
before merge, spec.md carries success criteria referencing the test suite
(SC-405, SC-407), and plan.md names nineteen test files. Every one becomes a
task below, and every test task precedes the implementation it covers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependencies
- **[Story]**: US1…US6, mapping each task to a user story

## Path Conventions

Web application in one repository: `src/server/`, `src/web/`, `src/shared/`,
`src/domain/`, with tests under `tests/{unit,contract,ops,features,e2e}/`.
Paths below are exact and come from plan.md's Source Code section.

---

## Phase 1: Setup

**Purpose**: Confirm the ground this slice builds on is where the plan says.

- [x] T001 Confirm the v1 baseline is green before changing anything: `npm run typecheck`, `npm run test:unit`, `npm run lint`. Record the counts; a failure here belongs to v1, not to this slice.
- [x] T003 [P] Take a database snapshot before any migration runs, so the migration tasks in Phase 2 can be re-run from a known state: `docker compose exec db pg_dump -U kanban kanban > /tmp/pre-005.sql`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema. All six migrations land together because they are one
interdependent set, and because applying them out of numeric order would leave
an already-migrated database unable to catch up (a real hazard: migrations run
in filename order at process start).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for Foundational

> Write first. These MUST fail before the migrations exist.

- [x] T005 [US1] Ops test in `tests/ops/migration-016-021.test.ts` covering TEST-401 (six-column set, Blocked refused as a target), TEST-402 (**every blocked card lands in In Progress, flagged, with a system-attributed history row — this is NFR-27's no-card-lost assertion**), TEST-403 (a conflicted card migrates with its conflict intact), TEST-404 (re-running changes nothing), TEST-405 (Blocked's mapping dropped, others survive) and TEST-433 (historical movements into and out of Blocked still resolve).

### Implementation for Foundational

- [x] T006 [US1] Migration `src/server/db/migrations/016_retire_blocked_column.sql` per data-model.md §016: add `columns.retired_at`, make `position` nullable, two-phase renumber, retire Blocked, insert Iteration Items as id 7. **Include research R-1's reasoning as a comment in the file itself** — the reason the row survives must live where someone tempted to drop it will read it (plan.md risk P-2).
- [x] T007 [US1] Migration `src/server/db/migrations/017_card_blocked.sql` per data-model.md §017: add `cards.blocked`; write one `system`-attributed `card_events` row per blocked card **before** moving it; move those cards to In Progress; renumber In Progress positions by `(position, id)`; delete the retired column's status mapping.
- [x] T008 [P] [US4] Migration `src/server/db/migrations/018_jira_blocked.sql`: add `jira_links.blocked_in_jira boolean`, nullable to distinguish "never observed" from "observed as not blocked".
- [x] T009 [P] [US2] Migration `src/server/db/migrations/019_iterations.sql`: the `iterations` table per data-model.md §019, with the `source` check constraint and the `starts_on DESC` index.
- [x] T010 [P] [US5] Migration `src/server/db/migrations/020_carry_over.sql`: add `cards.carried_iterations` (with its non-negative check) and `cards.iteration_seen`.
- [x] T011 [P] [US6] Migration `src/server/db/migrations/021_iteration_settings.sql`: the eleven settings rows per data-model.md §021, values taken from Appendix A of `docs/brd-2.md`. Note in a comment which four are written here but consumed by Slice 6.
- [x] T012 [US1] Update `src/shared/types.ts`: replace `blocked` with `iteration_items` in `COLUMN_KEYS` in the new order; add `blocked`, `blockedDivergesFromJira` and `carriedIterations` to `Card`; add the `Iteration` type from contracts/api.md.
- [x] T013 [US1] Update `src/server/repositories/board-repository.ts` and `board-row.ts` to filter `columns.retired_at IS NULL` and project the three new card fields.
- [x] T014 [P] [US6] Extend `src/server/repositories/settings-repository.ts` to read and write the eleven new keys.
- [x] T083 [P] Ops test `tests/ops/no-live-services.test.ts` — TEST-429: no adapter resolving to a real network client is constructed anywhere in the standard suite. Guards every story, so it lives in Foundational. *(Number out of sequence: added by `/speckit.analyze` finding B-1; existing task ids are stable anchors and are never renumbered.)*
- [x] T015 Run the migrations against the snapshot from T003 and confirm T005 now passes. Re-run them a second time and confirm nothing changes (FR-407).

**Checkpoint**: Schema is in place, the board query no longer sees a retired
column, and every previously-blocked card is in In Progress carrying its flag.

---

## Phase 3: User Story 1 — Blocked is a state my card carries (Priority: P1) 🎯 MVP

**Goal**: Blocked stops costing a column. A card can be flagged wherever it
actually is, seen at a glance across a full board, and still moved freely.

**Independent Test**: Start from a board with cards in Blocked, apply the
upgrade, and confirm every one sits in In Progress carrying the flag with the
move recorded against the system.

### Tests for User Story 1

- [x] T017 [P] [US1] Contract test `tests/contract/retired-column.test.ts` — TEST-401's write-path half: a move into the retired column is refused with `COLUMN_RETIRED` and 422.
- [x] T018 [P] [US1] Contract test `tests/contract/board-payload.test.ts` — TEST-406: `blocked`, `blockedDivergesFromJira` and `carriedIterations` present; no retired column returned.
- [x] T019 [P] [US1] Acceptance feature `tests/features/blocked-flag.feature` and steps — TEST-406, TEST-407, TEST-408: set and clear, move while blocked, filter by blocked, summary grouping driven by the flag.
- [x] T020 [P] [US1] E2E test `tests/e2e/blocked-card.spec.ts` — TEST-427: edge and badge visible, blocked distinguishable with colour disabled, flag settable and clearable by keyboard alone.

### Implementation for User Story 1

- [x] T021 [US1] Extend `PATCH /api/cards/:id` in `src/server/routes/cards.ts` to accept `blocked`, for local and Jira-sourced cards alike (FR-412). Setting it issues no Jira request.
- [x] T022 [US1] Reject a retired column as a move target in `src/server/routes/cards.ts` and `src/server/services/card-service.ts`, using the typed error shape in `src/server/errors.ts` (FR-402).
- [x] T023 [US1] Confirm a blocked card is **not** frozen (FR-414): the conflict freeze in `src/server/services/card-service.ts` must not grow a second condition. Add the assertion to T019's feature rather than new production code if none is needed.
- [x] T024 [P] [US1] Retire `--column-blocked` into a `--blocked` token in `src/web/styles/tokens.css`, and add the card's left-edge rule.
- [x] T025 [US1] Render the blocked edge and badge in `src/web/board/CardView.tsx`, following the existing `badge--conflict` pattern. The badge carries the text, so the state survives greyscale (FR-411); the priority dot keeps its meaning.
- [x] T026 [P] [US1] Add the blocked control to `src/web/cards/CardDialog.tsx`, reachable by keyboard (FR-440).
- [x] T027 [P] [US1] Add blocked to the filter in `src/web/board/use-filter.ts` and the left rail in `src/web/board/Sidebar.tsx` (FR-413).
- [x] T028 [US1] Drive the summary's blocked grouping from the flag rather than from column membership, in `src/server/services/summary-service.ts` and `src/server/repositories/summary-repository.ts` (FR-415).
- [x] T029 [US1] Update `src/web/board/Board.tsx` and `ColumnView.tsx` for the six new columns and their colours.

**Checkpoint**: US1 fully functional. **Story-Complete Review Gate PASSED.**

Spec alignment, design, error handling, tests, security and integration all
clear. Suites at the checkpoint: 216 unit, 24 contract, 135 acceptance (815
steps), 26 ops, 52 e2e.

Four defects were found during this story and fixed, none of them by reading
the code:

- Moving into the retired column answered 200 and the card vanished from the
  board. Found by probing the running board.
- Iteration Items was unreachable: `moveCardSchema` pinned `toColumnId` to
  1..6 and Iteration Items is id 7. The developer hit this dragging a card.
- `PATCH {blocked:true}` wrote `true` and answered `false`: two separate
  SELECTs feed the same `toCard`, and only one was updated.
- The mapping route pinned the same 1..6 range and required exactly six
  entries, so no mapping payload could be saved at all.

All four share one cause: constants that were true only while column ids
happened to match board positions. Four copies of the column-id map in the step
files had the same problem and are now one.

---

## Phase 4: User Story 2 — The board tells me which iteration we are in (Priority: P1)

**Goal**: The current iteration, its dates and its remaining
working days, visible without leaving the board — degrading to cache, then to
an estimate, rather than ever failing.

**Independent Test**: Point the board at a reference board with a dated active
sprint and confirm the banner shows it; make the source unreachable and confirm
the banner persists, marked as not freshly read.

### Tests for User Story 2

- [x] T031 [P] [US2] Unit test `tests/unit/sprint-selection.test.ts` — TEST-417 (the configured team's sprint wins over another team's regardless of response order), TEST-418 (an undated active sprint yields no iteration), TEST-430 (a lower reported ordinal is displayed as reported, never counted forward).
- [x] T032 [P] [US2] Unit test `tests/unit/working-days.test.ts` — TEST-416's arithmetic: working days remaining across weekends and a configured working-day set.
- [x] T033 [P] [US2] Unit test `tests/unit/iteration-provenance.test.ts` — TEST-419 (cached, marked stale), TEST-420 (estimated, marked, no ordinal name), TEST-422 (an elapsed iteration stops being presented as current).
- [x] T034 [P] [US2] Contract test `tests/contract/iteration-api.test.ts` — TEST-416 and TEST-421: the payload shape, and the never-5xx guarantee under every failure of the source.
- [x] T035 [P] [US2] Acceptance feature `tests/features/iteration-banner.feature` and steps — read, cached, estimated, and the board staying interactive throughout.
- [x] T036 [P] [US2] E2E test `tests/e2e/iteration-banner.spec.ts` — TEST-428: the banner present alongside roughly fifty cards in a column with no scrolling (FR-441).

### Implementation for User Story 2

- [x] T037 [P] [US2] Pure `src/domain/sprint-selection.ts`: pick the configured team's sprint from a list of active sprints; ignore other teams (FR-445); reject undated sprints (FR-425); break ties on lowest sprint id (FR-424).
- [x] T038 [P] [US2] Pure `src/domain/working-days.ts`: working days between two dates given a configured working-day set. Takes its clock as an argument.
- [x] T039 [US2] `src/server/jira/iteration-port.ts` — the interface from contracts/api.md, with nullable sprint dates because undated sprints are real.
- [x] T040 [P] [US2] `src/server/jira/iteration-adapter.ts` — reads active sprints from the configured board, reusing the existing credential handling in `credentials.ts` and the backoff in `src/domain/backoff.ts`. No new retry policy.
- [x] T041 [P] [US2] `src/server/jira/fake-iteration-adapter.ts` — the suite's double (FR-442, NFR-25), able to present two active sprints, an undated sprint, and every failure kind.
- [x] T042 [US2] `src/server/repositories/iteration-repository.ts` — upsert on `ordinal_name`, read the current iteration by `starts_on DESC`.
- [x] T043 [US2] `src/server/services/iteration-service.ts` — resolve, cache, degrade through cached to estimated to nothing (FR-426, FR-428). Runs inside the existing `src/server/sync/sync-lock.ts` so it cannot overlap a poll. **Failure never propagates to the caller** (FR-430).
- [x] T044 [US2] `GET /api/iteration` in `src/server/routes/iteration.ts`, registered in `src/server/app.ts`. Always 200; a null body is a valid state.
- [x] T045 [US2] `src/web/board/IterationBanner.tsx` — name, date range, working days remaining, and a visible marker when the value is cached or estimated (FR-427). Rendered by `src/web/App.tsx` so it does not block the board's own load (FR-429).
- [x] T046 [US2] **Add the Jira Agile touchpoint to `docs/external-interactions.md`** — direction, contract, authentication, timeout, retry, and both failure modes, matching the entries slices 1–3 wrote. Constitution Principle XI and the standing quality gate require this in the same change as the touchpoint.

**Checkpoint**: US1 and US2 both work independently. **Story-Complete Review
Gate PASSED.**

Verified live against yourcompany.atlassian.net: the banner reads
`Anchor Team 2026 S18`, 24 Aug – 7 Sep, correctly choosing Anchor Team
over the Signal sprint sharing board 4200, and displays it as `S18`.

Two findings recorded during this story:

- The settings route had no validation for any slice 5 key, so a PUT carrying
  `iterationBoardId` returned 200 and silently discarded it. T070 was pulled
  forward from US6 to close it.
- NFR-14's density budget had never been asserted by any test in four slices,
  and its literal reading — fifty cards in ONE column without scrolling — is
  not achievable by any layout on any display. The e2e test asserts the
  achievable reading (a full board of fifty, distributed) and says so.

---

## Phase 5: User Story 3 — I commit work to this iteration (Priority: P2)

**Goal**: Iteration Items holds what the user has committed, by their own hand,
never by inference from Jira.

**Independent Test**: Move cards into Iteration Items and confirm Jira-sourced
cards land there with no Jira request issued, and that nothing places cards
there automatically.

### Tests for User Story 3

- [x] T048 [P] [US3] Acceptance feature `tests/features/iteration-items.feature` and steps — TEST-409 (moving a Jira card in issues no Jira request), TEST-410 (sync never places a card there), TEST-425 (placement survives a reload). **Note**: TEST-410's fixture carries a sprint on the issue, but production code must remain ignorant of the sprint field — reading it onto cards is out of scope. The assertion is negative: nothing happens.

### Implementation for User Story 3

- [x] T049 [US3] Confirm Iteration Items has no `column_status_mappings` row and therefore takes the existing unmapped-column path in `src/server/sync/transition-service.ts` unchanged (FR-408). This is expected to require **no production change** — the mechanism is Slice 3's. If a change proves necessary, that is a finding worth recording.
- [x] T050 [US3] Confirm `src/server/sync/sync-service.ts` never assigns a card to Iteration Items, and add the guard if any path could (FR-434).
> **T051 withdrawn** by `/speckit.analyze` finding N-2: it exposed Iteration
> Items in the mapping editor, which no requirement asks for. The column's
> local-only status is already observable — moving a Jira card into it issues no
> Jira request, which T048 proves. The id is retired, not reused.

**Checkpoint**: US1–US3 work independently. **Story-Complete Review Gate PASSED.**

T049 and T050 required no production change, as the plan predicted: Iteration
Items simply has no `column_status_mappings` row, so it takes slice 3's
unmapped-column path unaltered. The mechanism outlived the column it was built
for.

TEST-410 is asserted structurally rather than by staging a sprint: `JiraPort`
has no field or method that can express sprint membership, so sync cannot read
one even by accident. That is the argument the port's own comment makes about
writes — an interface that cannot express the thing beats a rule saying not to
do it — and the step fails the day someone adds such a field.

---

## Phase 6: User Story 4 — Blockers my team recorded in Jira reach my board (Priority: P2)

**Goal**: Jira's blocked state arrives without re-entry, while the user keeps
the final say and the disagreement stays visible.

**Independent Test**: Import an issue whose blocked field is set, clear it
locally, and confirm later syncs do not re-set it and the divergence shows.

### Tests for User Story 4

- [x] T053 [P] [US4] Unit test `tests/unit/blocked-divergence.test.ts` — TEST-412 (a locally cleared flag survives a sync still reporting blocked), TEST-414 (the divergence indication clears once the states agree).
- [x] T054 [P] [US4] Extend `tests/unit/no-jira-writes.test.ts` — TEST-415: every Jira write in the suite leaves the blocked field untouched.
- [x] T055 [P] [US4] Acceptance feature `tests/features/blocked-from-jira.feature` and steps — TEST-411 (import), TEST-413 (a diverging card still moves), TEST-431 (the divergence marker is distinguishable from the blocked indicator).

### Implementation for User Story 4

- [x] T056 [US4] Read the blocked state in `src/server/jira/jira-adapter.ts`: the field is a **multi-checkbox**, so blocked means the configured option appears in the array (research R-6). Absent field, empty array and an array without the option all mean not blocked. Field id and option label both come from settings (FR-438).
- [x] T057 [US4] Persist `jira_links.blocked_in_jira` on each sync in `src/server/sync/sync-service.ts` and `src/server/repositories/jira-link-repository.ts`, and set `cards.blocked` only when no local opinion has been expressed (FR-418).
- [x] T058 [US4] Compute `blockedDivergesFromJira` server-side in `src/server/repositories/board-repository.ts`, alongside `overdue`, so one definition governs.
- [x] T059 [US4] Render the divergence marker in `src/web/board/CardView.tsx` — **outlined, not solid**, so it never reads as blocked (FR-443). Distinct from the badge added in T025.
- [x] T060 [US4] Show the two states side by side in `src/web/cards/CardDialog.tsx` when they diverge, with local marked as the one in force.
- [x] T061 [US4] Confirm divergence creates no `conflicts` row and triggers no freeze (FR-419). The conflict model must be untouched by this story.

**Checkpoint**: US1–US4 work independently. **Story-Complete Review Gate PASSED.**

Verified against live Jira rather than only against the fake: every
`jira_links.blocked_in_jira` reads `false` rather than `null`, which is the
proof the field was requested and parsed — null would mean skipped. And a real
blocked issue (WT-8383) carries `['Blocked']`, the multi-checkbox array shape
the parser expects, not a boolean.

T061 needed no change: divergence creates no `conflicts` row and reuses none of
slice 3's machinery, by construction rather than by suppression.

---

## Phase 7: User Story 5 — Chronic carry-over is visible (Priority: P3)

**Goal**: A card that has slipped from iteration to iteration says so on its
face.

**Independent Test**: Advance the board across an iteration boundary with
unfinished cards and confirm they remain, and display how many iterations they
have carried.

### Tests for User Story 5

- [x] T063 [P] [US5] Unit test `tests/unit/carry-over.test.ts` — TEST-424 (a twice-carried card shows two), TEST-432 (returning to Backlog resets), plus reaching Done resetting (FR-444).
- [x] T064 [P] [US5] Acceptance feature `tests/features/carry-over.feature` and steps — TEST-423: unfinished cards survive a boundary in place.

### Implementation for User Story 5

- [x] T065 [P] [US5] Pure `src/domain/carry-over.ts` — given a card's column, its `iteration_seen` and the current iteration, decide increment, reset or leave alone.
- [x] T066 [US5] `src/server/services/carry-over-service.ts` — apply that decision when `iteration-service` observes a new iteration. Reaching Done or Backlog resets (FR-444); the working columns increment (FR-435).
- [x] T067 [US5] Show the count on the card face in `src/web/board/CardView.tsx`, only when greater than zero.

**Checkpoint**: US1–US5 work independently. **Story-Complete Review Gate PASSED.**

One decision worth recording. The count increments once per OBSERVED boundary,
not once per ordinal skipped: a board left unopened for six weeks saw one
transition, not three, and claiming otherwise would mean reconstructing a
calendar it never read. The assumption in spec.md already says the count
depends on the app having observed each boundary; this is what that means in
practice.

---

## Phase 8: User Story 6 — I can point the board at my own team's calendar (Priority: P3)

**Goal**: Reference board, team name, working days and Jira field identifiers
all changeable without a code change.

**Independent Test**: Change the reference board in settings, confirm the
banner follows, restart, and confirm the setting survived.

### Tests for User Story 6

- [x] T069 [P] [US6] Acceptance feature `tests/features/iteration-settings.feature` and steps — TEST-426: changed settings survive a restart, and a changed team name switches the banner to the other team's sprint on the same dates.

### Implementation for User Story 6

- [x] T070 [US6] Extend the Zod schema in `src/server/routes/settings.ts` with the bounds from contracts/api.md: cadence 1–90, hours 0–23 with start < end, working days a non-empty subset, field ids matching `^customfield_\d+$`, board id a positive integer.
- [x] T071 [US6] Re-arm iteration resolution when the board or team name changes, following the existing `onIntervalChanged` pattern.
- [x] T072 [US6] Add the controls to `src/web/settings/SettingsDialog.tsx`, showing each field identifier's default. No credential appears, and there is nowhere to put one.

**Checkpoint**: All six stories independently functional. **Story-Complete
Review Gate PASSED.**

The settings dialog outgrew its 520px column during this story — enough that
the browser suite found its own Save button unreachable, timing out on a click
that resolved to a real but off-screen element. It is now three columns at
1180px, with the column mapping moved in rather than sitting full-width below,
and it collapses to fewer columns rather than squeezing.

`,` opens settings, matching the convention every editor and browser settled
on.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T073 [P] Update repo-root `README.md`: the new column set, blocked as a flag, the iteration banner, and every new setting with its default. Include the upgrade note for plan.md risk P-1 — rolling back the image without rolling back the data leaves cards in In Progress that older code expects in Blocked.
- [x] T074 Verify the **Architecture Diagram** in `plan.md` still reflects the as-built system; update both diagrams if the implementation diverged, and label every edge.
- [x] T075 Verify every one of the nineteen test files named in plan.md exists and passes.
- [x] T076 Verify every behavior pathway has a passing test and every test file named in plan.md exists. **No coverage percentage is claimed** — see plan.md's Constitution Check, where the absent coverage provider is recorded as a carried deviation (`/speckit.analyze` B-2).
- [x] T077 Confirm the new Agile touchpoint added in T046 is exercised by an integration test, per the standing quality gate on the External Interactions Register.
- [x] T078 [P] Run `npm run lint` and the full suite: unit, contract, ops, acceptance, e2e.
- [x] T079 Run `quickstart.md` end to end against a live stack, including the two degraded iteration paths and the team-filter check.
- [x] T080 **Live verification against real Jira** — the board's own history says this finds what a green suite cannot. Confirm the banner shows the actual current Anchor Team iteration with correct dates, and that the other team's sprint is ignored. Record it in `specs/005-iteration-and-board-restructure/live-verification.md`, as slice 3 did.
- [x] T081 Run `/speckit.review` for a second-pass review of the diff against `main`; address blocking findings before opening a PR.
- [ ] T082 Request peer code review; address feedback before merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story** —
  all six migrations land here as one set.
- **User Stories (Phases 3–8)**: all depend on Foundational.
- **Polish (Phase 9)**: depends on every story being complete.

### User Story Dependencies

Unlike a greenfield feature, these stories are not fully independent of each
other, and the spec says so: US1 is "the atomic change the rest of the slice
sits on."

- **US1 (P1)**: after Foundational. Independent.
- **US2 (P1)**: after Foundational. Independent of US1 — the banner needs no
  column change.
- **US3 (P2)**: needs the Iteration Items column, delivered in Foundational.
- **US4 (P2)**: needs `cards.blocked` (Foundational) and US1's card rendering,
  because the divergence marker sits beside the blocked badge.
- **US5 (P3)**: needs US2 — carry-over cannot be counted without an iteration.
- **US6 (P3)**: needs US2 — there is nothing to re-point until resolution exists.

### Within Each User Story

- Tests are written and MUST fail before the implementation they cover.
- Migrations before repositories, repositories before services, services before
  routes, routes before the interface.

### Parallel Opportunities

- T002 and T003 in Setup.
- T008 through T011 — four independent migrations on different tables.
- Every test task marked `[P]` within a story.
- T037 and T038 — two pure functions in different files.
- T040 and T041 — real and fake adapters.
- US1 and US2 can be worked in parallel by two people once Phase 2 completes.

---

## Per-Task Cleanup (MANDATORY)

After each task, before moving on:

- [ ] No commented-out code blocks remain in touched files
- [ ] No unused imports, variables, or functions introduced
- [ ] No TODO/FIXME/HACK markers left unresolved
- [ ] No debug logging (`console.log`, `debugger`)
- [ ] No file exceeding 300 lines without justification
- [ ] No functionality beyond what spec.md requires
- [ ] No unnecessary dependencies added — **this slice expects zero**

---

## Story-Complete Review Gate (MANDATORY)

Run at every Checkpoint, after the last task in a story phase and before
starting the next. Deeper than the per-task hygiene list: it looks for gaps in
design, coverage and spec alignment that a mechanical checklist misses.

**Spec alignment**
- [ ] Every acceptance scenario for this story is exercised by code or tests
- [ ] Every functional requirement tied to this story is met
- [ ] Nothing implemented beyond what the spec requires

**Design & structure**
- [ ] Each module has a single, cohesive responsibility
- [ ] No premature abstraction; no missing abstraction
- [ ] Coupling to prior stories is intentional, not accidental
- [ ] Names read cold; no file over 300 lines without justification

**Error handling & edge cases**
- [ ] Boundary failures (I/O, network, parsing, input) are handled
- [ ] Errors carry enough context to debug
- [ ] The spec's edge cases are covered — including the two that are real
      rather than hypothetical: two active sprints, and an undated sprint

**Tests**
- [ ] Every test file plan.md lists for this story exists and passes
- [ ] Tests assert behaviour, not implementation
- [ ] Tests would fail if the implementation regressed
- [ ] Every behavior pathway for this story has a passing test (no percentage is claimed — carried deviation)

**Security & data**
- [ ] Untrusted input validated at the boundary it enters
- [ ] No secrets in code, logs or fixtures
- [ ] No Jira field other than status is written

**Integration**
- [ ] Integrates cleanly with Foundational and prior stories
- [ ] No regressions: all previously-passing tests still pass
- [ ] Story still satisfies its Independent Test

**Documentation & onboarding**
- [ ] README gets a new developer running the feature end to end
- [ ] The Architecture Diagram in plan.md still reflects reality
- [ ] New config keys are documented where developers will look

### Outcome

Gaps found → add a remediation task to **this story's** section, implement,
re-run hygiene, re-run the gate. Only mark the Checkpoint passed when every
dimension is clear. Then run `/speckit.feedback` while the story is fresh.

---

## Notes

- `[P]` means different files and no dependency — not "unimportant".
- Commit after each task or logical group.
- The only destructive task in this slice is T007. T003's snapshot exists so it
  can be re-run from a known state.
- Migrations are numbered `016`–`021` and applied in filename order at process
  start. They are all created in Phase 2 for that reason: adding `018` after
  `019` had already been applied would leave a live database unable to catch up.
