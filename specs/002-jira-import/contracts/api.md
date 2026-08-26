# Phase 1 HTTP Contract — Jira Import

Additive to slice 1's contract. Nothing defined there changes shape.

## `Card` gains two fields

```ts
interface Card {
  // ... everything from slice 1 ...
  /** Present only when source is 'jira'. */
  issueKey: string | null;
  issueUrl: string | null;
}
```

Both null for local cards, which is what the card face reads to decide whether
to show the key badge.

## New error codes

| `code` | Status | Raised when |
|---|---|---|
| `JIRA_NOT_CONFIGURED` | 409 | A sync is requested with no credentials in the environment |
| `EDIT_FORBIDDEN_JIRA_OWNED` | 409 | An edit targets a field Jira owns — the title or the key (FR-121) |

`DELETE_FORBIDDEN_NON_LOCAL` from slice 1 already covers refusing to delete a
Jira card, and needs no change.

## `POST /api/sync/run`

Requests a sync. Returns when it finishes.

If a sync is already running, this **joins** it rather than starting a second
(FR-129) — so fifty concurrent calls produce one sync and fifty identical
responses.

→ `200 { "run": SyncRun }` · `409 JIRA_NOT_CONFIGURED`

## `GET /api/sync/status`

```json
{
  "configured": true,
  "running": false,
  "lastSuccessAt": "2026-08-26T14:02:11Z",
  "lastRun": {
    "outcome": "failed",
    "failureKind": "credentials",
    "startedAt": "2026-08-26T14:07:00Z",
    "finishedAt": "2026-08-26T14:07:01Z",
    "counts": { "issuesSeen": 0, "created": 0, "updated": 0, "archived": 0, "restored": 0 }
  }
}
```

`lastSuccessAt` is retained through a failure (FR-135) — the interface shows
both, because "failing now" and "last worked an hour ago" are different facts
and the user needs both to judge whether to trust the board.

`configured: false` is a normal state, not an error: the board works without
Jira (FR-105).

## `GET /api/settings`

```json
{ "jiraJql": "assignee = currentUser() AND statusCategory != Done",
  "syncIntervalSeconds": 300 }
```

**No credential appears in this response, and there is no field for one**
(FR-102). Anything the interface can display, it can leak.

## `PUT /api/settings`

Accepts either or both fields. `syncIntervalSeconds` is bounded to 60–3600 —
below a minute the poll is pointless against Jira's rate limits, and above an
hour the board is stale enough to mislead.

→ `200` with the updated settings · `422 VALIDATION_FAILED`

## Jira's side of the contract

Consumed, not offered. Recorded here because the register points at it.

`GET {JIRA_BASE_URL}/rest/api/3/search/jql?jql=…&startAt=…&maxResults=…&fields=summary,status,updated`

Authenticated with `Authorization: Basic base64(email:token)`.

| Response | Meaning to us |
|---|---|
| `200` | Issues, plus `total` for pagination |
| `401` / `403` | `JiraUnauthorized` — reported as a credential problem, distinctly from connectivity |
| `429` | `JiraRateLimited` — backoff honouring `Retry-After` |
| `5xx`, timeout, DNS failure | `JiraUnreachable` — retried, then reported as connectivity |
| `200` with an unexpected shape | `JiraMalformedResponse` — never partially applied |

**No other Jira endpoint is called, and no method other than GET is used.**
A unit test asserts the adapter's source contains no other verb.
