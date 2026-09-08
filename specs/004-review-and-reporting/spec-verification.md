# Spec Verification — 004-review-and-reporting

**Branch:** 004-review-and-reporting
**When:** 2026-08-27T01:24:48Z
**Result:** PASS

Second verification. The first passed on 2026-08-26; this one re-runs the gate
after `/speckit.plan` surfaced a contradiction inside the spec and the spec was
amended to resolve it.

## Blocking checks

- [PASS] B1. User stories present — 5 stories.
- [PASS] B2. Stories prioritized — P1, P1, P2, P2, P3.
- [PASS] B3. Acceptance Scenarios well-formed — every story carries
  Given/When/Then scenarios; 25 in total.
- [PASS] B4. No unresolved clarifications — zero markers. The two questions the
  amendment answered are recorded under Clarifications, Session 2026-08-27,
  rather than left as markers.
- [PASS] B5. Success Criteria measurable — all nine carry a number or an
  explicit zero/100% condition. SC-304 was reworded by the amendment and still
  does: "100% … and zero … excepting cards with an unresolved conflict, of
  which zero are archived at any age."
- [PASS] B6. Spec is technology-agnostic — no language, framework, library,
  file path, class or table name appears. Checked again after the amendment,
  which was the risk: R-3's resolution is about a database column, and the
  spec states it as "a distinct kind of history record" without naming the
  column, the table or the type.
- [PASS] B7. Behavior Pathways traceability — 23 pathways, 23 verification
  rows, one-to-one. Every `TEST-###` pins a `BH-###` that exists; no pathway
  is unpinned and no row is orphaned. Verified by extracting both lists and
  comparing them, not by counting.

  *(This check auto-passes at STANDARD tier and was run in full anyway: the
  spec authors these pathways deliberately, so a broken chain is worth
  catching whether or not the tier demands it.)*

## Non-blocking warnings

- [PASS] W1. Stories independently testable — each story's Independent Test
  names its own setup. US4 (weekly) reads on US2's archive, but states its own
  fixture rather than depending on US2 having run.
- [PASS] W2. Out-of-scope section present — and it is the section the
  amendment narrowed.
- [PASS] W3. No implementation phrasing — the amendment was drafted against
  this check specifically, since the change it records originated in a
  technical constraint. It states what must be true, not how.

## What the amendment changed

Recorded here because a passing re-verification is only meaningful alongside
what it re-verified.

1. **Out of Scope narrowed** from "any change to how movement history is
   written" to "any change to how **movements** are recorded", with an explicit
   note that a distinct kind of record for archival is in scope.

   *Why:* FR-317 requires archival to appear in the movement history, and a
   card eligible for archival is already in Done — so the record it demands is
   one the history could not hold. FR-317 and the old exclusion could not both
   stand. See plan.md's "Spec contradiction to resolve" and research.md R-3.

2. **FR-317 extended** with one sentence saying archival is a distinct kind of
   record from a movement, and why: an archived card does not change column.

3. **FR-318a added** — a card with an unresolved conflict is never archived,
   at any age.

   *Why:* the spec was written before Slice 3 existed and does not contemplate
   conflicts and archival meeting. Slice 3 freezes a conflicted card so the
   disagreement is resolved deliberately; archiving it would dispose of the
   evidence and leave the user unable to act. Left implicit, this would have
   been decided by whichever code ran first.

4. **BH-309a and TEST-309a added** to pin FR-318a, keeping the chain complete.

5. **SC-304 reworded** to carve out the conflicted case, so the success
   criterion and FR-318a do not contradict each other the way FR-317 and Out
   of Scope did.

## Next steps

Spec is ready. `/speckit.plan` has already run against the pre-amendment spec;
plan.md's flagged contradiction is now resolved in the spec, and plan.md's own
"Spec contradiction to resolve" section should be updated to record that rather
than to raise it. Then `/speckit.tasks`.
