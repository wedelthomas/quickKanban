# Analysis — 004-review-and-reporting

**When:** 2026-08-27T01:29:57Z
**Artifacts:** spec.md (amended 2026-08-27), plan.md, tasks.md, research.md,
data-model.md, contracts/api.md
**Result:** **PASS** — 0 blocking, 4 non-blocking, all four fixed in the same
change as this file.

## Requirement coverage

All **32** functional requirements (FR-301…FR-331 plus FR-318a) have at least
one covering task. Walked individually, not sampled.

All **23** behavior pathways (BH-301…BH-322 including BH-309a) are named by a
task, and all **23** verification rows pin a pathway that exists.

All **9** success criteria map to a verification task (T461), with SC-302's
combination matrix and SC-303/SC-308's zero-mutation claims called out
individually because they are claims about the whole suite rather than about one
behaviour.

## Test Strategy alignment

All **12** test files named in plan.md have a task. Tests precede implementation
in all five story phases — verified structurally: every phase has a
"Tests (must fail first)" heading before its "Implementation" heading.

One file — `tests/features/steps/reporting.steps.ts` — was missing from the
first draft of tasks.md and was added as T421a before this analysis ran. Worth
recording rather than quietly fixing: **the identical gap in slice 3 meant
`mapping-settings.feature` was never written**, and BH-223/BH-224 went
unverified until the closing polish phase caught it. Twelve named, eleven
covered, is a shape to look for.

## Architecture Review gate

All **22** rows carry a Decision or a reasoned N/A. No empty cell, no bare N/A.

No `dependency-manifest.md` exists, and the Cross-repo row reads
`N/A — no dependency manifest (single-codebase feature)`, which is the form the
gate expects.

## Scope creep

No task implements behaviour untied to an FR or pathway. Two tasks deserve
explicit justification, since neither traces to an FR:

- **T402 (set `TZ`)** — not required by any FR, but every period boundary in
  this slice is a local calendar day (R-7), and the container defaults to UTC.
  Without it the daily summary silently omits the user's evening work in exactly
  the hours before the standup it serves. This is correcting a latent defect the
  slice exposes, not new scope.
- **T458 (record that this slice adds no touchpoint)** — the External
  Interactions Register is only trustworthy if the *absence* of an entry is a
  checked claim rather than an omission.

## Non-blocking findings

All four are fixed in the same change as this file; recorded because the fix is
less interesting than the pattern.

1. **FR traceability was unverifiable mechanically.** Only 11 of 32 FRs were
   cited by number in tasks.md. Every FR did have a covering task — confirmed by
   walking them by hand — but "confirmed by walking them by hand" is exactly the
   check that stops happening under time pressure.
   **Fixed:** tasks.md gains an explicit FR → task traceability table.

2. **Pathway ranges hide their members.** Five pathways (BH-302, BH-303,
   BH-306, BH-307, BH-311) appeared only inside ellipsis ranges like
   "BH-301…BH-304", so a search for any one of them returns nothing. Each *was*
   covered; none could be shown to be.
   **Fixed:** ranges expanded to explicit lists in every task.

3. **research.md R-4 was made stale by the amendment.** It says the
   never-archive-a-conflicted-card rule is "not stated in the spec" and "a
   plan-level decision". That was true when written and false since the
   amendment made it FR-318a with BH-309a and TEST-309a. A research note that
   describes a decision as un-ratified after it has been ratified sends the next
   reader looking for a gap that was already closed.
   **Fixed:** R-4 records the outcome.

4. **research.md R-3 still speaks in the future tense** about a contradiction
   that has since been resolved — "should be resolved in the spec", "flagged for
   /speckit.analyze". Same class of staleness.
   **Fixed:** R-3 records how it was resolved and when.

## Post-amendment consistency

The spec was amended *after* planning, so each downstream artifact was
re-checked against the amended text rather than the original:

| Artifact | Reflects the amendment? |
|---|---|
| plan.md — Test Strategy coverage target | ✅ 23 pathways, including BH-309a |
| plan.md — archival.feature row | ✅ names BH-309a |
| plan.md — contradiction section | ✅ records the resolution rather than raising it |
| plan.md — Summary paragraph | ✅ past tense, points at the amendment |
| plan.md — Complexity Tracking | ✅ the `kind` column entry stands; it is a real deviation whether or not the spec now permits it |
| tasks.md — T419, T421, T427 | ✅ TEST-309a, BH-309a and FR-318a all named |
| research.md R-3, R-4 | ⚠️ stale — findings 3 and 4 above, now fixed |
| data-model.md | ✅ never claimed the change was unratified |
| contracts/api.md | ✅ `skippedConflicted` was there from the start |

## Next steps

Cleared for `/speckit.implement`, starting at Phase 1.

One thing to carry in: **T421a exists because plan.md named twelve test files
and the first tasks list covered eleven.** The Story-Complete Review Gate checks
"every test file listed in plan.md for this story exists" — that check is what
would have caught it, one story late.
