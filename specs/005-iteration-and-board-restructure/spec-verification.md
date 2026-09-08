# Spec Verification — 005-iteration-and-board-restructure

**Branch:** 005-iteration-and-board-restructure
**When:** 2026-08-27T04:30:46Z
**Result:** PASS

## Blocking checks
- [PASS] B1. User stories present — six stories
- [PASS] B2. Stories prioritized — P1×2, P2×2, P3×2
- [PASS] B3. Acceptance Scenarios well-formed — all six stories carry Given/When/Then scenarios
- [PASS] B4. No unresolved clarifications — zero markers remain
- [PASS] B5. Success Criteria measurable — SC-401…SC-407 each carry a count, a duration, or an explicit boolean condition
- [PASS] B6. Spec is technology-agnostic — see note below
- [PASS] B7. Behavior Pathways traceability — FULL tier; 32 pathways, 32 verification rows, every pathway pinned and no orphaned test

## Non-blocking warnings
- [PASS] W1. Stories independently testable — each story's scenarios establish their own setup; US5 depends on the iteration existing but states that as given state rather than borrowing another story's outcome
- [PASS] W2. Out-of-scope section present — "Out of Scope for This Feature" lists eight exclusions
- [PASS] W3. No implementation phrasing — requirements are stated as obligations on the system, not as chosen mechanisms

## Re-verification 2 — after the FR-402 correction

Planning established that the Blocked column's record cannot be removed:
`card_events` references every column a card has ever occupied. FR-402 had
asked for outright removal, which was impossible without destroying the
history. FR-402 now states what is achievable (absent from the board, refused
as a move target, holding no cards) and FR-446 states the retention obligation
and why. BH-433 and TEST-433 were added to cover it.

Re-run of every blocking check after that edit: all PASS. FR-401…FR-446 with no
gaps, 33 pathways, 33 verification rows, none orphaned, no clarification
markers, no technology tokens.

## Notes

B6 failed on first pass and was corrected before this record was written. Two
spots in the Clarifications section carried implementation detail:

1. A vendor API surface was named as the means of reading the iteration. Now
   stated as reading the reference board's active sprint, leaving the mechanism
   to the plan.
2. The blocked indicator's colour was given as a hex value alongside a style
   variable name. Now stated as the red the board already reserves for the
   Blocked column, which frees up when that column retires.

Both edits preserve the decisions exactly; only the mechanism naming was
removed. No requirement, pathway or verification row changed.

Retained deliberately: Jira, iteration, sprint, reference board and carry-over
are the business's own vocabulary, used throughout the v1 specs, and are domain
terms rather than technology choices.

## Next steps
Spec is ready for /speckit.plan.
