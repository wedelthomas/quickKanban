# Cross-Artifact Analysis — 005-iteration-and-board-restructure

**Branch:** 005-iteration-and-board-restructure
**When:** 2026-08-27T04:40:57Z
**Artifacts:** spec.md, plan.md, tasks.md (+ research.md, data-model.md, contracts/api.md)
**Result:** **2 blocking**, 3 non-blocking — **all five resolved 2026-08-27T04:44:36Z**

---

## Requirement coverage

| Check | Result |
|---|---|
| Functional requirements | 46 (FR-401…FR-446), no gaps, no duplicates |
| FRs with no path to a task (direct, via pathway, or via test) | **0** |
| Behavior pathways | 33; every one referenced by at least one task |
| Verification rows | 33; **one has no implementing task** — see B-1 |
| Acceptance scenarios | 23 across six stories (5/5/3/4/3/3) |
| `[NEEDS CLARIFICATION]` markers | 0 in all three artifacts |
| Test-first ordering | Holds in all seven phases that contain both |
| Architecture Review rows filled | 22 of 22; 0 empty, 0 bare N/A |
| Dependency manifest | Absent — cross-repo row correctly reasoned N/A |
| Plan test files with a task | 18 of 18 |

---

## Blocking findings

### B-1 — TEST-429 has no implementing task, so FR-442 is asserted but never verified

FR-442 requires that access to the iteration source sit behind a test double so
**no automated test in the standard suite contacts a live external service**.
BH-429 states it and TEST-429 is meant to prove it.

TEST-429 appears in exactly one place across all three artifacts: the case
sync line in T030. It is named in **no** plan.md Test Strategy row and **no**
implementing task. Nothing will ever assert it.

This matters more than a normal coverage gap. It is the guard that stops a
future change from quietly pointing a test at real Jira — and this slice adds a
brand-new outbound API surface, which is exactly when that guard earns its
keep. The related NFR-25 and the whole fake-adapter design (T041) exist to make
this property true; without a test, it is a convention rather than a guarantee.

**Remediation.** Add `tests/ops/no-live-services.test.ts` to plan.md's Test
Strategy against BH-429, and a corresponding task in Phase 2 (it guards every
story, so it belongs in Foundational, not US2). The assertion should fail if
any adapter resolving to a real network client is constructed during the
standard suite.

### B-2 — A coverage target is asserted with no means of measuring it

plan.md's Test Strategy states **"Coverage Target: ≥90% line and branch, per
the constitution's standing gate"**, the Story-Complete Review Gate asks to
tick "Coverage target met for this story", and T076 says to "run the coverage
report and record the figure".

None of that is executable. Verified:

- no coverage provider in `package.json` (no `@vitest/coverage-v8`, no `nyc`);
- no script mentioning coverage;
- no `coverage` block in any of the four vitest configs.

So T076 cannot be performed, and the Story-Complete checkbox cannot be ticked
honestly at any of the six checkpoints.

**This is inherited, not introduced** — slices 1 and 4 carry the same
unexecutable task, and no prior slice recorded a coverage figure. That makes it
a standing deviation rather than a regression, but this analysis is the point
at which it stops being invisible.

**Remediation, either:**

1. Add a task to install `@vitest/coverage-v8`, add a `test:coverage` script
   and a coverage block to `vitest.config.ts`, then record a real figure. Note
   in plan.md that this adds one **dev** dependency, so the drift heuristic's
   expected-zero claim stays accurate; or
2. Record it explicitly as a carried constitution deviation alongside
   Principle V, and reword T076 and the gate checkbox to match what is actually
   done. **Do not leave a gate that cannot be evaluated.**

---

## Non-blocking findings

### N-1 — plan.md's Source Code tree omits 14 files the tasks touch

Tasks name 42 source paths; 14 do not appear in plan.md's Source Code section:

```
src/server/app.ts                              src/web/App.tsx
src/server/errors.ts                           src/web/board/Board.tsx
src/server/jira/jira-adapter.ts                src/web/board/Sidebar.tsx
src/server/repositories/jira-link-repository.ts src/web/settings/MappingEditor.tsx
src/server/repositories/summary-repository.ts  src/domain/backoff.ts
src/server/services/card-service.ts            src/server/sync/sync-lock.ts
src/server/services/summary-service.ts         src/server/sync/transition-service.ts
```

