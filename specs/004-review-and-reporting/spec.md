# Feature Specification: Review and Reporting

**Feature Branch**: `004-review-and-reporting`
**Created**: 2026-08-26
**Status**: Draft
**Input**: User description: "Slice 4 — making the board's accumulated record useful. Search and filter across the board, automatic archival of finished work into a dated archive, and generated standup and weekly summaries that can be pasted into a chat. Reads the movement history written since Slice 1."

**Risk Tier:** STANDARD

**Business source**: `docs/brd.md` — this feature implements BR-29…BR-34. It
depends on Slice 1 (`specs/001-board-foundation/`) for the movement history and
the archived-at attribute, and on Slices 2 and 3 for Jira-sourced cards and
sync-attributed movements, which appear in what it displays.

---

## Clarifications

### Session 2026-08-26

- Q: When does a card in Done leave the board for the archive? → A:
  Automatically, once it has been in Done longer than a configurable window,
  defaulting to 7 days
- Q: Does a filter survive a page reload? → A: No. The board always opens
  unfiltered, so a filtered board is never mistaken for a lost one

### Session 2026-08-27

- Q: FR-317 requires archival in the movement history, but a card eligible for
  archival is already in Done and the history forbids an event whose from- and
  to-column match — while Out of Scope forbade changing how that history is
  written. Which holds? → A: FR-317. The exclusion is narrowed to how
  *movements* are recorded; archival becomes a distinct kind of record. Raised
  by `/speckit.plan`; see plan.md and research.md R-3.
- Q: May archival take a card that has an unresolved conflict on it? → A: No.
  Slice 3 freezes a conflicted card so the disagreement is resolved
  deliberately; archiving it would dispose of the evidence and remove the
  user's ability to act. The spec predates Slice 3, so this was not previously
  contemplated.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find the card I am thinking of (Priority: P1)

The board holds a few dozen cards across six columns. The user remembers a
word from a title, or wants to see only what is tagged "ops", or only what is
overdue. They narrow the board to it without leaving the board.

**Why this priority**: A board is a spatial memory aid, and it stops being one
the moment there is more on it than the eye can scan. Filtering is what keeps
the board usable as the workload grows (BR-29, BR-30).

**Independent Test**: With cards spanning several tags, priorities and sources,
apply each kind of filter and confirm only matching cards remain, in place, on
the same board.

**Acceptance Scenarios**:

1. **Given** a board of cards, **When** the user types text into the filter,
   **Then** only cards whose title or description contains that text remain
   visible.
2. **Given** a board of cards, **When** the user filters by a tag, **Then**
   only cards carrying that tag remain visible.
3. **Given** a board of cards, **When** the user filters by priority, **Then**
   only cards of that priority remain visible.
4. **Given** a board holding both Jira-sourced and ad-hoc cards, **When** the
   user filters by source, **Then** only cards of that source remain visible.
5. **Given** a filter is applied, **When** the board is displayed, **Then** all
   six columns remain visible, including any that match nothing.
6. **Given** a filter is applied, **When** the user clears it, **Then** every
   card is visible again.
7. **Given** a filter is applied, **When** the user reloads the page, **Then**
   the board opens unfiltered.
8. **Given** two filters are applied at once, **When** the board is displayed,
   **Then** only cards matching both remain visible.

---

### User Story 2 - Finished work leaves without being lost (Priority: P1)

Work reaches Done and stays there just long enough to be satisfying. After a
week it moves quietly into the archive, so the Done column keeps showing what
was recently finished rather than everything ever finished.

**Why this priority**: Without this, Done grows without bound and the board
degrades over months into something nobody opens. The archive is also what
makes the summaries in this feature possible over any span longer than the
board itself holds.

**Independent Test**: Place cards in Done with varying ages, run the archival
process, and confirm only those older than the window left the board and all
of them remain retrievable.

**Acceptance Scenarios**:

1. **Given** a card that has been in Done longer than the configured window,
   **When** archival runs, **Then** the card leaves the board and is retained
   in the archive.
2. **Given** a card that reached Done within the window, **When** archival
   runs, **Then** it remains on the board.
3. **Given** an archived card, **When** the user opens the archive, **Then**
   the card is listed under the date it was completed.
4. **Given** the archival window is changed in settings, **When** archival
   runs, **Then** the new window governs which cards leave.
5. **Given** a card is moved out of Done before the window elapses, **When**
   archival runs, **Then** it is not archived.
6. **Given** an archived card, **When** the movement history is inspected,
   **Then** the archival is recorded and attributed to the system rather than
   the user.

---

### User Story 3 - Produce my standup update without writing it (Priority: P2)

