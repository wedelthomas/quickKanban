# Feature Specification: Board Foundation

**Feature Branch**: `001-board-foundation`
**Created**: 2026-08-26
**Status**: Draft
**Input**: User description: "Slice 1 — Board foundation for Quick Kanban Wall. Six fixed columns, local ad-hoc cards, drag and keyboard movement, append-only movement history, persistent two-container deployment. All Jira integration, search/filter, archive and summaries explicitly deferred."

**Risk Tier:** STANDARD

**Business source**: `docs/brd.md` — this feature implements BR-01…BR-08 and
BR-31, plus NFR-03, NFR-06, NFR-10…NFR-20. NFR-05, NFR-21 and NFR-24 are
cross-cutting and apply here as they do to every slice.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture ad-hoc work before it is forgotten (Priority: P1)

A request arrives by chat, email or hallway conversation. It is real work that
will take real time, but it will never get a Jira ticket. The user captures it
on the board in seconds, gives it a priority, and gets back to what they were
doing — confident it is now visible rather than held in their head.

**Why this priority**: This is the product's reason to exist. The core business
problem (BP-2) is that non-Jira work is invisible and therefore unaccounted for.
Without capture, there is no board worth looking at, and every other story in
this feature operates on cards that must first exist.

**Independent Test**: Start the application with an empty board, create a card
with a title, priority, due date and two tags, and confirm it appears in
Backlog with all details legible on the card face. Delivers value on its own:
the user has a durable list of their ad-hoc commitments.

**Acceptance Scenarios**:

1. **Given** an empty board, **When** the user creates a card titled "Rotate
   staging certificates", **Then** the card appears in the Backlog column and
   is visible without opening it.
2. **Given** the new-card form is open, **When** the user submits it with a
   blank title, **Then** the card is not created and the user is told a title
   is required.
3. **Given** the user is creating a card, **When** they set priority to High, a
   due date, and the tags "ops" and "security", **Then** all four attributes are
   shown on the card face on the board.
4. **Given** the user is creating a card, **When** they submit without choosing
   a priority, **Then** the card is created with Medium priority.

---

### User Story 2 - Move work across the board as it progresses (Priority: P1)

Work moves. The user drags a card from Backlog to In Progress when they start
it, to Blocked when they are waiting on someone, to Test, to PO Review, and
finally to Done. The board reflects the move the instant they release the card.

**Why this priority**: A board that cannot express progress is a list. This is
the second half of the minimum viable product, and it is what makes the board
worth opening each morning.

**Independent Test**: With cards seeded in Backlog, drag one through each of
the six columns in turn, reload the page, and confirm every card is where it
was left. Delivers value on its own: the user can see the shape of their
workload at a glance.

**Acceptance Scenarios**:

1. **Given** a card in Backlog, **When** the user drags it to In Progress,
   **Then** it appears in In Progress immediately, without a page reload.
2. **Given** a card was moved to Blocked, **When** the user reloads the board,
   **Then** the card is still in Blocked.
3. **Given** three cards in a column, **When** the user drags the bottom card
   above the top one, **Then** that order is shown and survives a reload.
4. **Given** a card is being dragged, **When** the user releases it outside any
   column, **Then** the card returns to its original column and position and
   nothing is recorded as having moved.
5. **Given** a card is moved, **When** the server cannot record the move,
   **Then** the card returns to its previous column and position and the user
   is told the move did not save.

---

### User Story 3 - Keep the board across restarts (Priority: P1)

The user runs the board on their own machine. Machines restart, containers get
recycled, images get rebuilt. None of that may cost them their board.

**Why this priority**: Ad-hoc cards exist nowhere else — unlike Jira-sourced
work, there is no upstream system to recover them from. A tool that loses them
is worse than a text file, and the user would stop trusting it immediately
(success metric M-5, risk R-7).

**Independent Test**: Create several cards in different columns, stop and
recreate the application containers, start again, and confirm the board is
byte-for-byte what it was.

**Acceptance Scenarios**:

1. **Given** a board with cards in several columns, **When** the application is
   stopped and started again, **Then** every card is in the same column and the
   same position.
2. **Given** the application containers are destroyed and recreated from their
   images, **When** the application starts, **Then** all previously created
   cards are still present.
3. **Given** a first-ever start against empty storage, **When** the application
   starts, **Then** the storage schema is created automatically and the board
   loads with the six columns and no cards.
