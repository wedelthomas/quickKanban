# Phase 0 Research — Two-Way Sync

## Decisions

### Match transitions by destination status, not by transition name

**Chosen**: read the issue's available transitions and pick the one whose
`to.name` equals the mapped status.

**Not a preference — forced by the data.** Probed against
tsgjira.atlassian.net on 2026-08-26:

| Transition name | Destination status |
|---|---|
| `Pass` | PO Approve |
| `To Development` | Development |
| `To Backlog` | Open |
| `Failed` | Rework |

A mapping of column → status, matched against the transition's own *name*,
would have failed on all four. It would also have looked correct in any test
whose fixture used a workflow where the two happen to coincide — which is what
most examples use.

### Legal transitions are narrow, so refusal is a first-class path

ABSARCH-11 offers exactly two transitions: *To Development* and *Cancel*. A
board with six columns will therefore refuse most moves on most issues. This
is not an error condition to be surfaced grudgingly; it is ordinary operation,
and the interface has to make it obvious which moves are available rather than
letting the user discover the answer one rejection at a time.

### Writes are not retried

**Chosen**: a failed transition is reported, not retried.

A read that fails can be repeated harmlessly. A write that fails may or may not
have applied — a timeout in particular says nothing about whether Jira acted.
Repeating it risks a second transition the user never asked for, and Jira has
no idempotency key for this operation. The next sync observes the truth and
reconciles from it, which is strictly better than guessing.

### Conflicts are refused, not merged

Carried from the BRD's decision D-3, restated here because it is the single
most consequential choice in the slice. Any automatic resolution either
discards a decision the user deliberately made, or overwrites a change a
teammate deliberately made. Both are silent. Neither is recoverable, because
the user never learns it happened.

The cost is real — a conflicted card is stuck until a human looks at it — and
it is the right cost. A board that quietly disagrees with Jira is exactly the
failure this product exists to prevent.

### Transition screens are out of scope

Some transitions require fields (a resolution, a fix version). This slice
refuses those with a specific reason rather than guessing values or prompting
for them. Completing such a transition remains a job for Jira itself. Rejected
alternatives: sending empty values (Jira may accept and record nonsense), and
building a dynamic form (a large feature serving a case the user has not
reported hitting).

### The reconciler is pure

`reconcile(localColumn, remoteStatus, lastKnownStatus) → Decision`. No clock,
no database, no network, no ordering assumptions.

SC-203 requires every combination of its inputs to be covered. Through the HTTP
layer that is an unreasonable test; as a table it is a dozen lines. This is the
same reasoning that made slice 1's ordering planner pure, and it is the highest
-value application of it in the project — this is the logic that decides
whether to write to a system other people can see.

## Open questions carried forward

**Which statuses the user's columns should map to by default.** Their Jira
exposes Open, Development, Test, PO Approve, Rework, Blocked and Cancelled,
which map onto the board's six columns readably — but the mapping is now
user-editable, so the default only needs to be reasonable rather than right.
