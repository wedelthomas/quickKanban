# Quickstart — Slice 6

How to see each part of this slice work against a running stack.

```bash
docker compose up -d --wait
open http://localhost:3000
```

---

## 1. Time derives from movements, not from a timer

Create a card, move it to In Progress, wait, move it to Test, then Done.

```bash
curl -s http://localhost:3000/api/iterations/<current-ordinal>/report | python3 -m json.tool
```

- `time.byCard` shows the card with a non-zero `seconds` figure — nothing
  was typed.
- Move a card in on a Friday afternoon and out on Monday morning (or seed the
  events directly via `docker compose exec db psql`) — its `seconds` reflects
  only the configured working hours between those points, not the elapsed
  calendar time (SC-502).

## 2. Blocked time is excluded

Block a card mid-progress for a few minutes, unblock it, then move it to
Done. Its reported time excludes the blocked stretch.

```bash
docker compose exec db psql -U kanban -d kanban -c \
  "SELECT * FROM card_blocked_events WHERE card_id = '<card-id>' ORDER BY occurred_at;"
```

## 3. Points import, and a local override wins

Sync a Jira issue carrying a story-points value; confirm the card shows it.
Then set a different value locally in the card dialog — the card uses the
local value, and opening it shows the imported value alongside it.

```bash
curl -s -X PATCH http://localhost:3000/api/cards/<card-id> \
  -H 'content-type: application/json' -d '{"points": 8}'
```

## 4. Commitment is fixed at iteration start

```bash
docker compose exec db psql -U kanban -d kanban -c \
  "SELECT * FROM iteration_commitments;"
```

One row per iteration ever observed, `committed_points` unchanged no matter
how many cards join or leave afterward. Add a pointed card mid-iteration and
confirm the report's `points.scopeAdded` grows while `points.committed`
does not.

## 5. The burndown covers only elapsed days

```bash
curl -s http://localhost:3000/api/iterations/<current-ordinal>/burndown | python3 -m json.tool
```

For a running iteration, the array stops at today. Complete a card and
re-request — that day's `completedThatDay` reflects it.

## 6. The summary takes the iteration as its period

```bash
curl -s "http://localhost:3000/api/summary?period=iteration"
```

Covers exactly the current iteration's dates and copies as plain text, same
as the daily and weekly periods already do.

## 7. No card in the iteration has points

Seed an iteration with only unpointed cards and read its report — `points`
reads `{ "withheld": true, "reason": "…" }` rather than a zero total
(FR-523).
