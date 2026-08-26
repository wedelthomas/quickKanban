---
description: "Task list for Jira Import (slice 2)"
---

# Tasks: Jira Import

**Input**: Design documents from `/specs/002-jira-import/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)
**Pre-implementation gate**: `/speckit.analyze` MUST run before `/speckit.implement`.
**Risk tier**: FULL — the behavior-pathway chain is enforced, not advisory.

**Tests are MANDATORY.** The spec defines 25 behavior pathways with 25
verification rows, plan.md lists 16 test files, and constitution Principle X
requires automated tests. Every test task precedes the implementation it covers.

## Format: `[ID] [P?] [Story] Description`

## Phase ordering note

Stories are ordered by dependency, then priority:

- **US1** builds the import loop everything else extends.
- **US2** protects the cards it creates.
- **US5** extends the loop with the disappearance rule — part of applying a
  sync, so it belongs with the loop rather than after the scheduler.
- **US3** wraps the loop in a scheduler.
- **US4** surfaces what the loop has been recording all along.
- **US6 runs last on purpose.** It asserts the *absence* of the credential
  across the browser payload, the logs and the settings surface — a claim that
  only means something once that whole surface exists. Auditing it first would
  audit an empty room.

---

> **TestRail sync status**: all 25 cases synced up front to project 115,
> suite 32733, under section 2162674 ("Slice 2 — Jira Import"), cases
> 19999978–20000002, each *To Be Automated* and priority *Must Test* (FULL
> tier). The per-story sync tasks are therefore complete. Mapping:
> `testrail-mapping.json`.

## Phase 1: Setup

- [ ] T201 Add `undici` as an explicit dev dependency for `MockAgent`, and a `test:contract` script running `vitest --config vitest.contract.config.ts`.
- [ ] T202 [P] Create `vitest.contract.config.ts` for `tests/contract`, separate from the unit suite because these tests replay HTTP fixtures.
- [ ] T203 [P] Extend `.env.example` with `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN`, with placeholder values and a note that the token can act as the user in Jira.

---

## Phase 2: Foundational (Blocking Prerequisites)

**No story work begins until this phase is complete.**

- [ ] T204 [P] `src/server/db/migrations/005_jira_links.sql` — per data-model.md, with `issue_key` UNIQUE so no-duplicate-per-issue is enforced by the database rather than only by the upsert.
- [ ] T205 [P] `src/server/db/migrations/006_sync_runs.sql` — outcome and failure-kind CHECK constraints; counts default 0.
- [ ] T206 [P] `src/server/db/migrations/007_settings.sql` — key/value, seeded with the default query and a 300-second interval.
- [ ] T207 [P] `src/server/db/migrations/008_cards_archive_reason.sql` — add `archived_reason`.
- [ ] T208 `src/server/jira/jira-port.ts` — the interface and the issue shape it returns. Read-only: `searchIssues` and nothing else.
- [ ] T209 [P] `src/server/jira/fake-jira-adapter.ts` — in-memory, controllable from step definitions: issues, pagination, and each failure mode.
- [ ] T210 [P] Extend `src/shared/types.ts` with `issueKey`, `issueUrl`, `SyncRun`, `SyncStatus`, and the two new problem codes.
- [ ] T211 [P] Extend `src/server/errors.ts` with `JIRA_NOT_CONFIGURED` and `EDIT_FORBIDDEN_JIRA_OWNED`.
- [ ] T212 [P] `src/server/repositories/settings-repository.ts` — typed read and write over the key/value table.
- [ ] T213 `tests/features/steps/jira.steps.ts` — harness wiring the fake adapter into the acceptance world.

**Checkpoint**: the schema exists, the port is defined, and a scenario can stage Jira issues.

---

## Phase 3: User Story 1 — My assigned Jira work appears (Priority: P1) 🎯 MVP

**Goal**: Issues matching the query become cards in Backlog, without duplicates, without disturbing anything else, and without writing to Jira.

**Independent Test**: Stage three issues in the fake, run a sync, see three Backlog cards; run twenty more syncs and still see three.

### TestRail sync

- [x] T214 [US1] Author or sync TestRail cases for BH-101, BH-102, BH-103, BH-105, BH-106, BH-107, BH-108, BH-109 and BH-125 via `spec-testrail-sync`. **Precedes every implementation task in this phase.**

### Tests — write first, confirm they FAIL

- [ ] T215 [P] [US1] `tests/unit/jql.test.ts` — default query shape; empty query rejected (BH-124's unit half).
- [ ] T216 [P] [US1] `tests/unit/no-jira-writes.test.ts` — the adapter's source contains no POST, PUT, PATCH or DELETE (BH-109, by absence of capability rather than by behaviour).
- [ ] T217 [P] [US1] `tests/contract/jira-adapter.test.ts` — real adapter against recorded fixtures: pagination across pages, 401, 429, 5xx, malformed body (BH-102).
- [ ] T218 [P] [US1] `tests/features/jira-import.feature` + steps — import into Backlog, no duplicates across twenty syncs, summary updates, empty result is a success (BH-101, BH-103, BH-105, BH-125).
- [ ] T219 [P] [US1] `tests/features/sync-non-interference.feature` + steps — sync never moves a user-placed card, never touches ad-hoc cards, never issues a write (BH-106, BH-108, BH-109).
- [ ] T220 [P] [US1] `tests/features/jira-snapshot.feature` + steps — recorded status and Jira's own last-updated value match what Jira returned (BH-107).

### Implementation

- [ ] T221 [P] [US1] `src/domain/jql.ts` — default query selecting the user's unfinished assigned issues (FR-107), and validation of a user-supplied one. Pure.
- [ ] T222 [US1] `src/server/jira/credentials.ts` — read connection details and credentials from environment only (FR-101), report configured/not-configured, and build the auth header at call time. **Never returns the token to a caller that might render or log it** (FR-104).
- [ ] T223 [US1] `src/server/jira/jira-adapter.ts` — `searchIssues` over `GET /rest/api/3/search/jql`, paginating to exhaustion so results beyond one page are imported (FR-109), 10s timeout, typed failures. GET only (FR-118).
- [ ] T224 [US1] `src/server/repositories/jira-link-repository.ts` — upsert a link recording the issue's status and Jira's own last-updated value (FR-116), read links, list issue keys currently on the board.
- [ ] T225 [US1] Extend `card-repository.ts` with `upsertFromJira`: create exactly one card per matching issue and no second card for one already present (FR-110), carrying the issue key, summary as title and link (FR-114), updating the title when the summary changes (FR-115). Places new cards at the top of Backlog (FR-112) and **never changes an existing card's column** (FR-113).
- [ ] T226 [US1] Extend `board-row.ts` and the board query so `Card` carries `issueKey` and `issueUrl`.
- [ ] T227 [US1] `src/server/sync/sync-service.ts` — fetch every page, then apply in one transaction, recording a `sync_run`. Ad-hoc cards are never altered, moved or removed by a sync (FR-117).
- [ ] T228 [US1] `src/server/repositories/sync-run-repository.ts` — start, finish, read latest, read last success.

**Checkpoint**: Jira work appears on the board. **Run the Story-Complete Review Gate.**

---

## Phase 4: User Story 2 — Tell my own work from Jira's (Priority: P1)

**Goal**: A Jira card is identifiable without opening it, links through to Jira, and resists local edits to fields Jira owns.

**Independent Test**: With one imported and one ad-hoc card side by side, confirm the source of each at a glance, and that delete and title-edit are refused on the imported one.

### TestRail sync

- [x] T229 [US2] Author or sync TestRail cases for BH-104 and BH-110 via `spec-testrail-sync`.

### Tests — write first, confirm they FAIL

- [ ] T230 [P] [US2] `tests/features/jira-card-identity.feature` + steps — key shown, marked Jira-sourced, delete and title edit refused with stated reasons (BH-104, BH-110).
- [ ] T231 [P] [US2] `tests/e2e/jira-card.spec.ts` — the card face carries the key and a working link; refusals surface in the interface (BH-104, BH-110).

### Implementation

- [ ] T232 [US2] Extend `card-service.ts`: refuse edits to Jira-owned fields with `EDIT_FORBIDDEN_JIRA_OWNED` (FR-121). Deletion of an imported card is refused with a stated reason (FR-120) by slice 1's `DELETE_FORBIDDEN_NON_LOCAL`.
- [ ] T233 [P] [US2] `CardView.tsx` — issue-key badge and link, making an imported card distinguishable from an ad-hoc one without opening it (FR-119).
- [ ] T234 [P] [US2] `CardDialog.tsx` — Jira-owned fields shown read-only rather than editable-then-refused, so the interface does not invite a rejection.

**Checkpoint**: the two kinds of card are unmistakable. **Run the Story-Complete Review Gate.**

---

## Phase 5: User Story 5 — Work leaving my queue does not vanish (Priority: P2)

**Goal**: An issue that stops matching the query is archived with a reason and restored if it returns.

**Independent Test**: Import an issue, remove it from the query result, sync, and find the card in Done and archived with a reason; put it back and find the same card restored.

### TestRail sync

- [x] T235 [US5] Author or sync TestRail cases for BH-111, BH-112 and BH-113 via `spec-testrail-sync`.

### Tests — write first, confirm they FAIL

- [ ] T236 [P] [US5] `tests/features/issue-disappearance.feature` + steps — archived into Done not deleted, reason recorded, movement attributed to sync, and the same card restored rather than duplicated (BH-111, BH-112, BH-113).

### Implementation

- [ ] T237 [US5] Extend `sync-service.ts`: diff the board's Jira cards against the query result; archive the absent ones into Done with a reason.
- [ ] T238 [US5] Movement caused by sync is appended to the history with actor `sync`, not `user` (FR-124). The column already accepts it — slice 1 constrained the actor set to include it.
- [ ] T239 [US5] Restore an archived card when its issue matches again, by `issue_key`, rather than creating a second card (FR-125).

**Checkpoint**: nothing disappears silently. **Run the Story-Complete Review Gate.**

---

## Phase 6: User Story 3 — The board keeps itself current (Priority: P1)

**Goal**: Syncs happen at startup, on an interval, and on demand — and never two at once.

**Independent Test**: With a short interval, stage a new issue and watch it appear without touching the board; then fire fifty concurrent refreshes and confirm one sync ran.

### TestRail sync

- [x] T240 [US3] Author or sync TestRail cases for BH-114, BH-115, BH-116, BH-117 and BH-124 via `spec-testrail-sync`.

### Tests — write first, confirm they FAIL

- [ ] T241 [P] [US3] `tests/unit/backoff.test.ts` — bounded exponential delays, `Retry-After` honoured, attempts capped (BH-117).
- [ ] T242 [P] [US3] `tests/features/sync-schedule.feature` + steps — sync at startup, again each interval, immediately on refresh, and never twice at once across fifty overlapping requests (BH-114, BH-115, BH-116).
- [ ] T243 [P] [US3] `tests/e2e/settings.spec.ts` — query and interval edited, persisted across restart, and **no field anywhere for a credential** (BH-124, and half of BH-122).

### Implementation

- [ ] T244 [P] [US3] `src/domain/backoff.ts` — delay sequence. Pure, no timers.
- [ ] T245 [US3] `src/server/sync/sync-lock.ts` — single-flight. A request arriving mid-sync **joins** the in-flight one rather than queueing a second (FR-129).
- [ ] T246 [US3] Apply bounded backoff and `Retry-After` in `jira-adapter.ts`, retrying rate limits and temporary unavailability rather than failing at once or retrying without limit (FR-130).
- [ ] T247 [US3] `src/server/sync/scheduler.ts` — a sync shortly after startup without waiting a full interval (FR-128) and one per configured interval thereafter (FR-126), with an injected clock so the tests need no real waiting.
- [ ] T248 [US3] `src/server/routes/settings.ts` — `GET`/`PUT /api/settings` exposing the query (FR-106) and the poll interval (FR-108), bounded to 60–3600. No credential field (FR-102).
- [ ] T249 [US3] `src/web/settings/SettingsDialog.tsx` — query and interval. No credential field.

**Checkpoint**: the board stays current on its own. **Run the Story-Complete Review Gate.**

---

## Phase 7: User Story 4 — I know whether sync is working (Priority: P1)

**Goal**: Sync state is legible at a glance, and a failure never blocks the board.

**Independent Test**: Watch the pill through success, in-progress and failure; confirm the board stays fully usable while Jira is unreachable.

### TestRail sync

- [x] T250 [US4] Author or sync TestRail cases for BH-118, BH-119, BH-120 and BH-121 via `spec-testrail-sync`.

### Tests — write first, confirm they FAIL

- [ ] T251 [P] [US4] `tests/features/sync-status.feature` + steps — success then failure then cleared, last-success retained through failure, rejected credentials read differently from connectivity loss, and a failed sync leaves no partial change and blocks nothing (BH-118, BH-119, BH-121).
- [ ] T252 [P] [US4] `tests/e2e/sync-status.spec.ts` — the pill through all three states, and the board interactive throughout (BH-119, BH-120).

### Implementation

- [ ] T253 [US4] `src/server/routes/sync.ts` — `POST /api/sync/run`, which runs a sync on demand rather than waiting for the interval (FR-127), and `GET /api/sync/status`.
- [ ] T254 [P] [US4] `src/web/sync/use-sync.ts` — status polling and manual refresh; a failure indication clears once a sync succeeds (FR-137).
- [ ] T255 [P] [US4] `src/web/sync/SyncStatus.tsx` — the header pill, showing the time of the last successful sync (FR-133). Non-blocking by construction: it is a pill, never an overlay (FR-134).

**Checkpoint**: sync is legible. **Run the Story-Complete Review Gate.**

---

## Phase 8: User Story 6 — Credentials stay where they belong (Priority: P1)

**Goal**: The token is nowhere it could leak, and its absence is a supported state.

**Independent Test**: Inspect every browser payload and every log line across a successful sync, a failed sync and an authentication failure; find nothing.

### TestRail sync

- [x] T256 [US6] Author or sync TestRail cases for BH-122 and BH-123 via `spec-testrail-sync`.

### Tests — write first, confirm they FAIL

- [ ] T257 [P] [US6] `tests/unit/credential-redaction.test.ts` — no error the adapter can produce contains the token, across every failure mode (BH-122).
- [ ] T258 [P] [US6] Extend `tests/features/sync-status.feature` — unconfigured Jira is reported as such and the ad-hoc board still works (BH-123).
- [ ] T259 [P] [US6] `tests/e2e/settings.spec.ts` assertion — no credential in any browser payload during a full sync cycle (BH-122).

### Implementation

- [ ] T260 [US6] Audit and harden `credentials.ts` and `jira-adapter.ts` against the redaction tests: no error carries the request, the header, or the token, and nothing reaches logs or diagnostic output (FR-103).
- [ ] T261 [US6] Unconfigured Jira reports cleanly from `GET /api/sync/status` and `POST /api/sync/run` (FR-105).

**Checkpoint**: the credential is provably nowhere. **Run the Story-Complete Review Gate.**

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T262 Update `docs/external-interactions.md`: Jira moves from "planned" to a real entry with contract, failure modes, timeout and retry policy.
- [ ] T263 Update `README.md`: connecting to Jira, the three new variables, and what this slice deliberately does not do (dragging a Jira card does not tell Jira — that is slice 3).
- [ ] T264 Verify plan.md's diagrams still match the as-built system; update if they drifted.
- [ ] T265 Verify all 16 test files named in plan.md exist and pass.
- [ ] T266 Verify SC-101…SC-109, including the two that are absence claims: zero writes to Jira and zero credential occurrences across the whole suite.
- [ ] T267 Code cleanup; no file over 300 lines without recorded justification.
- [ ] T268 Security check: no credential in the diff; dependency audit clean at Critical/High.
- [ ] T269 Run `quickstart.md` end to end — including the no-token path, which must work.
- [ ] T270 Run `/speckit.review` against the diff; address blocking findings.
- [ ] T271 Request peer review.

---

## Dependencies & Execution Order

**Setup → Foundational → US1 → US2 → US5 → US3 → US4 → US6 → Polish.**

- Foundational blocks everything: no story can run without the schema and the port.
- **US1 blocks all other stories** — they extend, protect, schedule, surface or audit the loop it builds.
- US5 extends `sync-service.ts` directly (T237 depends on T227).
- US3's scheduler wraps the service US1 built.
- US4 reads the `sync_runs` rows US1 has been writing since T227.

### Genuinely parallel

Foundational migrations T204–T207; the four `[P]` foundational modules; each story's test files; the two view components in US2.

### Not negotiable

- Every story's TestRail sync completes before its implementation tasks.
- Every story's tests are written and **failing** first (NFR-21).
- T222 (credentials) before T223 (adapter) — the adapter cannot build a header before something reads one.
- T227 (sync service) before T237 (disappearance), T245 (lock) and T247 (scheduler).

---

## Implementation Strategy

**MVP**: Phases 1–3. Jira work appears on the board, on demand. That alone
closes the other half of the core business problem.

Then: **+US2** the two kinds of card become unmistakable · **+US5** nothing
disappears silently · **+US3** it keeps itself current · **+US4** you can see
whether it is working · **+US6** the credential is provably contained.

---

## Per-Task Cleanup (MANDATORY)

After every task: no commented-out code, no unused imports, no unresolved
TODO/FIXME/HACK, no debug logging, no file over 300 lines without
justification, nothing beyond what spec.md requires, no unnecessary dependency.

**And one specific to this slice: no credential in anything you just wrote** —
not in a fixture, not in a test, not in a log line, not in a comment.

---

## Story-Complete Review Gate (MANDATORY)

Run at every Checkpoint. Dimensions as slice 1 — spec alignment, design,
error handling, tests, security — plus two this slice adds:

- **Did anything reach Jira that should not have?** Every write is a defect,
  not a design choice, until slice 3.
- **Could the credential have escaped?** Check the browser payload, the logs,
  the error paths and the settings response — not just the places you
  remembered to guard.
