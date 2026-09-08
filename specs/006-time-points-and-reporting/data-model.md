# Phase 1 Data Model: Time, Points and Iteration Reporting

Three migrations, none destructive. Every new column is nullable or defaulted
so existing rows remain valid without a backfill (matching the pattern every
prior slice's additive migrations followed).

## 024_card_points.sql

```sql
ALTER TABLE cards ADD COLUMN IF NOT EXISTS points integer
  CONSTRAINT cards_points_non_negative CHECK (points IS NULL OR points >= 0);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS jira_points integer
  CONSTRAINT cards_jira_points_non_negative CHECK (jira_points IS NULL OR jira_points >= 0);
```

- `points`: the authoritative value (FR-518). `NULL` means unpointed
  (FR-519); `0` is a deliberate estimate and is distinct.
- `jira_points`: the value last read from the configured story-points field
  (`settings.jiraFieldStoryPoints`), written only by sync. `NULL` for local
  cards and for Jira cards whose field was empty at last sync. Never itself
  written to Jira (FR-517) — that constraint holds regardless, since nothing
  in the sync path ever writes `jira_points` back out.

## 025_card_blocked_events.sql

```sql
CREATE TABLE card_blocked_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id     uuid NOT NULL REFERENCES cards (id) ON DELETE RESTRICT,
  blocked     boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX card_blocked_events_card_idx ON card_blocked_events (card_id, id);
```

Append-only, same shape and same `ON DELETE RESTRICT` reasoning as
`card_events` (Principle II). Written by `CardService.update` whenever the
`blocked` field changes value — a toggle from `false`→`true` or `true`→
`false` writes one row; setting it to its current value writes nothing.

## 026_iteration_commitments.sql

```sql
CREATE TABLE iteration_commitments (
  ordinal_name     text PRIMARY KEY REFERENCES iterations (ordinal_name),
  committed_points integer NOT NULL CHECK (committed_points >= 0),
  committed_at     timestamptz NOT NULL DEFAULT now()
);
```

One immutable row per iteration, inserted `ON CONFLICT (ordinal_name) DO
NOTHING` the first time `IterationService.current()` observes that ordinal
(research.md R-4) — the same pattern `iterations` itself and
`carried_iterations` already use for boundary-triggered, write-once state.

No fourth migration is needed: `working.start_hour`, `working.end_hour` and
`working.days` already exist (`021_iteration_settings.sql`, slice 5) — this
slice is their first consumer, not their source.

## Key Entities

### Card (extended)

Adds `points: number | null` and a derived `pointsDivergesFromJira: boolean`
(`jira_points !== null && jira_points !== points`), mirroring
`blockedDivergesFromJira`'s shape exactly. `jira_points` itself is not
exposed on the `Card` API type — only the divergence boolean and the local
`points` value are, matching how the blocked flag's Jira-side value is never
returned either (only the divergence marker is).

### Blocked interval (new, internal)

Not a shared type — an internal shape `{ blocked: boolean; occurredAt: string
}` read by `elapsed-time.ts` from `card_blocked_events`. Never serialized to
the API.

### Iteration commitment (new)

```ts
interface IterationCommitment {
  ordinalName: string;
  committedPoints: number;
  committedAt: string;
}
```

Read-only from the API's perspective — nothing ever updates a row after
insert.

### Iteration report (new, derived — not persisted)

```ts
interface IterationReport {
  ordinalName: string;
  startsOn: string;
  endsOn: string;
  time: {
    byCard: { cardId: string; title: string; seconds: number }[];
    byProject: { project: string; seconds: number }[]; // 'local' is one project
    localShare: number;   // 0..1
    jiraShare: number;    // 0..1
  };
  points: {
    committed: number;
    completed: number;
    scopeAdded: number;
    scopeRemoved: number;
    localShare: number | null;  // null when withheld (FR-523)
    jiraShare: number | null;
    excludedUnpointed: number;  // count, not points
  } | { withheld: true; reason: string };
  incomplete: boolean; // FR-542 — period partly predates recorded history
}
```

### Burndown (new, derived — not persisted)

```ts
interface BurndownPoint {
  date: string;               // one per working day of the iteration
  outstanding: number;
  completedThatDay: number;
  scopeAddedThatDay: number;
  scopeRemovedThatDay: number;
}
```

Both `IterationReport` and `BurndownPoint[]` are computed fresh on every
request (research.md R-2) from `card_events`, `cards`, and
`iteration_commitments` — none of this shape is stored.
