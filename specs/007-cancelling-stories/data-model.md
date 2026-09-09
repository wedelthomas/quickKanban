# Data Model — Slice 7: Cancelling Stories

One migration. No new tables — cancellation is three columns on `cards`,
two new `card_events.kind` values, and one settings key.

## `cards` — three new columns

```sql
ALTER TABLE cards ADD COLUMN cancelled_at timestamptz;
ALTER TABLE cards ADD COLUMN cancellation_reason text;
ALTER TABLE cards ADD COLUMN cancelled_from_column_id integer REFERENCES columns(id);
```

- `cancelled_at` — presence is the discriminator between "retained because
  cancelled" and "retained because completed" (FR-627, R-1). Cleared on
  restore.
- `cancellation_reason` — the user's own words (FR-603, FR-628). A column
  of its own, not a reuse of `archived_reason` (R-2). Cleared on restore;
  the permanent record survives in `card_events` regardless (see below).
- `cancelled_from_column_id` — the column to return to (FR-630). References
  `columns(id)` the same way `card_events.to_column_id` already does, so it
  keeps resolving even if that column is later retired (FR-446's reasoning,
  reused) — restoring is what checks retirement, not this column's
  integrity. Cleared on restore.

Cancellation reuses the existing retention path: setting `archived_at`
(already written by `ArchiveRepository`/`JiraCardRepository`) is what takes
the card off `board-repository.ts`'s query (FR-604) and puts it in
`archiveByRange`'s result (User Story 4) — no new column, no new query,
for either.

## `card_events.kind` — two new values

```sql
ALTER TABLE card_events DROP CONSTRAINT card_events_kind_check;
ALTER TABLE card_events ADD CONSTRAINT card_events_kind_check
  CHECK (kind IN ('moved', 'archived', 'cancelled', 'restored'));
```

- `'cancelled'` — `from_column_id`/`to_column_id` both the column the card
  was cancelled from (the same "no real move, `kind` carries the meaning"
  shape `'archived'` already uses). `actor` is `'user'` — a cancellation is
  always something the person at the keyboard did (FR-607).
- `'restored'` — `from_column_id`/`to_column_id` both the column the card
  is restored into. Also `actor = 'user'`.

Both are permanent, append-only rows (Principle II) — restoring a card
clears its current-state columns above but never touches these. A card
cancelled, restored, and cancelled again carries the full sequence in its
history regardless of what its current row says.

## `settings` — one new key

```sql
-- No migration needed for the row itself: settings is key/value, and an
-- absent key already reads as "not configured" (matches jiraFieldBlocked's
-- own pattern) — FR-635 requires exactly that supported state.
```

`jira.cancellation_status` (text, nullable/absent = unconfigured). Read
through `SettingsRepository` alongside the other `jira.field.*` keys;
written through the existing `PUT /api/settings`, validated against
`jira.listStatuses()` the same way `PUT /api/settings/mappings` already
validates a status name (R-6). Never a credential (FR-637) — it names a
status, the same category of value `jiraFieldBlockedOption` already is.

## `IterationReportPoints` — one new figure

```ts
export interface IterationReportPoints {
  committed: number;
  completed: number;
  scopeAdded: number;
  scopeRemoved: number;
  withdrawn: number;        // NEW — FR-617, FR-619, FR-622
  localShare: number;
  jiraShare: number;
  excludedUnpointed: number;
}
```

Computed in `iteration-report.ts` exactly like `completed`/`scopeAdded`/
`scopeRemoved` already are (R-3): a card whose `cancelledAt` falls in the
requested iteration's span contributes its points to `withdrawn` when it
had already entered a working column at or before `committed_at` (i.e. was
part of the original commitment); otherwise it contributes nothing (FR-625
— never committed, nothing to withdraw). `withdrawn` is subtracted from
outstanding the same way `completed` already is (FR-619); it is never
folded into `scopeRemoved` (FR-622 — reported separately) and never into
`completed` (FR-620).

## `BurndownPoint` — one new figure

```ts
export interface BurndownPoint {
  date: string;
  outstanding: number;
  completedThatDay: number;
  scopeAddedThatDay: number;
  scopeRemovedThatDay: number;
  withdrawnThatDay: number;   // NEW — FR-617..FR-619
}
```

Same per-day bucketing `burndown.ts` already does for the other three
figures, keyed by the day of `cancelled_at` rather than a movement.
`outstanding` for a day now nets `- completedThatDay + scopeAddedThatDay -
scopeRemovedThatDay - withdrawnThatDay`.

## `ArchivedCard` — two new fields

```ts
export interface ArchivedCard {
  id: string;
  source: CardSource;
  title: string;
  priority: Priority;
  tags: string[];
  issueKey: string | null;
  issueUrl: string | null;
  archivedAt: string;
  archivedReason: string | null;
  cancelled: boolean;              // NEW — FR-627
  cancellationReason: string | null; // NEW — FR-628
}
```

`cancelled` is `cancelled_at IS NOT NULL`, read alongside every other
archived-card field `archiveByRange` already selects — no second query.

## `Card` — one new projected field

```ts
export interface Card {
  // …unchanged…
  cancellationDivergesFromJira: boolean; // NEW — FR-633, R-5
}
```

Computed the same way `blockedDivergesFromJira` already is: `true` only for
a Jira-sourced card currently on the board whose `jira_links.status_name`
equals the configured `jira.cancellation_status`. Always `false` for a
local card, for an archived/cancelled card, or when no cancellation status
is configured — there is nothing to disagree with in any of those cases.

## Cancellation and restoration, end to end

1. **Cancel** (`POST /api/cards/:id/cancel`, body `{ reason: string }`):
   - Refuse if an unresolved conflict is open on the card (FR-609) — the
     exact same `conflicts.hasOpen` check `CardService.move` already makes.
   - Refuse if the card is already cancelled or archived (FR-610, and Done
     work is out of scope per the spec's own Assumptions).
   - Set `cancelled_at = now()`, `cancellation_reason`, `cancelled_from_column_id
     = <current column>`, `archived_at = now()` — one update, one
     transaction.
   - Append one `card_events` row, `kind = 'cancelled'`.
   - Attempt the Jira transition (R-4) — best-effort, its outcome reported
     back but never able to undo the two writes above.
2. **Restore** (`POST /api/cards/:id/restore`):
   - Refuse if the card is not cancelled (nothing to restore).
   - Target column: `cancelled_from_column_id` if it still accepts cards
     (not retired), else `BACKLOG` (the same entry-column constant
     `status-mapping.ts` already exports) — FR-630, BH-626.
   - Clear `cancelled_at`, `cancellation_reason`, `cancelled_from_column_id`,
     `archived_at`; set `column_id` to the target.
   - Append one `card_events` row, `kind = 'restored'`.
   - No Jira call of any kind (FR-632) — the divergence this can leave
     behind is exactly what `cancellationDivergesFromJira` (R-5) surfaces.
