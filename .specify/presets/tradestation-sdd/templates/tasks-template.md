---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/
**Pre-implementation gate**: `/speckit.analyze` MUST be run after this tasks file
is generated and before `/speckit.implement` begins. Resolve any
inconsistencies it flags between spec.md, plan.md, and tasks.md first —
`/speckit.implement` will refuse to start otherwise.

**Tests**: Before generating tasks, scan the spec for test and coverage requirements
(NFRs, success criteria, acceptance scenarios). If ANY of the following are true,
test tasks are MANDATORY and MUST be generated for every user story:
- The spec defines a coverage target (e.g., ">=95% coverage")
- The spec includes success criteria referencing CI, tests, or coverage
- The plan.md project structure lists test files
- The constitution requires automated tests before merge

When test tasks are mandatory, cross-reference plan.md's project structure to
ensure every listed test file has a corresponding task. Test tasks MUST appear
BEFORE their story's implementation tasks (test-first).

Tests are only OPTIONAL when the spec contains no coverage requirements, no
test-related success criteria, and the constitution does not mandate them.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

<!-- 
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.
  
  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/
  
  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment
  
  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T004 Setup database schema and migrations framework
- [ ] T005 [P] Implement authentication/authorization framework
- [ ] T006 [P] Setup API routing and middleware structure
- [ ] T007 Create base models/entities that all stories depend on
- [ ] T008 Configure error handling and logging infrastructure
- [ ] T009 Setup environment configuration management

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 (see Tests policy above)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation.
> Cross-reference plan.md project structure for exact test file paths.**

- [ ] T010 [P] [US1] Unit test for [service] in tests/unit/test_[name].py — covers [key behavior]
- [ ] T011 [P] [US1] Integration test for [user journey] in tests/integration/test_[name].py — covers [acceptance scenario]

### Implementation for User Story 1

- [ ] T012 [P] [US1] Create [Entity1] model in src/models/[entity1].py
- [ ] T013 [P] [US1] Create [Entity2] model in src/models/[entity2].py
- [ ] T014 [US1] Implement [Service] in src/services/[service].py (depends on T012, T013)
- [ ] T015 [US1] Implement [endpoint/feature] in src/[location]/[file].py
- [ ] T016 [US1] Add validation and error handling
- [ ] T017 [US1] Add logging for user story 1 operations

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. **Run the Story-Complete Review Gate before starting the next story.**

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 (see Tests policy above)

- [ ] T018 [P] [US2] Unit test for [service] in tests/unit/test_[name].py — covers [key behavior]
- [ ] T019 [P] [US2] Integration test for [user journey] in tests/integration/test_[name].py — covers [acceptance scenario]

### Implementation for User Story 2

- [ ] T020 [P] [US2] Create [Entity] model in src/models/[entity].py
- [ ] T021 [US2] Implement [Service] in src/services/[service].py
- [ ] T022 [US2] Implement [endpoint/feature] in src/[location]/[file].py
- [ ] T023 [US2] Integrate with User Story 1 components (if needed)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. **Run the Story-Complete Review Gate before starting the next story.**

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 (see Tests policy above)

- [ ] T024 [P] [US3] Unit test for [service] in tests/unit/test_[name].py — covers [key behavior]
- [ ] T025 [P] [US3] Integration test for [user journey] in tests/integration/test_[name].py — covers [acceptance scenario]

### Implementation for User Story 3

- [ ] T026 [P] [US3] Create [Entity] model in src/models/[entity].py
- [ ] T027 [US3] Implement [Service] in src/services/[service].py
- [ ] T028 [US3] Implement [endpoint/feature] in src/[location]/[file].py

**Checkpoint**: All user stories should now be independently functional. **Run the Story-Complete Review Gate before moving to Polish.**

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Create or update repo-root `README.md`: add this feature to the feature list (or create the list if absent); document any new public APIs, CLI flags, env vars, and config keys; update the "Getting started" / setup section if it changed; ensure a new developer can clone the repo and run the feature end-to-end by following only the README
- [ ] TXXX Verify the **Architecture Diagram** in `plan.md` still reflects the as-built system. Update component/sequence/state diagrams if implementation diverged. Label every edge. A drifted diagram is worse than no diagram.
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX Verify test coverage meets spec target (if coverage NFR exists) — run coverage report
- [ ] TXXX Verify every test file listed in plan.md project structure exists and passes
- [ ] TXXX Security hardening
- [ ] TXXX Run quickstart.md validation
- [ ] TXXX Run `/speckit.review` for an automated second-pass review of the diff vs main; address blocking findings before opening a PR
- [ ] TXXX Request peer code review on the PR; address feedback before merge (constitution Quality Gate — automated review never replaces a human reviewer)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Contract test for [endpoint] in tests/contract/test_[name].py"
Task: "Integration test for [user journey] in tests/integration/test_[name].py"