Before standup the user opens the summary. It already says what moved
yesterday, what is in progress, and what is blocked. They copy it and paste it
into the channel.

**Why this priority**: This turns the board's byproduct into the thing the user
would otherwise spend time assembling by hand each morning (success metric
M-6). Valuable, but the board is fully useful without it.

**Independent Test**: Move several cards over two days, generate the daily
summary, and confirm it names what moved, what is in progress and what is
blocked, and that it can be copied as plain text.

**Acceptance Scenarios**:

1. **Given** cards moved yesterday and today, **When** the user generates a
   daily summary, **Then** it lists the cards that changed column in that
   period.
2. **Given** cards in the In Progress column, **When** the summary is
   generated, **Then** they are listed as in progress.
3. **Given** cards in the Blocked column, **When** the summary is generated,
   **Then** they are listed as blocked.
4. **Given** a summary is displayed, **When** the user copies it, **Then** it
   is copied as plain text suitable for pasting into a chat.
5. **Given** a period in which nothing moved, **When** the summary is
   generated, **Then** it says so rather than producing an empty document.
6. **Given** both Jira-sourced and ad-hoc cards moved, **When** the summary is
   generated, **Then** both appear, with Jira-sourced entries carrying their
   issue key.

---

### User Story 4 - Look back over the week (Priority: P2)

For a one-to-one, a weekly review, or a status report, the user wants the same
picture over seven days rather than one.

**Why this priority**: The same machinery as the daily summary over a longer
window, so it costs little once that exists — but it serves a less frequent
need.

**Independent Test**: Generate the weekly summary over a period containing
completed, in-progress and blocked work, and confirm it covers the full seven
days including archived cards.

**Acceptance Scenarios**:

1. **Given** movements spanning ten days, **When** the user generates a weekly
   summary, **Then** it covers the last seven days and excludes the rest.
2. **Given** cards completed and since archived within the period, **When** the
   weekly summary is generated, **Then** those cards appear in it.
3. **Given** a weekly summary, **When** it is displayed, **Then** work
   completed, work in progress and work blocked are distinguished from one
   another.

---

### User Story 5 - Look something up in the archive (Priority: P3)

Months later the user needs to know when they finished a piece of work, or
what they did in a particular week.

**Why this priority**: The rarest need of the four, but the reason the archive
retains cards rather than discarding them.

**Independent Test**: Archive cards across several dates, then retrieve the
archive for a chosen date range and confirm only cards from that range appear.

**Acceptance Scenarios**:

1. **Given** archived cards across several dates, **When** the user views the
   archive for a date range, **Then** only cards completed in that range are
   listed.
2. **Given** an archived card, **When** the user opens it, **Then** its title,
   tags, source and completion date are shown.
3. **Given** an archived Jira-sourced card, **When** the user opens it,
   **Then** the link to its issue is still available.
4. **Given** an archive with no entries in the chosen range, **When** it is
   viewed, **Then** the empty result is stated plainly.

---

### Edge Cases

- **A filter matching nothing** — every column is shown empty, with a clear
  statement that a filter is hiding cards and how to clear it. An empty board
  must never be ambiguous between "filtered" and "you have no work".
- **Filter text matching a tag name** — text filtering searches title and
  description only; tag filtering is a separate control, so the two never
  produce surprising overlaps.
- **A card archived while a filter is applied** — it disappears from the
  filtered view as it would from the board; the filter is not re-evaluated
  against archived cards.
- **A card that reaches Done, is dragged out, and returns** — the window is
  measured from its most recent arrival in Done, not its first.
- **A Jira-sourced card archived by the disappearance rule in Slice 2** — it
  appears in the archive dated when it left the board, and the recorded reason
  is shown alongside it.
- **An archived card whose issue is reassigned back to the user** — Slice 2's
  restore rule takes precedence; the card returns to the board and leaves the
  archive.
- **A summary period containing only movements caused by sync** — those
  movements are included and identified as having come from Jira, so the user
  does not claim credit for a transition someone else made.
- **A summary generated before any history exists** — states that there is
  nothing to report.
- **The archival window set to zero** — cards leave Done as soon as archival
  next runs; this is permitted and is the user's choice.

---

## Requirements *(mandatory)*

### Functional Requirements

**Filtering**

- **FR-301**: Users MUST be able to filter the board by free text matching card
  titles and descriptions. *(BR-29)*
- **FR-302**: Users MUST be able to filter the board by tag. *(BR-29)*
- **FR-303**: Users MUST be able to filter the board by priority. *(BR-29)*
- **FR-304**: Users MUST be able to filter the board by source, distinguishing
  Jira-sourced from ad-hoc cards. *(BR-29)*
