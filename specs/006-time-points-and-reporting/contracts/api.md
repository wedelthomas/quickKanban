# Phase 1 API Contract — Slice 6

Two new read endpoints, one changed payload, one extended mutation, one
extended summary period. Error codes follow the typed shapes established in
`src/server/errors.ts`.

---

## GET /api/board — changed

`Card` gains two fields:

```jsonc
{
  "points": 5,                        // null when unpointed (FR-519)
  "pointsDivergesFromJira": false     // FR-518; always false for local cards
}
```

`jira_points` is never returned on its own — only the divergence marker, the
same pattern `blockedDivergesFromJira` already established (slice 5) for the
one other field with a local-versus-Jira split.

---

## PATCH /api/cards/:id — changed

Accepts `points: number | null` alongside the fields it already accepts.
`0` and `null` are both valid and distinct (FR-519). Setting points never
issues a request to Jira (FR-517) — the same non-negotiable slice 3 already
established for status.

---

## GET /api/iterations/:ordinalName/report — new

The reporting surface for User Stories 1–4. `:ordinalName` is the iteration's
own ordinal (as `GET /api/iteration` returns it, or as read from the
iteration history — a past iteration is addressable the same way as the
current one, per BH-526).

```jsonc
{
  "ordinalName": "Anchor Team 2026 S18",
  "startsOn": "2026-08-24",
  "endsOn": "2026-09-07",
  "time": {
    "byCard": [
      { "cardId": "…", "title": "Migrate the gateway", "seconds": 43200 }
    ],
    "byProject": [
      { "project": "local", "seconds": 21600 },
      { "project": "AIHUB", "seconds": 43200 }
    ],
    "localShare": 0.33,
    "jiraShare": 0.67
  },
  "points": {
    "committed": 21,
    "completed": 13,
    "scopeAdded": 5,
    "scopeRemoved": 0,
    "localShare": 0.2,
    "jiraShare": 0.8,
    "excludedUnpointed": 3
  },
  "incomplete": false   // FR-542 — true when the period partly predates recorded history
}
```

- When no card in the period carries points, `points` is instead
  `{ "withheld": true, "reason": "…" }` (FR-523) — the two shapes are
  distinguished by the presence of `withheld` rather than by a null total,
  so a client cannot mistake "no data" for "zero."
- `time` is never withheld — FR-539 requires a zero share to read as zero,
  not as absent.
- 404 (`ITERATION_NOT_FOUND`) when the ordinal has never been observed.
- Never 5xx for a reachable ordinal — every figure inside degrades to its
  documented withheld/incomplete state rather than the endpoint failing.

---

## GET /api/iterations/:ordinalName/burndown — new

User Story 5.

```jsonc
{
  "ordinalName": "Anchor Team 2026 S18",
  "points": [
    {
      "date": "2026-08-24",
      "outstanding": 21,
      "completedThatDay": 0,
      "scopeAddedThatDay": 0,
      "scopeRemovedThatDay": 0
    }
  ]
}
```

- `points` covers only elapsed working days (FR-533) — a running iteration's
  array simply stops at today; a completed iteration's covers its full span
  (FR-534, BH-526).
- 404 (`ITERATION_NOT_FOUND`) when the ordinal has never been observed, same
  as the report endpoint.

---

## GET /api/summary — changed

`period` accepts `"iteration"` alongside the existing `"daily"` /
`"weekly"` (FR-540). When `period=iteration`, the response's date range is
the current iteration's `[starts_on, ends_on)` rather than a computed
window; 404 (`ITERATION_NOT_FOUND`) if no iteration can currently be
established, since there is then no period to bound the summary by.

All three periods share the existing plain-text copy contract (FR-541) —
nothing about that endpoint's shape changes beyond the new period value.
