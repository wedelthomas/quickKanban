# Phase 1 Data Model — Two-Way Sync

Two new tables and one new column. All additive.

## `column_status_mappings`

Which Jira status a board column means (FR-201).

| Column | Type | Notes |
|---|---|---|
| `column_id` | `smallint` PK → `columns` | One mapping per column, at most |
| `status_name` | `text` NOT NULL | Matched against a transition's **destination** status, not the transition's own name |

**A column with no row here is local-only** (FR-207). That is the whole
mechanism for the Blocked column, which most Jira workflows have no status for
— the absence of a row is the feature, not a gap.

Two columns may share a status; an inbound change resolves to the first such
column in board order (FR-205).

## `conflicts`

An open disagreement on one card.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` PK generated | |
| `card_id` | `uuid` NOT NULL → `cards` | |
| `board_column_id` | `smallint` NOT NULL → `columns` | What the board said when the conflict was raised |
| `jira_status_at_detection` | `text` NOT NULL | What Jira said then |
| `jira_status_current` | `text` NOT NULL | Updated in place if Jira moves again — one conflict per card, never two (FR-234) |
| `raised_at` | `timestamptz` NOT NULL DEFAULT now() | |
| `resolved_at` | `timestamptz` NULL | |
| `resolution` | `text` NULL | `kept_board` \| `accepted_jira` \| `moot`; CHECK constrained |

**Invariant**: at most one unresolved conflict per card, enforced by a partial
unique index on `card_id WHERE resolved_at IS NULL`. FR-234 says a second
detection updates the existing conflict; the index makes that the only
possibility rather than a rule someone has to remember.

Resolved conflicts are retained. They are the record of what was decided, and
slice 4's summary can show that a disagreement happened and how it went.

## `cards.has_open_conflict`

Not a column. The board query derives it from `conflicts`, because storing it
would create a second source of truth that can drift from the table it
duplicates. The cost is one join on a query that already has several.

## What this model deliberately does not have

- **No merge state.** There is nothing between "conflicted" and "resolved".
- **No transition cache.** Legal transitions are read fresh each time, because
  they depend on the issue's current status, which is exactly what is in doubt.
- **No write queue.** A failed write is reported, not retried (see research.md).
