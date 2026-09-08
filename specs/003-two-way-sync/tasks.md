---
description: "Task list for Two-Way Sync (slice 3)"
---

# Tasks: Two-Way Sync

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)
**Pre-implementation gate**: `/speckit.analyze` before `/speckit.implement`.
**Risk tier**: FULL — and this is the first slice that writes to a system other people can see.

**Tests are MANDATORY.** 26 behavior pathways, 26 verification rows, 13 test
files in the plan. Every test task precedes the implementation it covers.

## Phase ordering note

**US5 (the mapping) is built first, though it is P2.** Every other story
consults it: a push needs to know which status a column means, an adopt needs
the reverse, and a conflict is defined in terms of both. Building it later
would mean writing five stories against a constant and then replacing it.

Refusals (US7) come immediately after the push, not at the end. Against the
user's real workflows most moves have *no* legal transition — PROJ-11 offers
only two — so the refusal path is ordinary operation here, not an edge case to
tidy up later.

---

> **Live verification target**: PROJ-44, a scratch issue created for this
> purpose. It is the only issue any live check may touch (T353).

## Phase 1: Foundational

- [x] T301 [P] `src/server/db/migrations/009_column_status_mappings.sql` — per data-model.md, seeded with a default mapping onto the statuses this Jira actually exposes (Open, Development, Test, PO Approve, Blocked).
- [x] T302 [P] `src/server/db/migrations/010_conflicts.sql` — with the partial unique index on `card_id WHERE resolved_at IS NULL`, so "one open conflict per card" is enforced rather than remembered.
- [x] T303 [P] Extend `src/shared/types.ts` with `hasConflict`, `Conflict`, `ColumnMapping`, and the four new problem codes.
- [x] T304 [P] Extend `src/server/errors.ts` with `NO_LEGAL_TRANSITION`, `STALE_MAPPING`, `TRANSITION_NEEDS_FIELDS`, `CARD_CONFLICTED`.
- [x] T305 Extend `JiraPort` with `getTransitions` and `transitionIssue`; extend the fake to stage legal transitions and each refusal, keeping Jira substitutable so no test in the standard suite reaches a live instance (FR-237).

**Checkpoint**: the schema and the port can express a write.

---

## Phase 2: US5 — I decide which column means which Jira status (P2, built first)

- [x] T307 [P] [US5] `tests/unit/mapping.test.ts` — lookup both directions, unmapped columns, two columns sharing a status resolving by board order (BH-224).
- [x] T308 [P] [US5] `tests/features/mapping-settings.feature` — set, remove, persist across restart (BH-223).
- [x] T309 [P] [US5] `tests/e2e/mapping.spec.ts` — mapping chosen from Jira's own statuses, not typed.
- [x] T310 [US5] `src/domain/column-mapping.ts` — pure lookup both ways, first-in-board-order for a shared status (FR-201, FR-205).
- [x] T311 [US5] `src/server/repositories/mapping-repository.ts` — mappings persist across restarts (FR-203).
- [x] T312 [US5] `GET|PUT /api/settings/mappings`, and `GET /api/jira/statuses` so the mapping is chosen from what Jira reports rather than typed (FR-202). Removing a mapping returns the column to local-only (FR-204).
- [x] T313 [US5] Mapping editor in the settings dialog, choosing from Jira's statuses rather than free text.

**Checkpoint**: columns mean something in Jira terms. **Story-Complete Review Gate.**

---

## Phase 3: US1 — Moving a card updates Jira (P1)

- [x] T315 [P] [US1] `tests/unit/reconcile.test.ts` — the full decision table, every combination of the three inputs (BH-209, BH-211, SC-203).
- [x] T316 [P] [US1] `tests/unit/no-unbounded-writes.test.ts` — the adapter writes only transitions, touches no other endpoint and no other field (BH-204).
- [x] T317 [P] [US1] `tests/contract/jira-transitions.test.ts` — `getTransitions` and `transitionIssue` against recorded fixtures, **including the real case where a transition's name differs from its destination** (BH-201).
- [x] T318 [P] [US1] `tests/features/push-transitions.feature` — a move transitions the issue; ad-hoc cards write nothing (BH-201, BH-203, BH-204).
- [x] T319 [US1] `src/domain/reconcile.ts` — pure. Four outcomes from three inputs, nothing else consulted (FR-216, FR-217): unchanged on both sides is a no-op (FR-220), a local-only change is pushed (FR-219), and no path may leave the two sides silently disagreeing (FR-236).
- [x] T320 [US1] Extend `jira-adapter.ts` with `getTransitions` and `transitionIssue`. **Match on `transition.to.name`, never on `transition.name`** — verified against real workflows where `Pass → PO Approve`. The transition body carries only the transition id, so no field other than status is ever modified (FR-209). Writes are not retried (research.md).
- [x] T321 [US1] `src/server/sync/transition-service.ts` — board move to Jira transition, updating the recorded last-known state on success (FR-206, FR-210).
- [x] T322 [US1] Wire the move route: mapped column pushes, unmapped and ad-hoc do not (FR-206…FR-208).

**Checkpoint**: the board drives Jira. **Story-Complete Review Gate.**

---

## Phase 4: US7 — Refused transitions fail loudly and safely (P2, built early)

