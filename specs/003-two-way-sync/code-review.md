# Code review — 003-two-way-sync

**Branch:** main
**Base:** 2a5208f (last commit of slice 2)
**Reviewer:** claude-opus-5[1m]
**When:** 2026-08-27T00:08:25Z
**Diff stats:**  107 files changed, 5199 insertions(+), 876 deletions(-)

## Summary

Slice 3 makes the board write to Jira: dragging a Jira card transitions the
issue, changes made in Jira are adopted on the next sync, and when both sides
moved the board raises a conflict and freezes the card until the user decides.
The write path itself is tight — only a transition id is ever sent, writes are
never retried, and no standard-suite test reaches the network. The findings
below are about how failures are **named** to the user and about three claims
in the Architecture Review that the code does not actually make good on.

**Recommendation: fix-then-ship.** One blocking finding, five non-blocking —
plus one more found while fixing them (finding 7). **All seven are now
addressed**; see "Resolution" at the end of each and the summary below.

## Blocking findings

1. `src/server/sync/transition-service.ts:84-92` — **Spec alignment /
   Architecture Review drift** — every Jira failure that is not a refusal
   (connectivity, rejected credentials, rate limit) is converted to
   `databaseUnavailable()`, so a user whose token has expired mid-drag is told
   the *database* is unavailable. FR-213 requires a **connectivity failure**
   reported distinctly, and plan.md's error-handling row names
   `JiraUnreachable` as one of four typed causes. Slice 2 was careful to
   separate credentials from connectivity in the sync status; the push path
   discards that distinction at the last step. Worse, the acceptance suite
   enshrines it: `tests/features/push-refusals.feature:41` asserts
   `DATABASE_UNAVAILABLE` for an unreachable Jira, so the wrong behaviour is
   currently protected by a passing test.
   **Suggested fix:** add `JIRA_UNREACHABLE` (and keep the existing
   credentials distinction — `JIRA_CREDENTIALS_REJECTED` — rather than folding
   it in) to `ProblemCode`, map `JiraError.kind` onto them in
   `asDomainError`, and update the feature file to assert the new codes. The
   client's move-error path already renders whatever detail it is given, so no
   UI change is needed beyond the wording.

**Resolution (1):** `JIRA_UNREACHABLE` (503) and `JIRA_CREDENTIALS_REJECTED`
(502) added to `ProblemCode` and mapped from `JiraError.kind`.
`push-refusals.feature` now asserts the new codes and gained a scenario for a
credential rejected mid-drag, which had no coverage at all.

## Non-blocking findings

2. `src/server/sync/transition-service.ts:70-73` — **Design / premature
   abstraction** — `statusReachable()` has no caller anywhere in `src` or
   `tests`. It duplicates the lookup `moveTo` already performs, and an unused
   public method on a service that talks to a live system is an invitation to
   call it from somewhere that should not.
   **Suggested fix:** delete it. If a mapping validator later needs it (see
   finding 4), reintroduce it then, with the caller.

3. `src/server/repositories/mapping-repository.ts:52-78` and
   `src/server/routes/mappings.ts:7-11` — **Error handling / destructive
   input** — `PUT /api/settings/mappings` deletes every row and reinserts from
   the payload, but the schema only requires `.min(1)`. A client sending one
   entry silently erases the other five columns' mappings. The current editor
   always sends all six, so nothing is broken today — the hazard is that
   nothing enforces it.
   **Suggested fix:** require the payload to name every column
   (`.length(6)`, or validate the set of `columnId`s against `columns`) and
   refuse a partial one with `VALIDATION_FAILED`. Full replacement is the
   right semantics for a PUT on a collection; it should just be impossible to
   do it accidentally.

4. `plan.md:85` — **Architecture Review drift** — the input-validation row
   states the mapping "is validated against the statuses Jira reports for the
   project, not free text — an unmatchable mapping is refused at configuration
   time". It is not: the API accepts any string, and the guarantee exists only
   in the dropdown the editor renders. FR-202 (statuses *presented* rather
   than typed) is satisfied, so this is the plan overstating the code rather
   than the code missing a requirement — but the API is the boundary, and a
   guarantee that lives only in the client is not a guarantee.
   **Suggested fix:** either validate the submitted status names against
   `listStatuses()` in the route when Jira is configured, or soften the plan
   row to say the *editor* offers only reported statuses and a stale mapping is
   caught at move time. Prefer the first.

5. `plan.md:87` — **Architecture Review drift** — the observability row
   claims "`sync_runs` gains conflict counts" and "every write attempt is
   logged with its issue key and outcome". Neither exists: `sync_runs` has no
   conflict column, and there is no log statement anywhere on the push path.
   A refused push currently leaves no server-side trace at all, which is the
   one place an operator would look after a user reports a move that did not
   take.
   **Suggested fix:** log one line per transition attempt at info
   (issue key, target status, outcome — never the credential), and add a
   `conflicts_raised` count to `sync_runs`. Both are small; the row was right
   to ask for them.

6. `src/server/routes/conflicts.ts:38-39` — **Input validation** — the path
   parameter is passed through `Number()` with no check, so
   `POST /api/conflicts/abc/resolve` produces `NaN`, misses the lookup, and
   returns "Card NaN not found" — a 404 that names a card, for a malformed
   conflict id.
   **Suggested fix:** parse the parameter with `z.coerce.number().int()` and
   return `VALIDATION_FAILED` on a non-numeric id.

