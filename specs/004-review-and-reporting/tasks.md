---

description: "Task list for 004-review-and-reporting"
---

# Tasks: Review and Reporting

**Input**: Design documents from `/specs/004-review-and-reporting/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md),
[research.md](research.md), [data-model.md](data-model.md),
[contracts/api.md](contracts/api.md)

**Pre-implementation gate**: `/speckit.analyze` MUST run after this file is
generated and before `/speckit.implement` begins.

**Tests are mandatory.** The spec defines nine success criteria, three of which
(SC-302, SC-303, SC-308) are claims about the *whole suite*; plan.md names
twelve test files; and the constitution requires automated tests before merge.
Every test task precedes the implementation it covers.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — may run in parallel; touches no file another `[P]` task in the same
  group touches.
- **[Story]** — which user story the task serves.

---

## Phase 1: Setup

- [ ] T401 Create the four new domain module files as empty stubs with their
  intended signatures — `src/domain/{card-filter,archival,summary,summary-text}.ts`
  — so the test tasks that follow have something to import and fail against
  rather than failing to resolve.
- [ ] T402 **Set `TZ` in `docker-compose.yml`** (research.md R-7). The container
  runs UTC by default, and every period boundary in this slice is a local
  calendar day. Without this the daily summary silently omits the user's
  evening work for the five hours between 7pm Eastern and midnight UTC — wrong
  in exactly the window before the standup it exists to serve. Document it in
  README and `.env.example`. **Not a footnote: the feature is quietly incorrect
  without it.**

---

## Phase 2: Foundational (blocks every story)

**⚠️ No story work begins until this phase is complete.**

- [ ] T403 [P] Migration `013_card_events_kind.sql` — add `kind` defaulting to
  `'moved'`, re-scope `card_events_actual_move` to movements only, add
  `card_events_arrival_idx`. See data-model.md. The default is what makes this
  a no-backfill change: every existing row already means what it says.
- [ ] T404 [P] Migration `014_archive_runs.sql` — the run log, with its
  single-flight partial unique index.
- [ ] T405 [P] Seed `archive.window_days` (7) and `archive.interval_seconds`
  (3600) into `settings`, in the same migration style as slice 2's keys.
- [ ] T406 `EventRepository` gains an `appendArchival` write — `kind:
  'archived'`, `actor: 'system'`, both column ids the Done column. It stays the
  only writer of `card_events`; slice 1's unit test enforces that and must keep
  passing.
- [ ] T407 [P] Extend `Card`-adjacent shared types in `src/shared/types.ts`:
  `CardEvent` gains `kind`, and the new `ArchiveDay`, `Summary` and
  `SummaryEntry` shapes from contracts/api.md.
- [ ] T408 Settings route and dialog accept `archiveWindowDays` (0–365) and
  `archiveIntervalSeconds` (300–86400), validated against those bounds at the
  route. Zero is a *valid* window — the spec calls it the user's choice — so the
  lower bound is zero, not one.

**Checkpoint**: schema and settings in place; no behaviour has changed yet.

---

## Phase 3: User Story 1 — Find the card I am thinking of (P1)

**Goal**: narrow the board in place, by text, tag, priority, source or overdue.

**Independent Test**: with cards spanning several tags, priorities and sources,
apply each filter and confirm only matching cards remain — in place, on the same
board, with every column still visible.

- [ ] T409 [US1] Sync TestRail cases TEST-301, TEST-302, TEST-303, TEST-304, TEST-305, TEST-306, TEST-307, TEST-308 via `spec-testrail-sync`
  (project 115, suite 32733, new section "Slice 4 — Review and Reporting").
  **Before any implementation task in this story.**

### Tests (must fail first)

- [ ] T410 [P] [US1] `tests/unit/card-filter.test.ts` — every filter kind and
  every pairwise combination, the empty filter, and the filter matching nothing.
  SC-302 asks for no false positives and no omissions across combinations, so
  this is a table, not a handful of examples — BH-301, BH-302, BH-303, BH-304.
- [ ] T411 [P] [US1] `tests/features/filtering.feature` — a filtered board moves
  no card and changes no content. This is the acceptance-level half of SC-303;
  the client-side design (R-1) makes it true by construction, and this test is
  what proves the construction held — BH-305.
- [ ] T412 [P] [US1] `tests/e2e/filter.spec.ts` — all six columns visible while
  filtered; the empty-filtered board states that a filter is hiding cards and
  offers to clear it; filter reachable, applicable and clearable by keyboard
  alone; reload clears it — BH-305, BH-306, BH-307, BH-308.

### Implementation

- [ ] T413 [US1] `src/domain/card-filter.ts` — a pure `matches(card, filter)`
  plus the `Filter` shape. Text matches title and description only; tags are a
  separate control, so the two never overlap surprisingly (spec Edge Cases).
- [ ] T414 [US1] `src/web/board/use-filter.ts` — the filter state hook. Held in
  component state and nowhere else: that is what makes FR-310 (no persistence
  across reload) free rather than something to enforce.
- [ ] T415 [US1] `src/web/board/FilterBar.tsx` — text input, tag select,
  priority select, source select, overdue toggle, and a clear control. Every one
  reachable by keyboard (FR-309).
- [ ] T416 [US1] `Board.tsx` filters before rendering, and renders all six
  columns regardless of matches (FR-307).
- [ ] T417 [US1] The empty-filtered board states that a filter is active and how
  to clear it (FR-308). **An empty board must never be ambiguous between
  "filtered" and "you have no work"** — that ambiguity is the whole of SC-309.
- [ ] T418 [US1] `/` focuses the filter, `Escape` clears it; both listed in the
  help overlay. Must respect the `suspended` flag slice 1 added, so the
  shortcut cannot reach past an open dialog.

**Checkpoint**: US1 works independently. **Run the Story-Complete Review Gate.**

---

## Phase 4: User Story 2 — Finished work leaves without being lost (P1)

**Goal**: a card that has sat in Done past the window leaves the board on its
own, and is retained rather than deleted.

**Independent Test**: place cards in Done with varying ages, run a pass, and
confirm only those past the window left — and that all of them are still there.

**Scope note.** This story proves *retention* by asserting the database
directly in its acceptance steps, not through `GET /api/archive` — that endpoint
belongs to US5, and building half of it here to satisfy a test would be the
endpoint's shape being driven by test convenience rather than by US5's actual
need. The cucumber world already has a pool and other steps already assert
through it.

- [ ] T419 [US2] Sync TestRail cases TEST-309, TEST-309a, TEST-310, TEST-311, TEST-312 via
  `spec-testrail-sync`. **Before any implementation task in this story.**

### Tests (must fail first)

- [ ] T420 [P] [US2] `tests/unit/archival.test.ts` — the window boundary
  exactly: one second under, exactly on, one second over. Plus the zero window,
  and the card created directly in Done with no arrival event, whose fallback to
  `created_at` exists because null would otherwise mean either "infinitely old"
  or "infinitely new" and both are wrong (R-2) — BH-309, BH-310.
- [ ] T421 [P] [US2] `tests/features/archival.feature` — eligibility; the
  configurable window; the card that reached Done, left and returned yesterday,
  measured from its most recent arrival; **the conflicted card that is never
  archived however old** (FR-318a); and the archival recorded with the system as
  actor — BH-309, BH-309a, BH-310, BH-311, BH-312.

- [ ] T421a [US2] `tests/features/steps/reporting.steps.ts` — the steps the
  acceptance features above need: ageing a card's Done arrival, running an
  archival pass, asserting a card is archived and retained, and reading a
  summary. Grows in US3–US5 rather than being rewritten. Numbered with a suffix
  because it was missed on the first pass of this list — plan.md named twelve
  test files and this list covered eleven, which is precisely the gap that let
  slice 4's own `mapping-settings.feature` go unwritten in slice 3.

### Implementation

- [ ] T422 [US2] `src/domain/archival.ts` — pure
  `shouldArchive({ arrivedInDoneAt, createdAt, windowDays, now, conflicted })`.
  Takes `now` as an argument so every boundary case is a unit test rather than a
  scenario with a sleep in it.
- [ ] T423 [US2] `ArchiveRepository.candidates()` — the query in data-model.md,
  selecting the most recent Done arrival and whether a conflict is open, in one
  row per candidate. Both facts arrive together so the decision to skip is
  visible beside the decision to archive.
- [ ] T424 [US2] `ArchiveRepository.archive(cardId)` — sets `archived_at` and
  appends the archival history row, **in one transaction per card**. Per card,
  not per pass: batching means one bad card blocks every other card's archival.
- [ ] T425 [US2] `ArchiveRunRepository` — start, succeed with counts, fail.
- [ ] T426 [US2] `ArchivalService.runOnce()` — select, decide, archive, count.
  Re-checks each card under `SELECT … FOR UPDATE` inside its own transaction, so
  a user dragging a card out of Done mid-pass either wins the race or waits for
  it (plan.md, Concurrent writes).
- [ ] T427 [US2] Skip cards with an open conflict, and count them separately as
  `skippedConflicted`. **`archived: 0` alone cannot distinguish "nothing was
  due" from "something was due and I refused", and only one of those wants
  investigating.**
- [ ] T428 [US2] Log each archived card with its id and its age in Done. This is
  the first process here that changes the board unobserved; slice 3's live check
  found an unrequested write *only* because a log existed to find it in.
- [ ] T429 [US2] `POST /api/archive/run` (200 with the run, 409
  `ARCHIVE_IN_PROGRESS`). Exists so the pass is testable and observable without
  waiting an hour — the same reason `POST /api/sync/run` does.
- [ ] T430 [US2] Wire a second `Scheduler` in `app.ts` against
  `archive.interval_seconds`, with its own single-flight guard, re-armed when
  the setting changes. Separate from the sync's so a slow archival cannot delay
  a sync for a reason no user could explain (R-5).

**Checkpoint**: US1 and US2 both work independently. **Run the Story-Complete
Review Gate.**

---

## Phase 5: User Story 3 — Produce my standup update without writing it (P2)

**Goal**: a daily summary of what moved, what is in progress, and what is
blocked — copyable in one action.

**Independent Test**: move several cards over two days, generate the daily
summary, confirm it names all three groups and copies as plain text.

- [ ] T431 [US3] Sync TestRail cases TEST-316, TEST-318, TEST-319, TEST-320, TEST-321 via
  `spec-testrail-sync`. **Before any implementation task in this story.**

### Tests (must fail first)

- [ ] T432 [P] [US3] `tests/unit/summary.test.ts` — grouping into moved, in
  progress and blocked; sync-attributed movements marked; the empty period
  producing `empty: true` rather than three empty groups — BH-316, BH-319,
  BH-321.
- [ ] T433 [P] [US3] `tests/unit/summary-text.test.ts` — the rendered text
  asserted line by line, including issue keys and the sync marker. Rendering
  server-side is what makes the exact bytes the user pastes an assertable value
  (R-6) — BH-318, BH-320.
- [ ] T434 [P] [US3] `tests/e2e/summary.spec.ts` — open the summary and copy it.
  Two interactions, which is exactly SC-306's budget — BH-320.

### Implementation

- [ ] T435 [US3] `src/domain/summary.ts` — pure: history rows plus current board
  rows in, structured summary out. Takes the period boundaries as arguments.
- [ ] T436 [US3] `src/domain/summary-text.ts` — pure: structured summary in,
  plain text out (FR-329).
- [ ] T437 [US3] Period boundaries via `toCalendarDate` from `overdue.ts` — the
  same local-calendar-day rule due dates already use (R-7). Daily covers
  yesterday *and* today, because a standup update is about what you did
  yesterday and what you are on now.
- [ ] T438 [US3] `SummaryRepository` — the two reads in data-model.md. Note that
  the join to `cards` filters `deleted_at` but *not* `archived_at`: that is how
  archived work stays in a summary while deleted work drops out.
- [ ] T439 [US3] `SummaryService` + `GET /api/summary?period=daily`, returning
  structure and text together so the two cannot disagree.
- [ ] T440 [US3] Mark movements whose actor is not `user`, in both the structure
  and the text (FR-328). **This exists so the user does not read out a
  transition a teammate made as their own progress.**
- [ ] T441 [US3] `src/web/summary/SummaryDialog.tsx` — three distinguishable
  groups and a Copy control using the platform clipboard API. No new dependency.
- [ ] T442 [US3] An empty period states there was no activity rather than
  rendering three empty headings, which reads like a bug (FR-330).

**Checkpoint**: **Run the Story-Complete Review Gate.**

---

## Phase 6: User Story 4 — Look back over the week (P2)

**Goal**: the same picture over seven days, including work since archived.

**Independent Test**: generate the weekly summary over a period containing
completed, in-progress and blocked work, and confirm it covers seven days
including archived cards.

- [ ] T443 [US4] Sync TestRail cases TEST-317 and TEST-322 via
  `spec-testrail-sync`. **Before any implementation task in this story.**

### Tests (must fail first)

- [ ] T444 [P] [US4] `tests/features/summaries.feature` — daily and weekly; a
  card completed and archived inside the period still appearing; both sources
  with issue keys; and **twenty consecutive generations mutating no card, no
  column and no history row** (SC-308, BH-322) — BH-317, BH-322.

### Implementation

- [ ] T445 [US4] `period=weekly` — the last seven calendar days including today.
  The window is the only difference from daily; if it turns out not to be, the
  split was wrong and the summary builder needs the seam instead.
- [ ] T446 [US4] Confirm archived cards appear (FR-326). **A week's work that
  vanished from the report because it was tidied away would make the weekly
  summary useless for the one conversation it exists for.**
- [ ] T447 [US4] Period selector in `SummaryDialog`.

**Checkpoint**: **Run the Story-Complete Review Gate.**

---

## Phase 7: User Story 5 — Look something up in the archive (P3)

**Goal**: browse archived cards by date range, grouped by completion date.

**Independent Test**: archive cards across several dates, retrieve a range, and
confirm only cards from that range appear.

- [ ] T448 [US5] Sync TestRail cases TEST-313, TEST-314, TEST-315 via
  `spec-testrail-sync`. **Before any implementation task in this story.**

### Tests (must fail first)

- [ ] T449 [P] [US5] `tests/features/archive-view.feature` — a range returning
  only its own cards, grouped by completion date; retained title, tags, source
  and completion date; the issue link and the recorded reason for a card that
  left the query in slice 2; and an empty range stated plainly — BH-313, BH-314, BH-315.
- [ ] T450 [P] [US5] `tests/e2e/archive.spec.ts` — browse by range and open an
  entry — BH-313, BH-314.

### Implementation

- [ ] T451 [US5] `ArchiveRepository.byDateRange()` — the query in
  data-model.md, with tags and the Jira link joined as the board does.
- [ ] T452 [US5] `GET /api/archive?from=&to=` per contracts/api.md. `to` is
  **inclusive** — a range of one day means that day, which is what a person
  asking for one day means. Defaults to the last 30 days.
- [ ] T453 [US5] Group by the local calendar date of `archived_at`, in the
  service rather than in SQL, where the timezone would be the container's
  regardless (R-7). Omit days with no cards: a run of empty dates is noise.
- [ ] T454 [US5] `INVALID_DATE_RANGE` for a `from` later than its `to`, or an
  unparseable date — distinct from an empty result, which is a **200**. One is a
  mistake to correct; the other is an answer.
- [ ] T455 [US5] Show the recorded archival reason where one exists (FR-322).
  **"I finished it" and "it was reassigned away from me" look identical in an
  archive that does not say.**
- [ ] T456 [US5] `src/web/archive/ArchiveView.tsx` + a nav entry, with a date
  range control and a plain empty statement (FR-323).

**Checkpoint**: all five stories independently functional. **Run the
Story-Complete Review Gate before Polish.**

---

## Phase 8: Polish & Cross-Cutting

- [ ] T457 [P] Update `README.md` — filtering, the archive, the summaries, the
  two new settings, and `TZ` with what goes wrong when it is unset.
- [ ] T458 [P] Add a note to `docs/external-interactions.md` recording that this
  slice adds **no** touchpoint. The register is only trustworthy if the absence
  of an entry is itself a checked claim.
- [ ] T459 Verify plan.md's component and state diagrams against the as-built
  system; label every edge.
- [ ] T460 Verify all twelve test files named in plan.md exist and pass.
- [ ] T461 Verify SC-301 through SC-309, including SC-302's full combination matrix and
  SC-303/SC-308's zero-mutation claims.
- [ ] T462 Run the archival pass against a board with a conflicted card, a card
  created directly in Done, and a card that left Done and returned — the three
  cases most likely to be right in unit tests and wrong in wiring.
- [ ] T463 Code cleanup; no file over 300 lines without a recorded reason.
- [ ] T464 `npm audit` clean at Critical and High.
- [ ] T465 Run `quickstart.md` end to end from a clean `docker compose up`.
- [ ] T466 Run `/speckit.review`; address blocking findings.
- [ ] T467 Request peer review.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** — no dependencies.
- **Foundational (2)** — after Setup. **Blocks every story**: migration 013 is
  what makes an archival history row writable at all, and T407's shared types
  are imported by every story's tests.
- **Stories (3–7)** — after Foundational, in priority order.
- **Polish (8)** — after all five.

### Story dependencies

- **US1 (filtering)** — independent of everything after Foundational. Nothing
  else in this slice touches it, and it touches nothing else.
- **US2 (archival)** — independent. Proves retention against the database
  rather than through US5's endpoint, deliberately (see its scope note).
- **US3 (daily summary)** — independent, though richer once US2 has archived
  something.
- **US4 (weekly)** — **depends on US3**. It is the same machinery over a longer
  window; building it first would mean building US3 inside it.
- **US5 (archive browsing)** — **depends on US2** for anything to browse, and on
  slice 2's archival for the recorded-reason case in T449.

### Within a story

- The TestRail sync task first, always.
- Then tests, which must fail.
- Then domain (pure) → repository → service → route → interface.

### Parallel opportunities

- T403, T404, T405, T407 — different files, no shared state.
- Every test task marked `[P]` within a story.
- US1 is genuinely parallel to US2 for a second person: no shared file.

---

## Implementation Strategy

**MVP is US1 + US2.** Both are P1, and together they are the whole of "the board
stays usable as work accumulates" — one keeps it findable, the other keeps it
from growing without bound. The summaries are what the user asked for by name,
but a board that has become unusable produces summaries nobody reads.

Then US3 (the standup update, success metric M-6), US4 on top of it, and US5
last — the rarest need, and the reason the archive retains rather than discards.

---

## Story-Complete Review Gate (MANDATORY)

Run at every Checkpoint, before starting the next story. Deeper than the
per-task hygiene checklist: it looks for gaps in design, coverage and spec
alignment that a mechanical pass cannot see.

**Spec alignment** — every acceptance scenario for the story exercised; every FR
tied to it met; nothing implemented beyond what the spec requires.

**Design & structure** — one cohesive responsibility per module; no premature
abstraction; no near-duplicate blocks crying for extraction; coupling to prior
stories intentional; names readable cold; no file past 300 lines unjustified.

**Error handling & edge cases** — failures at I/O and input boundaries handled;
errors carry enough context to debug; the spec's edge cases (empty, zero window,
concurrent move during a pass) covered.

**Tests** — every test file plan.md names for this story exists and passes;
tests assert behaviour, not implementation; **mutation-test mentally — would a
plausibly wrong implementation still pass?** If yes, the test is weak. Slice 3
shipped a scenario that passed against the defect it was meant to catch; the
only reason it was found was running it against the old logic on purpose.

**Security & data** — untrusted input validated where it enters; no secrets
anywhere, including fixtures.

**Integration** — integrates cleanly with Foundational and prior stories; no
regressions; still satisfies its own Independent Test.

Gaps become remediation tasks in the same story section — never deferred to
Polish.

---

## Traceability: requirement → task

Every functional requirement, with the tasks that cover it. Present because the
first draft of this list cited eleven of thirty-two FRs by number, and "I walked
them by hand and they were all covered" is exactly the check that stops
happening under time pressure.

| FR | Covered by |
|---|---|
| FR-301 text filter | T410, T413 |
| FR-302 tag filter | T410, T413, T415 |
| FR-303 priority filter | T410, T413, T415 |
| FR-304 source filter | T410, T413, T415 |
| FR-305 overdue filter | T410, T413, T415 |
| FR-306 filters intersect | T410, T413 |
| FR-307 in place, six columns | T411, T416 |
| FR-308 says a filter is hiding cards | T412, T417 |
| FR-309 keyboard reachable | T412, T415, T418 |
| FR-310 no persistence across reload | T412, T414 |
| FR-311 filtering mutates nothing | T411, T413 (pure), T461 |
| FR-312 archive past the window | T420, T422, T426 |
| FR-313 window configurable, default 7 | T405, T408, T421 |
| FR-314 measured from most recent arrival | T420, T421, T423 |
| FR-315 archived card leaves the board | T421, T424 |
| FR-316 retained, never deleted | T421, T424, T461 |
| FR-317 recorded, system as actor | T403, T406, T421, T424 |
| FR-318 moved out before the window | T420, T421 |
| FR-318a conflicted card never archived | T421, T427, T462 |
| FR-319 view by date range | T449, T451, T452 |
| FR-320 grouped by completion date | T449, T453 |
| FR-321 detail retained, issue link | T449, T450, T451, T456 |
| FR-322 recorded reason shown | T449, T455 |
| FR-323 empty archive stated plainly | T449, T454, T456 |
| FR-324 moved, in progress, blocked | T432, T435, T441 |
| FR-325 daily and weekly offered | T439, T445, T447 |
| FR-326 includes archived cards | T438, T444, T446 |
| FR-327 both sources, issue keys | T433, T441, T444 |
| FR-328 sync movements marked | T432, T440 |
| FR-329 copyable as plain text | T433, T434, T436, T441 |
| FR-330 quiet period says so | T432, T442 |
| FR-331 summarising mutates nothing | T444, T461 |

**Thirty-two requirements, none uncovered.** Two tasks trace to no FR and are
justified in analysis.md: T402 (`TZ`) corrects a latent defect this slice
exposes, and T458 records that this slice adds no external touchpoint — the
register is only trustworthy if absence is a checked claim.
