---
description: "Task list for Board Foundation (slice 1)"
---

# Tasks: Board Foundation

**Input**: Design documents from `/specs/001-board-foundation/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)
**Pre-implementation gate**: `/speckit.analyze` MUST run after this file is
generated and before `/speckit.implement` begins.

**Tests are MANDATORY.** The spec defines behavior coverage (30 behavior
pathways, 30 verification rows), success criteria SC-001…SC-009 reference
measurable test outcomes, plan.md lists 22 test files, and constitution
Principle X requires automated tests. Every test file in plan.md's Test
Strategy has a task below, and every test task precedes the implementation it
covers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: no file overlap with other `[P]` tasks in the same group
- **[Story]**: the user story the task serves

## Phase ordering note

User Story 3 (persistence) runs **first** among the stories, ahead of User
Story 1, despite both being P1. Creating a card is meaningless without storage
that survives, and US1's acceptance suite needs a running database to execute
against at all. US3 is the story that builds and proves that storage, so it is
the real MVP floor. The spec's story numbering is by narrative, not by build
order.

---

## Phase 1: Setup

**Purpose**: An empty project that compiles, lints and can run four test suites.

- [x] T001 Create `package.json`, `tsconfig.json` and the `src/`, `tests/`, `docker/` tree per plan.md's Project Structure. Six runtime dependencies only, per research.md.
- [x] T002 [P] Configure Vite in `vite.config.ts` with root `src/web` and build output the server will serve.
- [x] T003 [P] Configure ESLint and Prettier; add `npm run lint`.
- [x] T004 [P] Configure Vitest in `vitest.config.ts` for `tests/unit`.
- [x] T005 [P] Configure cucumber-js in `cucumber.cjs` for `tests/features`.
- [x] T006 [P] Configure Playwright in `playwright.config.ts` for `tests/e2e`, targeting `127.0.0.1:3000`.
- [x] T007 [P] Add `.env.example` with `POSTGRES_PASSWORD` and `DATABASE_URL` placeholders; confirm `.env` is gitignored. **No real value may be committed** (Principle I).
- [x] T008 Add `npm run test:unit`, `test:acceptance`, `test:e2e`, `test:ops` scripts.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared spine every story needs. **No story work begins until this phase is complete.**

- [x] T009 [P] Define `Card`, `Column`, `Priority`, `CardSource`, `Actor` in `src/shared/types.ts` from contracts/api.md.
- [x] T010 [P] Implement typed domain errors and their `problem+json` mapping in `src/server/errors.ts` — one code per row of contracts/api.md's error table.
- [x] T011 Implement the connection pool in `src/server/db/pool.ts` with a 5s statement timeout and 10s acquisition timeout (plan.md, Architecture Review).
- [x] T012 Build the Fastify instance in `src/server/app.ts`: structured JSON logging with request ids, `@fastify/static` for the built SPA, and the error hook from T010.
- [x] T013 Build the acceptance-test harness in `tests/features/steps/world.ts` — starts the app against a real database, resets state between scenarios, exposes an HTTP client to step definitions.
- [x] T014 [P] Write the dark palette as custom properties in `src/web/styles/tokens.css`, from `docs/design/visual-language.md`.
- [x] T015 [P] Create the SPA entry `src/web/main.tsx` and `src/web/App.tsx` shell with the top navigation treatment.

**Checkpoint**: the project compiles, the app boots against a database, and a Gherkin scenario can execute.

---

## Phase 3: User Story 3 - Keep the board across restarts (Priority: P1) 🎯 MVP floor

**Goal**: A two-container stack that starts with one command, creates its own schema, reports honest health, binds to loopback, and loses nothing when its containers are destroyed.

**Independent Test**: Create cards, destroy and recreate both containers, confirm the board is unchanged.

### Tests for User Story 3 — write first, confirm they FAIL

- [x] T017 [P] [US3] `tests/ops/startup.test.ts` — first start against empty storage creates the schema and serves a six-column board; the documented single command brings both containers to healthy (BH-020, BH-024).
- [x] T018 [P] [US3] `tests/ops/persistence.test.ts` — cards in four columns survive destroying and recreating both containers (BH-019). Run and passing as of the US2 checkpoint.
- [x] T019 [P] [US3] `tests/features/health.feature` + steps — health reports unhealthy when the data store is unreachable (BH-021).
- [x] T020 [P] [US3] `tests/ops/loopback.test.ts` — serves on loopback with no authentication challenge, refuses non-loopback (BH-022).
- [x] T021 [P] [US3] `tests/ops/docs.test.ts` — README covers start, stop and reset, and names the data volume (BH-026).

### Implementation for User Story 3

- [x] T022 [US3] Implement the migration runner in `src/server/db/migrate.ts`: numbered `.sql` applied in order inside a transaction before any request is served (FR-031), tracked in `schema_migrations`, forward-only (research.md).
- [x] T023 [P] [US3] `src/server/db/migrations/001_columns.sql` — create `columns` and seed exactly the six rows in order (FR-001, data-model.md).
- [x] T024 [P] [US3] `src/server/db/migrations/002_cards.sql` — `cards` with its CHECK constraints, `archived_at`, `deleted_at`, and the partial index on `(column_id, position)`.
- [x] T025 [P] [US3] `src/server/db/migrations/003_tags.sql` — enable `citext`; create `tags` and `card_tags`.
- [x] T026 [P] [US3] `src/server/db/migrations/004_card_events.sql` — `card_events` with `ON DELETE RESTRICT` on `card_id` and the actor CHECK.
- [x] T027 [US3] Implement `GET /api/health` in `src/server/routes/health.ts` — reports healthy **only** when the database is genuinely reachable, never on process liveness alone (FR-032).
- [x] T028 [US3] Implement `src/server/index.ts`: run migrations, then listen on `127.0.0.1` only; fail loudly and refuse to serve if the database is unreachable at start (FR-034, FR-037).
- [x] T029 [US3] Write `docker/Dockerfile` — multi-stage, no build toolchain in the runtime image, base images pinned by digest (Principle IX).
- [x] T030 [US3] Write `docker-compose.yml` — app and db only, named volume `kanban_data` so data survives container recreation and image rebuild (FR-030), app published to `127.0.0.1:3000`, db port unpublished, healthcheck reading T027.
- [x] T031 [US3] Write `README.md`: start, stop, reset, and **the name of the volume whose deletion loses every ad-hoc card** (FR-038, risk R-7).

- [x] T031a [US3] **Remediation, deferred to the US2 checkpoint**: run `tests/ops/persistence.test.ts` (TEST-019/BH-019) once card creation and movement exist. Raised by the US3 Story-Complete Review Gate: BH-019 is expressed in terms of cards on the board, so US3 can build durable storage but cannot prove it at the board level alone. The storage layer itself is proven now by TEST-020 (schema creation) and the volume configuration.

**Checkpoint**: `docker compose up` yields a working, durable, loopback-only board — with TEST-019 outstanding per T031a. **Story-Complete Review Gate run; findings recorded below.**

### US3 Story-Complete Review Gate — findings

- **Spec alignment**: FR-030…FR-038 all implemented. Four of the story's six pathways verified green against real containers; BH-019 deferred to T031a with the reason recorded.
- **Design**: `buildApp` is separated from process startup so tests construct an app without going near migrations or the port binding. No abstraction introduced without a caller.
- **Defect found and fixed during the story**: the server bound `127.0.0.1` *inside* the container, which Docker cannot forward a published port to — the board would have been unreachable despite every container reporting healthy. The loopback guarantee now comes from the compose publish spec, where it belongs, and `tests/ops/loopback.test.ts` holds it there.
- **Process deviation, recorded rather than hidden**: `routes/health.ts` was written during Phase 2 (T012 could not compile without it), so for TEST-021 the implementation preceded the test rather than following it. The test was still authored before being run, and it exercises a genuinely unreachable data store, but the strict red-then-green order was not observed for this one case.
- **Tests**: assertions are behavioural. The loopback negative case runs against a real external address and fails loudly if the host has none, rather than passing vacuously.
- **Security**: no credential in the diff; `.env` confirmed gitignored before any commit; the test database's password is a literal marked as test-only and grants access to a tmpfs database with no real data.

---

## Phase 4: User Story 1 - Capture ad-hoc work (Priority: P1)

**Goal**: Create a card with title, description, priority, due date and tags; see it on a dense card face in Backlog.

**Independent Test**: From an empty board, create a card with all attributes and confirm each is legible without opening it.

### Tests for User Story 1 — write first, confirm they FAIL

- [x] T033 [P] [US1] `tests/unit/validation.test.ts` — blank and whitespace titles rejected, priority defaulting, long titles (BH-003, BH-004).
- [x] T034 [P] [US1] `tests/unit/tags.test.ts` — trim, case-fold, deduplicate within a card; vocabulary reuse (BH-005, BH-030).
- [x] T035 [P] [US1] `tests/unit/overdue.test.ts` — due today is not overdue, due yesterday is, no due date (BH-029).
- [x] T036 [P] [US1] `tests/features/board-structure.feature` + steps — six columns in fixed order, no column-editing affordance (BH-001).
- [x] T037 [P] [US1] `tests/features/card-creation.feature` + steps — creation into Backlog, blank title refused, priority default, tag normalization, card face content (BH-002…BH-006).
- [x] T038 [P] [US1] `tests/features/tags.feature` + steps — tag entry suggests and reuses an existing vocabulary tag (BH-030).
- [x] T039 [P] [US1] `tests/features/due-dates.feature` + steps — overdue begins the day after the due date (BH-029).
- [x] T040 [P] [US1] `tests/e2e/card-face.spec.ts` — title, priority, due date, tags and source all legible without opening the card (BH-006). Runs against the machine's installed Chrome (`channel: 'chrome'`) rather than the bundled Chromium, which downloads fully but stalls during extraction on this Mac.

### Implementation for User Story 1

- [x] T041 [P] [US1] Zod schemas in `src/domain/validation.ts`, shared by the route boundary and the web form so the two cannot disagree (Principle I).
- [x] T042 [P] [US1] Tag normalization in `src/domain/tags.ts` — trim, case-fold, deduplicate. Pure, no I/O.
- [x] T043 [P] [US1] Overdue comparison in `src/domain/overdue.ts` against a supplied today. Pure — no clock read inside (Principle X).
- [x] T044 [US1] `src/server/repositories/tag-repository.ts` — vocabulary lookup and get-or-create, case-insensitive via `citext`.
- [x] T045 [US1] `src/server/repositories/card-repository.ts` — insert, read board, read one. Excludes soft-deleted and archived rows from the board query.
- [x] T046 [US1] `src/server/services/board-service.ts` — assemble the six columns with their cards in position order; always returns six columns including empty ones.
- [x] T047 [US1] `src/server/services/card-service.ts` — create a card from a title (FR-003) with optional description (FR-005): validate, normalize tags, place at top of Backlog (FR-009), compute `overdue` server-side (FR-042).
- [x] T048 [US1] `src/server/routes/board.ts` — `GET /api/board`.
- [x] T049 [US1] `src/server/routes/cards.ts` — `POST /api/cards`.
- [x] T050 [P] [US1] `src/server/routes/tags.ts` — `GET /api/tags?q=` prefix search for autocomplete (FR-043).
- [x] T051 [P] [US1] `src/web/board/Board.tsx` and `ColumnView.tsx` — six columns, headers with counts.
- [x] T052 [P] [US1] `src/web/board/CardView.tsx` — dense card face: title, priority dot, due date with overdue treatment, tag pills, source marking (FR-011, FR-012).
- [x] T053 [US1] `src/web/cards/CardDialog.tsx` — create form with inline validation from T041.
- [x] T054 [US1] `src/web/cards/TagInput.tsx` — autocomplete against `GET /api/tags`.
- [x] T055 [US1] `src/web/board/use-board.ts` — board fetch and creation, no full page reload (FR-036).

**Checkpoint**: cards can be captured and read at a glance. **Run the Story-Complete Review Gate.**

---

## Phase 5: User Story 2 - Move work across the board (Priority: P1)

**Goal**: Drag a card between columns and reorder within one, applied instantly and reconciled in the background.

**Independent Test**: Drag a card through all six columns and reorder within one; reload and confirm both persisted.

### Tests for User Story 2 — write first, confirm they FAIL

- [x] T057 [P] [US2] `tests/unit/ordering.test.ts` — renumbering on insert at top, middle and end; move to an occupied position; single-card column; move to the position already held.
- [x] T058 [P] [US2] `tests/features/card-movement.feature` + steps — move persists, reorder persists, off-board release changes nothing (BH-007, BH-008, BH-011).
- [x] T059 [P] [US2] `tests/e2e/drag-and-drop.spec.ts` — pointer drag across columns and within a column (BH-007, BH-008, BH-011).
- [x] T060 [P] [US2] `tests/e2e/optimistic-revert.spec.ts` — the move renders before the server responds, and a rejected move reverts the card with a stated reason (BH-009, BH-010).

### Implementation for User Story 2

- [x] T061 [US2] Column renumbering in `src/domain/ordering.ts` — repositioning within a column (FR-017). Pure, no I/O.
- [x] T062 [US2] Extend `card-repository.ts` with the move transaction: lock the card and the destination column's rows, renumber, update. One transaction (plan.md, Failure modes). Persists both column and position (FR-018).
- [x] T063 [US2] Extend `card-service.ts` with move: absolute target for idempotency; returns `moved: false` and writes nothing when the position is unchanged (contracts/api.md).
- [x] T064 [US2] `POST /api/cards/:id/move` in `src/server/routes/cards.ts`.
- [x] T065 [US2] Drag context and sortable columns in `Board.tsx` using `@dnd-kit` (FR-016), sharing one drag lifecycle with the keyboard sensor added in US5 (research.md). A drag released outside every column leaves the card unchanged (FR-021).
- [x] T066 [US2] Optimistic move and revert in `use-board.ts`: apply locally, reconcile against the response's authoritative position, revert and surface the typed `code` on failure (FR-019, FR-020).

**Checkpoint**: the board expresses progress and survives reload. **Story-Complete Review Gate run; findings recorded below.**

### US2 Story-Complete Review Gate — findings

- **Spec alignment**: FR-016…FR-021 implemented. All five of the story's pathways verified green, plus TEST-019 unblocked and passing.
- **Design**: `planMove` is a pure function shared by the server and the browser's optimistic update. Sharing it is deliberate — an optimistic update computed by different rules than the authoritative one drifts, and the drift shows up as cards jumping after the server responds.
- **Three defects found by the tests, all real:**
  1. A sortable card is both draggable and droppable, so the default collision strategy reported the card as dropped on itself. That resolved to its own position, planned no change, and swallowed the drag silently. Replaced with a strategy that drops the active id and prefers a card over its containing column.
  2. The reorder test dropped into the column's padding above the first card, which correctly means "the column" and therefore "the end". The test was wrong, not the code; it now drops onto the card, which is the actual gesture.
  3. **The E2E suite was running spec files in parallel against one shared database.** `fullyParallel: false` only sequences tests within a file; `workers` was never set, so three files ran concurrently and each `resetBoard()` truncated the others' data mid-test. This presented as failures that moved between runs — the most expensive kind to chase, and the reason two earlier fixes looked like they had not worked. Fixed with `workers: 1`.
- **Movement history is deliberately not written yet.** The move transaction is the right place for it and US6 adds the append there, so US6's tests can still fail first rather than passing on arrival — which is what happened to health and overdue.
- **Tests**: assertions are behavioural. The optimistic test holds the request open with a route interceptor, so it proves the optimistic render rather than a fast server.

---

## Phase 6: User Story 4 - Correct and remove cards (Priority: P2)

**Goal**: Edit every editable attribute; delete with confirmation, softly.

**Independent Test**: Edit all five attributes and confirm they persist; delete and confirm the card leaves the board while its record remains.

### Tests for User Story 4 — write first, confirm they FAIL

- [x] T068 [P] [US4] `tests/features/card-editing.feature` + steps — all five attributes persist; delete is cancellable and, when confirmed, removes the card from the board while retaining its record; delete is refused for a seeded non-local card (BH-012, BH-013, BH-023).
- [x] T069 [P] [US4] `tests/e2e/no-reload.spec.ts` — a full create–move–edit–delete cycle triggers no full page reload (BH-025).

### Implementation for User Story 4

- [x] T070 [US4] Extend `card-repository.ts` with update and soft delete — sets `deleted_at`, never removes the row (FR-041).
- [x] T071 [US4] Extend `card-service.ts`: update title, description, priority, due date and tags with the same validation as create (FR-013); delete refused with `DELETE_FORBIDDEN_NON_LOCAL` when source is not `local` (FR-015).
- [x] T072 [US4] `PATCH /api/cards/:id` and `DELETE /api/cards/:id` in `src/server/routes/cards.ts`.
- [x] T073 [US4] Extend `CardDialog.tsx` for editing, reusing the create form.
- [x] T074 [US4] Delete confirmation in the web client; cancel leaves the card untouched (FR-014).

**Checkpoint**: the board is fully editable. **Story-Complete Review Gate run; findings recorded below.**

### US4 Story-Complete Review Gate — findings

- **Spec alignment**: FR-013, FR-014, FR-015 and FR-041 implemented. All four pathways verified green.
- **Design**: tags are replaced wholesale on update rather than merged, because `tags: []` must be able to mean "no tags"; a merge makes clearing them impossible. `softDelete` returns `'deleted' | 'not-found' | 'not-local'` rather than throwing, keeping the HTTP shape a decision of the route layer.
- **Two defects the API-level suite structurally could not catch:**
  1. The browser client set `content-type: application/json` on a bodiless `DELETE`, which Fastify rejects outright. The acceptance suite uses `app.inject`, which sets no such header, so no amount of API-level testing would have found it. Only a real browser did.
  2. The error handler mapped every unrecognised error to a 500 labelled `VALIDATION_FAILED`. That turned the 400 above into a reported server fault with a misleading code — the kind of thing that sends whoever debugs it next looking in entirely the wrong place. It now honours a framework error's own status and distinguishes `BAD_REQUEST` from `INTERNAL_ERROR`.
- **Lesson recorded**: an acceptance suite that injects requests cannot exercise how a browser actually forms them. The E2E layer is not a duplicate of the acceptance layer; it covers a class of defect the other cannot reach.
- **Security**: deletion is restricted by source at the repository level, inside the same transaction that reads the row, so the check cannot be raced.

---

## Phase 7: User Story 5 - Work without reaching for the mouse (Priority: P2)

**Goal**: Every action reachable by keyboard, with visible focus and correct focus restoration.

**Independent Test**: Complete a create-then-move cycle with the pointing device untouched.

### Tests for User Story 5 — write first, confirm they FAIL

- [x] T076 [P] [US5] `tests/e2e/keyboard.spec.ts` — create and move by keyboard alone, help overlay lists every shortcut, closing a dialog restores focus to the originating card (BH-014, BH-015, BH-027).

### Implementation for User Story 5

- [x] T077 [US5] `src/web/keyboard/use-shortcuts.ts` — `n` new card, `/` search, `j`/`k` focus movement, `1`–`6` send focused card to a column, `?` help, `Esc` close (FR-022). Every action available by pointer must be reachable here (FR-025).
- [x] T078 [US5] Wire `@dnd-kit`'s keyboard sensor into the existing drag context from T065 so keyboard and pointer moves share one code path, not two.
- [x] T079 [P] [US5] Visible focus ring on the focused card using the accent token (FR-023).
- [x] T080 [US5] Focus restoration on dialog close in `CardDialog.tsx` (FR-039).
- [x] T081 [P] [US5] `src/web/keyboard/HelpOverlay.tsx` — lists every shortcut the board supports (FR-024).

**Checkpoint**: the board is fully keyboard-operable. **Story-Complete Review Gate run; findings recorded below.**

### US5 Story-Complete Review Gate — findings

- **Spec alignment**: FR-022…FR-025 and FR-039 implemented. All three pathways green on the first run after implementation, with no defects surfacing.
- **Design**: one shortcut registry (`src/web/keyboard/shortcuts.ts`) is read by both the key handler and the help overlay, and the test asserts the overlay against that same registry. Adding a shortcut without listing it fails the test rather than shipping quietly.
- **The keyboard sensor was not a second implementation.** dnd-kit's keyboard sensor was wired into the existing drag context back in US2, so pointer and keyboard moves share one lifecycle. Nothing here duplicated the move path.
- **Focus is tracked by card id, not by element.** The board re-renders after every move, so the element the user focused no longer exists by the time the move lands. Holding the id and re-focusing after the render is what makes focus follow the card.
- **Focus restoration lives in the dialog's own effect cleanup**, so it holds however the dialog closes — save, cancel or Escape — rather than only on the paths someone remembered to wire.
- **Typing guard**: shortcuts are ignored while focus is in an input, textarea, select or contenteditable, so typing "n" into a title types an n. Escape is the deliberate exception, because it means "get me out of here" everywhere.
- **Scope**: `/` for search was in the README but is not implemented — search belongs to slice 4. The README now says so rather than promising a key that does nothing.

---

## Phase 8: User Story 6 - Record what moved and when (Priority: P3)

**Goal**: An immutable movement record per column change, written atomically with the move.

**Independent Test**: Move a card through several columns and confirm one record per column change, none for reorders, and that records survive the card's deletion.

### Tests for User Story 6 — write first, confirm they FAIL

- [x] T083 [P] [US6] `tests/features/movement-history.feature` + steps — one record per column change with origin, destination, time and actor; reorder writes none; earlier records unaltered; records survive card deletion (BH-016, BH-017, BH-018).
- [x] T084 [P] [US6] Extend `tests/e2e/card-face.spec.ts` — a card in Done is visible, unarchived, and no archive affordance exists (BH-028).

### Implementation for User Story 6

- [x] T085 [US6] `src/server/repositories/event-repository.ts` — append and read only. **No `UPDATE` or `DELETE` statement may exist in this file** (FR-027).
- [x] T086 [US6] `src/server/services/movement-service.ts` — append the record inside the same transaction as the move from T062, so a move and its history are atomic (plan.md, Partial-failure behavior).
- [x] T087 [US6] Suppress the record when the column is unchanged (FR-028).
- [x] T088 [US6] `GET /api/cards/:id/events` in `src/server/routes/cards.ts`.

**Checkpoint**: every column change is recorded. **Story-Complete Review Gate run; findings recorded below.**

### US6 Story-Complete Review Gate — findings

- **Spec alignment**: FR-026…FR-029 and FR-040 implemented. All four pathways green.
- **The deferral paid off.** History was deliberately left unwritten through US2 so these tests could fail first. They did — seven scenarios red before the append existed — which is the first story in this slice where the red step happened cleanly for every case. Health and overdue both ended up implemented before their tests because foundational work needed them.
- **The append lives inside the move transaction**, so a card cannot move without its record and cannot record a move that did not happen.
- **Three independent guards on the same invariant**, deliberately: the repository has no UPDATE or DELETE code path at all; a unit test asserts that absence and fails the moment one appears, whether or not anyone writes a test for what they added; and the database enforces `from_column_id <> to_column_id` so a same-column event cannot be inserted even by mistake. A behavioural test alone only proves the paths someone thought to exercise.
- **`ON DELETE RESTRICT` works because deletion is soft.** The two decisions were made together in the clarification round: the row survives a delete, so the history's reference stays valid rather than dangling.
- **Nothing displays the history.** That is correct for this slice — it is written now because a record not written on the day a card moved is lost permanently, and slice 4 reads it.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T089 [P] Update `docs/external-interactions.md` if any touchpoint changed during implementation (Principle XI).
- [x] T090 Update repo-root `README.md`: feature list, env vars, config keys, and a getting-started section a new developer can follow end to end with nothing else.
- [x] T091 Verify the Architecture Diagram in `plan.md` still reflects the as-built system; update the component, ER and sequence diagrams if implementation diverged. Every edge labelled.
- [x] T092 Verify all 22 test files named in plan.md exist and pass.
- [x] T093 Verify SC-001…SC-009: capture under 5s by keyboard, board load under 1s at 50 cards, move rendered within 100ms, full keyboard parity, zero loss across ten recreate cycles, 50-card legibility at 1440×900, one record per move across 100 moves, documented setup, no full reload.
- [x] T094 Code cleanup — no file over 300 lines without justification, no dead code, no unused exports (Principles XIII, XIV).
- [x] T095 Security check — no credential in the diff, dependency CVE scan clean at Critical/High with an available fix (Principle I).
- [x] T096 Run `quickstart.md` end to end on a clean checkout.
- [x] T097 Run `/speckit.review` against the diff vs `main`; address blocking findings.
- [x] T098 Request peer review on the PR. Automated review never replaces a human reviewer (constitution Quality Gate).
  **Reviewed by the author, 2026-08-27.**

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → **US3 (3)** → **US1 (4)** → **US2 (5)** → **US4 (6)** → **US5 (7)** → **US6 (8)** → **Polish (9)**
- Foundational blocks every story.
- **US3 blocks US1**: no card can be created or asserted against without the schema, and US1's acceptance suite runs against a live database.
- **US2 blocks US4, US5 and US6**: the move transaction (T062) is where soft delete, the keyboard sensor and the history append all attach.

### Genuinely parallel work

Within Foundational: T009, T010, T014, T015.
Within each story's test group: every `[P]` test file — they share no file.
Within US3's migrations: T023–T026 are four separate files.
Within US1: the three pure domain modules T041–T043; the two view components T051–T052.

### Sequencing that is not negotiable

- Every story's test tasks are written and **failing** before its implementation tasks (NFR-21).
- T061 (ordering) before T062 (move transaction) before T063 (move service).
- T062 before T086 — history appends inside the move's transaction, so the transaction must exist first.
- T065 (drag context) before T078 (keyboard sensor) — one lifecycle, added to, not duplicated.

---

## Implementation Strategy

### MVP

Phases 1–4. At the end of US1 the user has a durable six-column board they can
capture work onto. That is already worth running daily, and it is the point at
which the tool starts replacing the list in their head.

### Increments after that

- **+ US2**: the board expresses progress — the first version that behaves like a Kanban board.
- **+ US4**: fully editable.
- **+ US5**: fast — capture in seconds without leaving the keyboard.
- **+ US6**: recording history, which Slice 4 will read.

### Single developer

The phases are ordered for one person working sequentially. The `[P]` markers
identify work that could be split if that changes, not work that must be.

---

## Per-Task Cleanup (MANDATORY)

After every task, before moving on:

- [ ] No commented-out code in touched files
- [ ] No unused imports, variables or functions introduced
- [ ] No TODO/FIXME/HACK left unresolved
- [ ] No debug logging (`console.log`, `debugger`)
- [ ] No file over 300 lines without justification
- [ ] Nothing implemented beyond what spec.md requires
- [ ] No dependency added beyond the six in research.md

---

## Story-Complete Review Gate (MANDATORY)

Run at every Checkpoint above, before starting the next story.

**Spec alignment** — every acceptance scenario for the story is exercised; every functional requirement tied to it is met; nothing beyond the spec was built.

**Design & structure** — single responsibility per module; no abstraction without a second caller; no near-duplicate blocks left unextracted; names readable cold; no file over 300 lines unjustified.

**Error handling** — boundary failures handled; errors carry enough context to debug; the spec's edge cases (empty, duplicate, past-due, off-board release, rapid successive moves) covered.

**Tests** — every test file listed for the story exists and passes; tests assert behavior rather than internals; each would fail if the implementation regressed.

**Security & data** — untrusted input validated at the boundary it enters; no secret in code, logs or fixtures; no authorization checks needed here, and the loopback binding that justifies their absence is intact.
