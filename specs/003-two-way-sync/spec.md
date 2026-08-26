# Feature Specification: Two-Way Sync

**Feature Branch**: `003-two-way-sync`
**Created**: 2026-08-26
**Status**: Draft
**Input**: User description: "Slice 3 — the board drives Jira. Column-to-status mapping, status transitions when a card moves, adoption of status changes made in Jira, and detection and user resolution of conflicts when both sides changed. Turns the read-only board of Slice 2 into the only place the user needs to work."

**Risk Tier:** FULL

**Business source**: `docs/brd.md` — this feature implements BR-16…BR-20,
BR-22…BR-28 and BR-35…BR-37, plus NFR-08, NFR-22 and NFR-23. It depends on
Slice 2 (`specs/002-jira-import/`) for imported cards and the recorded
last-known Jira state it compares against.

**Why this slice exists**: the user's goal is to work from this board only and
have their Jira user stories stay correct without their opening Jira. Slice 2
made the work visible; this slice is what removes the second tool.

---

## Clarifications

### Session 2026-08-26

- Q: What happens when a card moves into a column with no configured Jira
  status? → A: The move is local-only; the board changes and the Jira issue is
  left untouched
- Q: Who wins when both the board and Jira changed since the last sync? → A:
  Neither automatically. A conflict is raised and the user chooses
- Q: How is a conflict resolved? → A: Two outcomes only — keep the board state
  and push it to Jira, or accept the Jira state
- Q: May a conflicted card be moved by a later sync? → A: No. It holds its
  position until the user resolves it

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Moving a card updates Jira (Priority: P1)

The user drags a card from In Progress to Test. The Jira issue transitions to
the matching status. They do not open Jira.

**Why this priority**: This is the feature. It is what turns the board from a
view into a tool, and it directly serves the goal of working from one place
(G-2, success metric M-2).

**Independent Test**: With a column-to-status mapping configured, move an
imported card to a mapped column and confirm the corresponding Jira issue's
status changed.

**Acceptance Scenarios**:

1. **Given** a card whose column maps to a Jira status, **When** the user moves
   it to another mapped column, **Then** the Jira issue transitions to that
   column's mapped status.
2. **Given** such a move, **When** it succeeds, **Then** the recorded
   last-known Jira state is updated so the next sync sees no difference.
3. **Given** such a move, **When** it succeeds, **Then** the movement history
   records the move with the user as the actor.
4. **Given** an ad-hoc card, **When** the user moves it to a mapped column,
   **Then** nothing is sent to Jira.

---

### User Story 2 - Changes made in Jira reach my board (Priority: P1)

A teammate transitions one of the user's issues in Jira, or the user changes it
from a phone. The card moves on the board to match, without the user doing
anything.

**Why this priority**: Sync that only pushes is not sync. If the board can
drift from Jira in one direction, the user must re-check Jira, which defeats
the entire purpose of the slice.

**Independent Test**: Change an issue's status in Jira only, run a sync, and
confirm the card moved to the column mapped to that status.

**Acceptance Scenarios**:

1. **Given** a card the user has not touched since the last sync, **When** its
   issue's status changes in Jira and a sync runs, **Then** the card moves to
   the column mapped to the new status.
2. **Given** such a move, **When** the movement history is inspected, **Then**
   the actor is the sync process, not the user.
3. **Given** an issue transitions to a status no column maps to, **When** a
   sync runs, **Then** the card does not move and the user is told the status
   is unmapped.
4. **Given** a card in an unmapped column the user placed it in, **When** its
   issue's status changes in Jira and a sync runs, **Then** the card moves to
   the column mapped to the new status.

---

### User Story 3 - Disagreements are surfaced, never guessed (Priority: P1)

The user moved a card to Test. Meanwhile someone moved the issue to Blocked in
Jira. The system does not silently pick a winner — it marks the card and stops
touching it.

**Why this priority**: This is the trust boundary of the whole product (G-4,
success metric M-4). Silent resolution either discards a deliberate decision
the user made or clobbers a teammate's legitimate update. Either one, once
noticed, ends the user's confidence in the board.