4. **Given** the data store is unreachable, **When** the application starts,
   **Then** it reports the failure clearly and does not present a board that
   silently discards changes.
5. **Given** the application is running, **When** its health is checked, **Then**
   it reports healthy only if the data store is genuinely reachable.

---

### User Story 4 - Correct and remove cards (Priority: P2)

The user mistyped a title, learned the real due date, or discovered the request
evaporated. They fix the card, or delete it.

**Why this priority**: Valuable but not existential — a board that captures and
moves work is already useful, and mistakes can survive an hour. Deliberately
sequenced after P1 so the MVP is reachable sooner.

**Independent Test**: Create a card, change every editable attribute, confirm
the changes persist across a reload, then delete it and confirm it is gone.

**Acceptance Scenarios**:

1. **Given** an existing card, **When** the user edits its title, description,
   priority, due date and tags, **Then** the changes are shown on the board and
   survive a reload.
2. **Given** an existing card, **When** the user removes all of its tags,
   **Then** the card is shown with no tags and remains valid.
3. **Given** an existing card, **When** the user deletes it and confirms,
   **Then** it no longer appears on the board.
4. **Given** the delete confirmation is shown, **When** the user cancels,
   **Then** the card remains untouched.
5. **Given** an existing card, **When** the user clears its title and saves,
   **Then** the change is rejected and the previous title is retained.

---

### User Story 5 - Work without reaching for the mouse (Priority: P2)

The user keeps their hands on the keyboard. Capturing a card, moving between
cards, and sending a card to another column all happen without a pointing
device.

**Why this priority**: This is what makes capture take seconds rather than a
minute (success metric M-3) — but the board is usable by mouse first, so it
follows the P1 stories.

**Independent Test**: Complete a full working cycle — create a card, focus it,
move it through three columns — using only the keyboard, with the pointing
device untouched.

**Acceptance Scenarios**:

1. **Given** the board has focus, **When** the user presses the new-card
   shortcut, **Then** the new-card form opens with the title field focused.
2. **Given** a card has focus, **When** the user presses the shortcut for a
   destination column, **Then** the focused card moves to that column and keeps
   focus.
3. **Given** the board has focus, **When** the user presses the
   next-card and previous-card keys, **Then** focus moves between cards and the
   focused card is visibly indicated.
4. **Given** any board state, **When** the user presses the help shortcut,
   **Then** a list of every available shortcut is shown.
5. **Given** a dialog is open, **When** the user presses the cancel key,
   **Then** the dialog closes without saving.

---

### User Story 6 - Record what moved and when (Priority: P3)

Every time a card changes column, the system writes an immutable record of it:
which card, from where, to where, when, and who or what caused it.

**Why this priority**: Nothing in this feature displays the history — the
archive and the standup summary that consume it are Slice 4. It is built now
because movement history cannot be reconstructed after the fact: a record not
written on the day a card moved is lost permanently. Building the write path
now costs one table; retrofitting it costs the first weeks of history.

**Independent Test**: Move a card through several columns and confirm one
history record exists per move, each carrying origin, destination, timestamp
and actor, with no record rewritten by later moves.

**Acceptance Scenarios**:

1. **Given** a card in Backlog, **When** it is moved to In Progress, **Then** a
   history record is written naming Backlog as origin, In Progress as
   destination, the time of the move, and the user as the actor.
2. **Given** a card with existing history, **When** it is moved again, **Then**
   a new record is appended and no earlier record is altered.
3. **Given** a card is reordered within its column without changing column,
   **Then** no movement record is written.
4. **Given** a card with history, **When** the card is deleted, **Then** its
   history records are retained.

---

### Edge Cases

- **Empty or whitespace-only title** — rejected on both create and edit, with a
  message naming the problem.
- **Very long title** — the card face truncates for display, and the full title
  remains intact in storage and on the card detail.
- **Duplicate titles** — permitted. Two cards may legitimately be called
  "Follow up with Ops"; the system never treats a title as an identifier.
- **Duplicate or whitespace-padded tags on one card** — trimmed and
  deduplicated case-insensitively, so "Ops", "ops " and "ops" become one tag.
- **Due date in the past** — permitted and visually distinguished as overdue.
  Refusing it would prevent recording work that is genuinely late.
- **Dropping a card in the position it already occupies** — treated as no
  change: nothing is written, no history record appended.
