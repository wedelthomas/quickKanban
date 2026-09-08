# Feature Specification: Time, Points and Iteration Reporting

**Feature Branch**: `006-time-points-and-reporting`
**Created**: 2026-08-26
**Status**: Draft
**Input**: User description: "Slice 6 — reading the movement history for what it always implied. Elapsed time derived from card movements, story points imported and locally editable, velocity, and per-iteration reporting: where the time went, how much of it was invisible work, commitment against completion, and a burndown. The generated summary gains the iteration as a reporting period."

**Risk Tier:** FULL

**Business source**: `docs/brd-2.md` (BRD v2) — this feature implements
BR-62…BR-80 and BR-84…BR-85, plus NFR-26 and NFR-29. It depends on Slice 1 for
the append-only movement history, Slice 3 for Jira-sourced cards, Slice 4 for
the generated summary and the archive, and Slice 5 for the iteration, the
blocked indicator and the configurable Jira field identifiers. NFR-05, NFR-21
and NFR-24 are cross-cutting and apply here as they do to every slice.

---

## Clarifications

### Session 2026-08-26

- Q: Where does elapsed time come from? → A: Derived from the movement history
  Slice 1 already writes. Never typed by the user, never read from any Jira
  field. Jira worklogs are empty on every one of the user's issues, and timers
  require a discipline the user does not expect to sustain.
- Q: What span does the clock cover? → A: First entry into In Progress until
  arrival in Done, counting Test and PO Review — waiting on review is part of
  how long the work took.
- Q: Wall clock or working hours? → A: Working hours only. A card started
  Friday afternoon and finished Monday morning is about three hours of work,
  not sixty-six.
- Q: Does anything else pause the clock? → A: Only the blocked indicator. No
  idle cap and no staleness prompt; the residual risk of a parked card
  inflating its time is accepted deliberately.
- Q: Where do story points come from? → A: Imported from the configured story
  points field, editable locally on any card, never written back.
- Q: What counts as committed for an iteration? → A: A snapshot taken at
  iteration start of the points in Iteration Items, In Progress, Test and PO
  Review. Anything arriving later is scope change, which is what makes the
  burndown's completed-versus-added distinction meaningful.
- Q: How do unpointed cards appear in points metrics? → A: Excluded from the
  figures, but counted and declared, so an incomplete number never passes as a
  total.
- Q: Do local ad-hoc cards count toward velocity? → A: Yes, and the local
  versus Jira-sourced split is always shown alongside — that split is the
  number that quantifies invisible work.
- Q: Is the story points field correct? → A: Verified against the live
  Anchor Team board twice. Its estimation configuration names one field, and
  23 of the 25 issues in its active sprint carry a value there while the
  alternative candidates carry none. The identifier itself is configuration,
  recorded in the plan rather than here.
- Q: Could the commitment baseline be read from Jira sprint membership instead
  of snapshotting the board? → A: No, and the board's own history shows why.
  Sprints S14 and S16 on board 4200 each report completed points exactly equal
  to their total, because Jira moves incomplete issues out of a sprint when it
  closes. Deriving commitment from a closed sprint's membership would therefore
  report perfect completion in every iteration, always. The snapshot must come
  from this board's columns at iteration start.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - I can see where my iteration went (Priority: P1)

The board has been recording every card movement with a timestamp since Slice
1, but nobody has ever read it for duration. The user wants to ask "where did
this iteration go?" and get an answer built from that record, without ever
having typed a duration.

**Why this priority**: It is the reason the slice exists, and it needs nothing
but the movement history and the iteration — both of which already exist. Every
other story in this slice is a refinement of, or a companion to, this number.

**Independent Test**: Can be fully tested by moving a card through In Progress,
Test and Done across known times, then reading the iteration report and
confirming the elapsed figure matches the working hours those movements span.

**Acceptance Scenarios**:

1. **Given** a card that entered In Progress at 09:00 and reached Done at 12:00
   on the same working day, **When** the iteration report is read, **Then** the
   card shows three hours.
2. **Given** a card that entered In Progress on Friday at 16:00 and reached
   Done on Monday at 10:00, **When** the report is read, **Then** the card
   shows only the configured working hours between those points, not the
   elapsed calendar time.
3. **Given** a card that was blocked for part of its time in progress, **When**
   the report is read, **Then** the blocked period is excluded.
4. **Given** a card that moved from In Progress back to Backlog and later
   returned, **When** the report is read, **Then** its time is the sum of both
   passes.
5. **Given** an iteration report has been produced, **When** the working hours
   configuration is corrected and the report is read again, **Then** the
   historical figures reflect the corrected configuration.

---

### User Story 2 - I can say how much of my work is invisible (Priority: P1)

Version 1 put ad-hoc work on the board. The user still cannot say how much of
their capacity it consumes, which is the argument they actually need to make.
They want a number: the share of an iteration's hours and points spent on work
no Jira board would ever show.

**Why this priority**: It closes the loop on the problem the whole product was
built for. It depends only on time existing, so it lands alongside User Story 1
rather than after it.

**Independent Test**: Can be fully tested by working a mix of local and
Jira-sourced cards through an iteration and confirming the report states each
one's share of hours and of points.

**Acceptance Scenarios**:

1. **Given** an iteration containing both local and Jira-sourced cards with
   time against them, **When** the report is read, **Then** it states the hours
   and the share attributable to each.
2. **Given** the same iteration, **When** the report is read, **Then** it
   states the points and share attributable to each, subject to the unpointed
   rule.
3. **Given** an iteration whose work was entirely Jira-sourced, **When** the
   report is read, **Then** the local share is reported as zero rather than
   omitted.

---

### User Story 3 - Estimates reach the board (Priority: P2)

Some of the user's work is already sized in Jira; most is not. They want
whatever exists to arrive automatically, and they want to size anything else
themselves without leaving the board — and without their local judgement
leaking back into a team's Jira.

**Why this priority**: A prerequisite for velocity, commitment and the
burndown, but it delivers little on its own, so it follows the time stories.

**Independent Test**: Can be fully tested by importing an issue carrying a
point value, confirming the card shows it, overriding it locally, and
confirming Jira is never written to.

**Acceptance Scenarios**:

1. **Given** a Jira issue carrying a story point value, **When** it is
   imported, **Then** the card shows that value.
2. **Given** an imported card, **When** the user sets a different value
   locally, **Then** the card uses the local value and the difference from Jira
   is visible when the card is opened.
3. **Given** a local ad-hoc card, **When** the user sets points on it, **Then**
   the card carries them.
4. **Given** any sequence of points changes, **When** the write requests issued
   to Jira are inspected, **Then** none of them touch the story points field.
5. **Given** an issue whose story points field is empty and another whose value
   is zero, **When** both are imported, **Then** the first is treated as
   unpointed and the second as pointed with a value of zero.

---

### User Story 4 - I can see what I committed to against what I finished (Priority: P2)

The user wants to know whether they took on more than the iteration could hold,
and to see that judgement made against what they actually committed at the
start rather than against a total that quietly grew.

**Why this priority**: Directly answers "am I overcommitted", one of the four
questions this phase exists to answer. Needs points, so it follows User Story 3.

**Independent Test**: Can be fully tested by committing cards to an iteration,
adding another mid-iteration, completing some, and confirming the report
separates the original commitment, the scope change, and the completion.

**Acceptance Scenarios**:

1. **Given** an iteration beginning with pointed cards in Iteration Items and
   In Progress, **When** the iteration starts, **Then** their total is recorded
   as the commitment for that iteration.
2. **Given** a committed iteration, **When** a further card is added to it
   mid-iteration, **Then** the commitment figure is unchanged and the addition
   is reported as scope added.