7. `src/server/jira/jira-adapter.ts:29-37` — **Documentation** — found while
   fixing the above. The file's header still read "Jira Cloud REST, read only.
   There is no request in this file that is not a GET" — written in slice 2 and
   false since the transitions POST was added to the same file. A comment that
   confidently states the opposite of the code is worse than no comment: it is
   exactly what a reader checking "can this thing write?" would trust.
   **Suggested fix:** rewrite the header to say what is true now — reads
   anything, writes exactly one thing.

## Resolutions

All seven findings are fixed in the commit that follows this review.

1. `JIRA_UNREACHABLE` (503) and `JIRA_CREDENTIALS_REJECTED` (502) added to
   `ProblemCode` and mapped from `JiraError.kind`. `push-refusals.feature`
   asserts the new codes and gained a scenario for a credential rejected
   mid-drag, which had no coverage at all.
2. `statusReachable` deleted.
3. The mapping schema requires exactly six entries with six distinct column
   ids; a partial payload is refused with `VALIDATION_FAILED`. The acceptance
   step helper had to be corrected to send the full set, which is itself the
   evidence the hazard was reachable.
4. The route validates submitted status names against `listStatuses()` when
   Jira is configured, and skips the check when it is not — there is nothing to
   check against offline, and refusing every mapping would leave the board
   unconfigurable.
5. `TransitionService` gained a `WriteLog` callback, called once per attempt
   with the issue key, target status and outcome — never the credential —
   wired to the Fastify logger. Migration 011 adds `sync_runs.conflicts_raised`,
   counted only for conflicts a run actually raised, not for ones it inherited,
   so one disagreement does not look like an epidemic.
6. The conflict id is parsed with `z.coerce.number().int().positive()`; a
   malformed id is `VALIDATION_FAILED` rather than a 404 naming card "NaN".
7. The adapter header rewritten.

After the fixes: 132 unit, 105 acceptance scenarios (620 steps), 16 contract,
33 browser, 11 ops — all passing. Lint and typecheck clean.

## Verified, not findings

- **Only status is ever written.** `jira-adapter.ts` sends exactly
  `{transition:{id}}`; `tests/contract/jira-adapter.test.ts` asserts the
  serialized body equals that object, and `tests/unit/no-jira-writes.test.ts`
  asserts the adapter source carries no other write path. An added field would
  fail both.
- **Writes are never retried.** `transitionIssue` has no retry loop, unlike
  the read path's backoff, and the reasoning is recorded in
  `docs/external-interactions.md`.
- **No standard-suite test contacts live Jira (NFR-23).** The contract suite
  runs against `undici` `MockAgent` with `disableNetConnect()`, and the fetch
  implementation is injected rather than global — the failure mode that bit
  this project once, where `setGlobalDispatcher` did not reach Node's bundled
  fetch and tests silently hit Atlassian, cannot recur. The only real Jira
  hostname anywhere in the suites is in comments recording fixture provenance.
- **Transition matched on destination status, not transition name.** Enforced
  in `transition-service.ts`, and the contract test uses the real shape where
  "To Development" leads to "Development" and "Pass" leads to "PO Approve".
- **The conflict freeze survives Jira's absence.** Checked at the top of
  `CardService.move` before the port is consulted; `conflict-freeze.test.ts`
  constructs the service with no Jira at all. This was a live defect found
  during review of the E2E work and is fixed in `c037877`.

## Skill output

- `review` skill: unavailable in this session.
- `security-review` skill: unavailable in this session. Performed manually:
  no credential in the diff (the only token-shaped string is the synthetic
  `ATATT-this-is-the-secret-value-nobody-may-ever-see` in
  `credential-redaction.test.ts`, which exists to assert redaction), `.env`
  and `certs/` gitignored, `npm audit` reports 9 findings — 2 low, 7
  moderate, none Critical or High.

## Outstanding from the task list

- **T353**, the live round-trip against real Jira on the scratch issue
  PROJ-44, is not run. It is the only task in the project that changes data
  other people can see and is excluded from every suite by design.
- **TEST-225** ("full-matrix run ends with no silently divergent card") is not
  recorded as passed. The reconciler's input matrix is covered by property
  tests, but no end-to-end run exercises every sync outcome against a
  live-shaped system, which is what BH-225 asks for.

## PR description scaffold

```markdown
## What changed

The board now writes to Jira. Dragging a Jira-sourced card into a mapped
column transitions the issue to that status — and only the status; the
request body carries nothing else. Changes made in Jira are adopted onto the
board on the next sync. When both sides moved and disagree, the board raises a
conflict, freezes the card, and asks the user to choose; it never picks a
winner.

- Column-to-status mapping, editable in settings, chosen from the statuses
  Jira reports. An unmapped column (Blocked ships this way) is local-only.
- A pure `reconcile()` deciding one of four outcomes from three inputs, with
  the full input matrix covered by property tests.
- Conflict detection, a badge on the card face, and a side-by-side resolution
  screen with two outcomes and no default.
- Writes are never retried: a transition that failed may or may not have
  applied, and repeating it risks a second, unwanted move.

## Reviewed

`/speckit.review` against spec.md, plan.md and the constitution: 1 blocking
finding (Jira failures reported as `DATABASE_UNAVAILABLE`), 5 non-blocking.
See `specs/003-two-way-sync/code-review.md`.

## Not tested

- No live Jira round-trip. Every suite runs against a fake or a mocked
  transport by design (NFR-23); the one live check is a separate, explicitly
  agreed step.
- No load or concurrency testing beyond the single-flight sync lock.
- "Persists across restart" is verified as persisted in PostgreSQL and re-read,
  not by restarting the container inside a test.

## Deferred

- Slice 4: search and filtering, the dated archive, standup and weekly
  summaries.
```
