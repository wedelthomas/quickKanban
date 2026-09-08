# Phase 0 Research: Time, Points and Iteration Reporting

No `[NEEDS CLARIFICATION]` markers remain in `spec.md` — its own Clarifications
session (2026-08-26) already resolved every open question. This file records
the technical decisions the plan is built on, each with the alternative it
rejected.

## R-1: Elapsed time is computed from movement events, not stored

**Decision**: A pure function, `computeElapsedWorkingTime` in
`src/domain/elapsed-time.ts`, takes a card's ordered `card_events` rows
(`toColumnId`, `occurredAt`), its blocked-interval log (new — see R-3), the
working-days/hours configuration, and `now`, and returns working seconds
elapsed per iteration the time falls within. It is exercised entirely by unit
tests (BH-533/FR-544) with no database.

**Algorithm sketch**: walk the movement events in order, treating entry into
`in_progress`, `test` or `po_review` as "the clock is running" and entry into
`done` or `backlog` (or reaching `now` while still in a counted column) as
"the clock stops here." Each running interval is intersected with the
working-hours calendar (reusing `working-days.ts`'s local-midnight and
`workingDays` conventions) and has any overlapping blocked sub-interval
subtracted once (FR-506). The result is a list of `{ intervalStart,
intervalEnd, seconds }` triples, which the caller clips to each iteration's
`[starts_on, ends_on)` span to apportion time across a boundary (FR-512).

**Alternatives considered**: Storing a running per-card elapsed-seconds
counter, updated on every move. Rejected — Principle IV requires figures to
be recomputable from the movement history so a corrected working-hours
setting corrects history (FR-509); a stored counter computed under the old
configuration cannot self-correct without replaying events anyway, so the
replay has to exist regardless and a cache on top of it is complexity with no
payoff at this board's scale (tens of cards).

## R-2: Reports are computed on read, not precomputed on write

**Decision**: Time, points, commitment, scope and burndown figures are all
derived at request time from `card_events`, `cards.points`, and the
commitment snapshot (R-4) — no daily snapshot table, no cached report row.

**Rationale**: FR-546 requires reports not to block board load or
interaction, which is the constraint that justified precomputing
`carried_iterations` in slice 5 (that value *is* on the board's load path).
A report is a separate, on-demand read — Principle I (Simplicity First)
weighs against adding storage and a write-time maintenance burden for a
value only computed when asked for, on a board with tens of cards where a
full replay costs milliseconds.

**Alternatives considered**: A nightly or boundary-triggered report cache.
Rejected as premature — nothing in the spec asks for a report faster than an
on-demand replay can already provide (SC-508 only requires *board load*
stays under a second, unaffected either way).

## R-3: Blocked intervals are tracked from this feature forward only

**Decision**: A new append-only table, `card_blocked_events` (see
data-model.md), gains one row every time `cards.blocked` changes, written
from the same `CardService.update` path that already writes it. Time
derivation subtracts only intervals this table can prove.

**Rationale**: This is exactly what spec.md's own Assumptions section
requires (FR-548, BH-536) — `blocked` has always been current-only state, so
no interval can be reconstructed before this table exists, and a card whose
blocked history predates it reports its time as an upper bound rather than a
fabricated exact figure.

**Alternatives considered**: Inferring historical blocked intervals from
existing data. None exists to infer from — ruled out by the spec, not by
this plan.

## R-4: Commitment is snapshotted once, at first observation of a new iteration

**Decision**: A new table, `iteration_commitments`, gains one row the first
time `IterationService.current()` observes an iteration name it has not
recorded before — mirroring `CarryOverService`'s existing boundary-detection
pattern exactly (same trigger point, same "insert once, never update"
shape). A new `CommitmentService.observe(currentIteration)` runs alongside
`CarryOverService.observe(...)` in that same call.

**Rationale**: FR-525/FR-526 require the commitment to be fixed at iteration
start and never move afterward — an `INSERT ... ON CONFLICT DO NOTHING` on a
primary-keyed `ordinal_name` gives that immutability for free, the same way
`iterations` itself does.

**Alternatives considered**: A scheduled job that snapshots at the iteration
boundary date. Rejected — the boundary is only ever *observed* when the
banner is next read (this board has no scheduler that runs independent of a
request), so a time-based job would either duplicate that observation logic
or run against a board nobody has opened yet, doing pointless work.

## R-5: Scope added/removed is derived, not logged separately

**Decision**: No new table for scope changes. "Scope added" is the sum of
points on pointed cards whose `card_events` show them entering a working
column ({iteration_items, in_progress, test, po_review}) for the first time
after the iteration's `committed_at`; "scope removed" is the mirror — a card
that was part of the commitment and has since left every working column
(moved to Backlog; cancellation, when slice 7 lands, is the other case).

**Rationale**: The commitment snapshot (R-4) already fixes the baseline
number; everything after it is fully reconstructable from `card_events`,
which Principle II (the movement history is the ledger) already treats as
authoritative. A second log recording the same transitions a different way
would be two sources of truth for one fact.

## R-6: Points live on the card, alongside the value last seen from Jira

**Decision**: `cards.points` (nullable integer, user-editable, authoritative
per FR-518) and `cards.jira_points` (nullable, written only by sync,
imported value as last seen) are both added to `cards`. The card's
authoritative value is always `points`; `jira_points` exists only to render
the divergence FR-518 requires when the card is opened.

**Alternatives considered**: A single column with a "source" flag.
Rejected — FR-518 requires *both* values to be visible at once (the local
figure in use, and how it differs from Jira), so both have to be stored, the
same shape `blockedDivergesFromJira` already established for the blocked
flag in slice 5.

## R-7: The generated summary's iteration period reuses `periodBounds`

**Decision**: `SummaryPeriod` gains `'iteration'`; `periodBounds` in
`summary-service.ts` gains a case that takes the iteration's own
`starts_on`/`ends_on` (from `IterationRepository`) instead of computing a
daily/weekly window, satisfying FR-540/BH-529 without a parallel summary
code path.

**Alternatives considered**: A dedicated iteration-summary endpoint separate
from `/api/summary`. Rejected — the acceptance criteria (BH-529, BH-530)
ask only that the existing summary accept the iteration as a period and
still copy as plain text; a second endpoint would duplicate
`buildSummary`/`renderSummaryText` for no behavioral difference.