**Independent Test**: Change a card's column locally and its issue's status in
Jira to two different statuses, run a sync, and confirm the card is marked in
conflict, has not moved, and no transition was sent to Jira.

**Acceptance Scenarios**:

1. **Given** a card moved locally to Test and its issue moved in Jira to a
   status mapped to Blocked, **When** a sync runs, **Then** the card is marked
   in conflict.
2. **Given** such a conflict, **When** it is raised, **Then** the card has not
   moved and no transition was sent to Jira.
3. **Given** a card in conflict, **When** further syncs run, **Then** the card
   does not move and the conflict remains.
4. **Given** a card moved locally and in Jira to statuses that map to the same
   column, **When** a sync runs, **Then** no conflict is raised because the two
   sides agree.
5. **Given** a card in conflict, **When** the board is displayed, **Then** the
   conflict is visible on the card without opening it.

---

### User Story 4 - I resolve a conflict by choosing a side (Priority: P1)

The user opens the conflicted card, sees both states side by side, and picks
one. The system carries out that choice and the card returns to normal.

**Why this priority**: A conflict the user cannot clear is a permanently
broken card. Detection without resolution makes the board worse than before
(risk R-3).

**Independent Test**: Raise a conflict, resolve it each way in separate runs,
and confirm that keeping the board state transitions Jira while accepting the
Jira state moves the card — and that the conflict clears in both cases.

**Acceptance Scenarios**:

1. **Given** a card in conflict, **When** the user opens it, **Then** the board
   state and the Jira state are shown side by side.
2. **Given** a card in conflict, **When** the user chooses to keep the board
   state, **Then** the Jira issue transitions to the board column's mapped
   status and the conflict clears.
3. **Given** a card in conflict, **When** the user chooses to accept the Jira
   state, **Then** the card moves to the column mapped to the Jira status and
   the conflict clears.
4. **Given** a resolved conflict, **When** the movement history is inspected,
   **Then** the resolution is recorded, including which side was chosen.
5. **Given** the user chooses to keep the board state, **When** the resulting
   transition is refused by Jira, **Then** the conflict remains and the user is
   told the transition failed.

---

### User Story 5 - I decide which column means which Jira status (Priority: P2)

The user's six columns are theirs; the Jira workflow is not. In settings they
say what each column means in Jira terms, or leave a column meaning nothing.

**Why this priority**: Every other story in this feature depends on the
mapping, but the mapping is configuration rather than daily use, and a default
can carry the user until they refine it.

**Independent Test**: Set a mapping, confirm a move honours it, change the
mapping, and confirm the same move now targets a different status.

**Acceptance Scenarios**:

1. **Given** settings are open, **When** the user maps a column to a Jira
   status, **Then** subsequent moves into that column target that status.
2. **Given** a mapping exists, **When** the user removes it, **Then** the column
   becomes local-only.
3. **Given** the mapping refers to a status that no longer exists in the
   workflow, **When** a move into that column is attempted, **Then** the move
   is refused and the user is told the mapping is stale.
4. **Given** settings are open, **When** the user views them, **Then** the
   Jira statuses available to choose from are shown rather than typed by hand.

---

### User Story 6 - Columns I have not mapped stay mine (Priority: P2)

Blocked has no equivalent in the user's Jira workflow. Dragging a card there
should park it on the board without lying to Jira about it.

**Why this priority**: Without this rule the user must either invent a false
Jira status for Blocked or lose the column. It is the difference between the
board fitting their workflow and their workflow bending to Jira (decision D-7).

**Independent Test**: Move an imported card into an unmapped column and confirm
the board changed and the Jira issue's status did not.

**Acceptance Scenarios**:

1. **Given** a column with no mapping, **When** the user moves an imported card
   into it, **Then** the card moves and the Jira issue's status is unchanged.
2. **Given** such a card, **When** a sync runs and its issue's status has not
   changed, **Then** no conflict is raised and the card stays where the user
   put it.
3. **Given** such a card, **When** the user moves it back to a mapped column,
   **Then** the Jira issue transitions to that column's mapped status.

