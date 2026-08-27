# Feature Specification: Iteration and Board Restructure

**Feature Branch**: `005-iteration-and-board-restructure`
**Created**: 2026-08-26
**Status**: Draft
**Input**: User description: "Slice 5 — Iteration and board restructure. The six columns become Backlog, Iteration Items, In Progress, Test, PO Review, Done; the Blocked column is retired in favour of a card flag; and the board learns the TradeStation iteration calendar and shows it in a banner. Time, points, velocity, burndown and all Phase 2 reporting are deferred to Slice 6."

**Risk Tier:** FULL

**Business source**: `docs/brd-2.md` (BRD v2) — this feature implements
BR-38…BR-61, BR-81…BR-83 and BR-86, plus NFR-25, NFR-27, NFR-28, NFR-30 and
NFR-32. It builds on the completed v1 baseline: Slice 1 for the column model
and movement history, Slice 2 for Jira import, Slice 3 for column-to-status
mapping and the conflict model, and Slice 4 for filters and the generated
summary. NFR-05, NFR-21 and NFR-24 are cross-cutting and apply here as they do
to every slice.

**Supersedes**: BR-01 (the v1 six-column set). D-7's local-only column
mechanism is reused unchanged; only its justifying example moves from Blocked
to Iteration Items.

---

## Clarifications

### Session 2026-08-26

Decisions taken while drafting BRD v2, recorded here because they constrain
this slice directly.

- Q: Where does the current TS iteration come from? → A: A single configured
  Jira reference board, read through the Agile API, defaulting to board 1391
  (CRM TradeBlazers). Not computed from a calendar rule: the sprint ordinal
  resets at the fiscal-year boundary, so a counting rule would drift silently
  every January.
- Q: Should the iteration come from the cards themselves? → A: No. Only 1 of
  the user's 12 open issues carries a Jira sprint, so per-card sprint data
  cannot establish the iteration.
- Q: Does Iteration Items membership come from Jira sprint membership? → A: No,
  it is a local user decision, for the same sparseness reason.
- Q: How is blocked shown, given the card already spends its most scannable
  pixel on the priority dot? → A: A red left edge on the card *and* a "Blocked"
  badge, both inheriting `#e04b4b` — the hue that `--column-blocked` frees up
  when the column retires. The priority dot keeps its existing meaning.
- Q: Should the board write the blocked flag back to Jira? → A: No. BR-22
  stands; status remains the only field the board writes.
- Q: Where do blocked cards go during the migration? → A: In Progress, not
  Backlog. Backlog would discard the fact that the work is in flight.
- Q: How is carry-over surfaced? → A: A badge on the card face showing how many
  iterations it has carried through, so chronic carry-over is visible on the
  board rather than only in a report.

### Session 2026-08-26 (spec review)

- Q: How is a blocked divergence from Jira distinguished on the card from plain
  blocked? → A: A distinct marker on the card face, rendered outlined rather
  than solid so it reads as "the two sources disagree" and not as "this card is
  blocked". The solid badge and red edge remain reserved for actually blocked.
- Q: Board 1391 carries two active sprints per iteration, one per team sharing
  it. Which is used? → A: TradeBlazers only. The other team's sprints are
  ignored. Their dates and ordinals match, but the displayed name would differ,
  so the choice must be explicit rather than incidental.
- Q: What resets the carry-over count? → A: Reaching Done, or returning to
  Backlog. The count measures one continuous stretch of being committed but
  unfinished; pulling a card back to Backlog is a deliberate withdrawal of that
  commitment and starts the next stretch fresh.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Blocked is a state my card carries, not a place it goes (Priority: P1)

Today a blocked card must be dragged into a Blocked column, which throws away
the information that the work was in test, or in review, or nearly done. The
user wants to mark a card blocked wherever it actually is, see it at a glance
across a full board, and get the sixth column back for something useful.

**Why this priority**: This is the atomic change the rest of the slice sits on.
The column set cannot be half-migrated, and both the Iteration Items column and
the blocked flag depend on it landing together. It also carries the only
destructive step in the slice — moving live cards out of a column that ceases
to exist.

