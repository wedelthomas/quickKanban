# Data model — 004-review-and-reporting

This slice reads far more than it writes. It adds **no new card attribute** and
**no new entity** in the spec's sense: the archive is a view over cards that
already carry `archived_at`, and a summary is derived and never stored.

Two additive migrations, two settings keys, one new index.

---

## Migration 013 — `card_events` gains a kind

```sql
ALTER TABLE card_events
  ADD COLUMN kind text NOT NULL DEFAULT 'moved'
  CHECK (kind IN ('moved', 'archived'));

ALTER TABLE card_events DROP CONSTRAINT card_events_actual_move;

ALTER TABLE card_events ADD CONSTRAINT card_events_actual_move
  CHECK (kind <> 'moved' OR from_column_id <> to_column_id);
```

**Why this exists.** FR-317 requires archival to appear in the movement history
with the system as actor. A card eligible for archival is already in Done, so
the row that requirement demands has `from_column_id = to_column_id = 6` — which
the original constraint forbids. Full argument, including the rejected
alternatives and the spec contradiction it raises, in [research.md](research.md)
R-3.

**Why the default matters.** `'moved'` means every existing row and every
existing writer keeps its exact meaning, with no backfill and no code change to
slices 1–3. The constraint is not weakened for movements — it is scoped to them.

**What an archival row looks like.** `from_column_id` and `to_column_id` both
hold the Done column (6); `actor` is `'system'`; `kind` is `'archived'`. Reading
"stayed in Done, archived by the system" from that is exact.

### New index

```sql
CREATE INDEX card_events_arrival_idx
  ON card_events (card_id, to_column_id, occurred_at DESC)
  WHERE kind = 'moved';
```

Serves the one question archival asks per candidate — when did this card most
recently arrive in Done (R-2) — and the summary's scan by period.

---

## Migration 014 — `archive_runs`

Shaped deliberately like `sync_runs`, because it answers the same question about
a different unattended process.

```sql
CREATE TABLE archive_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),

  -- Null while running, which is also how "a pass is in progress" is answered.
  finished_at timestamptz,

  outcome     text CHECK (outcome IN ('succeeded', 'failed')),

  considered  integer NOT NULL DEFAULT 0,
  archived    integer NOT NULL DEFAULT 0,

  -- Cards past the window that were left alone because a conflict is open on
  -- them (R-4). Counted separately: a card that is eligible and repeatedly not
  -- archived is a question someone will eventually ask, and "0 archived" alone
  -- does not answer it.
  skipped_conflicted integer NOT NULL DEFAULT 0,

  CONSTRAINT archive_runs_finished_has_outcome
    CHECK ((finished_at IS NULL) = (outcome IS NULL))
);

-- At most one pass in flight, the same expression of single-flight that
-- sync_runs uses.
CREATE UNIQUE INDEX archive_runs_one_in_flight
  ON archive_runs ((finished_at IS NULL))
  WHERE finished_at IS NULL;

CREATE INDEX archive_runs_recent_idx ON archive_runs (started_at DESC);
```

**Why a table rather than a log line.** This is the first process in the system
that changes the board without a user or Jira asking. Slice 3's live check found
an unrequested Jira write *only* because a write log existed to find it in;
without it the attempt was invisible through an entirely green suite. An
unattended process with no durable record is where the next such defect hides.

---

## Settings

Two new keys in the existing `settings` table.

| Key | Default | Bounds | Meaning |
|---|---|---|---|
| `archive.window_days` | `7` | 0–365 | How long a card stays in Done before archival takes it (FR-313). Zero is permitted and means "at the next pass" — the spec calls that the user's choice. |
| `archive.interval_seconds` | `3600` | 300–86400 | How often the archival pass runs (R-5). |

Both are validated at the route against these bounds, the way
`sync.interval_seconds` already is.

---

## Reads this slice performs

No table is created for these; they are queries over what exists.

### Archival candidates

```sql
SELECT c.id,
       c.created_at,
       (SELECT max(e.occurred_at)
          FROM card_events e
         WHERE e.card_id = c.id AND e.to_column_id = 6 AND e.kind = 'moved')
         AS arrived_in_done_at,
       EXISTS (SELECT 1 FROM conflicts f
                WHERE f.card_id = c.id AND f.resolved_at IS NULL) AS conflicted
  FROM cards c
 WHERE c.column_id = 6
   AND c.archived_at IS NULL
   AND c.deleted_at IS NULL;
```

`arrived_in_done_at` is null for a card created directly in Done — slice 1 writes
no event on creation (FR-028). The pure eligibility function takes
`created_at` as the fallback rather than treating null as "infinitely old" or
"infinitely new", both of which are wrong in a way nobody would notice for
months (R-2).

`conflicted` is selected here rather than checked later so the decision to skip
is visible in the same row as the decision to archive.

### The archive, by date range

```sql
SELECT id, source, title, priority, due_date, archived_at, archived_reason
  FROM cards
 WHERE archived_at IS NOT NULL
   AND deleted_at IS NULL
   AND archived_at >= $1 AND archived_at < $2
 ORDER BY archived_at DESC;
```

Tags and the Jira link join as they do for the board. Grouping by completion
date (FR-320) happens after the read, on the calendar date of `archived_at` in
local time (R-7) — not in SQL, where the timezone would be the container's UTC
regardless.

### A summary's period

Two reads, unioned in the service rather than in SQL:

```sql
-- What moved, including cards since archived (FR-326).
SELECT e.card_id, e.from_column_id, e.to_column_id, e.actor, e.occurred_at,
       c.title, c.source, c.archived_at, jl.issue_key, jl.url
  FROM card_events e
  JOIN cards c ON c.id = e.card_id
  LEFT JOIN jira_links jl ON jl.card_id = c.id
 WHERE e.kind = 'moved'
   AND e.occurred_at >= $1 AND e.occurred_at < $2
   AND c.deleted_at IS NULL
 ORDER BY e.occurred_at;
```

```sql
-- What is in progress and what is blocked, as of now — a state, not an event.
SELECT c.id, c.title, c.source, c.column_id, jl.issue_key, jl.url
  FROM cards c
  LEFT JOIN jira_links jl ON jl.card_id = c.id
 WHERE c.column_id IN (2, 3)
   AND c.archived_at IS NULL AND c.deleted_at IS NULL;
```

The join to `cards` in the first query is why deleted cards drop out of
summaries while archived ones stay: `deleted_at` is filtered, `archived_at` is
not.

---

## What this slice does **not** change

Worth stating, because each was considered:

- **No new column on `cards`.** `archived_at` and `archived_reason` were carried
  forward by slices 1 and 2 for exactly this purpose.
- **No `done_since` column.** Rejected in R-2: it would need maintaining by
  every writer that moves a card, and one missed writer produces a card that
  silently never archives.
- **No stored summaries.** The spec's own assumption — summaries are read,
  copied and discarded, and any past period can be rebuilt from history.
- **No deletion, no purge, no retention limit.** FR-316 and SC-305 require
  archived cards to remain retrievable. Nothing here removes a row, and adding
  a purge later would be its own decision with its own spec.
- **No index on `cards (archived_at)`** for now. The archive query is bounded by
  a date range over tens of rows a month; the planner's sequential scan over a
  table this size is faster than an index lookup. Revisit if the board ever
  holds tens of thousands of cards, which the BRD's assumptions say it will not.
