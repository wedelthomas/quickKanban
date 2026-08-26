# Feature Specification: Jira Import

**Feature Branch**: `002-jira-import`
**Created**: 2026-08-26
**Status**: Draft
**Input**: User description: "Slice 2 — read-only import of Jira issues assigned to the user onto the board built in Slice 1. Issues arrive in Backlog; the board records what Jira said but never moves a card in response. Polling, manual refresh, sync status, credential handling, and graceful handling of issues that leave the query. No writes to Jira."

**Risk Tier:** FULL

**Business source**: `docs/brd.md` — this feature implements BR-05, BR-09,
BR-10…BR-15 and BR-21, plus NFR-01…NFR-04, NFR-07 and NFR-09. It depends on
Slice 1 (`specs/001-board-foundation/`) for the board, cards and movement
history it populates.

---

## Clarifications

### Session 2026-08-26

- Q: Which column does a newly imported issue land in? → A: Backlog. Sync never
  moves a card between columns in this feature; the user arranges their own
  board and the recorded Jira status is carried for Slice 3's benefit
- Q: Does this feature write to Jira at all? → A: No. Every interaction with
  Jira is a read

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - My assigned Jira work appears without my typing it (Priority: P1)

The user connects the board to Jira once. Every issue currently assigned to
them and not yet finished appears on the board alongside the ad-hoc cards they
created by hand — one place, one view, no retyping.

**Why this priority**: This is the whole point of the slice, and it closes the
other half of the core business problem (BP-1): a board that shows only
ad-hoc work is as incomplete as a Jira board that shows only Jira work.

**Independent Test**: Configure credentials and a query against a Jira instance
holding three issues assigned to the user, run a sync, and confirm three cards
appear in Backlog carrying each issue's key, summary and status.

**Acceptance Scenarios**:

1. **Given** a board with no Jira cards and three issues assigned to the user
   in Jira, **When** a sync runs, **Then** three cards appear in the Backlog
   column, one per issue.
2. **Given** an imported card, **When** the board is displayed, **Then** the
   card shows the issue key and the issue summary as its title.
3. **Given** a sync has already imported an issue, **When** a later sync runs,
   **Then** no duplicate card is created for that issue.
4. **Given** an issue's summary changed in Jira, **When** a sync runs, **Then**
   the card's title reflects the new summary.
5. **Given** the user's ad-hoc cards are on the board, **When** a sync runs,
   **Then** no ad-hoc card is altered, moved or removed.

---

### User Story 2 - I can tell my own work from Jira's at a glance (Priority: P1)

Two kinds of card now share the board. The user must never have to guess which
is which, because the rules that govern them differ: one is authoritative
elsewhere, the other exists only here.

**Why this priority**: Without a visible distinction the user can be misled
into treating a Jira card as freely editable. It is also the precondition for
every rule in this feature that applies to Jira cards but not to local ones.

**Independent Test**: With one imported card and one ad-hoc card side by side,
confirm the source of each is identifiable without opening either.

**Acceptance Scenarios**:

1. **Given** a board holding one imported card and one ad-hoc card, **When**
   the board is displayed, **Then** the imported card is visually marked as
   Jira-sourced and the ad-hoc card is not.
2. **Given** an imported card, **When** the user opens it, **Then** a link to
   the issue in Jira is available.
3. **Given** an imported card, **When** the user attempts to delete it,
   **Then** the deletion is refused and the reason is stated.
4. **Given** an imported card, **When** the user attempts to edit its title,
   **Then** the edit is refused and the user is told the title comes from Jira.

---

### User Story 3 - The board keeps itself current (Priority: P1)

The user leaves the board open. New assignments appear on their own. When they
want to know right now, a refresh answers immediately.

**Why this priority**: A board that imports once is a snapshot, not a board.
Automatic currency is what lets the user trust it without thinking about it.

**Independent Test**: With the poll interval set low, assign a new issue in
Jira, wait one interval without touching the board, and confirm the card
appears. Separately, assign another and confirm a manual refresh brings it in
without waiting.

**Acceptance Scenarios**:

1. **Given** the board is open and a new issue is assigned to the user in
   Jira, **When** one poll interval elapses, **Then** the issue appears on the
   board without any user action.
