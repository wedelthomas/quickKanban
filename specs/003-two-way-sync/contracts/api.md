# Phase 1 HTTP Contract — Two-Way Sync

Additive to slices 1 and 2.

## `Card` gains one field

```ts
interface Card {
  // ... slices 1 and 2 ...
  /** True while an unresolved conflict exists. The card is frozen. */
  hasConflict: boolean;
}
```

## New error codes

| `code` | Status | Raised when |
|---|---|---|
| `NO_LEGAL_TRANSITION` | 409 | Jira offers no transition from the issue's current status to the mapped one |
| `STALE_MAPPING` | 409 | The mapped status does not exist in this issue's workflow at all |
| `TRANSITION_NEEDS_FIELDS` | 409 | The transition requires fields the board does not hold |
| `CARD_CONFLICTED` | 409 | The card has an unresolved conflict and is frozen (FR-228) |

These are four distinct codes rather than one, because the user's next action
differs for each: pick a different column, fix the mapping, go to Jira, or
resolve the conflict. A single `MOVE_REFUSED` would make the interface guess.

## `POST /api/cards/:id/move` — changed behavior

Unchanged for ad-hoc cards and unmapped columns: the card moves and nothing is
sent to Jira.

For a Jira card moved into a **mapped** column, the response now reports what
happened in Jira:

```json
{ "card": Card, "moved": true, "jira": { "transitioned": true, "toStatus": "Development" } }
```

On refusal the move is reverted server-side and one of the four codes above is
returned. **The card is never left moved on the board with Jira unchanged** —
that silent divergence is the failure the whole product exists to prevent.

## `GET /api/conflicts`

```json
{ "conflicts": [ {
  "id": 7,
  "card": Card,
  "board": { "columnId": 4, "columnName": "Test" },
  "jira": { "statusAtDetection": "Open", "statusCurrent": "Blocked" },
  "raisedAt": "2026-08-26T14:02:11Z"
} ] }
```

## `POST /api/conflicts/:id/resolve`

```json
{ "resolution": "kept_board" }
```

Exactly two choices: `kept_board` transitions Jira to the board column's mapped
status; `accepted_jira` moves the card to the column mapped from Jira's status.

A `kept_board` resolution can itself be refused — the transition may not be
legal. The conflict then **remains open** and the refusal code is returned
(FR-233). A resolution that half-applied would be worse than the conflict.

## `GET | PUT /api/settings/mappings`

```json
{ "mappings": [ { "columnId": 1, "columnKey": "backlog", "statusName": "Open" },
                { "columnId": 3, "columnKey": "blocked", "statusName": null } ] }
```

`null` means local-only. `PUT` replaces the whole set, so removing a mapping is
expressed by sending it as null rather than by a separate delete.

## `GET /api/jira/statuses`

The status names available in the user's Jira, so the mapping is chosen from a
list rather than typed. Read-only, and cached for the request only — statuses
change rarely but the board should not hold a stale list.

## Jira's side — the write direction

| Call | Purpose |
|---|---|
| `GET /rest/api/3/issue/{key}/transitions` | The transitions legal *from the issue's current status*. Read fresh every time: they depend on the very thing in question. |
| `POST /rest/api/3/issue/{key}/transitions` | Body `{ "transition": { "id": "…" } }`. **The only write this application ever makes.** |

**Matched on `transition.to.name`, never on `transition.name`.** Verified
against yourcompany.atlassian.net: `Pass → PO Approve`, `To Development →
Development`, `To Backlog → Open`. Matching by transition name would fail on
all three.

**Writes are never retried.** A failed transition may or may not have applied;
repeating it risks a second unwanted move, and Jira offers no idempotency key.
