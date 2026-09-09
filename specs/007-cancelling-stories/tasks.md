---
description: "Task list for Cancelling Stories (slice 7)"
---

# Tasks: Cancelling Stories

**Input**: Design documents from `/specs/007-cancelling-stories/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)

**Tests are MANDATORY** (constitution Principle IV). The spec defines 33
Behavior Pathways with 33 verification rows; every one gets a task below,
and every test task precedes the implementation task it covers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependencies
- **[Story]**: US1…US5, mapping each task to a user story

## Phase ordering note

US1 and US2 are both P1 in `spec.md`, but US2 ("the cancellation reaches
Jira") extends the exact call site US1 creates — the same relationship
slice 3's push had to slice 1's move. US1 is built first, local-only; US2
adds the best-effort Jira transition on top. US3 (reporting) and US4
(restore) are both P2 and independent of each other, but US4's restore
must reverse what US3 makes visible, so US3 goes first. US5 (the settings
UI) is P3 and depends on nothing but the setting itself, which Foundational
already makes readable — US5 is purely "choosing it well," per the spec's
own framing.

---

## Phase 1: Setup

- [X] T701 Confirm the current baseline is green before changing anything:
  `npm run typecheck`, `npm run test:unit`, `npm run lint`. Record the
  counts; a failure here predates this slice.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, shared types and settings plumbing every story
reads or writes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T702 Migration `src/server/db/migrations/027_cancellation.sql` — per
  data-model.md: `cards` gains `cancelled_at timestamptz`,
  `cancellation_reason text`, `cancelled_from_column_id integer REFERENCES
  columns(id)`; `card_events`'s existing `kind` CHECK constraint (verify its
  actual name against a running instance — introduced unnamed in migration
  013, likely `card_events_kind_check`) is dropped and re-added to allow
  `'cancelled'` and `'restored'` alongside `'moved'`/`'archived'`.
- [X] T703 [P] Extend `src/shared/types.ts`: `Card` gains
  `cancellationDivergesFromJira: boolean`; `ArchivedCard` gains
  `cancelled: boolean` and `cancellationReason: string | null`;
  `IterationReportPoints` gains `withdrawn: number`; `BurndownPoint` gains
  `withdrawnThatDay: number`; `CardEventKind` gains `'cancelled' |
  'restored'`.
- [X] T704 [P] `src/server/repositories/event-repository.ts` gains
  `appendCancellation(client, { cardId, columnId })` and
  `appendRestoration(client, { cardId, columnId })`, mirroring
  `appendArchival`'s exact shape (`from_column_id = to_column_id`, `actor =
  'user'` for both — a cancellation and a restoration are always something
  the person at the keyboard did, never sync).
- [X] T705 [P] Extend `src/server/repositories/settings-repository.ts`:
  `jira.cancellation_status` joins the `KEYS` map; `Settings` gains
  `cancellationStatus: string | null`, read as `null` when absent (FR-635)
  — no UI or tracker validation yet, that is US5.
- [X] T706 [P] `src/domain/status-mapping.ts`'s `BACKLOG` constant is
  already exported — confirm it, since restore's retired-column fallback
  (US4) will import it rather than hardcode `1` a second time.

**Checkpoint**: schema exists, the setting is readable, the event kinds
exist. No route yet does anything with any of it.

---

## Phase 3: User Story 1 — I can cancel work that is not going to happen (Priority: P1) 🎯 MVP

**Goal**: A card can be cancelled from any column, with a required reason
and confirmation, entirely locally — no Jira involvement in this story.

**Independent Test**: Cancel a card from each column and confirm it leaves
the board, is retained with its reason, and appears in the movement
history attributed to the user.

### Tests for User Story 1 — write first, confirm they FAIL

- [ ] T707 [P] [US1] `tests/features/cancelling.feature` + steps — a card
  is cancelled from any column and leaves the board (BH-601); declining the
  confirmation changes nothing (BH-602); the reason is kept and shown later
  (BH-603); the card is retained, not deleted (BH-604); the cancellation
  appears in the movement history, attributed to the user (BH-606);
  cancelling is distinct from deleting — one cancelled and one deleted card
  both exist, only one is retrievable (BH-607); a conflicted card refuses
  cancellation, naming the conflict (BH-608); cancelling an already-
  cancelled card has no further effect (BH-609, the local half — FR-610).
- [ ] T708 [P] [US1] `tests/e2e/cancel-card.spec.ts` — cancelling is
  reachable and completable by keyboard alone, and the outcome (card gone
  from the board) is conveyed by more than colour (BH-605).

### Implementation for User Story 1

- [ ] T709 [US1] `src/server/repositories/card-repository.ts` — a
  `cancel(id, { reason, now })` method: refuses (returns a sentinel) if
  already cancelled or archived; otherwise sets `cancelled_at = now`,
  `cancellation_reason = reason`, `cancelled_from_column_id = <current
  column_id>`, `archived_at = now` in one statement. Read methods
  (`findById`, board query) already exclude `archived_at IS NOT NULL` —
  confirmed, not re-implemented (R-1).
- [ ] T710 [US1] `src/server/services/card-service.ts` — `cancel(id,
  reason)`: throws `cardConflicted()` if `conflicts.hasOpen(id)` (the exact
  guard `move()` already makes, FR-609); validates `reason` is non-empty
  after trimming; calls the repository's `cancel`, appends the
  `'cancelled'` event via `EventRepository.appendCancellation` in the same
  transaction; returns `{ card }` with no `jira` key yet (US2 adds it).
  Calling `cancel` on an already-cancelled card is a no-op that still
  returns 200 with the current card (FR-610).
- [ ] T711 [US1] `src/server/routes/cards.ts` — `POST
  /api/cards/:id/cancel`, body `{ reason: string }` validated non-empty via
  zod, 422 `VALIDATION_FAILED` otherwise; registered in `app.ts`.
- [ ] T712 [P] [US1] `src/web/cards/CardDialog.tsx` — a `Cancel` action
  beside `Delete`, mirroring its two-step confirm exactly
  (`confirmingDelete`'s sibling state) but with a required reason textarea
  before the confirm step, keyboard-reachable throughout.

**Checkpoint**: a card can be cancelled and retained, locally, from the UI
and the API. **Run the Story-Complete Review Gate.**

---

## Phase 4: User Story 2 — The cancellation reaches Jira (Priority: P1)

**Goal**: Cancelling an imported card best-effort transitions its issue to
the configured cancellation status, and the user is told what happened in
every case — success, refused, unreachable, not configured, integration
off — without the local cancellation ever depending on the outcome.

**Independent Test**: Cancel an imported card with a cancellation status
configured; confirm the issue moved to exactly that status with no other
field touched. Cancel again under each failure condition; confirm the card
is cancelled locally regardless.

### Tests for User Story 2 — write first, confirm they FAIL

- [ ] T713 [P] [US2] `tests/features/cancelling-jira.feature` + steps,
  patterned directly on `push-refusals.feature`'s fixtures — the issue
  moves to the configured status (BH-610); no configured status still
  cancels locally and reports nothing was sent (BH-612, FR-613); a workflow
  that refuses the transition still cancels locally and reports the cause
  (BH-613, FR-614); an unreachable tracker still cancels locally and
  reports the failure (BH-614, FR-615); a card the user created locally
  contacts nothing (BH-615, FR-616); Jira integration toggled off still
  cancels locally and contacts nothing (BH-634, FR-640).
- [ ] T714 [P] [US2] `tests/unit/no-jira-writes.test.ts` — extend: confirm
  cancellation's Jira call is `TransitionService.moveTo`, the same single
  entry point `move()` already uses, so the existing structural guard (only
  `transitionIssue` ever POSTs, nothing else touches a field but status)
  already covers it (BH-611) — a regression here would mean a *second*
  Jira-writing call site had been added, which this test exists to catch.

### Implementation for User Story 2

- [ ] T715 [US2] Extend `src/server/services/card-service.ts`'s `cancel`:
  after the local write succeeds (R-4 — never before, never conditional on
  it), if the card is Jira-linked, Jira is enabled, and a cancellation
  status is configured, call `this.jira.transitions.moveTo(issueKey,
  cancellationStatus, currentStatus)`; catch every outcome (success,
  `DomainError` from a refusal, unreachable) into a `jira: { attempted,
  transitioned, toStatus?, message }` result per contracts/api.md's table.
  Absent entirely for a local card (FR-616). On a successful transition,
  record the new status via `links.recordStatus` exactly as `move()` does.
- [ ] T716 [US2] `src/server/routes/cards.ts` — the cancel route returns
  the `jira` key from the service unchanged.

**Checkpoint**: cancelling an imported card best-effort reaches Jira, and
every failure mode is reported rather than silently swallowed or allowed to
block the local action. **Run the Story-Complete Review Gate.**

---

## Phase 5: User Story 3 — Cancelled work does not read as failure (Priority: P2)

**Goal**: A cancelled card's points report as scope withdrawn — leaving the
outstanding total, absent from completed work, never moving the
commitment — reported separately from added scope, dated the day of
cancellation.

**Independent Test**: Cancel a pointed card committed to an iteration;
confirm its points appear as scope withdrawn, leave the outstanding total,
and are absent from completed work.

### Tests for User Story 3 — write first, confirm they FAIL

- [ ] T717 [P] [US3] `tests/unit/iteration-report.test.ts` — extend: a
  committed card's points report as `withdrawn`, dated the day it was
  cancelled (BH-616); a cancelled card is absent from `completed` (BH-618);
  the commitment figure is unchanged by a cancellation (BH-619); withdrawn
  and added scope stay in separate figures within the same report
  (BH-620); an unpointed cancelled card contributes no points and is
  counted in `excludedUnpointed` (BH-621); a card cancelled without ever
  being committed (entered a working column after `committed_at`, or
  never) reports no withdrawal (BH-623); a card with time accrued still
  reports that time after cancellation (BH-622, via `elapsed-time.ts`
  unaffected by `cancelled_at`).
- [ ] T718 [P] [US3] `tests/unit/burndown.test.ts` — extend: the day a
  committed card is cancelled shows `withdrawnThatDay` equal to its points,
  and `outstanding` falls by exactly that amount (BH-617).
- [ ] T719 [P] [US3] `tests/contract/iteration-report.test.ts` — extend:
  `points.withdrawn` present (and `0`, not omitted, when nothing was
  cancelled) via a real cancel against a real DB fixture.
- [ ] T720 [P] [US3] `tests/contract/burndown.test.ts` — extend:
  `withdrawnThatDay` present per point, same fixture shape.

### Implementation for User Story 3

- [ ] T721 [US3] Extend `src/domain/iteration-report.ts`: a card whose
  `cancelledAt` falls within `[startsOn, endsOnExclusive)` contributes its
  points to a new `withdrawn` accumulator when its `firstWorkingEntry`
  precedes `committedAt` (was part of the original commitment); otherwise
  contributes nothing (FR-625). This check runs before the existing
  `scopeAdded`/`scopeRemoved` branches for that card (a card cannot be both
  cancelled and mid-iteration-scope-added in the same report). Unpointed
  cancelled cards still count toward `touchesIteration` and
  `excludedUnpointed`.
- [ ] T722 [US3] Extend `src/domain/burndown.ts`: the mirror of T721,
  bucketing `withdrawn` points by the local calendar day of `cancelledAt`,
  netted into `outstanding` alongside the three existing figures.
- [ ] T723 [US3] `src/server/repositories/report-repository.ts`'s
  `allCards()` — extend the card-row `SELECT` to include `cancelled_at`,
  and thread it through to `ReportInputCard.cancelledAt` in
  `report-service.ts`'s two call sites (`iterationReport`, `burndown`).
- [ ] T724 [P] [US3] `src/web/reports/ReportDialog.tsx` — extend the
  points section with a "Withdrawn" row alongside committed/completed/scope
  change, present whenever non-zero.

**Checkpoint**: a cancelled card's points read as withdrawn scope, not as
missed work, in every report this slice touches. **Run the Story-Complete
Review Gate.**

---

## Phase 6: User Story 4 — I can find a cancelled story, and undo it (Priority: P2)

**Goal**: Cancelled cards are distinguishable from completed ones in the
archive, carry their reason, and can be restored to the column they left —
reversing the withdrawal, never touching Jira, and surfacing it if Jira
still disagrees.

**Independent Test**: Cancel a card, find it among retained work marked
cancelled with its reason, and restore it to the board.

### Tests for User Story 4 — write first, confirm they FAIL

- [ ] T725 [P] [US4] `tests/features/restoring.feature` + steps — cancelled
  and completed cards retained together are distinguishable without
  opening them (BH-624); the reason is shown when a cancelled card is
  viewed (already partly covered by T707/BH-603 — extend for the archive
  view specifically); a restored card returns to its original column
  (BH-625); a restored card whose original column has since been retired
  returns to Backlog instead (BH-626); restoring reverses the withdrawal
  when the iteration report is re-read (BH-627); restoring writes nothing
  to Jira and, when the issue still carries the cancellation status, the
  card displays the disagreement (BH-628).
- [ ] T726 [P] [US4] `tests/contract/board-payload.test.ts` — extend:
  `cancellationDivergesFromJira` present on the card payload, `true` only
  for a restored, Jira-sourced, active card whose `jira_links.status_name`
  equals the configured cancellation status.

### Implementation for User Story 4

- [ ] T727 [US4] `src/server/repositories/card-repository.ts` — a
  `restore(id, { now })` method: refuses if `cancelled_at IS NULL`;
  resolves the target column via `columnState(cancelled_from_column_id)`
  (retired or absent → `BACKLOG`, per T706); clears `cancelled_at`,
  `cancellation_reason`, `cancelled_from_column_id`, `archived_at`; sets
  `column_id` to the target. Also extend `toCard`/the board-row projection
  with `cancellationDivergesFromJira` (R-5): `true` only when
  `source = 'jira'`, the card is active (not archived), and
  `jira_links.status_name` equals the configured `cancellationStatus`.
- [ ] T728 [US4] `src/server/services/card-service.ts` — `restore(id)`:
  throws `validationFailed(...)` if the card is not cancelled; calls the
  repository's `restore`, appends the `'restored'` event via
  `EventRepository.appendRestoration` in the same transaction. No Jira
  call of any kind (FR-632).
- [ ] T729 [US4] `src/server/routes/cards.ts` — `POST
  /api/cards/:id/restore`, no body; registered in `app.ts`.
- [ ] T730 [US4] `src/server/repositories/archive-repository.ts`'s
  `archiveByRange` — extend the `SELECT` to include `cancelled_at IS NOT
  NULL AS cancelled` and `cancellation_reason`, mapped into
  `ArchivedCard.cancelled`/`cancellationReason`.
- [ ] T731 [P] [US4] `src/web/archive/` — a cancelled badge distinct from
  a completed one, the reason shown, and a Restore action, keyboard-
  reachable, on each cancelled entry.
- [ ] T732 [P] [US4] `src/web/board/CardView.tsx` — a
  `cancellationDivergesFromJira` badge, mirroring
  `badge--blocked-diverges`'s exact treatment (dashed, not styled as an
  error) for a restored card Jira still reports as cancelled.

**Checkpoint**: cancelling is now safe to reach for — a mistake is
recoverable in the same number of interactions the spec bounds (SC-08).
**Run the Story-Complete Review Gate.**

---

## Phase 7: User Story 5 — I choose what cancelled means in my Jira (Priority: P3)

**Goal**: The cancellation status is chosen from the tracker's own
statuses, not typed, and the choice survives a restart.

**Independent Test**: Choose a cancellation status from those the tracker
reports; confirm it survives a restart.

### Tests for User Story 5 — write first, confirm they FAIL

- [ ] T733 [P] [US5] `tests/contract/settings-api.test.ts` — extend:
  `PUT /api/settings` accepts `cancellationStatus`, validated against
  `GET /api/jira/statuses` the same way a mapping's status name already is
  (BH-629); rejects a status the tracker does not report; `null` is
  accepted and is the default, supported state (BH-630); the choice
  persists across a fresh `SettingsRepository.read()` — the same proof of
  "survives a restart" `iteration.anchor_date` already gives (BH-631); the
  settings payload never contains a token, password or secret field
  (BH-632 — a structural assertion over `Object.keys(Settings)`, mirroring
  how `credential-redaction.test.ts` already proves this for the rest of
  `Settings`).

### Implementation for User Story 5

- [ ] T734 [US5] `src/server/routes/settings.ts` — `updateSchema` gains
  `cancellationStatus: z.string().trim().min(1).max(120).nullable().
  optional()`; when Jira is configured and a non-null value is sent,
  validate it against `jira.listStatuses()` exactly as
  `PUT /api/settings/mappings` already does, 422 `VALIDATION_FAILED`
  otherwise; unvalidated when Jira is not configured (same existing
  exception the mapping route already carries).
- [ ] T735 [P] [US5] `src/web/settings/SettingsDialog.tsx` — a
  cancellation-status dropdown fed by the existing `GET /api/jira/statuses`
  fetch already used for the mapping editor, with an explicit "none" option
  representing the unconfigured state.

**Checkpoint**: choosing a cancellation status is as safe from typos as
choosing a column mapping already is. **Run the Story-Complete Review
Gate.**

---

## Phase 8: Polish & Cross-Cutting

- [ ] T736 [P] `tests/e2e/cancel-card.spec.ts` — extend: cancelling never
  blocks board interaction, including while a slow/failing tracker is
  being contacted (BH-633, FR-638) — assert the dialog closes and the
  board is interactive before any Jira-dependent state resolves.
- [ ] T737 [P] `tests/e2e/restoring.spec.ts` — restoring is reachable and
  completable by keyboard alone (SC-10), from the archive view.
- [ ] T738 Run `quickstart.md` end to end against a running stack; record
  any deviation.
- [ ] T739 Duplicate-code review across the cancel/restore paths in
  `card-repository.ts`, `card-service.ts`, `iteration-report.ts` and
  `burndown.ts` before marking the slice complete (constitution,
  Development Workflow & Quality Gates) — in particular, confirm the
  withdrawn-scope derivation in T721/T722 does not re-implement
  `firstWorkingEntry`/`lastMovement` rather than importing them from
  `elapsed-time.ts` (the exact duplication slice 6's own polish pass
  found and fixed).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — BLOCKS every user story
- **US1 (Phase 3)**: depends on Foundational only
- **US2 (Phase 4)**: depends on US1 — extends its one call site
- **US3 (Phase 5)**: depends on Foundational only (cancellation existing
  via US1 is enough; US2's Jira half is irrelevant to reporting)
- **US4 (Phase 6)**: depends on US1 (something to restore) and US3 (what
  restoring must reverse)
- **US5 (Phase 7)**: depends on Foundational only (T705 already makes the
  setting readable) — independent of every other story, built last as the
  spec frames it
- **Polish (Phase 8)**: depends on every story above

### Within Each User Story

- Tests are written and MUST fail before the implementation tasks that
  follow them.
- Repository → service → route → web, in that order within a phase.

## Parallel Example: User Story 1

```bash
# Once Foundational (Phase 2) is complete, these two run together:
Task: "tests/features/cancelling.feature — T707"
Task: "tests/e2e/cancel-card.spec.ts — T708"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational)
2. Complete Phase 3 (US1 — cancel, locally)
3. **STOP and VALIDATE**: cancel a real card from the running board and
   confirm it leaves the board and is retained
4. Everything else is additive on top of this MVP

### Incremental Delivery

Setup + Foundational → US1 (cancel, local) → US2 (reaches Jira) → US3
(reports as withdrawn) → US4 (find and restore) → US5 (choose the status
well) → Polish. Each checkpoint is independently demoable; nothing later
breaks an earlier story.