2. **Given** the board is open, **When** the user triggers a refresh, **Then** a
   sync runs immediately rather than waiting for the next interval.
3. **Given** a sync is already running, **When** the user triggers a refresh,
   **Then** a second concurrent sync does not start.
4. **Given** the poll interval is changed in settings, **When** the new
   interval elapses, **Then** syncs occur at the new cadence.
5. **Given** the application has just started, **When** it becomes ready,
   **Then** an initial sync runs without waiting a full interval.

---

### User Story 4 - I know whether sync is working (Priority: P1)

Sync happens in the background. When it is healthy the user should be able to
confirm that at a glance; when it is broken they must find out from the board
rather than from stale data they mistook for current.

**Why this priority**: A silently broken sync is worse than no sync, because
the user keeps trusting a board that stopped updating. This is the specific
failure that would destroy confidence in the tool (success metric M-4).

**Independent Test**: Confirm the board reports its last successful sync time;
then make Jira unreachable, run a sync, and confirm the failure is visible and
the board still works.

**Acceptance Scenarios**:

1. **Given** a sync has succeeded, **When** the board is displayed, **Then**
   the time of the last successful sync is shown.
2. **Given** Jira is unreachable, **When** a sync runs, **Then** the failure is
   shown on the board and the last successful sync time remains visible.
3. **Given** a sync has failed, **When** the user interacts with the board,
   **Then** creating, editing and moving cards all continue to work.
4. **Given** a sync failed and a later sync succeeds, **When** the board is
   displayed, **Then** the failure indication is cleared.
5. **Given** credentials are rejected by Jira, **When** a sync runs, **Then**
   the user is told the credentials were rejected, distinctly from a network
   failure.

---

### User Story 5 - Work that leaves my queue does not vanish (Priority: P2)

An issue gets closed, or reassigned to someone else. It stops matching the
query. The card must not simply disappear between one glance and the next.

**Why this priority**: Silent disappearance is indistinguishable from a bug,
and it destroys the movement history that Slice 4 depends on. Important, but
the board is already useful before this case is handled.

**Independent Test**: Import an issue, close it in Jira, run a sync, and
confirm the card moved to Done with the reason recorded rather than being
deleted.

**Acceptance Scenarios**:

1. **Given** an imported card whose issue no longer matches the query,
   **When** a sync runs, **Then** the card moves to the Done column and is
   archived, and is not deleted.
2. **Given** such a card, **When** the user inspects it, **Then** the reason it
   left the board is recorded and readable.
3. **Given** such a card was archived, **When** a later sync runs and the issue
   matches the query again, **Then** the card returns to the board rather than
   a duplicate being created.
4. **Given** a card moves to Done because its issue left the query, **When**
   the movement history is inspected, **Then** the movement is attributed to
   the sync process rather than the user.

---

### User Story 6 - My Jira credentials stay where they belong (Priority: P1)

The token that can act as the user in Jira is supplied once through
configuration and is never visible again — not in the interface, not in logs,
not in the browser.

**Why this priority**: This is the constitution's absolute rule and the
project's largest security surface. A leaked token is not a defect to fix
later; it is an incident.

**Independent Test**: Inspect everything the browser receives and everything
written to logs during a successful and a failed sync, and confirm no
credential material appears in either.

**Acceptance Scenarios**:

1. **Given** the system is configured with Jira credentials, **When** the
   board is loaded, **Then** no credential material is present in anything the
   browser receives.
2. **Given** a sync fails with an authentication error, **When** logs and
   error output are inspected, **Then** the credential is absent or redacted.
3. **Given** the user opens settings, **When** the settings are displayed,
   **Then** no field displays or accepts the Jira credential.
4. **Given** the system starts with no Jira credentials configured, **When**
   it becomes ready, **Then** it reports that Jira is not configured and the
   board still works with ad-hoc cards only.

---

### Edge Cases

- **The query matches no issues** — sync succeeds and reports success; the
  board simply shows no Jira cards. An empty result is not a failure.
- **The query matches more issues than one response can return** — every
  matching issue is imported, not just the first page.
- **Jira responds slowly or times out** — the sync ends, the failure is
  recorded, and the next scheduled sync proceeds normally.