**Independent Test**: Can be fully tested by starting from a board with cards
in the Blocked column, applying the upgrade, and confirming every one of them
now sits in In Progress carrying the blocked flag, with the move recorded in
the movement history — delivering a board where blocked no longer costs a
column.

**Acceptance Scenarios**:

1. **Given** a board carrying cards in the Blocked column, **When** the upgrade
   is applied, **Then** the board presents Backlog, Iteration Items, In
   Progress, Test, PO Review and Done, and every previously blocked card sits
   in In Progress with the blocked flag set.
2. **Given** the upgrade has been applied, **When** the movement history is
   read, **Then** each migrated card has a record of the move attributed to the
   system rather than to the user.
3. **Given** a card anywhere on the board, **When** the user sets the blocked
   flag, **Then** the card stays in its column and is identifiable as blocked
   without being opened.
4. **Given** a blocked card, **When** the user drags it to another column,
   **Then** the move succeeds and the card remains blocked.
5. **Given** a board of roughly fifty cards of which several are blocked,
   **When** the user looks at the board, **Then** every blocked card is
   identifiable without filtering or opening anything.

---

### User Story 2 - The board tells me which iteration we are in (Priority: P1)

Every other artefact at TradeStation is organised around an iteration such as
"2026 S18". The board is not, so the user has to look it up elsewhere. They
want the current iteration, its dates and how much of it is left, visible
without leaving the board.

**Why this priority**: It is the headline capability of the slice and is
independent of the restructure — it delivers value even if User Story 1 were
absent. It is also the prerequisite for carry-over (User Story 5) and for every
Slice 6 report.

**Independent Test**: Can be fully tested by pointing the board at a reference
board with a dated active sprint and confirming the banner shows that sprint's
name, date range and remaining working days, then making the source
unreachable and confirming the banner still shows the last known iteration,
marked as not freshly read.

**Acceptance Scenarios**:

1. **Given** a configured reference board whose active sprint is named
   "CRM TradeBlazers 2026 S18" running 2026-08-24 to 2026-09-07, **When** the
   board loads, **Then** the banner shows that name, that date range, and the
   number of working days remaining.
2. **Given** an iteration has been resolved and cached, **When** the source
   becomes unreachable, **Then** the banner continues to show the cached
   iteration and marks it as not freshly read.
3. **Given** no iteration has ever been resolved and the source is unreachable,
   **When** the board loads, **Then** the banner shows the iteration computed
   from the configured anchor date and cadence, marked as estimated.
4. **Given** the source is slow or unreachable, **When** the board loads,
   **Then** the board is fully usable and the banner populates separately.
5. **Given** the configured reference board's active sprint has no start or end
   date, **When** resolution runs, **Then** it is treated as no result and the
   cache or the estimated fallback is used instead.

---

### User Story 3 - I commit work to this iteration (Priority: P2)

The user wants a visible place on the board for the work they have committed to
the current iteration, distinct from the undifferentiated backlog behind it —
and they want that commitment to be their own decision, not something Jira
infers on their behalf.

**Why this priority**: The column exists as of User Story 1; this story gives it
its behaviour. Valuable but not urgent — the board is coherent without it, and
the sparseness of Jira sprint data means nothing here can be automated anyway.

**Independent Test**: Can be fully tested by moving cards into Iteration Items
and confirming that Jira-sourced cards land there without any Jira request
being issued, and that nothing places cards there automatically.

**Acceptance Scenarios**:

1. **Given** a card in Backlog, **When** the user moves it to Iteration Items,
   **Then** the card sits in Iteration Items and its order persists.
2. **Given** a Jira-sourced card and the default configuration, **When** the
   user moves it into Iteration Items, **Then** the board changes and no
   request is issued to Jira, because the column has no status mapping.
3. **Given** a Jira issue whose sprint matches the current iteration, **When**
   a sync runs, **Then** the card is not placed in Iteration Items by the
   system.