- **FR-305**: Users MUST be able to filter the board to overdue cards. *(BR-29)*
- **FR-306**: Multiple filters applied together MUST narrow the result to cards
  matching all of them. *(BR-29)*
- **FR-307**: Filtering MUST operate in place on the board, keeping all six
  columns visible, rather than navigating to a separate results view. *(BR-30)*
- **FR-308**: When a filter is active, System MUST indicate that cards are
  being hidden and MUST offer a means to clear it. *(BR-30)*
- **FR-309**: Filters MUST be reachable and clearable by keyboard alone. *(NFR-12)*
- **FR-310**: Filters MUST NOT persist across a page reload; the board MUST
  open unfiltered. *(BR-30)*
- **FR-311**: Filtering MUST NOT alter any card's column, position or content. *(BR-29)*

**Archival**

- **FR-312**: System MUST archive a card that has remained in the Done column
  longer than a configured window. *(BR-32)*
- **FR-313**: The archival window MUST be configurable and MUST default to 7
  days. *(BR-32, BR-35)*
- **FR-314**: The window MUST be measured from the card's most recent arrival
  in Done. *(BR-32)*
- **FR-315**: An archived card MUST leave the active board. *(BR-32)*
- **FR-316**: An archived card MUST remain retrievable and MUST NOT be
  deleted. *(BR-32)*
- **FR-317**: Archival MUST be recorded in the movement history and attributed
  to the system rather than the user. Archival is a distinct kind of history
  record from a movement: an archived card does not change column, so this
  record states that the card was archived, not that it moved. *(BR-31)*
- **FR-318**: A card moved out of Done before the window elapses MUST NOT be
  archived. *(BR-32)*
