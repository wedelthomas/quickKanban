# Research — Slice 7: Cancelling Stories

Six decisions the spec requires but does not mandate a mechanism for.

## R-1: Cancellation reuses the archive's own retention mechanism

**Decision**: Cancelling sets `cards.archived_at` — the exact column
`ArchiveRepository`/`JiraCardRepository` already set for Done-window archival
and sync-driven disappearance. A cancelled card therefore leaves the board
for free: `board-repository.ts`'s query already excludes every row with
`archived_at IS NOT NULL`, and `archiveByRange` already returns every such
row to the Archive view. Two new columns distinguish *why* a card left:
`cancelled_at timestamptz` (presence is the discriminator FR-627 needs) and
`cancellation_reason text` (the user's own words, FR-603/FR-628) — a third,
`cancelled_from_column_id`, remembers where to restore it to (FR-630).

**Rationale**: `archived_at IS NOT NULL` is already "retained, off the
board, browsable" everywhere in this codebase. A second retention path
(its own timestamp, its own board-exclusion clause, its own Archive query)
would duplicate that meaning under a different name for no behavioral
difference — Principle I weighs directly against it, and BH-624 itself
describes cancelled and completed cards as "retained together," which is
this mechanism's whole job already.

**Alternatives considered**: A `cards.status` enum (`active` /
`archived` / `cancelled`) replacing the boolean-ish `archived_at`/
`deleted_at` pair. Rejected — it would touch every existing query that
currently reads `archived_at IS NULL`, for a distinction (why retained,
not whether retained) that a nullable pair of columns already expresses.

## R-2: `cancellation_reason` is a new column, not a reuse of `archived_reason`

**Decision**: `cards.archived_reason` already holds two unrelated things
depending on how a card was archived (nothing, for a Done-window pass;
"the issue no longer matches your Jira query…", for sync-driven
disappearance). Cancellation gets its own `cancellation_reason` rather than
a third meaning for the same column.

**Rationale**: FR-627 requires cancelled cards to be identifiable *without
opening them* — from a list, not from reading a sentence and guessing which
of three origins it describes. A dedicated, always-cancellation-shaped
column is what makes that a `WHERE cancelled_at IS NOT NULL` rather than a
string match against reasons this feature does not control the wording of.

## R-3: Withdrawn scope is derived on read, exactly like scope added/removed already are

**Decision**: No column or table records which iteration a cancellation's
withdrawal belongs to. `iteration-report.ts` already computes scope
added/removed per requested ordinal by checking whether a card's `card_events`
timestamps fall inside `[startsOn, endsOn)` (R-5, slice 6) — cancellation
adds one more case to the same function: a card whose `cancelled_at` falls
in the requested span, and whose working-column entry preceded the
iteration's `committed_at`, contributes its points to a new `withdrawn`
figure instead of `completed`. One that was added *after* `committed_at`
and then cancelled contributes to neither `scopeAdded` nor `withdrawn` — it
was never part of the commitment to withdraw from (FR-625), and it was
cancelled before ever landing as delivered scope.

**Rationale**: The commitment/completion/scope-added/scope-removed figures
already prove that "derived from `card_events` on every read, logged
nowhere a second time" scales to a fifth figure without a schema change.
Storing an iteration reference on the card would create a second, staler
copy of a fact `iterations.starts_on`/`ends_on` and `cancelled_at` already
imply together.

**Alternatives considered**: A `cards.cancelled_iteration_ordinal` column,
set once at cancel time. Rejected — restoring (FR-631) would then have to
also clear it, and a past iteration's report re-read after a restore would
need the exact same on-read derivation anyway to reflect that reversal
correctly. The stored column would only ever agree with the derived answer,
never usefully disagree with it.

## R-4: Jira contact is best-effort and never blocks the local cancellation

**Decision**: `CardService.move()`'s existing order — transition Jira
*first*, and only apply the local change if that succeeds — is inverted for
cancel. The local cancellation always applies; the Jira transition (via the
unchanged `TransitionService.moveTo`) is attempted afterward, its outcome
(transitioned / refused with cause / unreachable / not configured /
integration off) captured and returned to the caller, never thrown in a way
that would undo the card leaving the board.

**Rationale**: FR-613 through FR-615 and FR-640 all say the same thing four
different ways: whatever Jira does or fails to do, the local cancellation
already happened. `move()`'s "Jira first, so there is no half-applied state
to unwind" reasoning does not transfer — a refused *move* leaves the card
exactly where a person can try again; a refused *cancellation* must not
leave the user's decision undone by a network problem that has nothing to
do with whether the work is still wanted.

**Alternatives considered**: Keep `move()`'s ordering and let a Jira failure
refuse the whole cancellation. Rejected outright — it directly contradicts
FR-613/614/615/640, each pinned by its own Behavior Pathway.

## R-5: The tracker divergence after a restore is a live comparison, not a stored flag

**Decision**: `cancellationDivergesFromJira` on the card payload is computed
the same way `blockedDivergesFromJira` already is — a projection at read
time, not a column. For a Jira-sourced card currently on the board (not
archived), it is `true` when the card's `jira_links.status_name` (the last
status sync observed) equals the configured cancellation status.

**Rationale**: BH-628 only asks that the disagreement be visible while it
exists. A live comparison against `status_name` (which sync already keeps
current) resolves itself the moment sync — or another cancel or transition
— moves the issue on, with no restore-tracking flag to remember to clear.
Exactly how `blockedDivergesFromJira` already self-resolves when Jira's
side changes.

**Alternatives considered**: A `restored_at` marker, checked alongside the
status comparison. Rejected — it answers "was this restored recently",
which is not the fact BH-628 cares about; the fact is "does Jira still
disagree right now", and the status comparison alone already answers that
precisely, restore or no restore.

## R-6: The cancellation status setting mirrors the column-mapping settings exactly

**Decision**: `settings.cancellation_status` (nullable text) joins the
existing settings table; `PUT /api/settings` validates it against
`jira.listStatuses()` the same way `PUT /api/settings/mappings` already
validates a status name, and the settings UI's dropdown is fed by the
already-existing `GET /api/jira/statuses` — no new Jira-facing endpoint.

**Rationale**: FR-634 ("chosen from the statuses the tracker reports, not
typed") is the identical requirement slice 2's column mapping already
satisfies for exactly the same reason. A second status-fetching code path
would be a second way to get the same list out of sync with itself.

## Summary of net-new surface

- 1 migration: `cards` gains `cancelled_at`, `cancellation_reason`,
  `cancelled_from_column_id`; `card_events.kind` gains `'cancelled'` and
  `'restored'`; `settings` gains `jira.cancellation_status`.
- 2 new routes: `POST /api/cards/:id/cancel`, `POST /api/cards/:id/restore`.
- 1 changed route: `PUT /api/settings` accepts `cancellationStatus`.
- 1 changed route: `GET /api/archive` (via `ArchiveViewService`) surfaces
  `cancelled` and `cancellationReason` on each retained card.
- `iteration-report.ts` and `burndown.ts` each gain one more derived figure
  (`withdrawn`) using the same on-read pattern every other figure already
  uses.
- No new Jira read/write capability — `TransitionService.moveTo` and
  `jira.listStatuses()` are reused unchanged.
