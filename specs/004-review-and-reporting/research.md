# Phase 0 research — 004-review-and-reporting

Decisions taken before design, each with what was rejected and why. Nothing
here is a preference; every entry changed the shape of the plan.

---

## R-1. Filtering happens in the browser, over data already loaded

**Decision.** The board fetches every live card as it does today. Filtering is
a pure function applied to that array in the client. No filter reaches the
server; no query changes.

**Why.** Three requirements point the same way and one of them is otherwise
unreachable:

- **FR-311** — filtering must not alter any card's column, position or content.
  A client-side filter cannot alter them; it never issues a write. Server-side
  filtering would satisfy this only by convention, and SC-303 asks for zero
  mutations across the *whole suite*, which is a much easier claim to make
  about code that has no write path at all.
- **SC-301** — under 200ms for a 50-card board. A local array filter is
  microseconds. A round trip is 10–30ms at best and depends on a database that
  may be busy syncing.
- **FR-310** — filters must not survive a reload. Component state dies on
  reload for free. A server-side filter would have to be actively *prevented*
  from persisting, and the natural implementations (query string, saved
  setting) all persist by default.

**Rejected: server-side filtering with a `?q=` parameter.** It buys nothing at
this scale — the BRD's assumption A-4 puts the board at tens of cards — and it
costs the three properties above. It would also make the empty-board case worse:
the client would no longer know whether it was showing nothing because of a
filter or because the board is empty, which FR-308 and SC-309 exist to prevent.

**Rejected: PostgreSQL full-text search.** Solving a problem the board does not
have. Reconsider if the archive ever becomes searchable, which is explicitly out
of scope here.

---

## R-2. "Most recent arrival in Done" is read from the movement history

**Decision.** The window is measured from
`MAX(occurred_at) WHERE to_column_id = 6` for that card, falling back to
`cards.created_at` when no such row exists.

**Why the fallback matters.** A card *created directly in Done* has no arrival
event — slice 1 writes an event only on a column change, never on creation
(FR-028). Without the fallback its arrival time is null, and depending on how
null sorts it would either archive immediately or never. Neither is defensible,
and both would be discovered months later by a user wondering where a card went.

**Why not a `done_since` column on `cards`.** It would have to be maintained by
every writer that moves a card — the move route, the sync's adopt path, the
conflict resolution path — and a single missed writer produces a card that
silently never archives. The history already records exactly this, is written
through one repository (enforced by a unit test since slice 1), and cannot drift
from the moves it describes.

**Cost, accepted.** One aggregate per candidate card at archival time. The
candidate set is "cards currently in Done", which is bounded by what a person
finished recently. An index on `card_events (card_id, to_column_id)` keeps it
flat.

---

## R-3. Archival needs a second kind of history row — and the spec contradiction that exposed

**Decision.** `card_events` gains a `kind` column (`'moved' | 'archived'`), and
its "an event is a real column change" constraint becomes conditional on
`kind = 'moved'`.

**The problem.** FR-317 requires archival to be recorded in the movement history
with the system as actor, and BH-312 verifies exactly that. But a card eligible
for archival is *already in Done* — archival changes `archived_at`, not
`column_id`. The table's constraint is:

```sql
CONSTRAINT card_events_actual_move CHECK (from_column_id <> to_column_id)
```

So the record FR-317 demands cannot be written. This is not a detail that
surfaces in implementation; it is visible from the schema, which is why it is
here rather than in a bug report later.

Slice 2 met the same wall from the other side and stepped around it: its
disappearance archival writes an event only when the card was *not* already in
Done (`jira-card-repository.ts:138`). For slice 4 that condition is false by
definition, so every archival would write nothing at all and BH-312 would fail.

**This contradicted the spec's own Out of Scope**, which at the time read:

> Any change to how movement history is written, which Slices 1 through 3 own.

FR-317 and that exclusion could not both stand. **The plan proceeded on the
reading that FR-317 wins** — it is a numbered requirement with a behavior pathway and a
verification row, while the exclusion is a scope note whose evident intent is
"do not change how *movements* are recorded", which this does not. `kind`
defaults to `'moved'`, so every existing row and every existing writer means
precisely what it meant before.

**Resolved in the spec on 2026-08-27**, rather than left to a reader of this
file. The exclusion now reads "any change to how **movements** are recorded",
and FR-317 states that archival is a distinct kind of record and why. The spec
re-passed verification afterwards. This entry is kept in the past tense on
purpose: the reasoning is still the reason, and a future reader asking "why does
`card_events` have a `kind` column" should find it here.