# Launch all models for User Story 1 together:
Task: "Create [Entity1] model in src/models/[entity1].py"
Task: "Create [Entity2] model in src/models/[entity2].py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Per-Task Cleanup (MANDATORY)

After completing each task, verify the following before moving on:

- [ ] No commented-out code blocks remain in touched files
- [ ] No unused imports, variables, or functions introduced
- [ ] No TODO/FIXME/HACK markers left unresolved
- [ ] No debug logging (console.log, print, debugger statements)
- [ ] No files exceeding 300 lines without justification
- [ ] No functionality beyond what spec.md requires
- [ ] No unnecessary dependencies added

This gate applies to every task — not just the final phase.

---

## Story-Complete Review Gate (MANDATORY)

Run this gate at every story Checkpoint — after the last task in a User Story
phase is complete and before starting the next story. Unlike the per-task
hygiene gate (mechanical, fast), this is a deeper review of the just-completed
story to identify gaps in design, coverage, or spec alignment that the
mechanical checklist would miss.

### Review dimensions

**Spec alignment**
- [ ] Every acceptance scenario for this story is exercised by code or tests
- [ ] Every functional requirement tied to this story is met
- [ ] Nothing implemented beyond what the spec requires (no scope creep)

**Design & structure**
- [ ] Each module/class/function has a single, cohesive responsibility
- [ ] No premature abstraction (interfaces/factories without a second caller)
- [ ] No missing abstraction (near-duplicate blocks crying for extraction)
- [ ] Coupling to prior stories is intentional, not accidental
- [ ] Names are readable cold — a new reader can follow without context
- [ ] No file exceeds 300 lines without justification

**Error handling & edge cases**
- [ ] Failure modes at boundaries (I/O, network, parsing, user input) are handled
- [ ] Errors propagate with enough context to debug
- [ ] Invariants are checked where they could be violated, not everywhere
- [ ] Edge cases from the spec (empty, max, null, concurrent) are covered

**Tests**
- [ ] Every test file listed in plan.md for this story exists and passes
- [ ] Tests assert behavior, not implementation (no over-mocking, no internals)
- [ ] Tests would fail if the implementation regressed (mutation-test mentally)
- [ ] Coverage target met for this story (if spec defines one)

**Security & data**
- [ ] Untrusted input is validated at the boundary it enters
- [ ] No secrets in code, logs, or test fixtures
- [ ] Authorization checks are present where the spec requires them

**Integration**
- [ ] This story integrates cleanly with Foundational + prior stories
- [ ] No regressions: all previously-passing tests still pass
- [ ] Story still satisfies its Independent Test from this phase header

**Documentation & onboarding**
- [ ] Repo-root `README.md` exists and gets a new developer set up and running end-to-end (clone → install → run → use the feature). If missing, create it as part of this story — do NOT defer to Polish.
- [ ] **Architecture Diagram** in `plan.md` still reflects the implemented system. Update it now if the story changed components, edges, or interaction flows; a stale diagram is a finding.
- [ ] Environment setup, config keys, and run/test commands in the README are still accurate after this story's changes
- [ ] New public APIs, CLI flags, or env vars introduced by this story are documented where developers will look (README, `--help` output, OpenAPI/contracts) — not buried in code comments

### Outcome

If gaps are found:
1. Add a remediation task for each gap to this story's section (do NOT defer
   to Polish — the gap belongs to the story that introduced it)
2. Implement, re-run hygiene, then re-run this gate
3. Only mark the Checkpoint as passed once every dimension is clear

If no gaps: note the gate passed in the story's Checkpoint and proceed to the
next phase.

**After the Checkpoint passes, run `/speckit.feedback`** to capture any
friction (or wins) from the story while it's fresh. This is part of the
default SDD loop — `/speckit.implement` will invoke it automatically. If
nothing comes to mind, pass an empty one-liner; the timestamp + branch +
feature still get recorded so we know the gate ran cleanly.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