Every one is legitimate FR-driven work — the summary files serve FR-415,
`card-service.ts` serves FR-402 and FR-414, `jira-adapter.ts` serves FR-416.
The omission is in the plan, not the tasks.

It matters because plan.md itself says a non-zero
`files_outside_planned_paths` at story-complete "is a real signal, not noise".
Left as is, that heuristic fires on 14 files at the first checkpoint and the
signal gets dismissed — which is how a genuine drift alarm becomes background
noise. Extend the tree instead. (Four of the fourteen — `errors.ts`,
`backoff.ts`, `sync-lock.ts`, `transition-service.ts` — are *referenced* by
tasks but expected to be read rather than modified; mark them as such.)

### N-2 — T051 implements behaviour no requirement asks for

T051 exposes Iteration Items in `MappingEditor.tsx` "as mappable-but-unmapped,
so its local-only status is visible rather than implied".

FR-408 requires only that Iteration Items **default to** having no mapping. No
requirement asks for it to be visible in the mapping editor, and spec.md's Out
of Scope section does not contemplate it. This is a small, defensible UI
improvement — and it is exactly the kind of thing the per-task cleanup gate
("No functionality beyond what spec.md requires") is written to catch.

**Remediation.** Either drop T051, or add a requirement covering it. Do not
leave it as an unattributed task.

### N-3 — BH-410's fixture could be misread as requiring sprint reading

BH-410 reads: *"Given a Jira issue whose sprint matches the current iteration,
When a sync runs, Then the corresponding card's column is unchanged."*

Spec.md's Out of Scope explicitly forbids "reading the per-card sprint field
onto cards". The two are compatible — BH-410 is a **negative** assertion, and
the fake adapter can present an issue carrying a sprint without production code
ever reading that field. But an implementer working from BH-410 alone could
reasonably conclude the sprint field must be read to satisfy it.

**Remediation.** Add a note to T048 stating that the fixture carries a sprint
and production code must remain ignorant of it. No requirement changes.

---

## What was checked and found sound

- The decision to place all six migrations in Foundational is correct and the
  reasoning holds: migrations apply in filename order at process start, so
  creating `018` after `019` had been applied would strand a live database.
- The FR-402 / FR-446 split resolves the contradiction planning surfaced. The
  spec no longer asks for something impossible, and the retention obligation is
  stated where an implementer will read it.
- Story dependencies are declared honestly rather than forced into the
  template's independence assumption.
- The two edge cases that are real rather than hypothetical — two active
  sprints on the reference board, and an undated active sprint — both have
  requirements (FR-424, FR-425), pathways (BH-417, BH-418) and tasks (T031).

---

## Resolution

All five findings were addressed in the same pass. Re-verified afterwards: 19
plan test files each with a task, 33 verification cases each named by a task, 22
Architecture Review rows filled, no clarification markers.

| # | Resolution |
|---|---|
| **B-1** | `tests/ops/no-live-services.test.ts` added to plan.md's Test Strategy against BH-429, and **T083** added to Foundational — it guards every story, so it does not belong to US2. Its number is out of sequence because existing task ids are stable anchors and are never renumbered. |
| **B-2** | Recorded as a **carried deviation** in plan.md's Constitution Check rather than asserting a gate nobody can evaluate. The coverage target is struck from the Test Strategy; T076 and the Story-Complete checkbox now ask what is actually done — every pathway has a passing test — and claim no percentage. No dependency added. |
| **N-1** | plan.md's Source Code section now names all eleven additionally-changed files, plus four listed as read-not-modified. The drift heuristic will now fire only on genuine drift. |
| **N-2** | **T051 withdrawn.** A tombstone records why; the id is retired, not reused. |
| **N-3** | T048 now states that TEST-410's fixture carries a sprint while production code must remain ignorant of the field. |

**B-2 leaves the constitution's coverage gate unmet.** That is a deliberate,
recorded choice, not an oversight — it was unmet across slices 1–4 too. It is
now visible in plan.md instead of implied by an unexecutable task.

## Next steps

Ready for `/speckit.implement`.
