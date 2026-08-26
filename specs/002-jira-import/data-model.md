# Phase 1 Data Model — Jira Import

Three new tables and one new column. All additive: no existing column changes
type or meaning, so the migration is safe against a board already holding the
user's ad-hoc cards.

## `jira_links`

The association between a card and a Jira issue, and the last-known state of
that issue.

| Column | Type | Notes |
|---|---|---|
| `card_id` | `uuid` PK → `cards` ON DELETE CASCADE | One link per card |
| `issue_key` | `text` NOT NULL UNIQUE | `AIHUB-123`. Unique: two cards must never claim one issue |
| `issue_id` | `text` NOT NULL | Jira's numeric id, stable across a project move where the key is not |
| `url` | `text` NOT NULL | Browse link for the card face |
| `status_name` | `text` NOT NULL | Last known. **Written here, read in slice 3** |
| `status_id` | `text` NOT NULL | Last known |
| `jira_updated_at` | `timestamptz` NOT NULL | **Jira's own `updated`, never the local clock** |
| `last_synced_at` | `timestamptz` NOT NULL | When this row was last confirmed |

**Invariants**
- Exactly one row per Jira-sourced card; none for local cards.
- `issue_key` is unique across the table, which is what FR-111 (no duplicate
  card for an issue) rests on — enforced by the database, not only by the
  upsert's `ON CONFLICT`.
- `jira_updated_at` is Jira's value. Writing the local clock here would make
  slice 3's change detection wrong in a way no test in this slice would catch.

## `sync_runs`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` PK generated | |
| `started_at` / `finished_at` | `timestamptz` | `finished_at` null while running — which is also how "a sync is in progress" is answered |
| `outcome` | `text` | `succeeded` \| `failed`; CHECK constrained |
| `failure_kind` | `text` NULL | `credentials` \| `connectivity` \| `rate_limit` \| `malformed`. Null on success. FR-136 requires credentials to read differently from connectivity, so the distinction is stored, not just phrased |
| `issues_seen` / `created` / `updated` / `archived` / `restored` | `int` | Counts, defaulting to 0 |

**Invariant**: at most one row with `finished_at IS NULL` at any time — the
database's expression of the single-flight rule, alongside the in-process lock.

## `settings`

| Column | Type | Notes |
|---|---|---|
| `key` | `text` PK | `jira.jql`, `sync.interval_seconds` |
| `value` | `jsonb` NOT NULL | |

Seeded with the default query and a 300-second interval.

**No credential is ever stored here.** That is not a convention — FR-102
forbids the interface from displaying or accepting one, and the simplest way to
keep that true is for there to be nowhere to put it.

## `cards.archived_reason`

`text` NULL. Why a card left the active board.

Written by this slice when an issue stops matching the query (FR-123), read by
slice 4's archive view. Null for cards that are still on the board and for
cards archived by slice 4's age rule, which has its own reason.

## What this model deliberately does not have

- **No table of Jira statuses.** Slice 3 maps columns to statuses; until then
  the status is a recorded string, not an entity.
- **No credential storage of any kind.**
- **No sync cursor.** Full-state sync has no position to remember.
