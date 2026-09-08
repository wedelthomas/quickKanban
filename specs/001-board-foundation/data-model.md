# Phase 1 Data Model — Board Foundation

Six tables. Entity names come from the specification's vocabulary so the
schema reads like the spec.

## `columns`

The six fixed stages. Seeded by migration; never written at runtime.

| Column | Type | Notes |
|---|---|---|
| `id` | `smallint` PK | 1–6, stable |
| `key` | `text` UNIQUE | `backlog`, `in_progress`, `blocked`, `test`, `po_review`, `done` |
| `name` | `text` | Display name |
| `position` | `smallint` UNIQUE | Board order, 1–6 |

**Invariant**: exactly six rows, always. FR-002 forbids any runtime mutation,
so no endpoint writes this table.

## `cards`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Generated server-side |
| `source` | `text` NOT NULL | `local` or `jira`; CHECK constrained. Only `local` is created in this slice (FR-010) |
| `title` | `text` NOT NULL | CHECK `length(btrim(title)) > 0` — FR-004 enforced in the database as well as the boundary |
| `description` | `text` NULL | |
| `priority` | `text` NOT NULL DEFAULT `'medium'` | `high`, `medium`, `low`; CHECK constrained (FR-006) |
| `due_date` | `date` NULL | Calendar date, no time component (FR-007) |
| `column_id` | `smallint` NOT NULL FK → `columns` | |
| `position` | `int` NOT NULL | Order within the column; unique per column among live cards |
| `archived_at` | `timestamptz` NULL | **Unused in this slice.** Read by Slice 4 (FR-040) |
| `deleted_at` | `timestamptz` NULL | Soft delete (FR-041); non-null rows are excluded from the board |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

**Indexes**: `(column_id, position) WHERE deleted_at IS NULL AND archived_at
IS NULL` — the board query's access path. `(deleted_at)` for exclusion.

**Invariants**
- Live cards in a column occupy positions `1..n` with no gaps. The move
  transaction renumbers to preserve this.
- A soft-deleted card keeps its `column_id` and `position` but is excluded
  from the board query and from renumbering.
- `title` is never an identifier: duplicates are permitted (spec edge case).

## `tags`

The shared, board-wide vocabulary (FR-008).

| Column | Type | Notes |
|---|---|---|
| `id` | `int` PK generated | |
| `name` | `citext` UNIQUE | Case-insensitive uniqueness is the mechanism that stops `Ops`, `ops ` and `ops` forking into three tags |

`citext` is enabled by migration. The alternative — a `UNIQUE` index on
`lower(name)` — works equally well but pushes case-folding into every query
rather than into the column's type.

## `card_tags`

| Column | Type | Notes |
|---|---|---|
| `card_id` | `uuid` FK → `cards` ON DELETE CASCADE | |
| `tag_id` | `int` FK → `tags` ON DELETE RESTRICT | |

PK `(card_id, tag_id)` — which is also what makes a duplicate tag on one card
impossible at the storage layer, not merely at the boundary.

**Note**: deleting a card is soft, so the cascade never fires in normal
operation. A tag is never removed when the last card carrying it goes away —
the vocabulary outlives individual cards (spec edge case).

## `card_events`

The append-only movement history (FR-026, FR-027).

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` PK generated | Insertion order |
| `card_id` | `uuid` NOT NULL FK → `cards` ON DELETE RESTRICT | RESTRICT is deliberate: FR-029 requires history to outlive its card, and soft delete means the row is still there to point at |
| `from_column_id` | `smallint` NOT NULL FK → `columns` | |
| `to_column_id` | `smallint` NOT NULL FK → `columns` | |
| `actor` | `text` NOT NULL | `user`, `sync`, or `system`; CHECK constrained. Only `user` is written in this slice; `sync` arrives in Slice 2, `system` in Slice 4 |
| `occurred_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

**Invariants**
- No `UPDATE` or `DELETE` statement targets this table anywhere in the
  codebase. FR-027 is enforced by there being no code path, and asserted by
  BH-017.
- `from_column_id <> to_column_id` — a reorder within a column writes no row
  (FR-028), so an event always represents a genuine column change.
- Written in the same transaction as the card update it describes, so a move
  and its history record are atomic.

## `schema_migrations`

`version text PK`, `applied_at timestamptz`. Written only by the migration
runner.

## What this model deliberately does not have

- **No `boards` table.** There is one board. A table with one row that can
  never have two is a join for nothing.
- **No `users` table.** There is one user and no authentication (FR-035).
- **No down-migration tracking.** Forward-only, per research.md.