- [x] T324 [P] [US7] `tests/features/push-refusals.feature` — illegal transition, stale mapping, unreachable Jira, transition needing fields; each reverts the card and names its own cause, and none writes a movement record (BH-205…BH-208, FR-215).
- [x] T325 [US7] Four typed refusals in `transition-service.ts`, each mapped to its own problem code: no legal transition (FR-211), a mapped status absent from the workflow (FR-212), Jira unreachable (FR-213), and a transition needing fields the board does not hold (FR-214).
- [x] T326 [US7] The interface reverts the optimistic move and states which of the four causes applied (FR-020 carried forward).

**Checkpoint**: a refused move is never mistaken for a successful one. **Story-Complete Review Gate.**

---

## Phase 5: US6 — Columns I have not mapped stay mine (P2)

- [x] T328 [P] [US6] `tests/features/unmapped-columns.feature` — moving a Jira card into an unmapped column changes the board and not Jira; an inbound status no column maps to leaves the card alone (BH-202, BH-212).
- [x] T329 [US6] Unmapped columns are local-only on both directions (FR-207, FR-221).

**Checkpoint**: Blocked is the user's, not Jira's. **Story-Complete Review Gate.**

---

## Phase 6: US2 — Changes made in Jira reach my board (P1)

- [x] T331 [P] [US2] `tests/features/adopt-remote.feature` — a remote-only change moves the card and is attributed to sync (BH-210, FR-218, FR-222).
- [x] T332 [US2] Apply the reconciler's `ApplyRemote` outcome in the sync service.

**Checkpoint**: sync is genuinely two-way. **Story-Complete Review Gate.**

---

## Phase 7: US3 — Disagreements are surfaced, never guessed (P1)

- [x] T334 [P] [US3] `tests/features/conflicts.feature` — raised on divergence, not on convergence; the card does not move and nothing is sent to Jira; twenty syncs leave it alone; a second detection updates rather than duplicates; a vanished issue closes it as moot (BH-213, BH-214, BH-215, BH-221, BH-222).
- [x] T335 [P] [US3] `tests/e2e/conflict.spec.ts` — the badge is visible on the card face without opening it (BH-213).
- [x] T336 [US3] `src/server/repositories/conflict-repository.ts` — raise, update in place, resolve, list.
- [x] T337 [US3] Apply the reconciler's `Conflict` outcome (FR-223). Convergent changes raise nothing and simply bring the last-known state up to date (FR-224); raising a conflict neither moves the card nor sends anything to Jira (FR-225); a conflicted card is skipped by every later sync (FR-227), updated rather than duplicated on a second detection (FR-234), and closed as moot if its issue leaves the query (FR-235).
- [x] T338 [US3] Conflict badge on the card face without opening it (FR-226), derived from the conflicts table rather than stored on the card, so there is no second source of truth to drift.

**Checkpoint**: nothing diverges silently. **Story-Complete Review Gate.**

---

## Phase 8: US4 — I resolve a conflict by choosing a side (P1)

- [x] T340 [P] [US4] `tests/features/conflict-resolution.feature` — both resolutions, each recorded; a failed `kept_board` leaves the conflict open (BH-217…BH-220).
- [x] T341 [P] [US4] Extend `tests/e2e/conflict.spec.ts` — side-by-side view, two buttons, dragging a conflicted card refused (BH-216, BH-217, BH-218).
- [x] T342 [US4] `POST /api/conflicts/:id/resolve` with exactly two outcomes (FR-229, FR-230). A successful resolution clears the conflict and brings the recorded last-known state up to date (FR-231); a refused one leaves it open (FR-233).
- [x] T343 [US4] A conflicted card refuses a user move and directs to resolution (FR-228).
- [x] T344 [US4] Resolution is recorded in the movement history with the side chosen (FR-232).
- [x] T345 [US4] The resolution dialog: board state and Jira state side by side, two buttons, nothing else.

**Checkpoint**: a conflict is always clearable. **Story-Complete Review Gate.**

---

## Phase 9: Polish

- [x] T346 Update `docs/external-interactions.md` with the write direction: which transitions are attempted, the four refusal causes, and that writes are never retried.
- [x] T347 Update `README.md`: what dragging a Jira card now does, and what a conflict means.
- [x] T348 Verify plan.md's diagrams against the as-built system.
- [x] T349 Verify all 13 test files exist and pass.
- [x] T350 Verify SC-201…SC-209, including SC-203's full input matrix and SC-207's zero non-status writes.
- [x] T351 Code cleanup; no file over 300 lines without recorded justification.
- [x] T352 Security check: no credential in the diff; audit clean at Critical/High.
- [x] T353 **Live verification against real Jira — requires explicit agreement first.** This is the only task in the project that changes data other people can see. Not to be run as part of any suite.
- [x] T354 Run `/speckit.review`; address blocking findings.
- [x] T355 Request peer review.
  **Reviewed by the author, 2026-08-27.**

---

## Dependencies

**Foundational → US5 → US1 → US7 → US6 → US2 → US3 → US4 → Polish.**

- US5 first: every other story consults the mapping.
- US7 immediately after US1: refusal is the common path against real workflows, not an afterthought.
- US3 before US4: a conflict must exist before it can be resolved.
- T319 (reconciler) before T332, T337 — both apply its outcomes.

## Per-Task Cleanup (MANDATORY)

As slices 1 and 2, plus one specific to this slice:

**Did this task make it possible to write something to Jira that the user did
not explicitly ask for?** Every write must trace to a drag or a resolution.
Nothing else may transition an issue.

## Story-Complete Review Gate (MANDATORY)

As before, plus:

- **Could a card end up moved on the board with Jira unchanged, or the
  reverse, without a conflict or a reported failure?** That silent divergence
  is the failure this product exists to prevent.
- **Is every write traceable to a user action?**