- **Jira rate-limits the request** — the sync backs off and retries rather
  than failing permanently or hammering the service.
- **An issue is assigned to the user, then reassigned away, then reassigned
  back, between two syncs** — the board reflects only the state at sync time;
  intermediate states are not reconstructed.
- **An issue's key changes because it moved project** — treated as the issue
  it now is; no duplicate card is created for the old key.
- **The user changes the query in settings so a previously matching issue no
  longer matches** — handled exactly as an issue leaving the query.
- **The application is stopped mid-sync** — no partially applied sync is left
  behind; the next sync starts cleanly.
- **The system clock and Jira's clock disagree** — the recorded Jira
  last-updated value is Jira's, never the local clock's, so comparisons in
  Slice 3 remain sound.

---

## Requirements *(mandatory)*

### Functional Requirements

**Connection and configuration**

- **FR-101**: System MUST read Jira connection details and credentials from
  environment configuration only. *(NFR-01)*
- **FR-102**: System MUST NOT display, return or accept credential material in
  any user interface. *(BR-37, NFR-02)*
- **FR-103**: System MUST NOT include credential material in logs, error
  messages or diagnostic output. *(NFR-04)*
- **FR-104**: System MUST NOT transmit credential material to the browser.
  All Jira communication originates server-side. *(NFR-02)*
- **FR-105**: When Jira is not configured, System MUST report that state and
  MUST continue to serve the board with ad-hoc cards. *(BR-20)*
- **FR-106**: System MUST allow the issue query to be viewed and changed in
  settings. *(BR-11)*
- **FR-107**: System MUST default the query to issues assigned to the current
  user that are not in a completed state. *(BR-10)*
- **FR-108**: System MUST allow the poll interval to be viewed and changed in
  settings, defaulting to 5 minutes. *(BR-12)*

**Importing**

- **FR-109**: System MUST import every issue matching the configured query,
  including results beyond a single response. *(BR-10)*
- **FR-110**: System MUST create one card per matching issue not already
  represented on the board. *(BR-10)*
- **FR-111**: System MUST NOT create a second card for an issue already
  represented on the board. *(BR-10)*
- **FR-112**: A newly imported card MUST be placed in the Backlog column. *(BR-10)*
- **FR-113**: System MUST NOT change the column of an existing card as a result
  of a sync, except as required by FR-122. *(BR-15)*
- **FR-114**: An imported card MUST carry the issue key, the issue summary as
  its title, and a link to the issue. *(BR-05)*
- **FR-115**: System MUST update an imported card's title when the issue
  summary changes in Jira. *(BR-10)*
- **FR-116**: System MUST record, for each imported card, the issue's status
  and Jira's own last-updated value as at the last successful sync. *(BR-15)*
- **FR-117**: System MUST NOT alter, move or remove ad-hoc cards during a sync. *(BR-23)*
- **FR-118**: System MUST NOT write to Jira in any way in this feature. *(BR-22)*

**Distinguishing and protecting Jira cards**

- **FR-119**: An imported card MUST be visually distinguishable from an ad-hoc
  card without being opened. *(BR-05)*
- **FR-120**: System MUST refuse deletion of an imported card while its issue
  matches the query, and MUST state why. *(BR-09)*
- **FR-121**: System MUST refuse local edits to fields owned by Jira — the
  title and the issue key — and MUST state why. *(BR-22)*

**Issues leaving the query**

- **FR-122**: When an imported card's issue no longer matches the query,
  System MUST move the card to Done and archive it, and MUST NOT delete it. *(BR-21)*
- **FR-123**: System MUST record why such a card left the board. *(BR-21)*
- **FR-124**: A movement caused by a sync MUST be attributed in the movement
  history to the sync process rather than to the user. *(BR-31)*
- **FR-125**: If an archived card's issue matches the query again, System MUST
  restore that card rather than create a duplicate. *(BR-21)*

**Scheduling and resilience**

- **FR-126**: System MUST run a sync automatically at the configured interval. *(BR-12)*
- **FR-127**: System MUST run a sync when the user requests a refresh. *(BR-13)*
- **FR-128**: System MUST run a sync shortly after startup without waiting a
  full interval. *(BR-12)*