---

### User Story 4 - Blockers my team recorded in Jira reach my board (Priority: P2)

Blockers are already recorded in Jira on the issues the user is assigned. They
want those to surface on the board without re-entering them, while keeping the
final say themselves.

**Why this priority**: Genuine convenience that removes duplicate entry, but the
board is fully functional with the local flag alone, so it follows the stories
that establish the flag and the iteration.

**Independent Test**: Can be fully tested by importing an issue whose blocked
field is set, confirming the card shows blocked, then clearing it locally and
confirming that subsequent syncs do not re-set it and that the disagreement is
visible on the card.

**Acceptance Scenarios**:

1. **Given** a Jira issue whose blocked field is set, **When** it is imported,
   **Then** the card shows as blocked.
2. **Given** an imported card showing blocked from Jira, **When** the user
   clears the flag locally, **Then** the card is not blocked, the divergence
   from Jira is visible on the card, and later syncs do not re-set it.
3. **Given** a card whose blocked state diverges from Jira's, **When** the user
   tries to move it, **Then** the move succeeds — a divergence is not a
   conflict and does not freeze the card.
4. **Given** any sequence of blocked changes on the board, **When** the write
   requests issued to Jira are inspected, **Then** none of them touch the
   blocked field.

---

### User Story 5 - Chronic carry-over is visible (Priority: P3)

Work that slips from iteration to iteration is the thing the user most wants to
notice and least wants to go looking for. They want a card that has carried to
say so on its face.

**Why this priority**: Depends on both the iteration (User Story 2) and the
committed-work column (User Story 3), and delivers insight rather than
capability. Valuable, but last.

**Independent Test**: Can be fully tested by advancing the board across an
iteration boundary with unfinished cards on it and confirming those cards
remain, and display how many iterations they have carried.

**Acceptance Scenarios**:

1. **Given** unfinished cards in Iteration Items, In Progress, Test or PO
   Review, **When** the iteration ends and a new one begins, **Then** those
   cards remain on the board in their columns.
2. **Given** a card that has survived two iteration boundaries unfinished,
   **When** the user looks at it, **Then** the card face shows that it has
   carried through two iterations.
3. **Given** a card that has never crossed an iteration boundary, **When** the
   user looks at it, **Then** no carry-over marker is shown.

---

### User Story 6 - I can point the board at my own team's calendar (Priority: P3)

The defaults are drawn from one team's board and one Jira instance's field
numbering. The user wants to change either without a code change.

**Why this priority**: The defaults are verified correct today, so this is
insurance rather than capability. It matters when a Jira administrator
renumbers a field or the user changes team.

**Independent Test**: Can be fully tested by changing the reference board in
settings, confirming the banner follows it, restarting, and confirming the
setting survived.

**Acceptance Scenarios**:

1. **Given** the settings screen, **When** the user changes the iteration
   reference board or the team name, **Then** the next resolution follows the
   new values.
2. **Given** changed Phase 2 settings, **When** the application restarts,
   **Then** the settings are still in force.
3. **Given** the settings screen, **When** the user views it, **Then** the Jira
   field identifiers for blocked, sprint and story points are visible and
   editable, with their defaults shown.

---

### Edge Cases

- **A card in Blocked also has an unresolved conflict.** The conflict model
  freezes such a card against moves, but the column it sits in is being
  removed. The migration must still move it, or it would be stranded in a
  column that no longer exists; the conflict itself survives the migration
  untouched.
- **The Blocked column is empty at upgrade time.** The migration must complete
  and record nothing rather than failing on an empty set.
- **The upgrade is applied twice.** The second run must find no Blocked column
  and make no further changes.
- **A saved column-to-status mapping refers to the removed Blocked column.**
  That mapping is discarded without disturbing the mappings for surviving
  columns.
- **The reference board has an active sprint with a name but null dates.** This
  is real — board 1391's future sprints are undated. Treated as no result.
- **The reference board has no active sprint at all.** Also real: board 5600
  has zero sprints of any state. Treated as no result.
