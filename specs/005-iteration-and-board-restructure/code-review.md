# Code review — 005-iteration-and-board-restructure

**Branch:** 005-iteration-and-board-restructure
**Base:** `392e03b4efe9bf607cd796d048cdd08c122cd825` (merge-base with main)
**Reviewer:** claude-opus-5[1m], reading the diff as an unfamiliar PR
**When:** 2026-08-27T06:51:41Z
**Diff stats:**  125 files changed, 7641 insertions(+), 192 deletions(-)

## Summary

Slice 5 restructures the board's six columns, turns Blocked into a card
attribute, and teaches the board the TradeStation iteration calendar. It adds
one outbound API surface, six migrations, six pure domain functions and roughly
2,900 lines of test.

**Recommendation: fix-then-ship — both blocking findings now fixed (see
Resolution below).** Two blocking findings, both about
traceability and file size rather than behaviour — the behaviour is verified
live and by 1,551 automated assertions. Nothing here suggests the feature is
wrong; the findings are about the diff being reviewable by someone who was not
present while it was written.

## Blocking findings

1. **`tests/features/iteration-items.feature` — Spec alignment — three
   requirements are implemented by the *absence* of code and cite nothing.**
   FR-408 (Iteration Items defaults to unmapped), FR-433 (placement persists)
   and FR-434 (sync never places a card there) appear nowhere outside
   `spec.md`. Tasks T049 and T050 correctly concluded no production change was
   needed — the local-only mechanism carried over from slice 3 — but that makes
   the traceability *weaker*, not stronger: there is no artefact linking those
   requirements to the scenarios that hold them true, so a future refactor of
   the unmapped-column path has nothing pointing at what it would break.
   **Suggested fix:** cite FR-408, FR-433 and FR-434 in
   `tests/features/iteration-items.feature`'s scenario comments, as the other
   features do.

2. **`src/shared/types.ts:1` — Design & structure — crossed 300 lines with no
   justification.** 229 → 304. The constitution's per-task gate says no file
   over 300 lines without one, and this file has no header comment addressing
   its size. It is a shared vocabulary module, which is a defensible reason to
   be long — but the reason should be stated rather than inferred.
   **Suggested fix:** add a one-line justification to the file header, or split
   the settings and iteration types into `src/shared/settings.ts`.

## Non-blocking findings

1. **`src/server/jira/jira-adapter.ts` — Design — 296 → 332 lines.** Already
   carried a justification comment before this slice ("over 300 lines,
   deliberately: one file per adapter") — but that comment is on the *test*
   file, not this one. Worth restating here.

2. **`src/web/settings/SettingsDialog.tsx` — Design — 166 → 302 lines.** Nearly
   doubled. The three fieldsets added are cohesive, but this is now the largest
   component in the web tree and the next addition should extract them.

3. **`src/web/App.css` — Design — 902 → 1061 lines.** Not new, and CSS does not
   decompose the way modules do, but the file has grown in every slice and no
   slice has ever split it.

4. **Architecture Review, `plan.md` — a row is missing.** The table has no row
   for *client-side state and refetch policy*, and this slice added two
   independent fetches (`useAuthor`, `IterationBanner`) that each decide for
   themselves when to reload. That is a genuine cross-cutting concern the table
   does not cover. **Suggested fix:** add the row rather than the code.

5. **`src/server/services/iteration-service.ts:41` — Error handling — a
   swallowed write.** `this.iterations.record(read).catch(() => {})` discards
   the failure silently. It is the right behaviour — a failed cache write must
   not cost the user the iteration just read — but nothing anywhere records
   that it happened, so a persistently failing write is invisible.
   **Suggested fix:** log at debug level.

6. **Coverage — the constitution's ≥90% gate remains unmeasured.** Recorded as
   a carried deviation in `plan.md` by `/speckit.analyze` finding B-2, and
   unmet across all five slices. Not introduced here, and not hidden.

## Resolution

Both blocking findings and two non-blocking ones were addressed in the same
pass:

| # | Resolution |
|---|---|
| **B-1** | FR-408, FR-433 and FR-434 are now cited in `iteration-items.feature`, which is the only artefact holding them true. |
| **B-2** | `src/shared/types.ts` gains a header stating why it stays whole: it is a glossary, and one place to look a name up is exactly the value splitting would destroy. |
| **N-4** | The Architecture Review gains a *client-side state and refetch policy* row. Two independent fetches, each deciding its own refresh, is what keeps a slow iteration source from delaying board load. |
| **N-5** | The swallowed cache write now reports through a debug sink. Still not surfaced to the user — a failed cache write must not cost them the iteration just read — but a persistently failing one is no longer invisible. |

N-1, N-2, N-3 and N-6 are left as recorded follow-ups: three are pre-existing
file-size growth, and N-6 is the coverage deviation already carried in
`plan.md`.

## Reconciliations that hold up

- **"No Jira field but status is written."** Verified three ways in the diff:
  the iteration port has one read method, `tests/unit/no-jira-writes.test.ts`
  asserts the adapters structurally, and live verification confirmed the
  blocked field is read-only. The Architecture Review row is accurate.
- **"Concurrent writes: resolution runs inside the existing sync lock."**
  Confirmed — `IterationService` is constructed with the same lock path.
- **"Idempotency: the migration is idempotent by construction."** Confirmed and
  asserted by `tests/ops/migration-016-021.test.ts`, which re-applies the
  data-moving migration and compares.
- **"N/A — no PII."** Holds. The diff adds sprint names, dates and a display
  name; none is personal data beyond what the board already held.
- **"N/A — no new runtime dependency."** Holds exactly. The only `package.json`
  change is three npm scripts.

## Skill output

- `review` skill: not invoked separately — this review walked the same
  dimensions directly against the diff.
- `security-review` skill: not invoked separately. The security-relevant
  surface here is one outbound read reusing existing credentials, covered by
  the credential-redaction tests and the no-writes guard, and the diff
  introduces no new inbound route that writes on anyone's behalf.

## PR description scaffold

```markdown
## What changed

Six board columns become Backlog / Iteration Items / In Progress / Test /
PO Review / Done. Blocked leaves the board and becomes a flag a card carries
wherever the work actually is. The board reads the current TradeStation
iteration from a nominated Jira board and shows it in a banner that degrades to
a cache and then to an estimate rather than ever failing.

Migrations 016–022. One new outbound API surface (Jira Agile), registered in
the External Interactions Register.

## Verified

- 271 unit, 32 contract, 168 acceptance (1,016 steps), 26 ops, 54 e2e
- Live against tsgjira.atlassian.net — see `live-verification.md`

## NOT tested

- Load or concurrency beyond the existing sync lock
- A real fiscal-year ordinal reset (January); the behaviour is unit-tested
  against a synthetic lower ordinal
- Any Jira instance other than tsgjira.atlassian.net

## Follow-ups deferred

- The ≥90% coverage gate is still unmeasured (carried deviation)
- `src/web/App.css` has grown in every slice and has never been split
```