- **FR-129**: System MUST NOT run two syncs concurrently; a request arriving
  while a sync is running MUST NOT start a second one. *(NFR-07)*
- **FR-130**: System MUST retry with increasing delay when Jira reports a rate
  limit or is temporarily unavailable, rather than failing immediately or
  retrying without limit. *(NFR-09)*
- **FR-131**: A failed sync MUST NOT leave partially applied changes. *(NFR-08)*
- **FR-132**: A failed sync MUST NOT prevent creating, editing or moving cards. *(BR-20)*

**Reporting sync state**

- **FR-133**: System MUST show the time of the last successful sync. *(BR-14)*
- **FR-134**: System MUST show that a sync is in progress without blocking
  interaction with the board. *(BR-14, NFR-16)*
- **FR-135**: System MUST show that the last sync failed, while continuing to
  show the last successful sync time. *(BR-14)*
- **FR-136**: System MUST distinguish a rejected-credentials failure from a
  connectivity failure in what it tells the user. *(BR-14)*
- **FR-137**: System MUST clear a failure indication once a sync succeeds. *(BR-14)*

### Key Entities

- **Jira Link**: The association between a card and a Jira issue. Carries the
  issue key, a link to the issue, the issue's status and Jira's own
  last-updated value as at the last successful sync, and the time of that
  sync. One per Jira-sourced card.
- **Sync Run**: A record of one synchronisation attempt — when it started and
  finished, whether it succeeded, how many issues it saw, created, updated and
  archived, and on failure, the kind of failure.
- **Query Configuration**: The user-adjustable definition of which issues
  belong on the board, plus the poll interval.

The **Card** entity from Slice 1 gains a source of Jira-sourced and an
optional Jira Link. The **Card Movement** entity gains sync as a possible
actor.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101**: 100% of issues matching the query appear on the board after one
  sync, including issues beyond the first response page. *(BR-10)*
- **SC-102**: Zero duplicate cards exist for any issue across 20 consecutive
  syncs. *(FR-111)*
- **SC-103**: A newly assigned issue appears on the board within one poll
  interval, with no user action. *(BR-12)*
- **SC-104**: Zero ad-hoc cards are altered, moved or removed across 20
  consecutive syncs. *(BR-23)*
- **SC-105**: Zero occurrences of credential material in anything the browser
  receives or anything written to logs, across a successful sync, a failed
  sync and an authentication failure. *(NFR-01, NFR-02, NFR-04)*
- **SC-106**: 100% of board actions — create, edit, move, delete an ad-hoc
  card — remain available while Jira is unreachable. *(BR-20)*
- **SC-107**: Zero concurrent sync runs across 50 overlapping refresh
  requests. *(NFR-07)*
- **SC-108**: Zero cards are deleted as a result of an issue leaving the
  query; 100% are archived instead. *(BR-21)*
- **SC-109**: Zero write requests are issued to Jira across the full test
  suite. *(BR-22)*

---

## Assumptions

- The user holds a valid Jira credential with permission to read the issues
  the query returns (BRD assumption A-1).
- The user's assigned open issues number in the tens, so a sync completing in
  a few seconds is achievable and incremental synchronisation is unnecessary
  (BRD assumption A-4).
- The issue key is a stable identifier for the lifetime of an issue. A key
  change from a project move is rare and is treated as the issue it now is.
- Jira's own last-updated value is authoritative for change detection. The
  local clock is never used for that comparison, because the two machines'
  clocks are not guaranteed to agree.
- Recording the issue's status without acting on it is useful now because
  Slice 3 needs a last-known state to compare against. This feature writes
  that record and deliberately never reads it.
- The board arrangement is the user's own in this feature. Jira status is
  recorded, not obeyed.

---

## Out of Scope for This Feature

- Writing anything to Jira, including status transitions *(Slice 3)*.
- Mapping board columns to Jira statuses *(Slice 3)*.
- Moving a card in response to a Jira status change *(Slice 3)*.
- Conflict detection and resolution *(Slice 3)*.
- Creating Jira issues from ad-hoc cards *(non-goal, BRD §5.2)*.
- Editing any Jira field, including comments and worklogs *(non-goal, BRD §5.2)*.
- Receiving pushed updates from Jira *(non-goal, BRD constraint C-5)*.
- Displaying the archive of cards that left the query *(Slice 4)*.
- Filtering the board by source *(Slice 4)*.

