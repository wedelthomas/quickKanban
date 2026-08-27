# Code review — 004-review-and-reporting

**Branch:** 004-review-and-reporting
**Base:** 115629f (last commit of slice 3)
**Reviewer:** claude-opus-5[1m]
**When:** 2026-08-27T03:31:18Z
**Diff stats:**  73 files changed, 6661 insertions(+), 281 deletions(-)

## Summary

Slice 4 makes the board's accumulated record useful: filter in place, archive
finished work automatically, browse the archive by date, and generate the
standup update. The read paths are clean — filtering issues no request at all
and the summary and archive paths contain no write statement, so three of the
spec's zero-mutation criteria hold structurally rather than by convention.

The archival pass is where the risk is, being the first thing here that changes
the board unattended, and that is where the findings are.

**Recommendation: fix-then-ship.** One blocking finding, four non-blocking.
**All five are now addressed** — see Resolutions below.

## Blocking findings

1. `src/server/repositories/archive-run-repository.ts:44-49` —
   **Failure modes / operational** — **an interrupted pass disables archival
   permanently.** `archive_runs` carries the same single-flight partial unique
   index as `sync_runs`, but not `sync_runs`'s recovery. Slice 2 built
   `abandonUnfinished()` for exactly this and calls it at startup
   (`index.ts:34`); this table copied the shape and not the repair.

   A crash, a `docker compose down`, or a container OOM mid-pass leaves
   `finished_at` null forever. Every later `start()` then violates
   `archive_runs_one_in_flight` and throws — **and a restart does not clear
   it**, because nothing looks.

   **Reproduced**, not theorised: inserting one unfinished row and calling
   `POST /api/archive/run` returns `500 INTERNAL_ERROR`, and still does after
   `docker compose restart`. Finished work would silently stop leaving the
   board, and the only symptom is an opaque 500 nobody is watching for.

   **Suggested fix:** give `ArchiveRunRepository` an `abandonUnfinished()`
   that marks orphaned rows `failed`, and call it at startup beside the sync's.
   Add an ops test that leaves a row unfinished, restarts, and asserts the next
   pass succeeds — the reproduction above, automated.

## Non-blocking findings

2. `src/server/services/archival-service.ts:64` — **Design / misleading
   argument** — `shouldArchive` is called with `conflicted: false` hardcoded,
   because the loop already `continue`d on a conflicted candidate ten lines
   above. The pure guard in `archival.ts` — the one with four unit tests
   against it — is therefore **never exercised by the production path**, and the
   literal `false` asserts something the caller has not checked at that point.

   Two guards for one rule is defensible; lying to the second one is not.

   **Suggested fix:** pass `candidate.conflicted` through, and keep the early
   branch for counting only. The pure function then genuinely decides, and its
   tests are testing the code that runs.

3. `src/server/services/archival-service.ts:49-54` — **Correctness of a
   reported number** — `skippedConflicted` counts **every** conflicted card in
   Done, including ones well inside the window that were never due. The number
   is meant to answer "was something due that I refused", so a card conflicted
   and finished an hour ago inflates it, and a number that is chronically
   non-zero for benign reasons is one nobody reads.

   **Suggested fix:** count only candidates that would otherwise have been
   archived — evaluate the window first, then attribute the skip.

4. `src/server/services/archive-view-service.ts:38-46` — **Input validation** —
   a `to` date arbitrarily far in the future is accepted, so
   `?to=9999-12-31` is a valid request. Harmless today (it returns everything
   since `from`) and it is a read, but the endpoint claims a bounded range and
   this is not one.

   **Suggested fix:** clamp `to` to today, or refuse a future date. Clamping is
   friendlier and matches what the user means.

5. `plan.md` Architecture Review, "Concurrent writes / race conditions" —
   **Reconciliation** — the row promises a re-check under
   `SELECT … FOR UPDATE`, and `ArchiveRepository.archive()` delivers it. But
   the row does not mention the case that actually bit: **an interrupted pass**,
   which is a liveness failure rather than a race. Finding 1 exists partly
   because the table asked about concurrency and not about interruption.

   **Suggested fix:** add an "Interrupted / abandoned work" line to that row
   naming the startup sweep, so the next feature that copies this table shape
   copies the recovery too.

## Resolutions

All five are fixed in the commit that follows this review.