- **Two sprints are active on the reference board simultaneously.** This is the
  normal state, not an exception: board 1391 is shared by two teams, and every
  iteration in its 730-sprint history exists twice — "CRM TradeBlazers 2026 S18"
  alongside "MDS 2026 S18", with identical dates. The configured team name
  decides, and the other team's sprints are ignored.
- **The iteration ends while the board is open.** The banner must not continue
  asserting a finished iteration indefinitely.
- **Jira reports a card blocked, the user clears it, and Jira later clears it
  too.** The states have converged and the divergence marker must disappear.
- **A blocked card is moved to Done.** Blocked is not a barrier to completion;
  the flag travels with the card.

## Requirements *(mandatory)*

### Functional Requirements

#### Column structure

- **FR-401**: The board MUST present exactly six ordered columns: Backlog,
  Iteration Items, In Progress, Test, PO Review, Done. Columns remain fixed and
  not user-editable. Supersedes the v1 column set.
- **FR-402**: The Blocked column MUST NOT exist after this feature is applied.
- **FR-403**: A card MUST carry a blocked indicator that is independent of which
  column it occupies.
- **FR-404**: On upgrade, every card in the Blocked column MUST be placed in In
  Progress with its blocked indicator set. No card may be placed in Backlog.
- **FR-405**: Each placement performed by FR-404 MUST be recorded in the
  movement history, attributed to the system rather than to the user.
- **FR-406**: FR-404 MUST apply to every card in the Blocked column, including
  cards carrying an unresolved conflict, which would otherwise be frozen. The
  conflict MUST survive the migration unchanged.
- **FR-407**: Applying the upgrade a second time MUST make no further changes.
- **FR-408**: Iteration Items MUST default to having no configured Jira status
  mapping, making it local-only under the existing unmapped-column behaviour.
- **FR-409**: Any saved column-to-status mapping for the removed Blocked column
  MUST be discarded without affecting the mappings of surviving columns.

#### The blocked indicator

- **FR-410**: A blocked card MUST be identifiable without opening it, and MUST
  remain so when roughly fifty cards are displayed.
- **FR-411**: The blocked state MUST be conveyed by more than colour alone.
- **FR-412**: Users MUST be able to set and clear the blocked indicator on any
  card, whether local or Jira-sourced.
- **FR-413**: The blocked indicator MUST be filterable alongside the existing
  filters.
- **FR-414**: A blocked card MUST remain movable between columns. Blocked is an
  annotation and MUST NOT freeze a card the way an unresolved conflict does.
- **FR-415**: The blocked grouping in the generated summary MUST be derived from
  the blocked indicator rather than from column membership.

#### Blocked state from Jira

- **FR-416**: The system MUST import the blocked state of Jira-sourced cards
  from the configured Jira blocked field.
- **FR-417**: The system MUST NOT write the blocked state to Jira under any
  circumstance.
- **FR-418**: Where the local blocked state differs from the state last imported
  from Jira, the local state MUST prevail and subsequent syncs MUST NOT
  overwrite it.
- **FR-419**: A divergence under FR-418 MUST be visible on the card face, MUST
  NOT be treated as a conflict, and MUST NOT freeze the card.
- **FR-443**: The divergence marker MUST be visually distinct from the blocked
  indicator itself, so that "the board and Jira disagree" is never mistaken for
  "this card is blocked".
- **FR-420**: When the local and Jira blocked states converge, the divergence
  indication MUST cease.

#### The iteration

- **FR-421**: The system MUST determine the current iteration's ordinal name,
  start date and end date.
- **FR-422**: The iteration MUST be read from the active sprint of a single
  configured reference board.
- **FR-423**: The ordinal name MUST be taken from the source rather than
  computed by counting, because the ordinal resets at the fiscal-year boundary.
- **FR-424**: Where the reference board reports more than one active sprint, the
  sprint MUST be selected by a configured team name, defaulting to
  "CRM TradeBlazers". Selection MUST NOT depend on response ordering. Two
  concurrently active sprints is the steady state on board 1391, not an edge
  case: two teams share it, and each iteration exists there twice.
