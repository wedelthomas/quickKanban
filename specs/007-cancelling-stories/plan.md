# Implementation Plan: Cancelling Stories

**Branch**: `007-cancelling-stories` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-cancelling-stories/spec.md`

## Summary

A third ending for work, alongside finishing it and deleting it. Cancelling
takes a card off the board immediately, keeps it, records why, best-effort
transitions the linked Jira issue to a configured status, and reports its
points as scope the user withdrew rather than as work not delivered. A
cancelled card is restorable to the column it left.

The technical shape follows six decisions from Phase 0 (research.md
R-1…R-6), all in the direction of reuse rather than new machinery:
cancellation is the *same* retention path (`archived_at`) the archive
already has, distinguished by two new columns rather than a parallel
mechanism; withdrawn scope is derived on read exactly the way scope
added/removed already are, with no iteration reference stored anywhere;
the Jira transition reuses `TransitionService.moveTo` unchanged, but with
its ordering inverted from `CardService.move()` — local-first, Jira
best-effort — because a cancellation, unlike a move, must survive a Jira
failure intact; the post-restore divergence is a live comparison, the same
shape `blockedDivergesFromJira` already is; and the cancellation-status
setting is validated and offered to the user through the exact endpoints
slice 2's column mapping already established for the same reason.

## Technical Context

**Language/Version**: TypeScript 5, Node 22, ES modules throughout
(unchanged)

**Primary Dependencies**: Fastify, `pg` (no ORM), React 19 + Vite. **No new
runtime dependency is added by this slice.**

**Storage**: PostgreSQL, one additive migration — three new columns on
`cards`, two new `card_events.kind` values, one new settings key. No new
tables.

**Testing**: Vitest (unit — the withdrawn-scope derivation's permutations,
the restore-target/retired-column logic), Vitest with a real database
(contract — the two new routes, the changed report/burndown/archive/
settings routes), cucumber-js (acceptance — the Jira transition's four
outcome branches, the conflict freeze), Playwright (end-to-end — cancel and
restore by keyboard alone, screen-reader legibility).

**Target Platform**: Unchanged — two containers on the user's own machine,
loopback only.

**Project Type**: Web application — Fastify API and React front end in one
repository, sharing types through `src/shared/`.

**Performance Goals**: SC-09 — cancelling completes in under 1s as
perceived by the user, independent of whether Jira responds. Satisfied by
construction (R-4): the local write and the response return before the
Jira attempt's outcome could ever block them, since the local change is
never made conditional on it.

**Constraints**: No request to Jira may touch any field but status
(FR-612) — the constraint slices 3 and 6 already established for status
and points extends to this feature's one write by the same non-negotiable
rule, and is met by reusing `TransitionService.moveTo` unchanged rather
than composing a new request.

**Scale/Scope**: One user, at most a handful of cancellations per
iteration. Two new routes, three changed routes, one changed settings
route, one new domain-level figure threaded through two existing pure
functions.

## Constitution Check

*GATE: passed before Phase 0 research; re-checked after Phase 1 design.*

| # | Principle | Verdict | How this plan satisfies it |
|---|---|---|---|
| I | Simplicity First | PASS | Cancellation is the archive's existing retention path plus two discriminator columns (R-1) — not a parallel "cancelled" mechanism. Withdrawn scope is derived on read from data that already exists (R-3); nothing is logged a second way. |
| II | The Movement History is the Ledger | PASS | Cancelling and restoring each append exactly one `card_events` row; a card cancelled, restored and cancelled again carries the whole sequence permanently. Restoring clears *current-state* columns on `cards`, never touches a ledger row. |
| III | Jira Is Read-Mostly | PASS | The one write this feature makes reuses `TransitionService.moveTo` unchanged — the same single-field-only guarantee slice 3 built and slice 6 reused for points. No new outbound touchpoint; `docs/external-interactions.md` needs no new entry beyond noting the new caller. |
| IV | Test-First, Behavior-Traced | PASS | `spec.md` already carries 33 Behavior Pathways each pinned to a named test in its Verification table; `/speckit-tasks` assigns each a test task preceding its implementation task, per the existing per-story pattern. |
| V | Security by Default, Sized for One User | PASS | The one new setting (`jira.cancellation_status`) names a status, never a credential (FR-637) — same category as `jiraFieldBlockedOption`, which already passes this gate. No new dependency. |
| VI | Spec-Driven, Living Documentation | PASS | This plan, `research.md`, `data-model.md`, `contracts/api.md` and `quickstart.md` are that documentation, written before implementation begins. |

No deviation requires an entry in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-cancelling-stories/
├── plan.md              # This file
├── research.md           # Phase 0 — six decisions, each in the direction of reuse
├── data-model.md         # Phase 1 — one migration, no new tables
├── contracts/api.md      # Phase 1 — two new routes, four changed
├── quickstart.md         # Phase 1 — how to see each part work
├── spec.md               # Input
└── tasks.md              # Phase 2 — /speckit-tasks, not this command
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── iteration-report.ts   # CHANGED: withdrawn scope, one more derived figure (R-3)
│   └── burndown.ts           # CHANGED: withdrawnThatDay, same per-day derivation
├── server/
│   ├── db/migrations/
│   │   └── 027_cancellation.sql   # NEW — cards columns, card_events kinds, no new table
│   ├── repositories/
│   │   ├── card-repository.ts       # CHANGED: cancel/restore writes, cancellationDivergesFromJira projection
│   │   ├── event-repository.ts      # CHANGED: appendCancellation, appendRestoration
│   │   ├── archive-repository.ts    # CHANGED: archiveByRange selects cancelled/cancellationReason
│   │   └── settings-repository.ts   # CHANGED: jira.cancellation_status
│   ├── services/
│   │   └── card-service.ts          # CHANGED: cancel(id, reason), restore(id) — local-first Jira ordering (R-4)
│   └── routes/
│       ├── cards.ts                 # CHANGED: POST :id/cancel, POST :id/restore
│       ├── settings.ts              # CHANGED: cancellationStatus in PUT /api/settings, validated against jira.listStatuses()
│       └── archive.ts               # Unchanged route; payload shape changes via archive-repository.ts
└── web/
    ├── cards/CardDialog.tsx         # CHANGED: Cancel action (confirm + reason), Restore where applicable
    ├── board/CardView.tsx           # CHANGED: cancellationDivergesFromJira badge, mirroring blockedDivergesFromJira's
    ├── archive/                     # CHANGED: cancelled badge + reason, restore action
    └── settings/                    # CHANGED: cancellation-status dropdown, fed by existing GET /api/jira/statuses
```

**Structure Decision**: Web application layout, unchanged from every prior
slice — routes → services → repositories, pure functions in `domain/`
separate from all I/O. No new domain module: unlike slice 6, this feature
adds one derived figure to two *existing* pure functions rather than a new
kind of computation, so a new file would be an abstraction with one
purpose already served by extending the two that exist.

## Complexity Tracking

> No Constitution Check violation requires justification here.