3. **Given** an iteration in which some committed cards reached Done, **When**
   the report is read, **Then** it shows commitment, completion and scope
   change as three distinct figures.
4. **Given** an iteration in which no card carries points, **When** the report
   is read, **Then** it reports no points figures and states why.

---

### User Story 5 - I can watch the iteration burn down (Priority: P2)

The user wants to see progress while the iteration is still running, not only
in hindsight — and to see immediately when a line that failed to fall did so
because work was added rather than because nothing got done.

**Why this priority**: The one output of this slice that is useful mid-flight
rather than retrospectively. It depends on the commitment baseline from User
Story 4.

**Independent Test**: Can be fully tested by advancing an iteration day by day
with work completed on some days and scope added on others, and confirming the
chart attributes each movement to the right cause.

**Acceptance Scenarios**:

1. **Given** an iteration with a recorded commitment, **When** the burndown is
   read, **Then** it shows the points outstanding at the close of each working
   day of the iteration.
2. **Given** a day on which committed work reached Done, **When** the burndown
   is read, **Then** that day's fall is attributed to completed work.
3. **Given** a day on which a card was added to the iteration, **When** the
   burndown is read, **Then** the increase is attributed to scope added and is
   distinguishable from an absence of progress.
4. **Given** an iteration still running, **When** the burndown is read,
   **Then** it covers the days elapsed so far without asserting values for days
   still to come.

---

### User Story 6 - My standup summary knows about the iteration (Priority: P3)

The user already generates a summary for a day or a week. They want the same
thing bounded by the iteration, with the time figures alongside, and they want
to paste it into a chat unchanged.

**Why this priority**: An extension of something that already works, valuable
but not load-bearing. Last.

**Independent Test**: Can be fully tested by generating a summary for the
iteration period and confirming it covers the iteration's boundaries, carries
the time figures, and copies as plain text.

**Acceptance Scenarios**:

1. **Given** the summary, **When** the user chooses the iteration as the
   period, **Then** it covers exactly that iteration's dates.
2. **Given** any Phase 2 report, **When** the user copies it, **Then** it is
   plain text suitable for pasting into a chat.
3. **Given** a period part of which predates this feature's installation,
   **When** a report covering it is read, **Then** it declares the data
   incomplete rather than presenting a partial figure as a total.

---

### Edge Cases

- **A card is in progress when the report is run.** Its time to date is
  reported without implying the work is finished.
- **A card reaches Done and is later moved back out.** The clock resumes rather
  than treating the card as finished.
- **A card is archived before a report covering its iteration is run.** Slice 4
  removes Done cards from the board after a configurable window; those cards
  must still contribute their time and points to the iteration they completed
  in.
- **A card spans three iterations.** Its time is apportioned across all three,
  not attributed wholly to the first or last.
- **A card is blocked overnight.** The blocked exclusion and the non-working
  hours exclusion overlap and must not be subtracted twice.
- **An iteration contains no pointed cards at all.** This is today's reality:
  every one of the user's twelve open issues is unpointed. Points figures must
  be withheld with an explanation rather than reported as zero.
- **A card carries a story point value of zero.** Four issues in the live
  Anchor Team sprint do. Zero is a deliberate estimate and must be counted,
  unlike an absent value.
- **Scope is added and removed on the same day.** The burndown must show the
  net effect without implying progress was made.
- **The working-hours configuration changes mid-iteration.** Historical figures
  are recomputed rather than left frozen against the old configuration.
- **An issue carries a Testing Points value.** That is a separate QA estimate
  and must never be read as the story estimate.
- **A Jira sprint is closed with unfinished issues in it.** Jira moves them to
  the next sprint, so the closed sprint's membership no longer reflects what was
  committed. Observed on board 4200 for S14 and S16, both of which report
  completion equal to their entire contents. Nothing in this feature may take a
  commitment figure from that source.

## Requirements *(mandatory)*

### Functional Requirements

#### Deriving time