- **FR-445**: Sprints on the reference board belonging to another team MUST be
  ignored entirely.
- **FR-425**: An active sprint lacking a start or end date MUST be treated as no
  result.
- **FR-426**: A resolved iteration MUST be cached and MUST continue to be
  displayed when the source is unreachable.
- **FR-427**: An iteration that is cached or computed rather than freshly read
  MUST be marked as such wherever it is displayed.
- **FR-428**: Where no iteration can be read and no cached iteration exists, the
  system MUST compute one from a configured anchor date and cadence length, and
  MUST mark it as estimated.
- **FR-429**: Iteration resolution MUST NOT block or delay board load.
- **FR-430**: Failure to resolve the iteration MUST NOT surface as an
  application error nor prevent any board interaction.
- **FR-431**: The board MUST display the current iteration's name, date range
  and remaining working days persistently.
- **FR-432**: The displayed iteration MUST stop asserting an iteration whose end
  date has passed.

#### Committed work and carry-over

- **FR-433**: Users MUST be able to place cards into Iteration Items, and that
  placement MUST persist.
- **FR-434**: Iteration Items membership MUST NOT be derived from Jira sprint
  membership, and no sync may place a card there.
- **FR-435**: Cards in Iteration Items, In Progress, Test or PO Review when an
  iteration ends MUST remain on the board in their columns.
- **FR-436**: A card that has remained unfinished across one or more iteration
  boundaries MUST show on its face how many iterations it has carried through.
- **FR-444**: The carry-over count MUST reset when a card reaches Done or
  returns to Backlog. Re-committing a card after it has returned to Backlog
  MUST start a fresh count.

#### Settings

- **FR-437**: Settings MUST include the iteration reference board, the team name
  used to select among its active sprints, the working days and working hours,
  and the fallback anchor date and cadence length.
- **FR-438**: The Jira field identifiers for blocked, sprint and story points
  MUST be viewable and editable in settings, with their defaults shown.
- **FR-439**: All settings introduced by this feature MUST persist across
  restarts.

#### Cross-cutting

- **FR-440**: The blocked indicator, the iteration display and the Iteration
  Items column MUST be operable by keyboard and legible to a screen reader.
- **FR-441**: The additions MUST NOT reduce the board below its existing density
  budget of roughly fifty cards visible without scrolling within a column.
- **FR-442**: Access to the iteration source MUST sit behind the same
  interface-and-test-double arrangement as existing Jira access, so that no
  automated test in the standard suite contacts a live external service.

### Key Entities

- **Column**: One of six fixed, ordered positions. Loses the Blocked member and
  gains Iteration Items. Retains its optional Jira status mapping.
- **Card**: Gains a blocked indicator independent of its column, a record of the
  blocked state last seen in Jira (to detect divergence), and a count of
  iterations carried since it was last in Done or Backlog.
- **Iteration**: An ordinal name, a start date, an end date, and a provenance
  saying whether it was freshly read, served from cache, or estimated.
- **Movement record**: Unchanged in shape. Gains entries attributed to the
  system for the migration in FR-404.
- **Settings**: Gains the reference board, working days and hours, fallback
  anchor and cadence, and the three Jira field identifiers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-401**: Every card in the Blocked column before the upgrade is present
  after it, in In Progress, flagged blocked — zero cards lost or misplaced.
- **SC-402**: A blocked card is identifiable on a board of fifty cards without
  filtering, opening a card, or relying on colour perception.
- **SC-403**: The iteration shown on the board matches the reference board's
  active sprint on every day of an iteration, including the day it rolls over.
- **SC-404**: The board remains fully interactive when the iteration source is
  unreachable, and the iteration shown is never silently presented as fresh
  when it is not.
- **SC-405**: No request issued to Jira across the whole test suite writes any
  field other than status.
- **SC-406**: A card that has carried through iterations can be identified from
  the board alone, without opening a report.