---

### User Story 7 - Refused transitions fail loudly and safely (Priority: P2)

Jira workflows restrict which transitions are legal. When the user asks for one
that is not, the card must not pretend to have moved.

**Why this priority**: This is the most likely everyday failure (risk R-1), and
an optimistic move that silently fails leaves the board confidently wrong —
the exact condition the product exists to prevent.

**Independent Test**: Attempt a move whose transition is illegal from the
issue's current status, and confirm the card returns to where it was with a
specific explanation.

**Acceptance Scenarios**:

1. **Given** a card whose issue has no legal transition to the target column's
   mapped status, **When** the user moves it there, **Then** the card returns
   to its previous column and the user is told no such transition is allowed.
2. **Given** Jira is unreachable, **When** the user moves a card into a mapped
   column, **Then** the card returns to its previous column and the user is
   told Jira could not be reached, distinctly from a refused transition.
3. **Given** a transition is refused, **When** the movement history is
   inspected, **Then** no movement was recorded, because none occurred.
4. **Given** a transition requires information the board does not hold, **When**
   the user moves the card, **Then** the move is refused with that reason
   rather than partially applied.

---

### Edge Cases

- **Two columns mapped to the same Jira status** — permitted. An inbound status
  change adopts the first such column in board order; the user's own placement
  in either column is never overridden by that alone.
- **A mapped status that the issue's workflow does not contain** — the move is
  refused as a stale mapping, distinctly from a refused transition.
- **The issue's status changes in Jira between reading the legal transitions
  and requesting one** — the request is refused, the card reverts, and the next
  sync reconciles from the new state.
- **A conflict raised, then the Jira status changes again** — the conflict is
  updated to show the current Jira state rather than a stale one; it is not
  duplicated.
- **A conflicted card the user drags** — refused while the conflict stands;
  the user is directed to resolve it.
- **A conflicted card whose issue leaves the query** — the disappearance rule
  from Slice 2 applies and the conflict is closed as moot, with the reason
  recorded.
- **Resolution chosen while Jira is unreachable** — the conflict remains and
  the user is told; no half-applied resolution is left behind.
- **An ad-hoc card in a mapped column** — never sends anything to Jira. Mapping
  governs Jira-sourced cards only.
- **The mapping is changed while cards sit in the affected column** — no
  retroactive transitions are issued; the new mapping governs subsequent moves
  and subsequent inbound changes only.
- **Both sides changed to the same status** — no conflict; the recorded
  last-known state is simply brought up to date.

---

## Requirements *(mandatory)*

### Functional Requirements

**Mapping configuration**

- **FR-201**: System MUST allow each board column to be mapped to a Jira
  status, or left unmapped. *(BR-16, BR-35)*
- **FR-202**: System MUST present the Jira statuses available for selection
  rather than requiring them to be typed. *(BR-16)*
- **FR-203**: Mapping configuration MUST persist across restarts. *(BR-36)*
- **FR-204**: System MUST allow a mapping to be removed, returning the column
  to unmapped. *(BR-17)*
- **FR-205**: System MUST permit two columns to map to the same Jira status.
  When adopting an inbound status change, System MUST choose the first such
  column in board order. *(BR-16)*

**Pushing board changes to Jira**

- **FR-206**: When a Jira-sourced card is moved into a mapped column, System
  MUST request the Jira transition to that column's mapped status. *(BR-18)*
- **FR-207**: When a Jira-sourced card is moved into an unmapped column,
  System MUST NOT contact Jira, and the card MUST move on the board. *(BR-17)*
- **FR-208**: System MUST NOT send anything to Jira as a result of moving an
  ad-hoc card. *(BR-23)*
- **FR-209**: System MUST NOT modify any Jira field other than issue status. *(BR-22)*
- **FR-210**: When a transition succeeds, System MUST update the recorded
  last-known Jira state so the next sync detects no difference. *(BR-15)*
- **FR-211**: When a transition is refused because no legal transition exists,
  System MUST return the card to its previous column and position and MUST
  tell the user that no such transition is allowed. *(BR-19)*
