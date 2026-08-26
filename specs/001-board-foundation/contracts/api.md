# Phase 1 HTTP Contract — Board Foundation

JSON over HTTP, same origin as the SPA, no authentication (FR-035). All
responses are `application/json` except failures, which are
`application/problem+json`.

## Error shape

Every failure carries a stable machine-readable `code`. **The client switches
on `code`, never on `detail`** — `detail` is for the user, `code` is for the
program, and conflating them makes error text load-bearing.

```json
{
  "type": "about:blank",
  "title": "Card title is required",
  "status": 422,
  "code": "TITLE_REQUIRED",
  "detail": "A card must have a title that is not only whitespace."
}
```

| `code` | Status | Raised when |
|---|---|---|
| `TITLE_REQUIRED` | 422 | Title empty or whitespace-only (FR-004) |
| `VALIDATION_FAILED` | 422 | Any other schema violation |
| `CARD_NOT_FOUND` | 404 | Unknown card id |
| `COLUMN_NOT_FOUND` | 404 | Unknown column id |
| `DELETE_FORBIDDEN_NON_LOCAL` | 409 | Delete attempted on a card whose source is not `local` (FR-015) |
| `DATABASE_UNAVAILABLE` | 503 | Database unreachable — the client reverts the optimistic move (FR-020) |

## Types

```ts
type Priority = "high" | "medium" | "low";
type CardSource = "local" | "jira";
type Actor = "user" | "sync" | "system";

interface Card {
  id: string;
  source: CardSource;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;   // ISO calendar date, no time (FR-007)
  overdue: boolean;         // server-computed against its own today (FR-042)
  columnId: number;
  position: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

`overdue` is computed server-side rather than in the browser so that one
definition of "today" governs, and so BH-029 can be asserted at the API level
without a browser.

## Endpoints

### `GET /api/board`

The whole board in one request — six columns, each with its live cards in
position order. Soft-deleted and archived cards are excluded.

```json
{
  "columns": [
    { "id": 1, "key": "backlog", "name": "Backlog", "position": 1, "cards": [ /* Card[] */ ] }
  ]
}
```

Always returns exactly six columns, including empty ones (FR-001, and BH-306
in Slice 4 depends on the same guarantee).

### `POST /api/cards`

```json
{ "title": "Rotate staging certificates", "description": null,
  "priority": "high", "dueDate": "2026-09-02", "tags": ["ops", "security"] }
```

`priority` defaults to `medium` when omitted (FR-006). Tags are trimmed,
case-folded and deduplicated, and any not already in the vocabulary are added
to it (FR-008). The card is created at the top of Backlog (FR-009).

→ `201` with the created `Card`.

### `PATCH /api/cards/:id`

Any subset of `title`, `description`, `priority`, `dueDate`, `tags`. Sending
`tags: []` removes all tags and is valid. → `200` with the updated `Card`.

### `DELETE /api/cards/:id`

Soft-deletes (FR-041). Refused with `DELETE_FORBIDDEN_NON_LOCAL` when the
card's source is not `local` (FR-015). → `204`.

### `POST /api/cards/:id/move`

```json
{ "toColumnId": 4, "toIndex": 2 }
```

Absolute target, not a delta — which is what makes the operation idempotent
under replay. `toIndex` is 1-based within the destination column.

→ `200 { "card": Card, "moved": boolean }`

`moved` is `false` when the card already occupied that exact position: no
write, no history record (spec edge case). The response always carries the
card's authoritative position, so the client reconciles its optimistic state
against fact rather than assuming success.

### `GET /api/cards/:id/events`

The card's movement history, oldest first. Exists so BH-016 through BH-018 can
be asserted without reading the database directly.

```json
{ "events": [
  { "id": 41, "fromColumnId": 1, "toColumnId": 2, "actor": "user",
    "occurredAt": "2026-08-26T14:02:11Z" } ] }
```

### `GET /api/tags?q=op`

The shared vocabulary, for autocomplete (FR-043). Prefix match,
case-insensitive. → `{ "tags": [{ "id": 3, "name": "ops" }] }`

### `GET /api/health`

→ `200 { "status": "ok", "database": "ok" }` when the database is genuinely
reachable; `503 { "status": "degraded", "database": "unreachable" }` otherwise
(FR-032). The container healthcheck reads this, so it must not report healthy
on process liveness alone.

## Contract evolution

Slice 2 extends this additively: `Card` gains `issueKey` and `issueUrl` for
Jira-sourced cards, and new endpoints appear under `/api/sync`. Nothing
defined above changes shape.
