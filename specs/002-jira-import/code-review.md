# Code review — 002-jira-import

**Branch:** 002-jira-import
**Base:** ffd9256be9007f77566a4a878dd03eb0eb61bd96 (end of slice 1)
**Reviewer:** Claude Opus 5 — /speckit.review
**When:** 2026-08-26T23:10:39Z
**Diff stats:**  78 files changed, 4628 insertions(+), 66 deletions(-)
**Risk tier:** FULL

## Summary

Read-only Jira import: assigned issues become cards in the column their status
maps to, refreshed on a schedule and on demand, with the credential provably
contained. Reviewed against 38 functional requirements, 26 behavior pathways,
the Architecture Review table and the constitution.

**Recommendation: fix-then-ship — the one blocking finding is already fixed.**

## Blocking findings

1. **`jira-card-repository.ts` — correctness — a card could be linked to the
   wrong Jira issue.** `cardIdForIssue` located a freshly created card with
   `WHERE jl.issue_key = $1 OR (jl.issue_key IS NULL AND c.source = 'jira')`,
   tie-broken by `ORDER BY created_at DESC`. Inside a transaction PostgreSQL's
   `now()` is the transaction start time, so **every card created in one sync
   shares an identical `created_at`** and the ordering cannot distinguish them.
   It worked only because each card was linked immediately after creation,
   leaving exactly one unlinked Jira card at each lookup — an invariant held by
   the order of statements in the loop, not by the query. Batching the inserts
   or reordering the loop would have silently attached cards to the wrong issue
   keys, and every existing test would still have passed.
   **Fix applied:** `upsertFromJira` now returns the id from its own
   `INSERT … RETURNING`, and `cardIdForIssue` is deleted. Regression test:
   *Several new issues in one sync each link to their own issue*, which asserts
   link counts, distinctness, and that every card carries its own issue's
   summary.

## Non-blocking findings

1. **`sync-run-repository.ts` — a crashed sync could block all later syncs.**
   The partial unique index permits one unfinished run. Every code path in
   `SyncService` finishes its row, and `abandonUnfinished()` clears strays at
   startup — but a process killed between `start()` and the try block would
   leave a row that blocks every subsequent `start()` until restart. Narrow,
   and self-healing on restart. Suggested fix if it ever bites: treat a run
   older than a few minutes with no `finished_at` as abandoned on read.

2. **`index.ts` — the scheduler drives sync through `app.inject`.** This is
   how it shares the routes' lock, which is the right outcome, but calling
   one's own HTTP layer internally is unusual and makes the call stack harder
   to follow. Suggested fix: lift the lock-and-run into a small function both
   the route and the scheduler call, leaving `inject` for tests.

3. **`use-sync.ts` — the browser polls `/api/sync/status` every 10 seconds
   indefinitely.** Cheap (it never touches Jira) and correct for a single-user
   tool, but it is a request every ten seconds for as long as the tab is open.
   Suggested fix if it ever matters: back off when the tab is hidden.

4. **`card-repository.ts` is 318 lines** against a 300-line limit. Two genuine
   seams have already been extracted — the board read model in slice 1, the
   sync-owned operations here. Recorded in Complexity Tracking; a third split
   would produce a class with no independent reason to exist.

5. **Five behaviours were implemented before the tests that pin them**
   (`health`, `overdue`, the disappearance rule, credentials, ordering). Each
   is recorded in its story's gate findings. The pattern is consistent: it
   happens when a later story's behaviour is structurally required by an
   earlier story's code, which means the fix belongs at task-ordering time.

## Process findings

Worth recording because they are about how the work was done, not the code:

- **T201 was marked complete without being done.** No `undici`, no contract
  config, no script, empty directory. Found only because the next task depended
  on it. A checked box is a claim, and this one was false.
- **A commit shipped with a lint error** whose own output printed
  `LINT FAILED`. The check ran; nobody read it.
- **The contract tests initially talked to the real internet.**
  `setGlobalDispatcher` from the standalone `undici` package does not
  intercept Node's built-in `fetch`, which bundles its own copy — so requests
  went to Atlassian's live wildcard domain and returned 404s that looked like
  test-setup mistakes. This violated NFR-23 outright. Fixed by injecting
  `fetch` into the adapter, which makes the dependency explicit rather than
  ambient.
- **The browser suite was flaky against a Jira-configured stack**, because the
  scheduler imported real issues mid-test. It now runs against a stack with
  Jira deliberately unconfigured; the Jira browser tests seed cards directly.
  Chasing that flake also surfaced a real application bug: the board refetched
  on *every* status poll rather than on a new success, so it refetched every
  ten seconds forever and could replace the board under a user mid-drag.

## Skill output

- `review` skill: not invoked separately — this pass covered the same
  dimensions directly against the diff.
- `security-review` skill: not invoked separately. Security was covered here:
  the credential is never persisted, returned, rendered or logged (asserted
  against every adapter failure mode *and* against live traffic); `.env` and
  `certs/` are untracked; no write verb exists in the adapter or on the port;
  all Critical and High CVEs are cleared.

## PR description scaffold

```markdown
## Slice 2 — Jira import

Your assigned Jira issues appear on the board in the column their status maps
to, refreshed at startup, on an interval, and on demand. Jira cards carry their
issue key as a link and refuse local edits to what Jira owns. Issues that leave
your query are archived with a reason rather than deleted, and restored if they
return. Sync status is always visible and a failure never blocks the board.

### Verified
- 107 unit, 11 contract, 73 acceptance scenarios, 29 browser tests
- 26 of 26 behavior pathways green (TestRail runs 51180, 51181)
- Verified against real Jira: 11 issues, each linked to its own key, no duplicates
- Credential absent from logs, board payload, sync status and settings under live traffic
- All Critical and High CVEs cleared

### Not tested
- Jira instances with hundreds of assigned issues; the design assumes tens
- Workflows whose status names fall outside the default mapping — those land in
  Backlog by design, but no real instance was tested against
- Two browser tabs on one board, still explicitly out of scope

### Deferred
- Writing to Jira: dragging a card does not transition the issue (slice 3)
- A user-editable status mapping (slice 3)
- Search, archive and summaries (slice 4)
```