- **FR-501**: Elapsed time MUST be derived from the movement history. It MUST
  NOT be entered by the user and MUST NOT be read from any external field.
- **FR-502**: The clock MUST start when a card first enters In Progress and
  stop when it reaches Done.
- **FR-503**: Time spent in Test and PO Review MUST be counted.
- **FR-504**: Only configured working days and working hours MUST be counted.
- **FR-505**: Time MUST NOT accrue while a card is blocked.
- **FR-506**: Where the blocked exclusion and the non-working-hours exclusion
  overlap, the overlapping period MUST be excluded once, not twice.
- **FR-507**: A card that leaves and re-enters the working columns MUST
  accumulate time across all of its passes rather than restarting.
- **FR-508**: A card that has reached Done and is later moved out of Done MUST
  resume accruing time.
- **FR-509**: All derived time MUST be recomputable from the movement history,
  so that a corrected configuration corrects historical figures.
- **FR-510**: Derived figures MUST NOT be stored as the sole record of
  themselves; the movement history remains the source of truth.
- **FR-511**: Time MUST be attributable to the iteration during which it
  accrued.
- **FR-512**: Time on a card spanning more than one iteration MUST be
  apportioned across each iteration in proportion to the working hours falling
  within it, rather than assigned wholly to any one.
- **FR-513**: A card still in progress MUST report its time to date without
  implying completion.
- **FR-514**: A card archived from the board MUST still contribute its time to
  reports covering the iteration in which it completed.

#### Points

- **FR-515**: Story points MUST be imported for Jira-sourced cards from the
  configured story points field.
- **FR-516**: Users MUST be able to set points on any card, local or
  Jira-sourced.
- **FR-517**: Points MUST NOT be written to Jira under any circumstance.
- **FR-518**: Where a local points value differs from the imported value, the
  local value MUST be used and the difference MUST be visible when the card is
  opened.
- **FR-519**: A card with no points value MUST be distinguished from a card
  whose points value is zero. An absent value means unpointed; zero is a
  deliberate estimate.
- **FR-520**: Unpointed cards MUST be excluded from every points figure.
- **FR-521**: Cards pointed at zero MUST be included in points figures,
  contributing zero.
- **FR-522**: Every points figure MUST state how many cards it excluded as
  unpointed.
- **FR-523**: Where no card in the period carries points, points figures MUST
  be withheld with an explanation rather than reported as zero.
- **FR-524**: Any secondary estimate field MUST NOT be read as the story
  estimate.

#### Commitment, completion and velocity

- **FR-525**: At the start of an iteration, the system MUST record as that
  iteration's commitment the total points of cards then in Iteration Items, In
  Progress, Test or PO Review.
- **FR-526**: The recorded commitment MUST NOT change as cards are added to or
  removed from the iteration afterwards.
- **FR-547**: The commitment MUST be derived from this board's own columns at
  iteration start and MUST NOT be derived from Jira sprint membership, because
  Jira rewrites sprint membership at close by moving unfinished issues out,
  which would make completion appear total in every iteration.
- **FR-527**: Cards joining an iteration after its start MUST be reported as
  scope added, and cards leaving as scope removed.
- **FR-528**: Velocity MUST be reported as the total points of cards reaching
  Done within an iteration.
- **FR-529**: Local and Jira-sourced cards MUST both count toward velocity.
- **FR-530**: Commitment, completion and scope change MUST be reported as
  distinct figures.

#### Burndown

- **FR-531**: The system MUST provide a burndown for an iteration showing the
  committed points outstanding at the close of each working day.
- **FR-532**: The burndown MUST distinguish movement caused by completed work
  from movement caused by scope change.
- **FR-533**: A burndown for an iteration still running MUST cover only the
  days elapsed and MUST NOT assert values for days still to come.
- **FR-534**: Burndowns MUST be available for past iterations as well as the
  current one.

#### Reporting

- **FR-535**: The system MUST report where an iteration's time went, broken
  down by card.