1. `ArchiveRunRepository.abandonUnfinished()` added and called at startup beside
   the sync's. Orphaned rows are marked **failed rather than deleted** — a pass
   that died is something an operator may want to see, and recording what
   happened is what the table is for. Guarded by two ops tests that leave a row
   unfinished, restart the container, and assert both that the next pass
   succeeds and that the abandoned row survives as `failed`. That is the manual
   reproduction from finding 1, automated.

2. `shouldArchive` is now passed `candidate.conflicted` rather than a hardcoded
   `false`, so the pure guard genuinely decides and its four unit tests are
   testing the code that runs.

3. `skippedConflicted` counts a card only when the conflict is the **reason** —
   the service asks the pure function a second time with `conflicted: false` to
   find out whether it would otherwise have been archived. A new acceptance
   scenario covers a conflicted card still inside the window and asserts the
   count stays zero; it was mutation-tested against the old behaviour and fails
   against it.

4. A `to` date in the future is **clamped to today** rather than refused.
   Nothing is archived tomorrow, so a future date is a harmless way of saying
   "up to now" and refusing it would be pedantry — but the endpoint promises a
   bounded range and `to=9999-12-31` was not one.

5. plan.md's Architecture Review gains an **"Interrupted / abandoned work"**
   row. Finding 1 existed precisely because the table asked about concurrency
   and not about interruption, and the next feature to copy this table shape
   should be prompted to copy the recovery too.

After the fixes: 192 unit, 129 acceptance scenarios (771 steps), 16 contract,
47 browser, 16 ops — all passing. Lint and typecheck clean.

## Verified, not findings

- **Filtering mutates nothing.** There is no filter endpoint — the client
  filters an array it already holds — so there is no code path that could write.
  `filtering.feature` asserts it at the API boundary anyway, and was
  mutation-tested against a server-side filter bolted onto `GET /api/board`.
- **Summaries mutate nothing.** `grep` over the summary route, service and
  repository finds no `INSERT`, `UPDATE` or `DELETE`. Twenty consecutive
  generations are asserted to leave the board and the whole of `card_events`
  byte-identical.
- **Archived cards are never deleted.** No `DELETE FROM cards` exists anywhere
  in `src/server`. Archival sets `archived_at`; the row stays.
- **A conflicted card is never archived.** Guarded in the service and in the
  pure function (see finding 2 about the second one being bypassed), asserted
  in unit tests, in an acceptance scenario, and confirmed against a live board
  with a 90-day-old conflicted card.
- **Archival is observable.** `archive_runs` records considered / archived /
  skipped per pass, and every archived card is logged with its id and age. This
  is the precaution slice 3's live check proved the value of.
- **Timezone.** Verified inside the running container: Node resolves the
  configured zone, and at the time of review the local date was 26 Aug while UTC
  had already reached the 27th. Three ops tests guard it.
- **The `kind` column changed nothing existing.** It defaults to `'moved'`,
  the constraint was scoped rather than weakened, and slice 1–3 tests all pass
  untouched.

## Skill output

- `review` skill: unavailable in this session.
- `security-review` skill: unavailable in this session. Performed manually:
  no new credential surface, no new outbound call, no new dependency; the one
  new user input (a date range) is parsed with Zod at the route and validated in
  the service; `npm audit` reports 9 findings, 2 low and 7 moderate, none
  Critical or High.

## PR description scaffold

```markdown
## What changed

Slice 4 turns the board's accumulated record into something useful.

- **Filter in place** by text, tag, priority, source or overdue. `/` reaches
  it, `Escape` clears it, all six columns stay visible, and a filter matching
  nothing says so rather than looking like an empty board.
- **Archival**: work that has sat in Done past a configurable window (7 days)
  leaves the board on its own — retained, never deleted, recorded in history
  with the system as actor. A conflicted card is never taken, at any age.
- **The archive**, browsable by date range and grouped by completion day, with
  the reason a card left where one was recorded.
- **Summaries**, daily and weekly, copyable as plain text, with movements that
  came from Jira marked as such.

No new external touchpoint and no new dependency.

## Reviewed

`/speckit.review`: 1 blocking finding (an interrupted archival pass disabled
archival permanently — reproduced, then fixed), 4 non-blocking. See
`specs/004-review-and-reporting/code-review.md`.

## Not tested

- No load testing. The archive is assumed to grow by tens of cards a month.
- Filter latency (SC-301) is met structurally rather than measured — the filter
  is an array pass in the browser over data already loaded.
- The archival scheduler's hourly cadence is exercised by driving
  `POST /api/archive/run` directly rather than by waiting an hour.
```
