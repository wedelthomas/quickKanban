# Implementation Plan: Time, Points and Iteration Reporting

**Branch**: `006-time-points-and-reporting` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-time-points-and-reporting/spec.md`

## Summary

Read the movement history for what it always implied. Elapsed time is
derived from `card_events` and the working-hours calendar, never typed.
Story points import from Jira and stay locally editable, never written
back. A commitment snapshot, taken once at iteration start, lets completion
and scope change be reported as three distinct figures instead of one moving
target. A burndown and a set of iteration reports — including the local
versus Jira-sourced split that quantifies invisible work — sit on top, all
computed on read rather than precomputed, and the generated summary gains
the iteration as a fourth reporting period.

The technical shape follows five decisions from Phase 0 that the spec
assumed but did not mandate a mechanism for (research.md R-1…R-5): time is
computed by a pure function over movement + blocked-interval events rather
than stored as a running counter; reports are computed on read rather than
precomputed, since nothing here is on the board's own load path; blocked
intervals can only be tracked from this feature forward, matching the
spec's own stated limit; commitment is snapshotted using the exact
boundary-detection pattern `CarryOverService` already established in slice
5; and scope added/removed is derived from `card_events` rather than logged
a second way.

## Technical Context

**Language/Version**: TypeScript 5, Node 22, ES modules throughout
(unchanged)

**Primary Dependencies**: Fastify, `pg` (no ORM), React 19 + Vite. **No new
runtime dependency is added by this slice.**

**Storage**: PostgreSQL, three additive migrations (024–026) — two new
columns on `cards`, two new tables (`card_blocked_events`,
`iteration_commitments`).

**Testing**: Vitest (unit — the elapsed-time function's every permutation is
the highest-value target here), Vitest with a real database (contract — the
two new report endpoints), cucumber-js (acceptance), Playwright
(end-to-end — the reporting UI).

**Target Platform**: Unchanged — two containers on the user's own machine,
loopback only.

**Project Type**: Web application — Fastify API and React front end in one
repository, sharing types through `src/shared/`.

**Performance Goals**: Board load stays under 1s (SC-508, unaffected — no
report computation sits on that path). No numeric target for report
generation itself; nothing in the spec asks for one, and Principle I weighs
against inventing an SLA the spec never required.

**Constraints**: No card's derived time may be entered by the user or read
from an external field (FR-501). No request to Jira may write story points
(FR-517) — the constraint slice 3 established for status extends to this
new field by the same non-negotiable rule.

**Scale/Scope**: One user, tens of cards per iteration, one new pure domain
module, two new read endpoints, one changed endpoint (`PATCH
/api/cards/:id`), one extended endpoint (`GET /api/summary`).

## Constitution Check

*GATE: passed before Phase 0 research; re-checked after Phase 1 design.*

| # | Principle | Verdict | How this plan satisfies it |
|---|---|---|---|
| I | Simplicity First | PASS | Reports are computed on read, not precomputed (R-2) — no new snapshot table beyond the one FR-525 actually requires (commitment itself). Scope added/removed is derived from `card_events` rather than logged a second way (R-5). |
| II | The Movement History is the Ledger | PASS | Every derived figure (time, velocity, commitment, scope, burndown) is computed from `card_events` and `iteration_commitments`, both append-only. Nothing in this slice edits or deletes a history row. |
| III | Jira Is Read-Mostly | PASS | Story points are imported, never written (FR-517) — the same single-field discipline slice 3 established for status. No new outbound touchpoint: points arrive on the same already-registered sync read as everything else a Jira-sourced card carries, so `docs/external-interactions.md` needs no new entry. |
| IV | Test-First, Behavior-Traced | PASS | `spec.md` already carries 36 Behavior Pathways each pinned to a named test in its Verification table; `/speckit-tasks` assigns each a test task preceding its implementation task, per the existing per-story pattern. |
| V | Security by Default, Sized for One User | PASS | No new credential surface. No dependency added. |
| VI | Spec-Driven, Living Documentation | PASS | This plan, `research.md`, `data-model.md`, `contracts/api.md` and `quickstart.md` are that documentation, written before implementation begins. |

No deviation requires an entry in Complexity Tracking as a *violation* —
see that section below for one transparency note that is not one.

## Project Structure

### Documentation (this feature)

```text
specs/006-time-points-and-reporting/
├── plan.md                 # This file
├── research.md              # Phase 0 — six decisions with rejected alternatives
├── data-model.md            # Phase 1 — three migrations, two new tables
├── contracts/api.md         # Phase 1 — two new endpoints, two changed
├── quickstart.md            # Phase 1 — how to see each part work
├── spec.md                  # Input
└── tasks.md                 # Phase 2 — /speckit-tasks, not this command
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── elapsed-time.ts             # NEW — pure: working seconds per iteration from movement + blocked events (R-1)
│   ├── iteration-report.ts         # NEW — pure: assembles time/points/scope figures from repository rows
│   └── burndown.ts                 # NEW — pure: per-working-day outstanding points
├── server/
│   ├── db/migrations/
│   │   ├── 024_card_points.sql            # NEW
│   │   ├── 025_card_blocked_events.sql    # NEW
│   │   └── 026_iteration_commitments.sql  # NEW
│   ├── repositories/
│   │   ├── card-repository.ts       # CHANGED: points, jira_points on read/write
│   │   ├── event-repository.ts      # CHANGED: read blocked-interval events too, or a new sibling repository
│   │   └── commitment-repository.ts # NEW — read/insert-once for iteration_commitments
│   ├── services/
│   │   ├── card-service.ts          # CHANGED: writes card_blocked_events on a blocked-flag change
│   │   ├── carry-over-service.ts    # Unchanged, but its call site in iteration-service.ts gains a sibling
│   │   ├── commitment-service.ts    # NEW — CarryOverService's boundary-detection pattern, for commitment
│   │   └── report-service.ts        # NEW — orchestrates elapsed-time + iteration-report + burndown against real repositories
│   └── routes/
│       ├── cards.ts                 # CHANGED: PATCH accepts points
│       ├── reports.ts               # NEW — GET /api/iterations/:ordinalName/report, /burndown
│       └── summary.ts               # CHANGED: accepts period=iteration
├── domain/summary.ts, summary-text.ts   # CHANGED: iteration period case
└── web/
    ├── reports/                     # NEW — reporting UI (time/points breakdown, burndown chart)
    ├── cards/CardDialog.tsx         # CHANGED: points field, divergence display
    └── summary/SummaryDialog.tsx    # CHANGED: iteration period option
```

**Structure Decision**: Web application layout, unchanged from every prior
slice — routes → services → repositories, pure functions in `domain/` kept
separate from all I/O. Three new pure domain modules rather than one,
because time derivation, report assembly and burndown computation each have
one reason to change and are each independently unit-testable without a
database (Principle IV) or a fake board (Principle I — a merged module
would be a speculative "reporting" abstraction with three unrelated
callers).

## Complexity Tracking

> No Constitution Check violation requires justification here. One
> transparency note, not a violation:

| Note | Why it is not a violation |
|---|---|
| `cards` gains two points-related columns (`points`, `jira_points`) rather than one | FR-518 requires the local value *and* its divergence from the imported value to be visible simultaneously — this is the identical shape `blocked` / `blockedDivergesFromJira` already established in slice 5 for the one other locally-overridable, Jira-sourced field. Not a new pattern; the second column is what the requirement costs, not a speculative addition. |