- **FR-536**: The system MUST report where an iteration's time went, broken
  down by Jira project, with local cards grouped as their own category.
- **FR-537**: The system MUST report the share of an iteration's time
  attributable to local cards versus Jira-sourced cards.
- **FR-538**: The system MUST report the share of an iteration's points
  attributable to local cards versus Jira-sourced cards.
- **FR-539**: A share of zero MUST be reported as zero rather than omitted.
- **FR-540**: The generated summary MUST accept the iteration as a reporting
  period alongside the existing day and week.
- **FR-541**: Every report introduced by this feature MUST be copyable as plain
  text.
- **FR-542**: A report covering a period for which the underlying record is
  incomplete MUST declare that rather than presenting a partial figure as a
  total.
- **FR-548**: Where a card's blocked history predates this feature, its elapsed
  time MUST be reported as an upper bound rather than as exact, and the report
  MUST say so. The board records when a card MOVES but has never recorded when
  its blocked flag changed, so blocked stretches before this feature cannot be
  subtracted — only claimed not to have happened, which would be a fabrication.
- **FR-543**: Time and points MUST be reported as separate metrics and MUST NOT
  be combined into a single derived score.

#### Cross-cutting

- **FR-544**: Time derivation MUST be a pure function over the movement history
  and the configuration, free of input and output, so that every permutation is
  testable without external dependencies.
- **FR-545**: Reports MUST be operable by keyboard and legible to a screen
  reader.
- **FR-546**: Producing a report MUST NOT block board load or board
  interaction.

### Key Entities

- **Movement record**: Unchanged in shape and still append-only. Read for the
  first time as a source of duration rather than only of sequence.
- **Card**: Gains a points value and a record of the points last seen in Jira,
  to detect divergence. Time is never stored on it.
- **Iteration commitment**: A per-iteration snapshot of committed points, taken
  once at iteration start and thereafter immutable.
- **Scope change**: A card joining or leaving an iteration after its start,
  with the date and the points involved.
- **Report**: A derived view over the above. Holds no authoritative state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-501**: The user never types a duration, and every hour reported traces
  to recorded card movements.
- **SC-502**: A card started on a Friday afternoon and finished on a Monday
  morning reports roughly three hours, not sixty-six.
- **SC-503**: The share of an iteration's hours spent on local versus
  Jira-sourced work can be stated as a number without manual analysis.
- **SC-504**: No points figure is ever presented as a total when cards were
  excluded from it for being unpointed.
- **SC-505**: A burndown line that fails to fall always says whether the cause
  was scope added or work not completed.
- **SC-506**: Correcting the working-hours configuration corrects every
  historical figure, with no figure left frozen against the old setting.
- **SC-507**: No request issued to Jira across the whole test suite writes any
  field other than status.
- **SC-508**: Board load remains under one second with reporting available.

## Assumptions

- Slice 5 is complete: the iteration, the blocked indicator, the Iteration
  Items column and the configurable field identifiers all exist.
- Working hours and working days configured in Slice 5 are consumed here for
  the first time.
- Cards do not sit parked in In Progress unworked for long periods. Where they
  do, the derived time overstates effort; the blocked indicator is the only
  relief valve, and this residual risk is accepted deliberately.
- The user's Jira workload will remain sparsely pointed, so local entry is the
  primary route by which points reach the board. This is a property of the
  user's own work rather than of the company: the Anchor Team board points 33
  to 37 of every 34 to 39 issues, whereas the user's twelve open issues sit in
  architecture projects off that board and carry no points at all.
- Points values of zero are common rather than exceptional — between one and
  seven per sprint on the Anchor Team board — which is why an absent value and
  a zero value must be handled differently.
- An iteration's commitment snapshot is taken when the system first observes a
  new iteration, not by a timer at the exact boundary moment.