**Rejected: relaxing the constraint outright.** It encodes something true and
worth keeping — a reorder within a column writes no row (FR-028). Dropping it
to make room for a different kind of row would remove a guard that has nothing
to do with the problem.

**Rejected: a separate `card_archivals` table.** It splits "what happened to
this card" across two tables, so every reader — the archive view, the summary,
the card history endpoint — has to remember to union them. The one that forgets
is the bug.

---

## R-4. A card with an open conflict is never archived

**Decision.** Archival skips any card with an unresolved conflict, however long
it has sat in Done.

**Why.** Slice 3 freezes a conflicted card against movement (FR-227, FR-228) so
that a disagreement between the board and Jira is resolved deliberately rather
than papered over. Archiving one would remove it from the board while the
disagreement stands — and the user would then be unable to do the one thing the
freeze exists to make them do. An automatic process quietly disposing of the
evidence of an unresolved problem is the worst available outcome.

**Was not in the spec; now is.** The spec was written before slice 3 existed
and did not contemplate conflicts and archival meeting, so this began as a
plan-level decision. Left there, the behaviour would have been settled by
whichever code happened to run first. It was raised into the spec on 2026-08-27
as **FR-318a**, with **BH-309a** and **TEST-309a** — which is where a rule about
what the system must never do belongs.

---

## R-5. Archival runs on its own schedule, not on the sync's

**Decision.** A second `Scheduler` instance, with its own interval setting
(`archive.interval_seconds`, default 3600) and its own single-flight guard.

**Why not fold it into the sync.** The sync's cadence is driven by how fresh the
user wants Jira to be — five minutes by default. Archival is a once-a-day-ish
concern operating on a seven-day window; running it every five minutes is 288
pointless passes a day. More importantly, the sync must not be made to depend on
anything that is not about Jira: a slow or failing archival pass would then
delay or fail a sync, and the board's freshness would degrade for a reason that
has nothing to do with Jira. They are separate concerns with separate failure
modes, and the `Scheduler` class already exists precisely so a second one costs
almost nothing.

**Why not a cron container.** A third container for one periodic function, in a
two-container deployment chosen for its smallness (BRD D-2). The scheduler in
process is already proven by slice 2.

---

## R-6. The summary's plain text is produced on the server

**Decision.** `GET /api/summary?period=daily|weekly` returns both a structured
summary *and* the rendered plain text. The client displays the structure and
copies the text.

**Why.** FR-329 requires the copied result to be plain text suitable for
pasting, and BH-320/TEST-320 verify it. If the client renders the text, the
thing under test is React markup and a clipboard API, and the acceptance suite —
which speaks HTTP — cannot see the text at all. Rendering it server-side makes
the exact bytes the user will paste an assertable value in a cucumber step.

The renderer itself is a pure function in `src/domain/summary-text.ts`, so its
output is also unit-testable line by line without a database.

**Rejected: returning only text.** The interface needs structure to lay out
three distinguishable groups (FR-324, BH-316); re-parsing prose to draw a UI is
absurd. Both are returned; the text is derived from the structure, so they
cannot disagree.

---

## R-7. Periods are calendar days in the container's local timezone

**Decision.** "Yesterday" and "the last seven days" are calendar boundaries
computed with `toCalendarDate` from `src/domain/overdue.ts` — the same function
that decides whether a card is overdue.

**Why.** Slice 1 already made this choice for due dates and stated the reason:
UTC would shift the boundary, so a card due today could read as overdue at 7pm.
A summary has the same hazard in a sharper form — a standup update that omits
what you did yesterday evening because UTC had already rolled over is wrong in a
way the user notices immediately and cannot explain.

**Consequence, stated plainly.** The container runs UTC unless `TZ` is set, and
`docker-compose.yml` does not set it. For a user in US Eastern, "yesterday"
currently ends at 8pm local. **This is a real defect for this user**, whose
standup is the motivating use case (M-6).

**Action:** set `TZ` in `docker-compose.yml` and document it. Captured as a task
rather than left as a footnote, because the alternative is shipping a standup
summary that is quietly wrong for five hours of every day.

---

## R-8. The archive is read by date range with no pagination

**Decision.** `GET /api/archive?from=&to=` returns every archived card in the
range, grouped by completion date.

**Why.** The spec's own assumption: tens of cards a month. A year is a few
hundred rows of title, tags and a link. Pagination is machinery for a problem
this will not have for years, and it would complicate the one thing the view
must get right — grouping by date (FR-320).

**Bounded anyway.** The range is required, not optional, so there is no request
that means "everything ever". A missing range defaults to the last 30 days.
