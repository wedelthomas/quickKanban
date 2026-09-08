# Quickstart — 004-review-and-reporting

How to see each of the three features work, from a running board. Assumes
slices 1–3 are up (`docker compose up`, board at <http://127.0.0.1:3000>).

---

## Filtering

1. Open the board with a few cards across tags and priorities.
2. Press `/` — the filter bar takes focus without the mouse (FR-309).
3. Type a word from one card's title.

**Expect:** cards narrow as you type. **All six columns stay visible**, including
ones now empty (FR-307) — the board keeps its shape so you do not lose your
place.

4. Type something matching nothing.

**Expect:** every column empty, and a plain statement that a filter is hiding
cards, with a way to clear it (FR-308). An empty board must never be ambiguous
between "filtered" and "you have no work" — that ambiguity is the whole point of
SC-309.

5. Press `Escape`, then reload the page.

**Expect:** every card back, both times. The filter does not survive a reload
(FR-310) — deliberately, so a filtered board is never mistaken for a lost one.

Throughout: **no card moves.** Filtering never issues a write; there is no
endpoint to write to (contracts/api.md).

---

## Archival

The window defaults to 7 days, so watching it happen naturally takes a week.
Two ways to see it now.

### Shorten the window

1. Open Settings, set **Archive after** to `0` days, save.
2. Move a card to Done.
3. `curl -X POST localhost:3000/api/archive/run`

**Expect:** the card leaves the board. It is not deleted — see the archive
below. Zero is a permitted window and means "at the next pass".

### Age a card directly

For testing an in-between window without waiting:

```bash
docker compose exec -T db psql -U kanban -d kanban -c \
  "UPDATE card_events SET occurred_at = now() - interval '10 days'
    WHERE card_id = '<uuid>' AND to_column_id = 6;"
```

Then run a pass. The window is measured from the card's **most recent** arrival
in Done (FR-314), so a card that reached Done, was dragged out and came back
yesterday is one day old, not ten.

### What a pass reports

```json
{ "considered": 6, "archived": 2, "skippedConflicted": 1 }
```

`skippedConflicted` is a card past the window that was left alone because a
conflict is open on it. That is deliberate: slice 3 freezes a conflicted card so
the disagreement gets resolved, and archiving it would remove the user's ability
to do so (research.md R-4). If this number stays above zero, there is a conflict
waiting to be decided.

### Check the history

```bash
curl -s localhost:3000/api/cards/<uuid>/events
```

**Expect** a row with `actor: "system"` and `kind: "archived"` — nobody moved
that card; the board did it on its own, and the record says so (FR-317).

---

## The archive

1. Open **Archive** from the top navigation.

**Expect:** the last 30 days, grouped by completion date, newest first. Days
with nothing are omitted rather than shown empty.

2. Pick a range with nothing in it.

**Expect:** a plain statement that the range holds no cards (FR-323) — not a
blank panel.

3. Open an archived Jira-sourced card that left the query in slice 2.

**Expect:** title, tags, source, completion date, a working link to the issue,
and **the recorded reason it left** (FR-322). The reason matters: "I finished
it" and "it was reassigned away from me" look identical in an archive that
does not say.

---

## Summaries

1. Move a few cards today, and make sure something sits in In Progress and
   something in Blocked.
2. Open **Summary**.

**Expect:** three distinguishable groups — what moved, what is in progress, what
is blocked (FR-324). Jira-sourced entries carry their issue key (FR-327).

3. Look for movements marked as coming from Jira.

Anything a sync caused is marked (FR-328). This exists so you do not read out a
transition a teammate made as your own progress — the failure is small,
embarrassing, and entirely avoidable.

4. Press **Copy**.

**Expect:** plain text on the clipboard, ready to paste into a chat (FR-329).
That is the whole interaction budget: **open, copy** — SC-306 allows exactly
two.

5. Switch to **Weekly**.

**Expect:** the last seven calendar days, including cards that were completed
and have since been archived (FR-326). A week's work that vanished from the
report because it was tidied away would make the weekly summary useless for the
one conversation it exists for.

6. Ask for a period in which nothing happened.

**Expect:** a summary that says there was no activity (FR-330) — not three empty
headings, which reads like a bug.

---

## A note on timezone

Daily and weekly periods are calendar days in **the container's** local time,
matching the rule due dates already use. The container runs UTC unless `TZ` is
set in `docker-compose.yml`.

If your `TZ` is wrong, "yesterday" ends at the wrong hour and the standup
summary quietly omits your evening's work. Set it to your own zone — this slice
makes it explicit rather than leaving it to the default (research.md R-7).

```yaml
services:
  app:
    environment:
      TZ: America/New_York
```