- **Blocked time can only be excluded from this feature onward.** The movement
  history goes back to Slice 1, so elapsed time itself is derivable for any
  period; but `blocked` has always been current state, with no record of when it
  changed. Cards blocked before this ships have no interval to subtract, so
  their time is an upper bound (FR-548). Inventing intervals from the current
  flag would claim knowledge the system never had.
- Reports are read by one person on demand; they are not scheduled, exported or
  delivered anywhere.

## Out of Scope for This Feature

- Timers, start/stop controls, manual time entry, or worklog editing of any
  kind.
- Reading or writing Jira worklogs.
- Writing story points, sprint membership or the blocked state to Jira.
- Burn-up charts, and any chart of a team's progress rather than the user's own.
- Team velocity, team capacity, or anyone else's numbers.
- Forecasting or predicting completion dates from historical velocity.
- Any combined efficiency score derived from time and points together.
- Any change to how movement records are written, or to the conflict model.
- Any further change to the column set, which Slice 5 settles.
- Idle detection, staleness caps, or prompts about parked cards.

## Behavior Pathways

- **BH-501** (satisfies FR-501, FR-502): Time comes from movements
  - **Given** a card whose movements into In Progress and Done are recorded
  - **When** its elapsed time is derived
  - **Then** the figure follows from those records alone, with nothing entered
    by a user and nothing read from an external field

- **BH-502** (satisfies FR-503): Waiting counts
  - **Given** a card that spent time in Test and PO Review between In Progress
    and Done
  - **When** its time is derived
  - **Then** that time is included

- **BH-503** (satisfies FR-504): Only working hours count
  - **Given** a card that entered In Progress on Friday afternoon and reached
    Done on Monday morning
  - **When** its time is derived
  - **Then** only the configured working hours between those points are counted

- **BH-504** (satisfies FR-505): Blocked time is excluded
  - **Given** a card that was blocked for part of its time in progress
  - **When** its time is derived
  - **Then** the blocked period is excluded

- **BH-505** (satisfies FR-506): Overlapping exclusions subtract once
  - **Given** a card blocked across a night and a weekend
  - **When** its time is derived
  - **Then** the overlapping period is excluded once, and the total is never
    negative

- **BH-506** (satisfies FR-507): Repeat passes accumulate
  - **Given** a card that went to In Progress, returned to Backlog, and entered
    In Progress again
  - **When** its time is derived
  - **Then** the figure is the sum of both passes

- **BH-507** (satisfies FR-508): Reopening resumes the clock
  - **Given** a card that reached Done and was then moved back out
  - **When** its time is derived
  - **Then** it accrues again from the point it left Done

- **BH-508** (satisfies FR-509, FR-510): Figures are recomputed, not frozen
  - **Given** derived figures produced under one working-hours configuration
  - **When** the configuration is corrected and the figures are read again
  - **Then** they reflect the corrected configuration

- **BH-509** (satisfies FR-511, FR-512): Time splits across iterations
  - **Given** a card whose working time falls partly in one iteration and
    partly in the next
  - **When** its time is attributed
  - **Then** each iteration receives the portion falling within it, and the
    portions sum to the total

- **BH-510** (satisfies FR-513): Unfinished work reports time to date
  - **Given** a card still in progress
  - **When** a report is read
  - **Then** its time so far is shown without marking it complete

- **BH-511** (satisfies FR-514): Archived work still counts
  - **Given** a card that completed in an iteration and has since been archived
  - **When** a report for that iteration is read
  - **Then** the card's time and points are included

- **BH-512** (satisfies FR-515): Points are imported
  - **Given** a Jira issue carrying a story point value
  - **When** it is imported
  - **Then** the card carries that value

- **BH-513** (satisfies FR-516, FR-518): Local points prevail and are visible
  - **Given** an imported card whose points the user has overridden locally
  - **When** the card is opened
  - **Then** the local value is in use and the difference from the imported
    value is visible

- **BH-514** (satisfies FR-517): Points are never written to Jira
  - **Given** any sequence of points changes on the board
  - **When** the write requests issued to Jira are inspected
  - **Then** none of them reference the story points field