- **FR-212**: When a transition cannot be attempted because the mapped status
  is absent from the issue's workflow, System MUST refuse the move and report
  a stale mapping, distinctly from a refused transition. *(BR-19)*
- **FR-213**: When Jira cannot be reached, System MUST return the card to its
  previous column and position and MUST report a connectivity failure,
  distinctly from a refused transition. *(BR-20)*
- **FR-214**: When a transition requires information the board does not hold,
  System MUST refuse the move with that reason and MUST NOT partially apply
  it. *(BR-19, NFR-08)*
- **FR-215**: A refused or failed move MUST NOT produce a movement history
  record. *(BR-31)*

**Adopting Jira changes**

- **FR-216**: For each Jira-sourced card, a sync MUST determine exactly one
  outcome from three inputs — the card's current column, the issue's current
  Jira status, and the recorded last-known Jira state — and that outcome MUST
  be one of: no change, adopt the Jira state, send the board state to Jira, or
  raise a conflict. *(NFR-22)*
- **FR-217**: The outcome MUST be determined solely from those three inputs,
  with no dependence on wall-clock time, request ordering, or any other
  state. *(NFR-22)*
- **FR-218**: When only the Jira status changed, System MUST move the card to
  the column mapped to the new status. *(BR-15)*
- **FR-219**: When only the board column changed, System MUST send the board
  state to Jira as in FR-206. *(BR-18)*
- **FR-220**: When neither changed, System MUST leave the card and Jira
  untouched. *(BR-15)*
- **FR-221**: When the Jira status changes to one no column maps to, System
  MUST leave the card where it is and MUST tell the user the status is
  unmapped. *(BR-17)*
- **FR-222**: A movement caused by adopting a Jira change MUST be attributed
  in the movement history to the sync process. *(BR-31)*

**Conflicts**

- **FR-223**: When both the board column and the Jira status changed since the
  last sync, and they no longer agree, System MUST raise a conflict rather
  than choosing a winner. *(BR-24)*
- **FR-224**: When both changed but now agree, System MUST NOT raise a
  conflict and MUST bring the recorded last-known state up to date. *(BR-24)*
- **FR-225**: Raising a conflict MUST NOT move the card and MUST NOT send
  anything to Jira. *(BR-26)*
- **FR-226**: A card in conflict MUST be visibly marked on the board without
  being opened. *(BR-25)*
- **FR-227**: A card in conflict MUST NOT be moved by any subsequent sync
  until the conflict is resolved. *(BR-26)*
- **FR-228**: A card in conflict MUST NOT be moved by the user until the
  conflict is resolved; the attempt MUST direct the user to resolve it. *(BR-26)*
- **FR-229**: System MUST present a conflict as the board state and the Jira
  state side by side. *(BR-27)*
- **FR-230**: System MUST offer exactly two resolutions: keep the board state,
  which transitions Jira to the board column's mapped status; or accept the
  Jira state, which moves the card to the mapped column. *(BR-27)*
- **FR-231**: A successful resolution MUST clear the conflict and update the
  recorded last-known Jira state. *(BR-24)*
- **FR-232**: A resolution MUST be recorded in the movement history, including
  which side was chosen. *(BR-28)*
- **FR-233**: If the transition required by a resolution fails, the conflict
  MUST remain and the failure MUST be reported. *(NFR-08)*
- **FR-234**: When a conflict's Jira state changes again before resolution,
  System MUST update the existing conflict rather than raise a second one. *(BR-24)*
- **FR-235**: When a conflicted card's issue leaves the query, System MUST
  close the conflict as moot, recording why, and apply the archival rule from
  Slice 2. *(BR-21)*

**Safety**

- **FR-236**: No sync or resolution may leave the board and Jira in states
  that disagree without either a conflict or a reported failure. *(NFR-08)*
- **FR-237**: Jira access MUST be reachable through a substitutable interface
  so that the standard automated test suite contacts no live Jira instance. *(NFR-23)*

### Key Entities

- **Column Status Mapping**: The association between a board column and a Jira
  status. Absent for unmapped columns. Many columns may share a status.
