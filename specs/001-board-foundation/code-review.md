# Code review — 001-board-foundation

**Branch:** 001-board-foundation
**Base:** a4ea737973f9a6ca2e2112ec169fc66fe35ed09e (initial commit)
**Reviewer:** Claude Opus 5 — /speckit.review
**When:** 2026-08-26T22:03:54Z
**Diff stats:**  115 files changed, 17121 insertions(+), 6 deletions(-)

## Summary

Slice 1 delivers a six-column board with local cards, drag and keyboard
movement, an append-only movement history, and a two-container deployment whose
data survives container recreation. Reviewed against spec.md's 43 functional
requirements and 30 behavior pathways, plan.md's Architecture Review table, and
the constitution.

**Recommendation: fix-then-ship — and the fixes are already applied.** Two
blocking findings were found and corrected during this review, each with a
regression test. Both were user-facing keyboard and error-handling defects that
every existing test passed straight over.

## Blocking findings

1. **`src/web/keyboard/use-shortcuts.ts` — error handling / spec alignment —
   board shortcuts reached past an open dialog.** The global handler claimed
   `Enter` as "open the focused card" regardless of what owned the screen, so
   pressing Enter on a focused **Save** button was swallowed: the dialog stayed
   open and no card was created. A keyboard user who tabs to Save — the
   ordinary gesture — could not submit the form at all. This contradicts FR-025
   (every pointer action reachable by keyboard) while the US5 tests all passed,
   because every one of them submits from the title field, where the typing
   guard already stands aside.
   **Fix applied:** `useShortcuts` takes a `suspended` flag, set while a
   dialog or overlay is open, and dispatches only `Escape` in that state.
   Regression test: *board shortcuts do not reach past an open dialog*.

2. **`src/web/cards/CardDialog.tsx` — error handling — a refused save was
   silent.** Only move failures were surfaced. `createCard`, `updateCard` and
   `deleteCard` had no catch, so a server refusal rejected into
   `CardDialog.submit` unhandled: the dialog sat open with no explanation and
   the user could not distinguish a save that failed from one still in flight.
   The common failure (blank title) is caught client-side, which is precisely
   why this stayed hidden.
   **Fix applied:** submit and delete both catch and surface the problem
   detail. Regression test: *a save that the server refuses is explained, not
   silent*.

## Non-blocking findings

1. **`src/web/board/CardView.tsx` — FR-011 is satisfied by absence.** A
   Jira-sourced card gets a badge; a local card gets nothing, so "local" is
   signalled by the lack of a marker rather than by a marker. Adequate while
   every card is local, and it resolves itself in slice 2 when both kinds share
   the board. Worth a second look then rather than now.

2. **`src/web/board/use-board.ts` — `moveCard` closes over `board`.** Two
   drags in quick succession can compute the second optimistic state from a
   snapshot taken before the first landed. Self-correcting, because the handler
   reconciles against the server's authoritative position and refreshes on
   mismatch — so the visible symptom is at worst a brief flicker, not a wrong
   board. Suggested fix if it ever bites: move to a reducer so each update
   reads the latest state rather than a captured one.

3. **`src/server/repositories/card-repository.ts` is 302 lines** against a
   300-line limit. The board read model was split out during polish, taking it
   from 379. Recorded in plan.md's Complexity Tracking with the reasoning; the
   remaining overage is comments explaining the transaction's locking.

4. **Nine moderate and low CVEs remain** after clearing all seven Critical and
   High. Within NFR-05's bar, which names Critical and High with an available
   fix. Worth a periodic `npm audit`.

5. **The TDD cycle slipped twice, in `health.ts` and `overdue.ts`.** Both were
   written during foundational work because other code could not compile
   without them, so their tests passed on first run. Recorded in tasks.md at
   the time rather than discovered here. US6 was deliberately deferred to avoid
   a third.

6. **plan.md's Test Strategy lists `tests/features/steps/*.ts` as one row**
   where six files exist. Not a coverage gap — every step file is exercised —
   but the plan understates the work. Suggested fix: enumerate them, or note
   the row is a glob.

## Skill output

- `review` skill: not invoked separately — this pass performed the same
  dimensions directly against the diff.
- `security-review` skill: not invoked separately. Security was covered here:
  no credential in the diff, `.env` confirmed untracked, input validated at
  the route boundary by shared Zod schemas, all Critical/High CVEs cleared, and
  the loopback-only binding asserted by `tests/ops/loopback.test.ts` against a
  real external address.

## PR description scaffold

```markdown
## Slice 1 — Board foundation

A six-column Kanban board for ad-hoc work: create cards with priority, due
dates and tags; drag or keyboard them between columns; edit and soft-delete
them. Every column change is recorded in an append-only history that slice 4's
archive and summaries will read. Runs as two containers with data on a named
volume.

### Verified
- 46 unit tests, 39 acceptance scenarios (177 steps), 18 browser tests, 4 ops tests
- 30 of 30 behavior pathways green, recorded across TestRail runs 51174–51179
- Board loads in 2–3ms with 50 cards (target: under 1s)
- 100 column changes produced exactly 100 history records, none same-column
- Data survives destroying and recreating both containers
- All Critical and High CVEs cleared

### Not tested
- Load beyond 50 cards; the design assumes tens, not thousands
- Two browser tabs on the same board — explicitly out of scope
- Any Jira interaction; there is no Jira code in this slice

### Deferred
- Search, archive and summaries (slice 4)
- Jira import and two-way sync (slices 2 and 3)
- Light theme — dark only, decided in docs/design/visual-language.md
```