- **BH-515** (satisfies FR-519, FR-521): Zero is not the same as unpointed
  - **Given** one card with no points value and one card pointed at zero
  - **When** points figures are computed
  - **Then** the first is excluded as unpointed and the second is included
    contributing zero

- **BH-516** (satisfies FR-520, FR-522): Exclusions are declared
  - **Given** a period containing both pointed and unpointed completed cards
  - **When** a points figure is read
  - **Then** the figure covers only the pointed cards and states how many were
    excluded

- **BH-517** (satisfies FR-523): No points at all withholds the figure
  - **Given** an iteration in which no card carries a points value
  - **When** a points figure is read
  - **Then** no number is reported and the reason is stated

- **BH-518** (satisfies FR-524): A secondary estimate is never the story estimate
  - **Given** an issue carrying a value in a secondary estimate field and none
    in the story points field
  - **When** it is imported
  - **Then** the card is unpointed

- **BH-535** (satisfies FR-547): Commitment ignores Jira sprint membership
  - **Given** an iteration whose corresponding Jira sprint has had unfinished
    issues moved out of it at close
  - **When** the commitment for that iteration is read
  - **Then** it reflects the snapshot taken from the board at iteration start,
    and completion is not reported as total

- **BH-519** (satisfies FR-525, FR-526): Commitment is snapshotted once
  - **Given** pointed cards in the working columns as an iteration begins
  - **When** cards are later added and removed
  - **Then** the recorded commitment is still the total from the start

- **BH-520** (satisfies FR-527): Later arrivals are scope, not commitment
  - **Given** a committed iteration
  - **When** a card is added to it mid-iteration
  - **Then** it is reported as scope added and the commitment is unchanged

- **BH-521** (satisfies FR-528, FR-529): Velocity counts both sources
  - **Given** local and Jira-sourced pointed cards reaching Done in an iteration
  - **When** velocity is read
  - **Then** both contribute to the total

- **BH-522** (satisfies FR-530): Three figures stay distinct
  - **Given** an iteration with commitment, completion and scope change
  - **When** the report is read
  - **Then** the three are reported separately

- **BH-523** (satisfies FR-531): The burndown covers each working day
  - **Given** an iteration with a recorded commitment
  - **When** the burndown is read
  - **Then** it gives the outstanding points at the close of each working day

- **BH-524** (satisfies FR-532): Cause is attributed
  - **Given** one day on which work completed and another on which scope was
    added
  - **When** the burndown is read
  - **Then** each day's movement is attributed to its cause and the two are
    distinguishable

- **BH-525** (satisfies FR-533): The future is not asserted
  - **Given** an iteration still running
  - **When** its burndown is read
  - **Then** it covers only elapsed days

- **BH-526** (satisfies FR-534): Past iterations burn down too
  - **Given** a completed iteration
  - **When** its burndown is read
  - **Then** it covers that iteration's full span

- **BH-527** (satisfies FR-535, FR-536): Time is broken down two ways
  - **Given** an iteration with time against local and Jira-sourced cards
  - **When** the report is read
  - **Then** time is given per card and grouped by Jira project, with local
    cards as their own group

- **BH-528** (satisfies FR-537, FR-538, FR-539): The invisible share is stated
  - **Given** an iteration of mixed local and Jira-sourced work
  - **When** the report is read
  - **Then** the local and Jira shares of both time and points are stated, and
    a zero share is shown as zero

- **BH-529** (satisfies FR-540): The summary takes the iteration
  - **Given** the generated summary
  - **When** the iteration is chosen as the period
  - **Then** it covers exactly that iteration's dates

- **BH-530** (satisfies FR-541): Reports copy as plain text
  - **Given** any report from this feature
  - **When** it is copied
  - **Then** the result is plain text suitable for pasting into a chat