- **Sync Decision**: The outcome computed for one card in one sync — no
  change, adopt Jira, send to Jira, or conflict — derived only from the card's
  column, the issue's Jira status, and the recorded last-known state.
- **Conflict**: An open disagreement on one card. Records the board column and
  the Jira status at the moment it was raised and as currently known, when it
  was raised, and once resolved, which side was chosen and when.

The **Jira Link** entity from Slice 2 is read as well as written here: its
recorded status is the last-known state the Sync Decision compares against.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-201**: 100% of moves into a mapped column result in the Jira issue
  carrying that column's mapped status, or in the card reverting with a stated
  reason. No move ends with the board and Jira disagreeing silently. *(M-4)*
- **SC-202**: Zero transitions are sent to Jira for moves into unmapped
  columns or for ad-hoc cards, across the full test suite. *(BR-17, BR-23)*
- **SC-203**: All 16 combinations of the three sync inputs — board changed or
  not, Jira changed or not, and whether the resulting states agree — produce
  the specified outcome. *(NFR-22)*
- **SC-204**: The sync outcome for a given set of three inputs is identical
  across 100 repeated evaluations. *(NFR-22)*
- **SC-205**: Zero conflicted cards are moved by a sync while their conflict
  stands, across 20 consecutive syncs. *(BR-26)*
- **SC-206**: A conflict is resolvable in two interactions — open the card,
  choose a side. *(BR-27, risk R-3)*
- **SC-207**: Zero fields other than issue status are modified in Jira across
  the full test suite. *(BR-22)*
- **SC-208**: Zero automated tests in the standard suite contact a live Jira
  instance. *(NFR-23)*
- **SC-209**: 100% of refused moves report which of the four causes applied —
  no legal transition, stale mapping, missing required information, or Jira
  unreachable. *(BR-19, BR-20)*

---

## Assumptions

- The user's Jira permissions allow them to transition their own assigned
  issues. If not, this feature degrades to the read-only board of Slice 2 and
  the board still delivers value (BRD assumption A-2).
- The user's Jira workflows expose statuses that can be mapped to the board's
  columns. Any column without a suitable status stays unmapped, which FR-207
  makes a supported state rather than a failure (BRD assumption A-3).
- Transitions the user needs do not require additional fields. Where one does,
  FR-214 refuses the move rather than guessing; completing such a transition
  remains a task for Jira itself.
- Conflicts are rare, because the user is the assignee of the issues on their
  board. The design optimises for them being unmistakable rather than for
  them being frequent.
- Comparing the recorded last-known state against Jira's current state is
  sufficient to detect a remote change. Jira's own last-updated value, not the
  local clock, is authoritative (carried from Slice 2).

---

## Out of Scope for This Feature

- Creating Jira issues from ad-hoc cards *(non-goal, BRD §5.2, decision D-9)*.
- Editing Jira summaries, descriptions, assignees, comments or worklogs
  *(non-goal, BRD §5.2)*.
- Supplying values for transition screens that require additional fields.
- Bulk transitions or multi-card selection.
- Receiving pushed updates from Jira *(BRD constraint C-5)*.
- Automatic conflict resolution of any kind *(explicitly rejected, decision D-3)*.
- Reconciling two browser tabs open on the same board *(carried from Slice 1)*.
- The archive and summary views that read this feature's history *(Slice 4)*.

---

## Behavior Pathways

- **BH-201** (satisfies FR-206, FR-210): A move transitions the issue
  - **Given** a Jira-sourced card in a mapped column and a mapped target column
  - **When** the user moves the card to the target column
  - **Then** the issue carries the target column's mapped status and the
    recorded last-known state matches it

- **BH-202** (satisfies FR-207): Unmapped columns never contact Jira
  - **Given** a Jira-sourced card and a column with no mapping
  - **When** the user moves the card into that column
  - **Then** the card is in that column and the issue's status is unchanged,
    and no request was sent to Jira

- **BH-203** (satisfies FR-208): Ad-hoc cards never contact Jira
  - **Given** an ad-hoc card and a mapped column
  - **When** the user moves the card into it
  - **Then** no request was sent to Jira