- **SC-407**: Board load remains under one second against a local database with
  the iteration display present.

## Assumptions

- The v1 baseline (Slices 1–4) is complete and merged, and this feature modifies
  that code rather than replacing it.
- The user's Jira credentials can read the iteration source for the configured
  reference board. If they cannot, the estimated fallback covers it.
- Board 1391 continues to carry a dated active sprint. Its *future* sprints are
  undated, which is why lookahead is not attempted in this slice.
- The iteration cadence is two weeks, used only by the estimated fallback; the
  read path takes whatever dates it is given.
- Working hours are configured in this slice but consumed only by Slice 6. Only
  working *days* have a consumer here, in the banner's remaining-days count.
- An iteration boundary is detected on the next successful resolution rather
  than by a timer, so the board may briefly show a just-ended iteration until
  the next poll.
- Existing Blocked-column cards are few; the migration is not performance
  sensitive.

## Out of Scope for This Feature

- Elapsed time, in any form. Deferred to Slice 6.
- Story points: importing, displaying, or entering them. Only the configurable
  field identifier lands here, unused.
- Velocity, burndown, commitment-versus-completion, and every other Phase 2
  report. All Slice 6.
- Writing sprint membership, story points, or the blocked state to Jira.
- Reading the per-card sprint field onto cards, or showing a sprint badge on a
  card.
- Any change to the conflict model, its detection, or its resolution.
- Any change to how movement records themselves are written.
- Iteration lookahead: showing the next iteration or its dates.

## Behavior Pathways

- **BH-401** (satisfies FR-401, FR-402): The column set is restructured
  - **Given** a board built on the v1 column set
  - **When** the upgrade is applied
  - **Then** the board presents Backlog, Iteration Items, In Progress, Test, PO
    Review and Done, and no Blocked column exists

- **BH-402** (satisfies FR-404, FR-405): Blocked cards migrate to In Progress
  - **Given** cards occupying the Blocked column
  - **When** the upgrade is applied
  - **Then** every one of those cards is in In Progress with its blocked
    indicator set, and each has a movement record attributed to the system

- **BH-403** (satisfies FR-406): A conflicted card still migrates
  - **Given** a card in the Blocked column carrying an unresolved conflict
  - **When** the upgrade is applied
  - **Then** the card is in In Progress, flagged blocked, and its conflict is
    unchanged

- **BH-404** (satisfies FR-407): The upgrade is idempotent
  - **Given** the upgrade has already been applied
  - **When** it is applied again
  - **Then** no card changes column and no movement record is written

- **BH-405** (satisfies FR-409): Mappings for the removed column are dropped
  - **Given** a saved status mapping for the Blocked column and mappings for
    other columns
  - **When** the upgrade is applied
  - **Then** the Blocked mapping is gone and the other mappings are unchanged

- **BH-406** (satisfies FR-403, FR-412, FR-414): Blocked is orthogonal to column
  - **Given** a card in any column
  - **When** the user sets the blocked indicator and then moves the card
  - **Then** the move succeeds and the card remains blocked in its new column

- **BH-407** (satisfies FR-413): Blocked is filterable
  - **Given** a board with blocked and unblocked cards
  - **When** the user filters by blocked
  - **Then** exactly the blocked cards remain visible

- **BH-408** (satisfies FR-415): The summary groups by the indicator
  - **Given** blocked cards distributed across several columns
  - **When** the summary is generated
  - **Then** its blocked grouping lists exactly those cards, regardless of
    column

- **BH-409** (satisfies FR-408, FR-434): Iteration Items never contacts Jira
  - **Given** a Jira-sourced card and the default configuration
  - **When** the user moves it into Iteration Items
  - **Then** the card is in Iteration Items and no request was sent to Jira

- **BH-410** (satisfies FR-434): Sync never fills Iteration Items
  - **Given** a Jira issue whose sprint matches the current iteration
  - **When** a sync runs
  - **Then** the corresponding card's column is unchanged

