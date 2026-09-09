# Quickstart — Slice 7

How to see each part of this slice work against a running stack.

```bash
docker compose up -d --wait
open http://localhost:3000
```

---

## 1. Cancelling takes a card off the board and keeps it

Create a card, then:

```bash
curl -s -X POST http://localhost:3000/api/cards/<card-id>/cancel \
  -H 'content-type: application/json' \
  -d '{"reason": "Descoped"}' | python3 -m json.tool
```

- `GET /api/board` no longer lists it.
- `GET /api/archive` lists it, `cancelled: true`, `cancellationReason:
  "Descoped"`.

## 2. Cancelling never writes any field but status to Jira

Configure a cancellation status in Settings, sync a Jira issue, cancel its
card, then inspect what was actually sent (contract tests intercept every
Jira request — nothing here reaches the network per NFR-23, but a real
instance's `docker compose logs app` shows the single transition request).

## 3. No configured status still cancels locally

Leave the cancellation status empty in Settings, cancel an imported card:

```bash
curl -s -X POST http://localhost:3000/api/cards/<card-id>/cancel \
  -H 'content-type: application/json' -d '{"reason": "test"}' | python3 -m json.tool
```

`jira.attempted` is `false`; the card is cancelled regardless.

> Validated against a running stack (T738): when Jira integration itself is
> unconfigured (no credentials at all, distinct from "configured but no
> cancellation status set"), the response carries no `jira` key rather than
> `{attempted: false, ...}` — `attemptJiraCancellation` returns early for a
> null Jira port before it can build that shape. The card still cancels
> locally either way; the `{attempted: false}` shape this step describes was
> confirmed instead via the acceptance suite (`cancelling-jira.feature`,
> "No configured status still cancels locally"), which runs against a stub
> Jira adapter rather than requiring live credentials.

## 4. Cancelled points report as scope withdrawn

Commit a pointed card to the running iteration, cancel it, then:

```bash
curl -s "http://localhost:3000/api/iterations/<current-ordinal>/report" | python3 -m json.tool
```

`points.withdrawn` carries its points; `points.completed` does not;
`points.committed` is unchanged.

```bash
curl -s "http://localhost:3000/api/iterations/<current-ordinal>/burndown" | python3 -m json.tool
```

The day of cancellation shows `withdrawnThatDay` equal to those points, and
`outstanding` falls by exactly that amount.

## 5. A cancelled card restores to where it was

```bash
curl -s -X POST http://localhost:3000/api/cards/<card-id>/restore | python3 -m json.tool
```

The card reappears on `GET /api/board` in its original column, and the
iteration report's `points.withdrawn` for that iteration drops back down.

## 6. A conflicted card refuses cancellation

Raise a conflict on an imported card (or reuse an existing conflict
fixture), then attempt to cancel it — expect 409 `CARD_CONFLICTED`,
identical to attempting to move it.
