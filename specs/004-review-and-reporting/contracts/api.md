# API contract — 004-review-and-reporting

Three additions, all reads, plus two settings keys. Nothing here mutates a card,
which is not an accident of implementation but the requirement (FR-311, FR-331).

Failures use the existing problem shape from slice 1: `type`, `title`, `status`,
`code`, `detail`. Clients switch on `code`, never on prose.

---

## Filtering: no endpoint

**There is no filter endpoint, and that is a design decision, not an omission.**

Filtering happens in the browser over the cards `GET /api/board` already
returned (research.md R-1). The consequences worth naming:

- Filter text never crosses the wire, so it has no injection surface.
- FR-311 ("filtering must not alter any card") holds because there is no code
  path that could — the filter has no write.
- FR-310 ("filters do not survive a reload") holds because component state dies
  on reload without anything having to enforce it.

If the board ever outgrows this, a `?q=` parameter is additive and none of the
above is a barrier — but it would need to re-earn each of those three
properties.

---

## `GET /api/archive`

Archived cards in a date range, grouped by the calendar date they were
completed.

### Query parameters

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `from` | `YYYY-MM-DD` | no | 30 days ago | Inclusive. Local calendar date. |
| `to` | `YYYY-MM-DD` | no | today | **Inclusive** — a range of `2026-08-01`…`2026-08-01` returns that day's cards, which is what a person asking for one day means. |

The range is always bounded: there is no request meaning "everything ever". The
defaults exist so opening the archive shows something useful immediately.

### 200

```json
{
  "from": "2026-07-28",
  "to": "2026-08-27",
  "days": [
    {
      "date": "2026-08-20",
      "cards": [
        {
          "id": "0c4f…",
          "source": "jira",
          "title": "Migrate the gateway",
          "priority": "medium",
          "tags": ["ops"],
          "issueKey": "PROJ-11",
          "issueUrl": "https://yourcompany.atlassian.net/browse/PROJ-11",
          "archivedAt": "2026-08-20T16:04:11.201Z",
          "archivedReason": "no longer matches the query"
        }
      ]
    }
  ],
  "total": 1
}
```

- `days` is ordered newest first and **omits days with no cards** — a run of
  empty dates is noise, not information.
- `archivedReason` is null for cards archived by the window; it carries slice
  2's reason for issues that left the query (FR-322).
- `total` lets the interface state "no cards in this range" (FR-323) without
  walking the array. An empty range is `{"days": [], "total": 0}` and a **200**,
  not a 404: asking a reasonable question and getting no answer is a successful
  request.

### 400 — `INVALID_DATE_RANGE`

`from` later than `to`, or either unparseable as a calendar date. Distinguished
from an empty result on purpose: one is a mistake to correct, the other is an
answer.

---

## `GET /api/summary`

A generated report over a period. Returns both the structure the interface draws
and the exact text the user will paste (research.md R-6).

### Query parameters

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `period` | `daily` \| `weekly` | no | `daily` | Daily covers the previous calendar day *and* today, because a standup update is about what you did yesterday and what you are on now. Weekly covers the last seven calendar days including today. |

Boundaries are calendar days in local time, the same rule due dates use (R-7).

### 200

```json
{
  "period": "daily",
  "from": "2026-08-26",
  "to": "2026-08-27",
  "moved": [
    {
      "cardId": "0c4f…",
      "title": "Migrate the gateway",
      "source": "jira",
      "issueKey": "PROJ-11",
      "issueUrl": "https://…",
      "fromColumn": "In Progress",
      "toColumn": "Test",
      "actor": "user",
      "occurredAt": "2026-08-26T14:02:00.000Z",
      "archived": false
    }
  ],
  "inProgress": [{ "cardId": "…", "title": "…", "source": "local", "issueKey": null }],
  "blocked": [{ "cardId": "…", "title": "…", "source": "jira", "issueKey": "APEX-190" }],
  "empty": false,
  "text": "*Yesterday and today*\n• PROJ-11 Migrate the gateway — In Progress → Test\n\n*In progress*\n• …\n\n*Blocked*\n• …"
}
```

- `actor` is `user`, `sync` or `system`. The interface marks anything that is
  not `user`, and the rendered text says so too — FR-328 exists so the user does
  not report a transition a teammate made as their own progress.
- `archived` marks a card that has since left the board but moved within the
  period (FR-326). Its entry still names it; it just will not be found on the
  board.
- `empty` is true when all three groups are empty. The interface and the text
  then both say there was nothing, rather than rendering three empty headings
  (FR-330). It is a field rather than something the client infers, so the
  emptiness rule lives in one place.
- `text` is the copy target for FR-329 — plain text, no markup beyond what a
  chat client renders from asterisks, and asserted byte-for-byte in unit tests.

### 400 — `VALIDATION_FAILED`

An unrecognised `period`. Only the two the spec requires are offered (FR-325);
an arbitrary range is out of scope.

---

## `GET /api/settings` and `PUT /api/settings`

The existing endpoints gain two fields. The shape is otherwise unchanged, so the
current client keeps working.

```json
{
  "jiraJql": "assignee = currentUser() AND statusCategory != Done",
  "syncIntervalSeconds": 300,
  "archiveWindowDays": 7,
  "archiveIntervalSeconds": 3600
}
```

| Field | Bounds | Refusal |
|---|---|---|
| `archiveWindowDays` | integer 0–365 | `VALIDATION_FAILED` |
| `archiveIntervalSeconds` | integer 300–86400 | `VALIDATION_FAILED` |

Zero is a valid window and means "at the next pass" — the spec calls that
permitted and the user's choice, so the bound starts at zero rather than one.

Changing `archiveIntervalSeconds` re-arms the pending timer immediately, the way
`syncIntervalSeconds` already does. Without that, shortening the interval would
still wait out the old one.

---

## `POST /api/archive/run`

Runs an archival pass now.

Exists for the same reason `POST /api/sync/run` does: an hourly background
process is untestable and unobservable if the only way to see it act is to wait
an hour. The acceptance suite drives this endpoint directly.

### 200

```json
{
  "run": {
    "id": 4,
    "startedAt": "2026-08-27T00:00:00.000Z",
    "finishedAt": "2026-08-27T00:00:00.140Z",
    "outcome": "succeeded",
    "considered": 6,
    "archived": 2,
    "skippedConflicted": 1
  }
}
```

`skippedConflicted` counts cards past the window left alone because a conflict
is open on them (research.md R-4). Reported separately because "archived: 0"
alone does not distinguish "nothing was due" from "something was due and I
refused", and only one of those is worth investigating.

### 409 — `ARCHIVE_IN_PROGRESS`

A pass is already running. Single-flight, enforced by a partial unique index as
well as in process, so two app instances could not overlap either.