- **BH-411** (satisfies FR-416): Jira's blocked state is imported
  - **Given** a Jira issue whose blocked field is set
  - **When** it is imported
  - **Then** the resulting card is blocked

- **BH-412** (satisfies FR-418): Local blocked state prevails
  - **Given** a card imported as blocked whose flag the user has since cleared
  - **When** a further sync runs with Jira still reporting it blocked
  - **Then** the card is still not blocked

- **BH-413** (satisfies FR-419): Divergence does not freeze a card
  - **Given** a card whose blocked state differs from Jira's
  - **When** the user moves it
  - **Then** the move succeeds

- **BH-414** (satisfies FR-420): Convergence clears the divergence
  - **Given** a card marked as diverging from Jira's blocked state
  - **When** a sync brings the two states into agreement
  - **Then** the card no longer indicates a divergence

- **BH-415** (satisfies FR-417): Blocked is never written to Jira
  - **Given** any sequence of blocked changes on the board
  - **When** the write requests issued to Jira are inspected
  - **Then** none of them reference the blocked field

- **BH-416** (satisfies FR-421, FR-422, FR-431): The iteration is read and shown
  - **Given** a reference board whose active sprint is named "2026 S18" running
    2026-08-24 to 2026-09-07
  - **When** the board loads
  - **Then** that name, that range and the remaining working days are displayed

- **BH-417** (satisfies FR-424, FR-445): The configured team's sprint is chosen
  - **Given** a reference board reporting two active sprints belonging to
    different teams
  - **When** resolution runs repeatedly with the responses in differing order
  - **Then** the configured team's sprint is chosen every time and the other
    team's is ignored

- **BH-418** (satisfies FR-425): An undated sprint is no result
  - **Given** a reference board whose active sprint has no start or end date
  - **When** resolution runs
  - **Then** no iteration is taken from it and the fallback path is used

- **BH-419** (satisfies FR-426, FR-427): A cached iteration is shown and marked
  - **Given** a previously resolved iteration and an unreachable source
  - **When** the board loads
  - **Then** the cached iteration is displayed and marked as not freshly read

- **BH-420** (satisfies FR-428): The estimate is a last resort and is labelled
  - **Given** no cached iteration and an unreachable source
  - **When** the board loads
  - **Then** an iteration computed from the anchor and cadence is displayed and
    marked as estimated

- **BH-421** (satisfies FR-429, FR-430): Resolution never blocks the board
  - **Given** an iteration source that is slow or failing
  - **When** the board loads
  - **Then** the board is interactive within its normal budget and no error is
    surfaced to the user as a failure

- **BH-422** (satisfies FR-432): A finished iteration is not asserted
  - **Given** a displayed iteration whose end date has passed
  - **When** the board is next resolved
  - **Then** the display no longer presents that iteration as current

- **BH-423** (satisfies FR-435): Unfinished work survives the boundary
  - **Given** unfinished cards in Iteration Items, In Progress, Test and PO
    Review
  - **When** an iteration ends and the next begins
  - **Then** all of those cards remain on the board in their columns

- **BH-424** (satisfies FR-436): Carry-over is counted on the card
  - **Given** a card that has remained unfinished across two iteration
    boundaries
  - **When** the card is displayed
  - **Then** it shows that it has carried through two iterations

- **BH-425** (satisfies FR-433): Committed work persists
  - **Given** a card moved into Iteration Items
  - **When** the board is reloaded
  - **Then** the card is still in Iteration Items in the same position

- **BH-426** (satisfies FR-437, FR-438, FR-439): Phase 2 settings persist
  - **Given** changed reference board, working days and field identifiers
  - **When** the application restarts
  - **Then** the changed values are still in force

- **BH-427** (satisfies FR-410, FR-411, FR-440): Blocked is perceivable and operable
  - **Given** a board containing blocked cards
  - **When** it is examined without colour and driven by keyboard alone
  - **Then** blocked cards are still distinguishable and the indicator can be
    set and cleared