- **BH-204** (satisfies FR-209): Only status is ever written
  - **Given** any sequence of moves and resolutions
  - **When** the write requests issued to Jira are inspected
  - **Then** every one changes only issue status

- **BH-205** (satisfies FR-211, FR-215): An illegal transition reverts cleanly
  - **Given** a card whose issue has no legal transition to the target
    column's mapped status
  - **When** the user moves it there
  - **Then** the card is back in its original column and position, the user is
    told no such transition is allowed, and no movement was recorded

- **BH-206** (satisfies FR-212): A stale mapping is named as such
  - **Given** a column mapped to a status absent from the issue's workflow
  - **When** the user moves the card into that column
  - **Then** the move is refused and reported as a stale mapping, in terms
    distinct from a refused transition

- **BH-207** (satisfies FR-213): Unreachable Jira is named as such
  - **Given** Jira is unreachable
  - **When** the user moves a card into a mapped column
  - **Then** the card reverts and the failure is reported as connectivity, in
    terms distinct from a refused transition

- **BH-208** (satisfies FR-214): Transitions needing more information are
  refused whole
  - **Given** a transition that requires a field the board does not hold
  - **When** the user moves the card to trigger it
  - **Then** the move is refused with that reason and neither the board nor
    Jira was partially changed

- **BH-209** (satisfies FR-216, FR-217, FR-220): Unchanged on both sides is
  a no-op
  - **Given** a card whose column and whose issue status both match the
    recorded last-known state
  - **When** a sync runs
  - **Then** nothing changes on the board or in Jira

- **BH-210** (satisfies FR-218, FR-222): A remote-only change is adopted
  - **Given** a card the user has not moved, whose issue status changed in Jira
    to one mapped to another column
  - **When** a sync runs
  - **Then** the card is in that column and the movement's actor is the sync
    process

- **BH-211** (satisfies FR-219): A local-only change is pushed
  - **Given** a card the user moved to a mapped column, whose issue status has
    not changed in Jira
  - **When** a sync runs
  - **Then** the issue carries the column's mapped status

- **BH-212** (satisfies FR-221): An unmapped inbound status leaves the card be
  - **Given** a card whose issue transitions to a status no column maps to
  - **When** a sync runs
  - **Then** the card has not moved and the user is told the status is unmapped

- **BH-213** (satisfies FR-223, FR-225, FR-226): Divergent changes raise a
  conflict
  - **Given** a card the user moved to Test and whose issue moved in Jira to a
    status mapped to Blocked
  - **When** a sync runs
  - **Then** the card is marked in conflict on the board, has not moved, and
    nothing was sent to Jira

- **BH-214** (satisfies FR-224): Convergent changes raise no conflict
  - **Given** a card the user moved to Test and whose issue moved in Jira to
    the status mapped to Test
  - **When** a sync runs
  - **Then** no conflict exists and the recorded last-known state matches Jira

- **BH-215** (satisfies FR-227): Syncs leave conflicted cards alone
  - **Given** a card in conflict
  - **When** twenty further syncs run
  - **Then** the card has not moved and the conflict still stands

- **BH-216** (satisfies FR-228): The user is redirected to resolution
  - **Given** a card in conflict
  - **When** the user attempts to drag it
  - **Then** the move is refused and the user is directed to resolve the
    conflict

- **BH-217** (satisfies FR-229, FR-230, FR-231): Keeping the board state
  pushes it
  - **Given** a card in conflict
  - **When** the user opens it and chooses to keep the board state
  - **Then** both states were shown side by side, the issue now carries the
    board column's mapped status, and the conflict is cleared

- **BH-218** (satisfies FR-230, FR-231): Accepting the Jira state moves the
  card
  - **Given** a card in conflict
  - **When** the user chooses to accept the Jira state
  - **Then** the card is in the column mapped to the Jira status and the
    conflict is cleared

- **BH-219** (satisfies FR-232): Resolutions are recorded with their side
  - **Given** a resolved conflict
  - **When** the movement history is inspected
  - **Then** the resolution is present and names which side was chosen

