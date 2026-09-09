# API Contracts — Slice 7: Cancelling Stories

## POST /api/cards/:id/cancel — new

Body:

```jsonc
{ "reason": "Descoped — replaced by the caching approach in AIHUB-40." }
```

`reason` is required, non-empty after trimming (FR-603).

Response 200:

```jsonc
{
  "card": { /* full Card payload, no longer reachable via GET /api/board */ },
  "jira": {
    "attempted": true,
    "transitioned": true,
    "toStatus": "Cancelled",
    "message": "AIHUB-40 moved to Cancelled."
  }
}
```

`jira` is **absent** entirely for a card the user created locally (FR-616 —
the response shape itself never claims a Jira action happened). For an
imported card it is always present, one of:

| `attempted` | `transitioned` | When | `message` example |
|---|---|---|---|
| `false` | `false` | No cancellation status configured (FR-613) | "Nothing was sent — no cancellation status is configured." |
| `false` | `false` | Jira integration toggled off (FR-640) | "Nothing was sent — Jira integration is off." |
| `true` | `true` | The transition succeeded (FR-611) | "AIHUB-40 moved to Cancelled." |
| `true` | `false` | The workflow refused the transition (FR-614) | "Jira refused the transition: …" (cause named) |
| `true` | `false` | Jira was unreachable (FR-615) | "Jira could not be reached." |

Every branch returns **200** — a Jira failure of any kind never turns into
an error response, because the local cancellation already succeeded
(FR-613, FR-614, FR-615, FR-640; R-4).

Errors (local cancellation refused, no Jira contact attempted):

- 404 `CARD_NOT_FOUND` — no such card.
- 409 `CARD_CONFLICTED` — an unresolved conflict is open (FR-609); same
  code `PATCH`/`move` already use for the identical freeze.
- 422 `VALIDATION_FAILED` — empty reason.
- Cancelling an already-cancelled card (FR-610) is **not** an error: 200,
  no additional effect, `jira` absent (nothing is attempted twice).

## POST /api/cards/:id/restore — new

No body.

Response 200:

```jsonc
{ "card": { /* full Card payload, back on the board */ } }
```

Never contacts Jira (FR-632) — there is no `jira` key in the response,
ever, for this endpoint.

Errors:

- 404 `CARD_NOT_FOUND`.
- 422 `VALIDATION_FAILED` — the card is not currently cancelled.

## PUT /api/settings — changed

Accepts `cancellationStatus: string | null` alongside the existing fields.
`null` (or omitting it, if already `null`) is the supported "not
configured" state (FR-635). A non-null value must name a status
`GET /api/jira/statuses` actually reports, validated the same way
`PUT /api/settings/mappings` already validates a mapping's status name —
422 `VALIDATION_FAILED` otherwise. Unvalidated (accepted as given) when
Jira is not configured at all, matching that same existing exception.

## GET /api/jira/statuses — unchanged

Reused as-is for the settings UI's cancellation-status dropdown (FR-634) —
no new Jira-facing endpoint.

## GET /api/archive — changed

Each `ArchivedCard` gains:

```jsonc
{
  // …existing fields…
  "cancelled": true,
  "cancellationReason": "Descoped — replaced by the caching approach in AIHUB-40."
}
```

`cancelled: false` and `cancellationReason: null` for a card retained by
ordinary completion (FR-627).

## GET /api/iterations/:ordinalName/report — changed

`points` (when not withheld) gains `withdrawn`:

```jsonc
{
  "points": {
    "committed": 21,
    "completed": 13,
    "scopeAdded": 5,
    "scopeRemoved": 0,
    "withdrawn": 3,
    "localShare": 0.2,
    "jiraShare": 0.8,
    "excludedUnpointed": 3
  }
}
```

`withdrawn` is `0` — never omitted — when nothing was cancelled in the
period (FR-539's zero-reads-as-zero rule, extended to this figure).

## GET /api/iterations/:ordinalName/burndown — changed

Each point gains `withdrawnThatDay`:

```jsonc
{
  "date": "2026-08-27",
  "outstanding": 18,
  "completedThatDay": 0,
  "scopeAddedThatDay": 0,
  "scopeRemovedThatDay": 0,
  "withdrawnThatDay": 3
}
```

## Card payload — changed

Every `Card` (board, create, update, move responses) gains:

```jsonc
{ "cancellationDivergesFromJira": false }
```

`true` only for a Jira-sourced, currently-active card whose issue still
carries the configured cancellation status (FR-633) — see data-model.md's
`Card` section.