- **BH-428** (satisfies FR-441): Density survives the additions
  - **Given** a column holding roughly fifty cards with the iteration display
    present
  - **When** the board is rendered
  - **Then** the column shows them without scrolling

- **BH-429** (satisfies FR-442): No test reaches a live service
  - **Given** the standard automated suite
  - **When** it runs
  - **Then** no iteration or Jira request leaves the test process

- **BH-430** (satisfies FR-423): The ordinal is never computed
  - **Given** a reference board reporting an active sprint whose ordinal is
    lower than the previously seen one, as happens at the fiscal-year reset
  - **When** resolution runs
  - **Then** the reported ordinal is displayed, not a counted successor

- **BH-431** (satisfies FR-419, FR-443): Divergence reads differently from blocked
  - **Given** one card blocked in agreement with Jira and one card whose
    blocked state diverges from Jira's
  - **When** both are displayed
  - **Then** the two carry visibly different markers, and the diverging card
    does not present as blocked

- **BH-432** (satisfies FR-444): The carry-over count resets
  - **Given** a card showing a carry-over count of two
  - **When** it is moved to Backlog and later committed to an iteration again
  - **Then** it shows no carry-over count until it next crosses a boundary
    unfinished

## Verification

| ID | Test name | Pins |
|---|---|---|
| TEST-401 | Upgrade produces the six-column set with no Blocked column | BH-401 |
| TEST-402 | Every blocked-column card lands in In Progress, flagged, with a system-attributed record | BH-402 |
| TEST-403 | A conflicted blocked card migrates with its conflict intact | BH-403 |
| TEST-404 | Re-applying the upgrade changes nothing | BH-404 |
| TEST-405 | Blocked-column mapping is dropped, other mappings survive | BH-405 |
| TEST-406 | A blocked card moves between columns and stays blocked | BH-406 |
| TEST-407 | Filtering by blocked returns exactly the blocked cards | BH-407 |
| TEST-408 | Summary's blocked grouping follows the indicator across columns | BH-408 |
| TEST-409 | Moving a Jira card into Iteration Items issues no Jira request | BH-409 |
| TEST-410 | Sync never places a card into Iteration Items | BH-410 |
| TEST-411 | An issue with the blocked field set imports as a blocked card | BH-411 |
| TEST-412 | A locally cleared flag survives a sync that still reports blocked | BH-412 |
| TEST-413 | A card diverging from Jira's blocked state is still movable | BH-413 |
| TEST-414 | Divergence indication clears once the states agree | BH-414 |
| TEST-415 | Every Jira write in the suite leaves the blocked field untouched | BH-415 |
| TEST-416 | Banner shows the active sprint's name, range and remaining working days | BH-416 |
| TEST-417 | The configured team's sprint wins over another team's, regardless of order | BH-417 |
| TEST-418 | An undated active sprint yields no iteration | BH-418 |
| TEST-419 | Unreachable source shows the cached iteration, marked stale | BH-419 |
| TEST-420 | No cache and no source yields an estimated iteration, marked | BH-420 |
| TEST-421 | A failing iteration source leaves the board interactive and error-free | BH-421 |
| TEST-422 | An elapsed iteration stops being presented as current | BH-422 |
| TEST-423 | Unfinished cards survive an iteration boundary in place | BH-423 |
| TEST-424 | A twice-carried card displays a count of two | BH-424 |
| TEST-425 | Iteration Items placement survives a reload | BH-425 |
| TEST-426 | Phase 2 settings survive a restart | BH-426 |
| TEST-427 | Blocked is distinguishable without colour and operable by keyboard | BH-427 |
| TEST-428 | Fifty cards plus the iteration display fit without scrolling | BH-428 |
| TEST-429 | No test in the standard suite contacts a live service | BH-429 |
| TEST-430 | A lower reported ordinal is displayed as reported | BH-430 |
| TEST-431 | Divergence marker is distinguishable from the blocked indicator | BH-431 |
| TEST-432 | Returning a carried card to Backlog resets its count | BH-432 |