---

## Behavior Pathways

- **BH-101** (satisfies FR-109, FR-110, FR-112): Matching issues import into
  Backlog
  - **Given** three issues match the configured query and none is on the board
  - **When** a sync runs
  - **Then** three cards exist in the Backlog column, one per issue

- **BH-102** (satisfies FR-109): Import is not limited to one response page
  - **Given** the query matches more issues than a single Jira response returns
  - **When** a sync runs
  - **Then** a card exists for every matching issue, not only the first page

- **BH-103** (satisfies FR-111): Repeated syncs do not duplicate
  - **Given** an issue already has a card
  - **When** twenty further syncs run
  - **Then** exactly one card exists for that issue

- **BH-104** (satisfies FR-114, FR-119): Imported cards show their origin
  - **Given** an imported card and an ad-hoc card on the board
  - **When** the board is displayed
  - **Then** the imported card shows its issue key and is marked Jira-sourced,
    and the ad-hoc card is not

- **BH-105** (satisfies FR-115): Summary changes flow through
  - **Given** an imported card whose issue summary changes in Jira
  - **When** a sync runs
  - **Then** the card's title matches the new summary

- **BH-106** (satisfies FR-113): Sync never rearranges the board
  - **Given** an imported card the user moved to Test, and its issue's status
    has since changed in Jira
  - **When** a sync runs
  - **Then** the card is still in Test

- **BH-107** (satisfies FR-116): The last known Jira state is recorded
  - **Given** an imported card
  - **When** a sync completes successfully
  - **Then** the card's recorded Jira status and Jira last-updated value match
    what Jira reported, and the sync time is recorded

- **BH-108** (satisfies FR-117): Ad-hoc cards are untouched by sync
  - **Given** ad-hoc cards in four columns
  - **When** twenty syncs run
  - **Then** every ad-hoc card is in the column and position it started in

- **BH-109** (satisfies FR-118): Nothing is written to Jira
  - **Given** any board activity and any number of syncs
  - **When** the requests issued to Jira are inspected
  - **Then** every one is a read; no write request was issued

- **BH-110** (satisfies FR-120, FR-121): Jira-owned data resists local change
  - **Given** an imported card whose issue matches the query
  - **When** the user attempts to delete it, and separately to edit its title
  - **Then** both are refused, each with a stated reason

- **BH-111** (satisfies FR-122, FR-123): Issues leaving the query are archived
  - **Given** an imported card whose issue is then closed in Jira
  - **When** a sync runs
  - **Then** the card is in Done, is archived, still exists, and records why it
    left

- **BH-112** (satisfies FR-124): Sync-caused movement is attributed to sync
  - **Given** a card archived because its issue left the query
  - **When** the movement history is inspected
  - **Then** the movement's actor is the sync process, not the user

- **BH-113** (satisfies FR-125): A returning issue restores its card
  - **Given** a card archived because its issue left the query
  - **When** the issue matches the query again and a sync runs
  - **Then** the original card is restored and no duplicate exists

- **BH-114** (satisfies FR-126, FR-128): Syncs run at startup and on schedule
  - **Given** the poll interval is configured and Jira is reachable
  - **When** the application starts, and the interval then elapses twice
  - **Then** a sync runs shortly after startup without waiting a full interval,
    and one further sync runs per elapsed interval, with no user action

- **BH-115** (satisfies FR-127): Refresh syncs immediately
  - **Given** the board is open and the next scheduled sync is not due
  - **When** the user requests a refresh
  - **Then** a sync runs immediately

- **BH-116** (satisfies FR-129): Syncs never overlap
  - **Given** a sync is in progress
  - **When** fifty refresh requests arrive
  - **Then** no second sync run is started

- **BH-117** (satisfies FR-130): Rate limits are absorbed, not amplified
  - **Given** Jira reports a rate limit
  - **When** a sync runs
  - **Then** the sync waits an increasing delay and retries a bounded number of
    times rather than failing at once or retrying without limit