- **Two moves of the same card in quick succession** — the later move wins and
  the board and stored state agree; history shows both moves in the order they
  occurred.
- **Move issued while the server is unreachable** — the card reverts to its
  prior position and the user is told; no history record is written for a move
  that did not take effect.
- **A column holding many cards** — the column scrolls internally; the board
  never loses its column headers or its horizontal layout.
- **Board opened in two browser tabs** — each tab reflects its own actions;
  reconciling concurrent tabs is out of scope for this feature.
- **Storage schema is behind the application version** — migrations apply
  automatically at start before the board accepts any request.

---

## Requirements *(mandatory)*

### Functional Requirements

**Board structure**

- **FR-001**: System MUST present exactly six columns in this fixed order:
  Backlog, In Progress, Blocked, Test, PO Review, Done. *(BR-01)*
- **FR-002**: System MUST NOT offer any means to add, rename, reorder or remove
  columns. *(BR-01)*

**Card creation and content**

- **FR-003**: Users MUST be able to create a card by supplying a title. *(BR-02, BR-08)*
- **FR-004**: System MUST reject a card whose title is empty or only
  whitespace, and MUST state that a title is required. *(BR-02)*
- **FR-005**: A card MUST support an optional free-text description. *(BR-02)*
- **FR-006**: A card MUST carry exactly one priority from the fixed set High,
  Medium, Low, defaulting to Medium when unspecified. *(BR-03)*
- **FR-007**: A card MUST support an optional due date. *(BR-03)*
- **FR-008**: A card MUST support zero or more free-form tags, trimmed of
  surrounding whitespace and deduplicated case-insensitively within a card. *(BR-04)*
- **FR-009**: A newly created card MUST be placed at the top of the Backlog
  column. *(BR-02)*
- **FR-010**: Every card MUST record its source as either local or
  Jira-sourced. All cards created in this feature are local. *(BR-05)*
- **FR-011**: A card's source MUST be distinguishable on the board without
  opening the card. *(BR-05)*
- **FR-012**: Card faces MUST display title, priority, due date when set, and
  tags, without requiring the card to be opened. *(NFR-13)*

**Card modification**

- **FR-013**: Users MUST be able to edit a card's title, description, priority,
  due date and tags. *(BR-08)*
- **FR-014**: Users MUST be able to delete a local card, and deletion MUST
  require an explicit confirmation. *(BR-08)*
- **FR-015**: System MUST restrict deletion to cards whose source is local; a request to delete a Jira-sourced card MUST be refused. No such
  cards exist in this feature; the rule is stated here because the delete path
  is built here. *(BR-09)*

**Card movement**

- **FR-016**: Users MUST be able to move a card from any column to any other
  column by dragging it. *(BR-06)*
- **FR-017**: Users MUST be able to change a card's position within its column. *(BR-07)*
- **FR-018**: A card's column and its position within that column MUST persist
  across sessions. *(BR-07)*
- **FR-019**: A move MUST be reflected in the interface immediately, before the
  system has confirmed it was recorded. *(NFR-10)*
- **FR-020**: If recording a move fails, the card MUST return to its previous
  column and position, and the user MUST be told the move did not save. *(NFR-10)*
- **FR-021**: A drag released outside any column MUST leave the card unchanged. *(BR-06)*

**Keyboard operation**

- **FR-022**: Users MUST be able to create a card, move focus between cards, and
  move the focused card to any of the six columns, using the keyboard alone. *(NFR-12)*
- **FR-023**: The currently focused card MUST be visually indicated at all
  times while the board has focus. *(NFR-12)*
- **FR-024**: System MUST provide a shortcut that lists every available
  keyboard shortcut. *(NFR-12)*
- **FR-025**: Every action available by pointing device MUST also be reachable
  by keyboard. *(NFR-12)*

**Movement history**

- **FR-026**: System MUST append an immutable history record for every change
  of a card's column, capturing the card, origin column, destination column,
  time of the change, and whether the actor was the user or an automated
  process. *(BR-31)*
- **FR-027**: System MUST NOT modify or remove a history record once written. *(BR-31)*
- **FR-028**: A change of position within the same column MUST NOT produce a
  history record. *(BR-31)*
- **FR-029**: Deleting a card MUST NOT remove that card's history records. *(BR-31)*

**Persistence and operation**