- **FR-318a**: A card with an unresolved conflict MUST NOT be archived,
  regardless of how long it has been in Done. Archival would remove the card
  from the board while the disagreement stands, leaving the user unable to
  resolve it. *(BR-32, and Slice 3's FR-227)*

**The archive**

- **FR-319**: Users MUST be able to view archived cards for a chosen date
  range. *(BR-32)*
- **FR-320**: Archived cards MUST be presented grouped by completion date. *(BR-32)*
- **FR-321**: An archived card MUST show its title, tags, source and
  completion date, and for Jira-sourced cards, a link to the issue. *(BR-32)*
- **FR-322**: Where a card was archived for a recorded reason, that reason
  MUST be shown. *(BR-21)*
- **FR-323**: An empty archive result MUST be stated plainly rather than
  presented as a blank view. *(BR-32)*

**Summaries**

- **FR-324**: System MUST generate a summary for a chosen period covering work
  that moved, work in progress, and work blocked. *(BR-33)*
- **FR-325**: System MUST offer at least a daily and a weekly period. *(BR-33)*
- **FR-326**: The summary MUST draw on the movement history, including cards
  since archived. *(BR-31, BR-33)*
- **FR-327**: The summary MUST include both Jira-sourced and ad-hoc cards, and
  MUST show the issue key for Jira-sourced entries. *(BR-33)*
- **FR-328**: The summary MUST identify movements caused by sync distinctly
  from movements the user made. *(BR-31)*
- **FR-329**: The summary MUST be copyable as plain text suitable for pasting
  into a chat or document. *(BR-34)*
- **FR-330**: A period containing no activity MUST produce a summary that says
  so. *(BR-33)*
- **FR-331**: Generating a summary MUST NOT alter any card, column or history
  record. *(BR-33)*

### Key Entities

- **Filter**: A transient, unsaved narrowing of the board by text, tag,
  priority, source or overdue state. Holds no persistent state.
- **Archive Entry**: A card that has left the active board, retrievable by its
  completion date, retaining title, tags, source, issue link where applicable,
  and the reason it left where one was recorded.
- **Summary**: A generated, read-only view over a period — what moved, what is
  in progress, what is blocked — derived from the movement history and the
  current board. Never stored.

This feature adds no attributes to Card. It reads the archived-at attribute and
the movement history that Slices 1 through 3 wrote.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-301**: Applying any single filter to a 50-card board updates the visible
  set in under 200 milliseconds. *(NFR-15)*
- **SC-302**: 100% of filter combinations return exactly the cards matching all
  applied filters — no false positives, no omissions. *(BR-29)*
- **SC-303**: Zero cards change column, position or content as a result of
  filtering, across the full test suite. *(FR-311)*
- **SC-304**: 100% of cards in Done longer than the window are archived on the
  next archival run, and zero cards younger than the window are — excepting
  cards with an unresolved conflict, of which zero are archived at any age.
  *(BR-32, FR-318a)*
- **SC-305**: Zero archived cards are deleted; 100% remain retrievable by date. *(BR-32)*
- **SC-306**: A standup update is produced in one interaction — open the
  summary — and copied in one more. *(M-6)*
- **SC-307**: The daily summary accounts for 100% of column changes recorded in
  its period, including those of cards since archived. *(BR-33)*
- **SC-308**: Zero card, column or history records are modified by generating a
  summary, across the full test suite. *(FR-331)*
- **SC-309**: A filtered board that matches nothing states that a filter is
  active in 100% of cases, so an empty board is never ambiguous. *(FR-308)*

---

## Assumptions

- The archive grows slowly — tens of cards a month — so listing it by date
  range needs no pagination or search beyond the range itself.
- Summaries are read, copied and discarded. Nothing needs to store a generated
  summary, and reproducing one for a past period from the movement history is
  sufficient.
- The user's standup covers the previous working day. The daily period is
  measured in calendar days in the user's local timezone, consistent with the
  due-date rule established in Slice 1.
- Movement history is complete from Slice 1 onward. Summaries covering periods
  before the board existed will simply be empty, which FR-330 handles.
- Filtering happens over a board small enough to filter in place; no
  server-side search infrastructure is warranted (BRD assumption A-4).
- Sync-attributed movements are worth distinguishing in a summary because the
  user should not report a transition a teammate made as their own progress.

---

## Out of Scope for This Feature

- Saved or named filter presets. Filters are deliberately transient (FR-310).
- Full-text search across archived cards. The archive is browsed by date range.
- Exporting the archive or summaries to a file format.
- Charts, metrics, velocity, cycle time or any quantitative analysis of the
  movement history.
- Editing or restoring an archived card by hand. Slice 2's rule restores a
  Jira-sourced card automatically when its issue returns to the query; there is
  no manual un-archive.
- Scheduled or automatic delivery of a summary anywhere.
- Any change to how **movements** are recorded, which Slices 1 through 3 own.
  Adding a distinct kind of history record for archival is in scope and is
  required by FR-317; what a *movement* row means is not touched.

---

## Behavior Pathways

<!--
  Optional at STANDARD tier; authored in full for consistency with the other
  three slices and because this project works BDD-first.
-->

- **BH-301** (satisfies FR-301): Text filtering matches title and description
  - **Given** cards whose titles and descriptions differ
  - **When** the user filters by a word appearing in one title and one
    description
  - **Then** exactly those two cards remain visible

- **BH-302** (satisfies FR-302, FR-303): Tag and priority filters narrow the
  board
  - **Given** cards across several tags and priorities
  - **When** the user filters by a tag, and separately by a priority
  - **Then** only cards carrying that tag, and only cards of that priority,
    remain visible

- **BH-303** (satisfies FR-304, FR-305): Source and overdue filters narrow the
  board
  - **Given** a board of Jira-sourced and ad-hoc cards, some overdue
  - **When** the user filters by source, and separately by overdue
  - **Then** each filter leaves exactly the matching cards visible

- **BH-304** (satisfies FR-306): Combined filters intersect
  - **Given** cards spanning two tags and two priorities
  - **When** the user applies one tag filter and one priority filter together
  - **Then** only cards matching both remain visible

- **BH-305** (satisfies FR-307, FR-311): Filtering is non-destructive and in
  place
  - **Given** a filtered board
  - **When** the filter is applied and then cleared
  - **Then** all six columns stayed visible throughout, and every card is in
    the column and position it started in

- **BH-306** (satisfies FR-308): A filtered empty board explains itself
  - **Given** a filter matching no cards
  - **When** the board is displayed
  - **Then** it states that a filter is hiding cards and offers to clear it

- **BH-307** (satisfies FR-309): Filters are keyboard-reachable
  - **Given** the board has focus and no pointing device is used
  - **When** the user opens the filter, applies one, and clears it
  - **Then** all three succeed

- **BH-308** (satisfies FR-310): Reload clears the filter
  - **Given** a filter is applied
  - **When** the page is reloaded
  - **Then** the board shows every card

- **BH-309** (satisfies FR-312, FR-314, FR-318): Age in Done decides archival
  - **Given** one card in Done longer than the window, one within it, and one
    that left Done and returned yesterday
  - **When** archival runs
  - **Then** only the first is archived

- **BH-309a** (satisfies FR-318a): A conflicted card is never archived
  - **Given** a card in Done far past the window, with an unresolved conflict
  - **When** archival runs
  - **Then** the card remains on the board, and the run reports that it was
    skipped for that reason

- **BH-310** (satisfies FR-313): The window is the user's
  - **Given** the default window of 7 days and a card 5 days in Done
  - **When** the user sets the window to 3 days and archival runs
  - **Then** the card is archived

- **BH-311** (satisfies FR-315, FR-316): Archived cards leave but survive
  - **Given** a card eligible for archival
  - **When** archival runs
  - **Then** the card is absent from the board and present in the archive

- **BH-312** (satisfies FR-317): Archival is attributed to the system
  - **Given** an archived card
  - **When** the movement history is inspected
  - **Then** the archival is recorded with the system as actor

- **BH-313** (satisfies FR-319, FR-320): The archive reads by date
  - **Given** archived cards across three dates
  - **When** the user views the archive for a range covering two of them
  - **Then** only those cards are listed, grouped by completion date

- **BH-314** (satisfies FR-321, FR-322): Archived cards keep their detail
  - **Given** an archived ad-hoc card and an archived Jira-sourced card that
    left the query for a recorded reason
  - **When** the user opens each
  - **Then** both show title, tags, source and completion date; the
    Jira-sourced card shows its issue link and the recorded reason

- **BH-315** (satisfies FR-323): An empty archive says so
  - **Given** no cards archived in the chosen range
  - **When** the archive is viewed
  - **Then** the empty result is stated plainly

- **BH-316** (satisfies FR-324, FR-325): The summary covers moved, in progress
  and blocked
  - **Given** cards that moved yesterday, cards in In Progress and cards in
    Blocked
  - **When** the user generates a daily summary
  - **Then** all three groups appear and are distinguished

- **BH-317** (satisfies FR-326): Summaries include archived work
  - **Given** a card completed and archived within the last seven days
  - **When** the user generates a weekly summary
  - **Then** the card appears in it

- **BH-318** (satisfies FR-327): Both sources appear, keys included
  - **Given** an ad-hoc card and a Jira-sourced card both moved in the period
  - **When** the summary is generated
  - **Then** both appear and the Jira-sourced entry shows its issue key

- **BH-319** (satisfies FR-328): Sync movements are marked as such
  - **Given** one movement made by the user and one made by sync in the period
  - **When** the summary is generated
  - **Then** the sync-caused movement is identified as having come from Jira

- **BH-320** (satisfies FR-329): The summary is copyable as text
  - **Given** a generated summary
  - **When** the user copies it
  - **Then** the result is plain text suitable for pasting into a chat

- **BH-321** (satisfies FR-330): A quiet period reports itself
  - **Given** a period in which nothing moved
  - **When** a summary is generated
  - **Then** it states there was no activity

- **BH-322** (satisfies FR-331): Generating a summary changes nothing
  - **Given** a board and its history
  - **When** twenty summaries are generated
  - **Then** every card, column and history record is unchanged

---

## Verification

| ID | Test name | Pins |
|---|---|---|
| TEST-301 | Text filter matches titles and descriptions only | BH-301 |
| TEST-302 | Tag and priority filters each narrow correctly | BH-302 |
| TEST-303 | Source and overdue filters each narrow correctly | BH-303 |
| TEST-304 | Two filters together return only their intersection | BH-304 |
| TEST-305 | Filtering keeps all columns and moves no card | BH-305 |
| TEST-306 | Empty filtered board states that a filter is active | BH-306 |
| TEST-307 | Filter can be opened, applied and cleared by keyboard | BH-307 |
| TEST-308 | Reload returns the board to unfiltered | BH-308 |
| TEST-309 | Only cards past the window and still in Done are archived | BH-309 |
| TEST-309a | A conflicted card is never archived, however old | BH-309a |
| TEST-310 | Changing the window changes which cards archive | BH-310 |
| TEST-311 | Archived card leaves the board and remains retrievable | BH-311 |
| TEST-312 | Archival is recorded with the system as actor | BH-312 |
| TEST-313 | Archive lists only the chosen range, grouped by date | BH-313 |
| TEST-314 | Archived cards retain detail, issue link and recorded reason | BH-314 |
| TEST-315 | Empty archive range is stated plainly | BH-315 |
| TEST-316 | Daily summary distinguishes moved, in progress and blocked | BH-316 |
| TEST-317 | Weekly summary includes cards archived within the period | BH-317 |
| TEST-318 | Summary includes both sources and shows issue keys | BH-318 |
| TEST-319 | Sync-caused movements are marked as originating in Jira | BH-319 |
| TEST-320 | Summary copies as plain text | BH-320 |
| TEST-321 | Period with no activity produces a stated empty summary | BH-321 |
| TEST-322 | Twenty summary generations mutate nothing | BH-322 |