- **BH-118** (satisfies FR-131, FR-132): A failed sync is inert, not damaging
  - **Given** Jira becomes unreachable partway through a sync
  - **When** the sync fails
  - **Then** no partially applied change remains, and creating, editing,
    moving and deleting ad-hoc cards all still work

- **BH-119** (satisfies FR-133, FR-135, FR-137): Sync state is legible
  - **Given** a successful sync, then a failing sync, then a successful sync
  - **When** the board is displayed after each
  - **Then** it shows the last success time; then the failure alongside the
    retained last success time; then the failure indication cleared

- **BH-120** (satisfies FR-134): Sync does not block the board
  - **Given** a sync is in progress
  - **When** the user creates and moves a card
  - **Then** both succeed and progress is indicated without obstructing the
    board

- **BH-121** (satisfies FR-136): Authentication failure reads differently
  - **Given** Jira rejects the configured credentials
  - **When** a sync runs
  - **Then** the user is told the credentials were rejected, in terms distinct
    from those used for a connectivity failure

- **BH-122** (satisfies FR-101, FR-102, FR-103, FR-104): Credentials never
  surface
  - **Given** the system is configured with Jira credentials
  - **When** a successful sync, a failed sync and an authentication failure
    have all occurred
  - **Then** no credential material appears in anything the browser received,
    in any log, or in any settings field

- **BH-123** (satisfies FR-105): Unconfigured Jira degrades gracefully
  - **Given** no Jira credentials are configured
  - **When** the application starts
  - **Then** it reports Jira as not configured and the board works with ad-hoc
    cards

- **BH-124** (satisfies FR-106, FR-107, FR-108): Query and cadence are the
  user's
  - **Given** the default configuration
  - **When** the user views settings, then changes the query and the interval
  - **Then** the default query selects their unfinished assigned issues, and
    subsequent syncs use the changed query and cadence

- **BH-125** (satisfies FR-110): An empty result is a success
  - **Given** the configured query matches no issues
  - **When** a sync runs
  - **Then** the sync is reported as successful and no Jira cards are shown

---

## Verification

| ID | Test name | Pins |
|---|---|---|
| TEST-101 | Matching issues create one Backlog card each | BH-101 |
| TEST-102 | Issues beyond the first response page are imported | BH-102 |
| TEST-103 | Twenty syncs produce no duplicate card | BH-103 |
| TEST-104 | Imported card shows issue key and Jira-sourced marking | BH-104 |
| TEST-105 | Changed issue summary updates the card title | BH-105 |
| TEST-106 | Sync leaves a user-placed card in its column | BH-106 |
| TEST-107 | Recorded Jira status and last-updated match what Jira returned | BH-107 |
| TEST-108 | Twenty syncs leave every ad-hoc card untouched | BH-108 |
| TEST-109 | No write request is issued to Jira in the whole suite | BH-109 |
| TEST-110 | Delete and title edit are refused on an imported card | BH-110 |
| TEST-111 | Issue leaving the query archives the card into Done | BH-111 |
| TEST-112 | Sync-caused movement records sync as the actor | BH-112 |
| TEST-113 | Returning issue restores the archived card without duplicating | BH-113 |
| TEST-114 | Sync runs at startup and again each interval | BH-114 |
| TEST-115 | Refresh triggers a sync ahead of schedule | BH-115 |
| TEST-116 | Fifty overlapping refreshes start no second sync | BH-116 |
| TEST-117 | Rate limit produces bounded backoff and retry | BH-117 |
| TEST-118 | Failed sync leaves no partial change and blocks no board action | BH-118 |
| TEST-119 | Sync status shows success, then failure, then clears | BH-119 |
| TEST-120 | Board stays interactive while a sync runs | BH-120 |
| TEST-121 | Rejected credentials report differently from connectivity loss | BH-121 |
| TEST-122 | No credential appears in browser payloads, logs or settings | BH-122 |
| TEST-123 | Unconfigured Jira still serves the ad-hoc board | BH-123 |
| TEST-124 | Default query is the user's unfinished assigned issues; changes take effect | BH-124 |
| TEST-125 | Empty query result is reported as a successful sync | BH-125 |
