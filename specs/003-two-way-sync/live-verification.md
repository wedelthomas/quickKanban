# Live verification — T353

**When:** 2026-08-27
**Against:** tsgjira.atlassian.net, the user's real Jira
**Scratch issue:** ABSARCH-44 — the only issue any write was aimed at
**Agreed:** explicitly, before the first write

Excluded from every automated suite, by design. This is the only step in the
project that changes data other people can see, so it is run deliberately and
never as a side effect of `npm test`.

## What was checked

| # | Check | Result |
|---|---|---|
| 1 | Dragging a card transitions the real issue | Open → Development ✅ |
| 2 | **Only** the status changed | Summary, description, assignee, priority (`Low`, not the card's `medium`), labels, due date all unchanged ✅ |
| 3 | A change made in Jira is adopted by the board | Development → Open in Jira; sync moved the card In Progress → Backlog ✅ |
| 4 | The adoption is attributed to sync, not the user | History: `2 → 1 by sync` ✅ |
| 5 | Board-driven round trip | Backlog → In Progress → Backlog, both legs transitioned in Jira ✅ |
| 6 | The issue ends where it started | `Open`, every other field untouched ✅ |
| 7 | No other issue was touched | 12 issues seen, 0 created, 0 archived; write log names only ABSARCH-44 ✅ |

## What real Jira told us that no fixture could

**The workflow is narrow.** From `Development`, the only legal destinations are
`Done`, `Open` and `Cancelled` — **not** `Test`. A board that assumed any
column was reachable from any other would refuse constantly and look broken.

**Transition names are not destination names.** `To Backlog` leads to `Open`.
Matching on the transition's own name would have failed here.

## The defect this found

**A sync attempted an unrequested write to a real issue.**

The write log — added an hour earlier as a non-blocking review finding — caught
a second entry nobody asked for:

```
{"issueKey":"PMO-11976","targetStatus":"Development","outcome":"refused","reason":"NO_LEGAL_TRANSITION"}
```

PMO-11976 is real work, and nobody had dragged it.

**Cause.** Two independent mappings had grown up beside each other. Slice 2
places an imported issue by a hardcoded status-name table, where both
`In Progress` and `Development` land in the In Progress column. Slice 3's
reconciler asked a different question — "what status does this column mean?" —
and a column can mean exactly one status. So for an issue whose real status is
`In Progress`, the reconciler compared `Development` against `In Progress`,
found them different, and concluded **the user had moved the card**.

It then tried to transition a live issue. It failed only because PMO's
workflow has no `Development` status. On a project that had one, the board
would have silently rewritten the status of the user's real work on the first
sync after import — the exact failure this whole slice exists to prevent.

**Fix.** "The board changed" now means the card is not in the column the last
sync left it in — column identity, not a comparison of two names for the same
thing. `jira_links.synced_column_id` (migration 012) records it; a null counts
as unmoved, so upgrading an existing board pushes nothing.

**Guarded by** three cases in `tests/unit/reconcile.test.ts` and one acceptance
scenario in `unmapped-columns.feature`. The scenario was mutation-tested: it
fails against the old logic and passes against the new, so it is not vacuous.

**Re-verified live** after the fix: two full syncs over all 12 assigned issues,
with `synced_column_id` populated, attempted **zero** writes — while a
deliberate drag still transitioned correctly in both directions.

## Note

This is the second time a defect of real consequence has been found by going to
the real system rather than to a fixture — the first being the `/search`
endpoint that had been removed and answered 410 Gone. Both were invisible to a
suite that was entirely green.
