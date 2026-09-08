# Phase 1 API Contract — Slice 5

One new read endpoint, two changed payloads, one extended mutation, one
extended settings surface. Error codes follow the typed shapes established in
`src/server/errors.ts`.

---

## GET /api/iteration — new

The banner's source (FR-431). Never fails in a way the board must handle:
resolution failure degrades to cache, then to estimate, then to `null`
(FR-428, FR-430).

```jsonc
{
  "ordinalName": "Anchor Team 2026 S18",  // null when estimated (R-11)
  "startsOn": "2026-08-24",
  "endsOn": "2026-09-07",
  "workingDaysRemaining": 8,
  "provenance": "read" | "cached" | "estimated",
  "observedAt": "2026-08-26T14:02:11Z"
}
```

- `provenance: "read"` — resolved from the reference board this run.
- `provenance: "cached"` — a previously read iteration, source unreachable
  now. FR-427 requires the client to mark it.
- `provenance: "estimated"` — computed from anchor and cadence. `ordinalName`
  is `null` because the ordinal cannot be counted (FR-423, R-11).
- Body is `null` when no iteration can be established at all. A `null` body is
  a valid state, not an error — the banner renders nothing and the board is
  unaffected.

Always answers 200. It never answers 5xx, because a failing iteration must not
present as an application error (FR-430).

---

## GET /api/board — changed

`Column` gains nothing; retired columns are simply absent (FR-402). `Card`
gains three fields:

```jsonc
{
  "blocked": true,
  "blockedDivergesFromJira": false,   // FR-419; always false for local cards
  "carriedIterations": 2              // 0 when never carried (FR-436)
}
```

`blockedDivergesFromJira` is computed server-side, like `overdue` before it, so
one definition governs.

The board query filters `columns.retired_at IS NULL`. A card can no longer be
returned in a retired column, because the migration empties it (FR-404) and no
write path can put one back (see below).

---

## PATCH /api/cards/:id — extended

Accepts `blocked` alongside the existing fields (FR-412):

```jsonc
{ "blocked": true }
```

Applies to local and Jira-sourced cards alike (FR-412). Setting it never
contacts Jira (FR-417).

Unlike a conflicted card, a blocked card is **not** frozen: moves continue to
be accepted (FR-414). The existing conflict freeze is untouched.

---

## POST /api/cards/:id/move — changed

Rejects a retired column as a target:

```jsonc
{ "error": "COLUMN_RETIRED", "message": "That column no longer exists." }
```

Answers 422. This is the write-path half of FR-402: the migration empties the
column, and this stops anything refilling it.

Moving into Iteration Items follows the existing unmapped-column path
unchanged (FR-408) — the column has no `column_status_mappings` row, so no
transition is attempted and no request is issued to Jira (FR-409's mechanism,
inherited from Slice 3).

---

## GET /api/settings, PUT /api/settings — extended

Gains, alongside the existing `jiraJql`, `syncIntervalSeconds`,
`archiveWindowDays` and `archiveIntervalSeconds`:

```jsonc
{
  "iterationBoardId": 4200,
  "iterationTeamName": "Anchor Team",
  "iterationAnchorDate": "2026-08-24",
  "iterationCadenceDays": 14,
  "workingDays": ["mon", "tue", "wed", "thu", "fri"],
  "workingStartHour": 9,
  "workingEndHour": 17,
  "jiraFieldBlocked": "customfield_10003",
  "jiraFieldBlockedOption": "Blocked",
  "jiraFieldSprint": "customfield_10000",
  "jiraFieldStoryPoints": "customfield_10005"
}
```

Validation: `iterationCadenceDays` 1–90; `workingStartHour` < `workingEndHour`,
both 0–23; `workingDays` a non-empty subset of the seven day keys; field ids
matching `^customfield_\d+$`; `iterationBoardId` a positive integer.

Changing `iterationBoardId` or `iterationTeamName` re-arms resolution
immediately, following the pattern the sync interval already uses
(`onIntervalChanged`).

Still no credential, and still nowhere to put one.

---

## Iteration port — internal contract

Not an HTTP surface. Recorded because R-7 makes it a boundary, and NFR-25
requires a test double for it.

```ts
interface IterationPort {
  /** Active sprints on the board, unfiltered. Selection is the caller's. */
  listActiveSprints(boardId: number): Promise<Sprint[]>;
}

interface Sprint {
  id: number;
  name: string;
  startsOn: string | null;   // null is real: board 4200's future sprints
  endsOn: string | null;
}
```

`startsOn`/`endsOn` are nullable because undated sprints exist on the real
board, and FR-425 requires them to be treated as no result rather than as an
error.

Failures raise the existing `JiraError` kinds. The caller degrades on all of
them (FR-430) — none reaches the user as a failed operation.