- **BH-220** (satisfies FR-233): A failed resolution leaves the conflict standing
  - **Given** a card in conflict and a Jira that will refuse the required
    transition
  - **When** the user chooses to keep the board state
  - **Then** the conflict remains and the failure is reported

- **BH-221** (satisfies FR-234): A conflict is updated, never duplicated
  - **Given** a card in conflict whose issue status then changes again
  - **When** a sync runs
  - **Then** exactly one conflict exists for that card and it shows the current
    Jira state

- **BH-222** (satisfies FR-235): A vanished issue closes its conflict
  - **Given** a card in conflict whose issue then leaves the query
  - **When** a sync runs
  - **Then** the card is archived into Done, the conflict is closed as moot,
    and the reason is recorded

- **BH-223** (satisfies FR-201, FR-202, FR-203, FR-204): Mapping is the user's
  to set
  - **Given** settings are open
  - **When** the user maps a column by choosing from the Jira statuses offered,
    then removes another column's mapping, then restarts the application
  - **Then** both changes persist, moves into the mapped column transition the
    issue, and the unmapped column is local-only

- **BH-224** (satisfies FR-205): Shared mappings resolve by board order
  - **Given** two columns mapped to the same Jira status
  - **When** an issue transitions to that status and a sync runs
  - **Then** the card is placed in the first of those columns in board order

- **BH-225** (satisfies FR-236): No silent divergence, ever
  - **Given** a run exercising every sync outcome and every failure mode
  - **When** the final board state and Jira state are compared
  - **Then** every card either agrees with its issue, carries a conflict, or
    has a reported failure

- **BH-226** (satisfies FR-237): The suite never touches live Jira
  - **Given** the standard automated test suite
  - **When** it runs to completion
  - **Then** no request reached a live Jira instance

---

## Verification

| ID | Test name | Pins |
|---|---|---|
| TEST-201 | Move into a mapped column transitions the issue and updates last-known state | BH-201 |
| TEST-202 | Move into an unmapped column changes the board only | BH-202 |
| TEST-203 | Moving an ad-hoc card issues no Jira request | BH-203 |
| TEST-204 | Every Jira write in the suite changes only status | BH-204 |
| TEST-205 | Illegal transition reverts the card and records nothing | BH-205 |
| TEST-206 | Stale mapping is reported distinctly from a refused transition | BH-206 |
| TEST-207 | Unreachable Jira is reported distinctly from a refused transition | BH-207 |
| TEST-208 | Transition needing extra fields is refused without partial application | BH-208 |
| TEST-209 | No-change-both-sides produces no board or Jira change | BH-209 |
| TEST-210 | Remote-only change moves the card and attributes it to sync | BH-210 |
| TEST-211 | Local-only change transitions the issue | BH-211 |
| TEST-212 | Inbound unmapped status leaves the card in place with notice | BH-212 |
| TEST-213 | Divergent changes mark a conflict without moving or writing | BH-213 |
| TEST-214 | Convergent changes clear cleanly with no conflict | BH-214 |
| TEST-215 | Twenty syncs never move a conflicted card | BH-215 |
| TEST-216 | Dragging a conflicted card is refused with direction to resolve | BH-216 |
| TEST-217 | Keep-board-state resolution transitions Jira and clears the conflict | BH-217 |
| TEST-218 | Accept-Jira-state resolution moves the card and clears the conflict | BH-218 |
| TEST-219 | Resolution is recorded in history with the chosen side | BH-219 |
| TEST-220 | Failed resolution leaves the conflict open and reports why | BH-220 |
| TEST-221 | Repeated remote changes update one conflict rather than duplicating | BH-221 |
| TEST-222 | Issue leaving the query archives the card and closes the conflict | BH-222 |
| TEST-223 | Mapping set, removed and persisted across restart behaves accordingly | BH-223 |
| TEST-224 | Two columns sharing a status resolve to the first in board order | BH-224 |
| TEST-225 | Full-matrix run ends with no silently divergent card | BH-225 |
| TEST-226 | Standard suite issues no request to a live Jira instance | BH-226 |