- **FR-030**: All board data MUST survive application restart, container
  recreation, and image rebuild. *(NFR-06)*
- **FR-031**: System MUST apply any pending storage schema changes
  automatically at start, before serving any request. *(NFR-18)*
- **FR-032**: System MUST expose a health check that reports healthy only when
  the data store is reachable. *(NFR-19)*
- **FR-033**: The complete system MUST start from a single command. *(NFR-17)*
- **FR-034**: System MUST accept connections only from the host machine's
  loopback interface. *(NFR-03)*
- **FR-035**: System MUST NOT require authentication, and MUST NOT present a
  login. *(BRD §5.2, D-11)*
- **FR-036**: No routine user action may require a full page reload. *(NFR-11)*
- **FR-037**: If the data store is unreachable at start, System MUST report the
  failure clearly rather than serving a board that discards changes. *(NFR-08)*
- **FR-038**: Repository documentation MUST describe how to start, stop and
  reset the system, and MUST name the storage volume whose deletion would lose
  data. *(NFR-20, R-7)*

### Key Entities

- **Column**: One of the six fixed stages of work. Has a stable identity, a
  display name, and an ordinal position. Not user-editable.
- **Card**: A unit of work. Carries a title, optional description, priority,
  optional due date, tags, a source (local or Jira-sourced), the column it
  occupies, its position within that column, and creation and modification
  times. In this feature every card is local.
- **Tag**: A free-form label attached to a card. A card holds zero or more;
  the same label may appear on many cards.
- **Card Movement**: An immutable record that a card changed column — the card,
  origin column, destination column, time, and actor (user or automated
  process). Append-only. Retained after the card itself is deleted.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can capture an ad-hoc item — open the form, type a title,
  save — in under 5 seconds using the keyboard alone. *(M-3)*
- **SC-002**: The board finishes loading in under 1 second with 50 cards
  present. *(NFR-15)*
- **SC-003**: A card moved by drag or keyboard appears in its new column within
  100 milliseconds, before any server confirmation. *(NFR-10)*
- **SC-004**: 100% of actions available by pointing device are also completable
  by keyboard alone. *(NFR-12)*
- **SC-005**: Zero cards are lost across ten consecutive stop-and-recreate
  cycles of the application containers. *(M-5)*
- **SC-006**: A board of 50 cards displays each card's title, priority, due
  date and tags without opening any card, on a 1440×900 display. *(NFR-13)*
- **SC-007**: Every column change produces exactly one history record —
  no duplicates, no gaps — across a 100-move exercise. *(BR-31)*
- **SC-008**: A first-time user brings the system up from a clean checkout by
  following the documented steps, with no undocumented step required. *(NFR-20)*
- **SC-009**: No user action triggers a full page reload during a complete
  create–move–edit–delete cycle. *(NFR-11)*

---

## Assumptions

- The user runs the system on a single machine they control, and is the only
  person who will ever use it. Concurrent use from two browser tabs is
  tolerated but not reconciled.
- Operating without authentication is acceptable **only** because the service
  binds to loopback and is not reachable from the network. If that binding
  changes, the no-authentication decision must be revisited.
- A container runtime capable of running the stack is available on the user's
  machine (BRD assumption A-5).
- A realistic board holds tens of cards, not thousands, so pagination and
  virtualised rendering are unnecessary (BRD assumption A-4).
- Priority is a fixed three-value set. Nothing in the business requirements
  calls for user-defined priority schemes.
- The six columns are correct as given and stable. BR-01 fixes them
  deliberately, and BRD decision D-10 records why they are not configurable.
- The card source attribute is carried from the start even though only local
  cards exist, so that Slice 2 introduces Jira-sourced cards without a data
  migration.
- Movement history is written but never displayed in this feature; the archive
  and summary views that read it arrive in Slice 4.

---

## Out of Scope for This Feature

Deferred deliberately, with the slice that owns each:

- All Jira integration — issue import, status transitions, column-to-status
  mapping, credentials, polling, conflict detection and resolution *(Slices 2 and 3)*.
- Search and filtering of the board *(Slice 4)*.
- The dated archive of completed work *(Slice 4)*.
- The generated standup and weekly summary *(Slice 4)*.
- Any user interface for viewing movement history — it is written here and read
  in Slice 4.
- Authentication, user accounts, and multi-user access *(non-goal, BRD §3)*.
- Attachments, file uploads, and comment threads *(non-goal, BRD §5.2)*.