- **BH-536** (satisfies FR-548): Time before the blocked record is an upper bound
  - **Given** a card whose blocked history predates this feature
  - **When** its elapsed time is reported
  - **Then** the figure is presented as an upper bound and the report says why

- **BH-531** (satisfies FR-542): Incompleteness is declared
  - **Given** a period partly predating this feature's records
  - **When** a report covering it is read
  - **Then** it declares the record incomplete rather than presenting a partial
    figure as a total

- **BH-532** (satisfies FR-543): The two metrics never merge
  - **Given** an iteration with both time and points recorded
  - **When** every reported figure is inspected
  - **Then** none combines time and points into a single score

- **BH-533** (satisfies FR-544): Derivation is pure
  - **Given** the time derivation
  - **When** it is exercised across every permutation of movements and
    configuration
  - **Then** it runs without any external dependency

- **BH-534** (satisfies FR-545, FR-546): Reports are accessible and non-blocking
  - **Given** a report being produced
  - **When** the user drives the interface by keyboard alone
  - **Then** the report is reachable and legible, and the board stays
    interactive throughout

## Verification

| ID | Test name | Pins |
|---|---|---|
| TEST-501 | Elapsed time derives from recorded movements alone | BH-501 |
| TEST-502 | Test and PO Review time is counted | BH-502 |
| TEST-503 | A weekend-spanning card reports working hours only | BH-503 |
| TEST-504 | Blocked periods are excluded from elapsed time | BH-504 |
| TEST-505 | Blocked-and-overnight overlap is excluded exactly once | BH-505 |
| TEST-506 | Repeat passes through In Progress accumulate | BH-506 |
| TEST-507 | Moving a card out of Done resumes its clock | BH-507 |
| TEST-508 | Corrected working hours correct historical figures | BH-508 |
| TEST-509 | Time spanning a boundary splits and the parts sum to the whole | BH-509 |
| TEST-510 | An in-progress card reports time to date, not completion | BH-510 |
| TEST-511 | Archived cards still contribute to their iteration's report | BH-511 |
| TEST-512 | A Jira story point value imports onto the card | BH-512 |
| TEST-513 | A local override is used and its divergence is visible | BH-513 |
| TEST-514 | Every Jira write in the suite leaves story points untouched | BH-514 |
| TEST-515 | Pointed-at-zero counts; unpointed is excluded | BH-515 |
| TEST-516 | Points figures state how many cards were excluded | BH-516 |
| TEST-517 | An iteration with no pointed cards reports no points figure | BH-517 |
| TEST-518 | A secondary estimate field never supplies the story estimate | BH-518 |
| TEST-519 | Commitment is fixed at iteration start | BH-519 |
| TEST-535 | Commitment survives Jira moving issues out of a closed sprint | BH-535 |
| TEST-520 | Mid-iteration additions report as scope, not commitment | BH-520 |
| TEST-521 | Velocity counts local and Jira-sourced cards alike | BH-521 |
| TEST-522 | Commitment, completion and scope report separately | BH-522 |
| TEST-523 | Burndown gives outstanding points per working day | BH-523 |
| TEST-524 | Burndown attributes each movement to completion or scope | BH-524 |
| TEST-525 | A running iteration's burndown covers elapsed days only | BH-525 |
| TEST-526 | A past iteration's burndown covers its full span | BH-526 |
| TEST-527 | Time reports break down per card and per project | BH-527 |
| TEST-528 | Local and Jira shares are stated, zero shown as zero | BH-528 |
| TEST-529 | Summary bounded by the iteration covers its dates | BH-529 |
| TEST-530 | Reports copy as plain text | BH-530 |
| TEST-531 | A partly-unrecorded period is declared incomplete | BH-531 |
| TEST-536 | Time predating the blocked record is reported as an upper bound | BH-536 |
| TEST-532 | No reported figure combines time and points | BH-532 |
| TEST-533 | Time derivation runs with no external dependency | BH-533 |
| TEST-534 | Reports are keyboard-reachable and never block the board | BH-534 |
