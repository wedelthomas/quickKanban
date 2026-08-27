# Phase 0 Research — Slice 5

Decisions taken before design, each with the alternative it beat. Everything
here is settled; `plan.md` assumes it.

---

## R-1 — The Blocked column row cannot be deleted

**Finding.** `card_events.from_column_id` and `card_events.to_column_id` both
carry `REFERENCES columns (id)` (`004_card_events.sql`). Any historical movement
into or out of Blocked points at `columns.id = 3`. Deleting that row violates
those foreign keys wherever such rows exist, and the history is append-only by
requirement (BR-31), so the rows cannot be rewritten to point elsewhere.

**Corrected during implementation (T003).** The developer's own database
currently holds **zero** cards in Blocked and **zero** `card_events` rows
referencing column 3 — the column was never used. So on *this* database the row
is deletable today. That does not change the decision: a migration whose
correctness depends on a column never having been used is not a migration, and
the first user who had ever parked a card in Blocked would hit a foreign-key
violation on upgrade. The retire-don't-delete rule is written for the general
case, and this database simply happens to be the easy one.

It has one practical consequence: the live data will **not** exercise the
card-moving path (FR-404, FR-405), so `tests/ops/migration-016-021.test.ts`
must construct that state itself rather than relying on the developer's
database, and T080's live verification cannot cover it either.

**Decision.** The Blocked column is **retired, not deleted**. Its `columns` row
survives so that history keeps resolving; it stops being a board column.

**Consequence for FR-402.** "The Blocked column MUST NOT exist" is satisfied at
the board — no card may occupy it, it is not returned by the board query, and
it cannot be a move target. The row remains as a historical referent. This
reading is recorded because a later reader could otherwise "finish the job" by
dropping the row and break every archived movement.

**Alternative rejected.** Repurposing row 3 as Iteration Items. It would keep
the foreign keys valid but retroactively rewrite history: every past "moved to
Blocked" event would render as "moved to Iteration Items". Corrupting the
record to save a migration step is the worst trade available here.

---

## R-2 — How a column is retired

**Decision.** `columns` gains `retired_at timestamptz`. A non-null value means
the column is historical: excluded from the board query, rejected as a move
target, and ineligible for a status mapping.

`columns.position` is `NOT NULL UNIQUE`. A retired column still holding
position 3 would block the renumbering in R-3, so `position` becomes nullable
and a retired column's position is set to NULL. Nullable is preferable to
parking it at an out-of-range number, because NULL cannot be accidentally
ordered into the board.

**Alternative rejected.** A `columns.active boolean`. `retired_at` records
*when*, which the movement history already establishes as this codebase's habit
(`archived_at`, `deleted_at`, `synced_at`).

---

## R-3 — Renumbering positions without tripping the UNIQUE constraint

**Finding.** The target order is Backlog 1, Iteration Items 2, In Progress 3,
Test 4, PO Review 5, Done 6. Today In Progress is 2, Blocked 3, Test 4. A
single-statement renumbering collides with `position UNIQUE` partway through.

**Decision.** Two-phase update inside the migration transaction: offset every
live position by +100, insert the new column, then assign final positions. The
constraint stays enforced throughout; no deferrable constraint is introduced.

**Alternative rejected.** Making the constraint `DEFERRABLE INITIALLY
DEFERRED`. It would work, but it weakens a constraint permanently to serve one
migration.

---

## R-4 — Iteration Items gets a new identifier

**Decision.** Iteration Items is inserted as `columns.id = 7`, key
`iteration_items`, position 2. It reuses no retired identifier.

**Rationale.** Identifiers in this schema are historical referents (R-1).
Reusing one makes the past ambiguous. Seven rows for six board columns is the
honest shape once a column has been retired.

---

## R-5 — Blocked lives on the card, with a separate record of Jira's opinion

**Decision.** `cards` gains `blocked boolean NOT NULL DEFAULT false`. For
Jira-sourced cards, `jira_links` gains `blocked_in_jira boolean` recording the
state last seen in Jira.

**Why two.** FR-418 makes the local value authoritative and FR-419 requires the
disagreement to be visible. One field cannot express "I say no, Jira says yes";
two can, and the comparison is the divergence.

