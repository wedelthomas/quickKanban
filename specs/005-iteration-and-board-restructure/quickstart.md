# Quickstart — Slice 5

How to see each part of this slice work against a running stack.

```bash
docker compose up -d --wait
open http://localhost:3000
```

---

## 1. The columns restructured, blocked cards migrated

Before upgrading, put a card in Blocked. Then apply the migrations (they run at
process start) and reload.

- The board shows **Backlog, Iteration Items, In Progress, Test, PO Review,
  Done**. No Blocked column.
- The card you parked is in **In Progress**, carrying a red left edge and a
  `Blocked` badge.
- Its history shows a move from Blocked to In Progress attributed to the
  system, not to you.

```bash
docker compose exec db psql -U kanban -d kanban -c \
  "SELECT id, key, position, retired_at FROM columns ORDER BY position NULLS LAST;"
```

The Blocked row is still there with `position NULL` and a `retired_at` — that
is deliberate (research R-1): the movement history references it.

---

## 2. Blocked is a state, not a place

- Set and clear the flag from the card dialog, or with the keyboard.
- Drag a blocked card between columns. **It moves** — blocked does not freeze a
  card, unlike a conflict.
- Filter by blocked in the left rail; only flagged cards remain.
- Generate the summary. Its blocked grouping lists cards from whichever columns
  they are actually in.

---

## 3. The iteration banner

With Jira reachable, the banner shows the current Anchor Team iteration:

```
Anchor Team 2026 S18 · 24 Aug – 7 Sep · 8 working days left
```

Then test each degradation in turn:

```bash
# Cached: stop the app reaching Jira, reload. Banner persists, marked stale.
docker compose exec app sh -c 'echo "127.0.0.1 yourcompany.atlassian.net" >> /etc/hosts'

# Estimated: clear the cache too, reload. Dates only, no name, marked estimated.
docker compose exec db psql -U kanban -d kanban -c "DELETE FROM iterations;"
```

The board stays fully interactive throughout. That is the point of FR-429 and
FR-430 — none of this surfaces as an error.

To prove the team filter (FR-445), set `iterationTeamName` to `Signal` in
settings: the banner switches to the other team's sprint name on the same
dates, confirming both are present and the choice is ours.

---

## 4. Committing work to the iteration

- Drag a Jira card into **Iteration Items**. It lands there and **no Jira
  request is issued** — the column has no status mapping.
- Confirm with the sync log:

```bash
docker compose exec db psql -U kanban -d kanban -c \
  "SELECT id, outcome, counts FROM sync_runs ORDER BY id DESC LIMIT 3;"
```

- Run a sync. Nothing is placed into Iteration Items by the system (FR-434).

---

## 5. Carry-over

The fastest way to see this without waiting two weeks is to move the anchor:

```bash
curl -X PUT localhost:3000/api/settings -H 'content-type: application/json' \
  -d '{"iterationAnchorDate":"2026-08-10"}'
```

With Jira unreachable so the estimated path is used, each boundary the app
observes increments the count on cards left unfinished in the working columns.
A card showing `↻2` has carried through two. Move it to Done or back to
Backlog and the marker disappears (FR-444).