---

## Behavior Pathways

<!--
  Optional at STANDARD tier; authored in full here because this project's
  workflow is BDD-first and these pathways are the source for the executable
  acceptance suite.
-->

- **BH-001** (satisfies FR-001, FR-002): Board presents six fixed columns
  - **Given** the application is running against empty storage
  - **When** the user opens the board
  - **Then** exactly six columns are shown, in the order Backlog, In Progress,
    Blocked, Test, PO Review, Done, with no control to add, rename or remove one

- **BH-002** (satisfies FR-003, FR-009): A card is created into Backlog
  - **Given** an empty board
  - **When** the user creates a card titled "Rotate staging certificates"
  - **Then** a card with that title appears at the top of the Backlog column

- **BH-003** (satisfies FR-004): A blank title is rejected
  - **Given** the new-card form is open
  - **When** the user submits it with a title of only spaces
  - **Then** no card is created and the user is told a title is required

- **BH-004** (satisfies FR-006): Priority defaults to Medium
  - **Given** the new-card form is open
  - **When** the user submits a title without choosing a priority
  - **Then** the created card has Medium priority

- **BH-005** (satisfies FR-008): Tags are trimmed and deduplicated
  - **Given** the new-card form is open
  - **When** the user enters the tags "Ops", "ops " and "security"
  - **Then** the created card carries exactly two tags, "ops" and "security"

- **BH-006** (satisfies FR-007, FR-010, FR-011, FR-012): Card faces are information-dense
  - **Given** a card with a title, High priority, a due date and two tags
  - **When** the board is displayed
  - **Then** title, priority, due date, tags and the card's local source are all
    legible without opening the card

- **BH-007** (satisfies FR-016, FR-018): A card moves between columns and stays
  - **Given** a card in Backlog
  - **When** the user drags it to In Progress and reloads the board
  - **Then** the card is in In Progress

- **BH-008** (satisfies FR-017, FR-018): Cards reorder within a column
  - **Given** three cards ordered A, B, C in one column
  - **When** the user drags C above A and reloads the board
  - **Then** the order is C, A, B

- **BH-009** (satisfies FR-019): Moves apply optimistically
  - **Given** a card in Backlog and a server that has not yet responded
  - **When** the user drops the card on In Progress
  - **Then** the card is shown in In Progress before the server confirms it

- **BH-010** (satisfies FR-020): A failed move reverts and explains
  - **Given** a card in Backlog and a server that will reject the move
  - **When** the user drops the card on Test
  - **Then** the card returns to Backlog in its original position and the user
    is told the move did not save

- **BH-011** (satisfies FR-021): A drag released off-board changes nothing
  - **Given** a card in Blocked
  - **When** the user drags it and releases outside every column
  - **Then** the card remains in Blocked at its original position and no
    movement is recorded

- **BH-012** (satisfies FR-005, FR-013, FR-018): Card edits persist
  - **Given** an existing card
  - **When** the user changes its title, description, priority, due date and
    tags, saves, and reloads the board
  - **Then** all five changes are present

- **BH-013** (satisfies FR-014): Deletion requires confirmation
  - **Given** an existing card
  - **When** the user deletes it and cancels at the confirmation
  - **Then** the card remains on the board; and when the user deletes it and
    confirms, the card is gone

- **BH-014** (satisfies FR-022, FR-023): A card is created and moved by keyboard
  - **Given** the board has focus and no pointing device is used
  - **When** the user presses the new-card shortcut, types a title, saves,
    focuses the card, and presses the shortcut for the Test column
  - **Then** the card exists in Test and is visibly focused

- **BH-015** (satisfies FR-024, FR-025): Shortcuts are discoverable
  - **Given** the board has focus
  - **When** the user presses the help shortcut
  - **Then** every keyboard shortcut the board supports is listed

- **BH-016** (satisfies FR-026): A column change writes one history record
  - **Given** a card in Backlog
  - **When** it is moved to In Progress
  - **Then** exactly one history record exists naming Backlog as origin,
    In Progress as destination, the time of the move, and the user as actor

- **BH-017** (satisfies FR-027, FR-028): History is append-only and
  column-scoped
  - **Given** a card with one history record
  - **When** the card is reordered within its column, then moved to Blocked
  - **Then** the reorder produced no record, a second record exists for the
    move to Blocked, and the first record is unchanged