**Divergence is not a conflict.** It reuses none of the conflict machinery from
Slice 3: no `conflicts` row, no freeze, no resolution dialog (FR-419). The
conflict model stays exactly as Slice 3 left it.

**Alternative rejected.** Deriving blocked from a tag. Tags are user-authored
free text; a reserved tag would collide with a real one and could not carry
Jira's separate opinion.

---

## R-6 — Jira's blocked field is a multi-checkbox, not a boolean

**Finding, verified against tsgjira.atlassian.net.** The field is a
multi-checkbox whose set value is the single option `Blocked`. Issues carrying
it were observed with statuses Development, Test and Open — confirming the
field is orthogonal to status, which is the empirical basis for this whole
restructure.

**Decision.** Blocked is read as *"the configured option appears in the
field's array"*. An absent field, an empty array, and an array without the
option all mean not blocked. The field id and the option label are both
configurable (FR-438), because neither is guaranteed stable across a Jira
administration change.

---

## R-7 — The iteration source is a separate port, not an extension of JiraPort

**Decision.** A new `IterationPort` with one method, alongside the existing
`JiraPort`. A real adapter reads the reference board's active sprints; a fake
adapter serves the test suite (FR-442, NFR-25).

**Rationale.** `JiraPort`'s doc comment states its shape deliberately: read-only
plus exactly one write. The iteration source is a different API surface with
different failure semantics — its failure degrades to a cache (FR-426) rather
than surfacing to the user, which is the opposite of how a failed transition
behaves. Folding it into `JiraPort` would blur a boundary that is currently
carrying a guarantee.

**Alternative rejected.** Adding `getActiveSprints()` to `JiraPort`. Cheaper by
one file, but it puts a method with degrade-silently semantics next to methods
whose failures must be loud.

---

## R-8 — Two teams share the reference board, so selection is by name

**Finding.** Board 1391 carries two active sprints at all times, one per team
sharing it, with identical dates and ordinals — true throughout its 730-sprint
history.

**Decision.** Selection matches the configured team name against the start of
the sprint name, defaulting to `CRM TradeBlazers`. Sprints not matching are
ignored (FR-445). Where several still match, the lowest sprint id wins, so the
result cannot depend on response ordering (FR-424).

**Alternative rejected.** Taking the first active sprint returned. It would
have satisfied a naive reading of "deterministic" while displaying another
team's name on the banner.

---

## R-9 — The resolved iteration is cached in its own table

**Decision.** A new `iterations` table holding ordinal name, start, end, the
source it came from, and when it was read. The banner reads the most recent
row; a successful resolution upserts.

**Rationale.** `settings` is a key-value store for user-adjustable
configuration; the resolved iteration is neither user-adjustable nor a single
value. A table also gives carry-over (R-10) the boundary history it needs, and
gives Slice 6 the iteration list its reports require, without a second
migration.

---

## R-10 — Carry-over is counted at boundary crossings, not derived on read

**Decision.** `cards` gains `carried_iterations integer NOT NULL DEFAULT 0` and
`iteration_seen text`. When resolution observes an iteration different from the
one a card was last seen in, and the card is in Iteration Items, In Progress,
Test or PO Review, the count increments. Reaching Done or Backlog resets it to
zero (FR-444).

**Rationale.** Deriving the count on read would require replaying the movement
history against the iteration calendar for every card on every board load,
which conflicts with FR-429's requirement that nothing delays board load.

**Consequence, recorded honestly.** The count depends on the application having
observed each boundary. A board left unopened across a boundary picks the
change up on its next resolution, which is correct; a board that never
resolves at all does not count. Stated as an assumption in `spec.md`.

---

## R-11 — The estimated fallback needs no sprint arithmetic

**Decision.** The fallback computes only the *dates* of the current period from
the configured anchor and cadence. It does not compute an ordinal, because the
ordinal resets at the fiscal year and cannot be counted (FR-423). The banner
shows the date range and marks the whole thing estimated, with no name.

**Alternative rejected.** Guessing the ordinal by counting cadences from the
anchor. It is wrong every January, and a wrong iteration number is worse than
an absent one.