- **BH-018** (satisfies FR-029): History outlives the card
  - **Given** a card with two history records
  - **When** the card is deleted
  - **Then** both history records remain retrievable

- **BH-019** (satisfies FR-030, FR-031): Data survives container recreation
  - **Given** a board with cards in four different columns
  - **When** the application and data containers are destroyed and recreated
    from their images and started again
  - **Then** every card is present in the column and position it held before

- **BH-020** (satisfies FR-031): Schema is created on first start
  - **Given** empty storage with no schema
  - **When** the application starts
  - **Then** the schema is created automatically and the board loads with six
    columns and no cards

- **BH-021** (satisfies FR-032, FR-037): Health reflects real readiness
  - **Given** the application is running and the data store is unreachable
  - **When** the health check is called
  - **Then** it reports unhealthy, and the failure is stated clearly rather
    than the board accepting changes it cannot store

- **BH-022** (satisfies FR-034, FR-035): Reachable only from the host, with no
  login
  - **Given** the system is running
  - **When** it is requested from the loopback interface
  - **Then** the board is served with no authentication challenge; and when it
    is requested from a non-loopback address, the connection is refused

---

- **BH-023** (satisfies FR-015): Deletion is refused for non-local cards
  - **Given** a card whose source is Jira-sourced exists in storage
  - **When** deletion of that card is requested
  - **Then** the request is refused and the card remains

- **BH-024** (satisfies FR-033): One command brings up the whole system
  - **Given** a clean checkout and no running containers
  - **When** the documented single start command is run
  - **Then** both containers reach a healthy state and the board is reachable
    with no further manual step

- **BH-025** (satisfies FR-036): A full working cycle needs no page reload
  - **Given** the board is open
  - **When** the user creates a card, moves it to In Progress, edits its title,
    and deletes it
  - **Then** no full page reload occurs at any point in the cycle

- **BH-026** (satisfies FR-038): Operating instructions are documented
  - **Given** the repository as checked out
  - **When** the documentation is read
  - **Then** it states how to start, stop and reset the system, and names the
    storage volume whose deletion would lose data

## Verification

| ID | Test name | Pins |
|---|---|---|
| TEST-001 | Board renders the six fixed columns in order and exposes no column-editing affordance | BH-001 |
| TEST-002 | Creating a card places it at the top of Backlog | BH-002 |
| TEST-003 | Whitespace-only title is rejected with a stated reason | BH-003 |
| TEST-004 | Card created without an explicit priority defaults to Medium | BH-004 |
| TEST-005 | Tags are trimmed and case-insensitively deduplicated on save | BH-005 |
| TEST-006 | Card face shows title, priority, due date, tags and source | BH-006 |
| TEST-007 | Card moved to another column is still there after reload | BH-007 |
| TEST-008 | Reordering within a column persists across reload | BH-008 |
| TEST-009 | Move renders before the server responds | BH-009 |
| TEST-010 | Rejected move reverts the card and surfaces the failure | BH-010 |
| TEST-011 | Drag released outside any column leaves card and history untouched | BH-011 |
| TEST-012 | All five editable attributes persist across reload | BH-012 |
| TEST-013 | Delete is cancellable and, when confirmed, removes the card | BH-013 |
| TEST-014 | Full create-then-move cycle completes with keyboard input only | BH-014 |
| TEST-015 | Help overlay lists every supported shortcut | BH-015 |
| TEST-016 | Column change appends one record with origin, destination, time and actor | BH-016 |
| TEST-017 | Reorder writes no record; later move appends without altering the first | BH-017 |
| TEST-018 | History records survive deletion of their card | BH-018 |
| TEST-019 | Cards survive destroy-and-recreate of both containers | BH-019 |
| TEST-020 | First start against empty storage creates the schema and loads the board | BH-020 |
| TEST-021 | Health check reports unhealthy when the data store is unreachable | BH-021 |
| TEST-022 | Service answers on loopback without a login and refuses non-loopback | BH-022 |
| TEST-023 | Delete request against a Jira-sourced card is refused | BH-023 |
| TEST-024 | Documented single command brings both containers to healthy | BH-024 |
| TEST-025 | Create-move-edit-delete cycle triggers no full page reload | BH-025 |
| TEST-026 | Documentation covers start, stop, reset and names the data volume | BH-026 |
