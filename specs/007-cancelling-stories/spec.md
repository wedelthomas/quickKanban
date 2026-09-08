# Feature Specification: Cancelling Stories

**Feature Branch**: `007-cancelling-stories`
**Created**: 2026-08-27
**Status**: Draft
**Input**: User description: "Slice 7 — a way to cancel work that is not going to be done. Distinct from finishing it and distinct from deleting it. Cancelling is an action rather than a column: the card leaves the board immediately, is retained and browsable, transitions the issue in Jira to a configured status, and its points report as scope withdrawn rather than as work not delivered."

**Risk Tier:** FULL

## Overview

Work gets abandoned. A story is descoped, a request is withdrawn, an approach is
replaced by a better one. Until now the board has offered two endings and
neither fits: finishing it, which is a lie, or deleting it, which discards the
record of a decision somebody made deliberately.

This slice adds a third ending. Cancelling removes a card from the board
immediately, keeps it, records why, tells Jira, and — the part that matters most
— reports the abandoned points as scope the user withdrew rather than as work
the user failed to deliver.

Builds on Slice 1 for the movement history, Slice 3 for the single status write
to Jira, Slice 4 for retention and the archive, Slice 5 for the iteration, and
Slice 6 for points, commitment and the burndown.

**Why an action rather than a column.** The board's six columns are the states
work passes *through*. Cancelled is not one of those; it is an ending, and the
board already has a mechanism for endings that get work off the screen while
keeping it. A seventh column would be a waiting room for that mechanism, and it
would re-introduce exactly what Slice 5 removed when the Blocked column became
an indicator: a column holding cards that are not in flight.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - I can cancel work that is not going to happen (Priority: P1)

The user has a card for work that has been called off. They want it off the
board now, without pretending it was finished and without destroying the record
that it existed.

**Why this priority**: Without this there is no feature. Everything else
describes what happens *after* a cancellation.

**Independent Test**: Can be fully tested by cancelling a card from each column
and confirming it leaves the board, is retained, and carries the user's reason.

**Acceptance Scenarios**:

1. **Given** a card in any column, **When** the user cancels it and confirms,
   **Then** the card is no longer on the board and is retained.
2. **Given** the cancellation prompt, **When** the user supplies a short reason,
   **Then** that reason is kept with the card.
3. **Given** the cancellation prompt, **When** the user declines the
   confirmation, **Then** nothing changes and the card stays where it was.
4. **Given** a board driven by keyboard alone, **When** the user cancels a card,
   **Then** the whole interaction is reachable and completable without a mouse.
5. **Given** a cancelled card, **When** the movement history is read, **Then**
   the cancellation is recorded and attributed to the user.

---

### User Story 2 - The cancellation reaches Jira (Priority: P1)

The user's team reads Jira, not this board. A story cancelled here and left open
there is worse than not cancelling it, because now two records disagree and only
one of them is the one the team looks at.

**Why this priority**: A cancellation that stops at the board's edge fails the
purpose. Equal first with US1.

**Independent Test**: Can be fully tested by cancelling an imported card with a
cancellation status configured, and confirming the issue moved to exactly that
status with no other field touched.

**Acceptance Scenarios**:

1. **Given** a configured cancellation status and an imported card, **When** the
   user cancels it, **Then** the issue moves to that status.
2. **Given** any cancellation, **When** the requests sent to Jira are inspected,
   **Then** none of them modifies any field other than issue status.
3. **Given** no configured cancellation status, **When** the user cancels an
   imported card, **Then** the card is still cancelled locally and the user is
   told nothing was sent.
4. **Given** a workflow that refuses the transition, **When** the user cancels,
   **Then** the card is still cancelled locally and the refusal is reported with
   its cause.
5. **Given** a card the user created themselves, **When** they cancel it,
   **Then** no request is sent to Jira at all.
6. **Given** Jira integration is toggled off, **When** the user cancels an
   imported card, **Then** the card is still cancelled locally and the user is
   told nothing was sent.

---

### User Story 3 - Cancelled work does not read as failure (Priority: P2)

The user reports on the iteration. Five points of cancelled work sitting in the
outstanding total is indistinguishable from five points they simply did not
finish, and it is the difference between a report that explains the iteration
and one that quietly indicts them.

**Why this priority**: The reports exist and are already trusted. This makes
them stay honest once cancelling is possible.

**Independent Test**: Can be fully tested by cancelling a pointed card committed
to an iteration and confirming its points appear as scope withdrawn, leave the
outstanding total, and are absent from completed work.

**Acceptance Scenarios**:

1. **Given** a pointed card committed to the iteration, **When** it is
   cancelled, **Then** its points are reported as scope withdrawn, dated the day
   it was cancelled.
2. **Given** a cancelled pointed card, **When** the burndown is read, **Then**
   the outstanding total no longer includes those points.
3. **Given** a cancelled card, **When** completed work is read, **Then** the
   card is absent from it.
4. **Given** a cancelled card, **When** the commitment is read, **Then** the
   commitment is unchanged from what was committed at the start.
5. **Given** an unpointed cancelled card, **When** points figures are read,
   **Then** it contributes no points and is counted among those excluded for
   carrying no estimate.
6. **Given** a card with time accrued against it, **When** it is cancelled and
   the time report is read, **Then** that time is still reported.
7. **Given** an iteration with both withdrawn and added scope, **When** the
   report is read, **Then** the two are reported separately.

---

### User Story 4 - I can find a cancelled story, and undo it (Priority: P2)

Cancelling is a decision, and decisions get revisited. The user needs to see
what was cancelled and why, and to put one back if they were wrong.

**Why this priority**: Recoverability is what makes the action safe to reach
for. Without it, users hesitate and the feature goes unused.

**Independent Test**: Can be fully tested by cancelling a card, finding it among
retained work marked as cancelled with its reason, and restoring it to the
board.

**Acceptance Scenarios**:

1. **Given** cancelled and completed cards retained together, **When** the user
   browses them, **Then** the cancelled ones are distinguishable from those that
   finished.
2. **Given** a cancelled card, **When** the user views it, **Then** the reason
   they gave is shown.
3. **Given** a cancelled card, **When** the user restores it, **Then** it
   returns to the board in the column it occupied when it was cancelled.
4. **Given** a restored card, **When** the iteration report is read, **Then**
   the scope withdrawal is reversed.
5. **Given** a restored imported card whose issue is still cancelled in Jira,
   **When** the card is displayed, **Then** the disagreement is visible rather
   than silent.

---

### User Story 5 - I choose what cancelled means in my Jira (Priority: P3)

The user's Jira reports many statuses that mean some form of cancelled, and they
differ per project and per workflow. The board cannot guess which one is right.

**Why this priority**: Configuration, not capability. The feature works the
moment a status is chosen, and this story is about choosing it well.

**Independent Test**: Can be fully tested by choosing a cancellation status from
those the tracker reports and confirming it survives a restart.

**Acceptance Scenarios**:

1. **Given** the settings, **When** the user chooses a cancellation status,
   **Then** they choose from the statuses the tracker actually reports rather
   than typing one.
2. **Given** a chosen cancellation status, **When** the application restarts,
   **Then** the choice is still in force.
3. **Given** the settings, **When** they are read, **Then** nothing in them
   names a token, a password or a secret.

---

### Edge Cases

- **A card with an unresolved conflict is cancelled.** A conflicted card is
  frozen against both sides until the disagreement is settled. Cancelling it
  would resolve that disagreement by discarding it, which is exactly what the
  freeze exists to prevent.
- **The same card is cancelled twice.** The second cancellation must not record
  a second withdrawal, or the reported scope shrinks by twice the points.
- **A card is cancelled and then restored and then cancelled again.** The
  reported scope must reflect one withdrawal, not two.
- **A card is cancelled after the iteration it was committed to has ended.** The
  withdrawal belongs to the iteration that was running when it was cancelled,
  not to the one it was committed to.
- **A card is cancelled that was never committed to any iteration.** There is no
  commitment to withdraw from, and reporting a withdrawal would reduce a total
  the card never contributed to.
- **A card in Done is cancelled.** Finished work is not cancellable in any
  meaningful sense; the user is looking for the archive.
- **Jira is unreachable at the moment of cancellation.** The user's decision must
  not be lost because a network was down.
- **Jira integration is toggled off at the moment of cancellation.** The board
  must not attempt a transition it has been told not to attempt; the
  cancellation still succeeds locally, exactly as when no cancellation status
  is configured.
- **The configured cancellation status is later removed from the workflow.** The
  transition begins failing, and the failure must name the cause rather than
  reporting a generic error.
- **A restored card is restored into a column that has since been retired.**
  Slice 5 retired a column and kept its record; a card cancelled before that
  point can name a column that no longer accepts cards.

## Requirements *(mandatory)*

### Functional Requirements

**Cancelling**

- **FR-601**: Users MUST be able to cancel a card from any column it can occupy.
- **FR-602**: Cancelling MUST require an explicit confirmation before it takes
  effect.
- **FR-603**: Cancelling MUST accept a short free-text reason from the user, and
  MUST retain it with the card.
- **FR-604**: A cancelled card MUST leave the board immediately.
- **FR-605**: A cancelled card MUST be retained and MUST NOT be deleted.
- **FR-606**: Cancelling MUST be completable by keyboard alone.
- **FR-607**: Cancelling MUST be recorded in the movement history, attributed to
  the user who performed it.
- **FR-608**: Cancelling MUST remain distinct from deleting, and MUST NOT change
  how deletion behaves.
- **FR-609**: A card frozen by an unresolved conflict MUST NOT be cancellable
  until that conflict is resolved.
- **FR-610**: Cancelling a card that is already cancelled MUST have no
  additional effect.

**Reaching Jira**

- **FR-611**: Cancelling an imported card MUST transition its issue to the
  configured cancellation status.
- **FR-612**: The system MUST NOT modify any field of an issue other than its
  status.
- **FR-613**: Where no cancellation status is configured, the local cancellation
  MUST still succeed and the user MUST be told that nothing was sent.
- **FR-614**: Where the transition is refused, the local cancellation MUST still
  succeed and the refusal MUST be reported with its cause.
- **FR-615**: Where the tracker is unreachable, the local cancellation MUST
  still succeed and the failure MUST be reported.
- **FR-616**: Cancelling a card the user created locally MUST NOT issue any
  request to the tracker.
- **FR-640**: Where Jira integration is toggled off, cancelling an imported
  card MUST still succeed locally and MUST NOT issue any request to Jira, the
  same as when no cancellation status is configured.

**Reporting**

- **FR-617**: A cancelled card's points MUST be reported as scope withdrawn from
  the iteration that was running when it was cancelled.
- **FR-618**: Withdrawn scope MUST be dated the day the cancellation happened.
- **FR-619**: Withdrawn points MUST leave the outstanding total.
- **FR-620**: A cancelled card MUST NOT be counted as completed work.
- **FR-621**: The commitment recorded at the start of an iteration MUST NOT
  change when a card is cancelled.
- **FR-622**: Withdrawn scope MUST be reported separately from added scope.
- **FR-623**: A cancelled card carrying no estimate MUST contribute no points
  and MUST be counted among those excluded for carrying no estimate.
- **FR-624**: Time already accrued against a cancelled card MUST still be
  reported.
- **FR-625**: A card cancelled without ever having been committed to an
  iteration MUST NOT be reported as withdrawn scope.
- **FR-626**: Cancelling the same card more than once MUST report exactly one
  withdrawal.

**Finding it again**

- **FR-627**: Retained cancelled cards MUST be distinguishable from cards that
  completed normally.
- **FR-628**: The reason the user gave MUST be visible where a cancelled card is
  viewed.
- **FR-629**: A cancelled card MUST be restorable to the board.
- **FR-630**: A restored card MUST return to the column it occupied when it was
  cancelled, or to the entry column where that column no longer accepts cards.
- **FR-631**: Restoring a card MUST reverse its scope withdrawal.
- **FR-632**: Restoring MUST NOT transition the issue in the tracker.
- **FR-633**: Where a restored card's issue still carries the cancellation
  status, the disagreement MUST be visible on the card.

**Configuration**

- **FR-634**: The cancellation status MUST be chosen from the statuses the
  tracker reports, and MUST NOT be free text.
- **FR-635**: The cancellation status MUST be optional; its absence is a
  supported state.
- **FR-636**: The cancellation status MUST survive a restart.
- **FR-637**: No setting introduced by this feature may name or hold a
  credential.

**Standing constraints**

- **FR-638**: Cancelling MUST NOT delay board load or block board interaction.
- **FR-639**: Cancelling and restoring MUST be legible to a screen reader and
  MUST NOT convey their outcome by colour alone.

### Key Entities

- **Cancellation**: the act of ending a card's life on the board without
  completing it. Carries who did it, when, and why.
- **Withdrawn scope**: points that were committed to an iteration and then
  cancelled. Distinct from added scope and from completed work.
- **Cancellation status**: the status in the tracker that the user's workflow
  uses to mean cancelled. Configuration, because it cannot be guessed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-01**: A user can cancel a card in at most 3 interactions from seeing it
  on the board.
- **SC-02**: 100% of cancellations remove the card from the board without a
  reload.
- **SC-03**: 0 cancelled cards are deleted; all remain retrievable.
- **SC-04**: 100% of cancellations of imported cards either transition the issue
  or report why they did not.
- **SC-05**: 0 requests issued to the tracker modify a field other than issue
  status.
- **SC-06**: A cancelled pointed card changes the iteration's outstanding total
  by exactly its own points, and its completed total by 0.
- **SC-07**: 100% of retained cancelled cards are distinguishable from completed
  ones without opening them.
- **SC-08**: A cancelled card can be restored in at most 3 interactions.
- **SC-09**: Cancelling completes in under 1 second as perceived by the user,
  independent of whether the tracker responds.
- **SC-10**: The whole cancel-and-restore path is completable by keyboard alone.

## Assumptions

- The user is the only person operating this board, so "attributed to the user"
  means one person and needs no identity model.
- A short reason is free text of a sentence or two, not a structured taxonomy.
  The user is writing a note to their future self.
- Cancelling Done work is not a use case; the user reaching for that wants the
  archive, and Done cards leave the board on their own.
- Restoring is rare — a correction to a mistake, not a routine workflow step —
  so it does not need to be reachable from the board itself.
- The iteration that owns a withdrawal is the one running on the day of
  cancellation, which is the one whose report the user is about to read.
- Jira's workflow may refuse a transition to the cancellation status from some
  states. That is the tracker's decision to make and the board reports it rather
  than working around it.

## Behavior Pathways *(mandatory at FULL tier)*

- **BH-601** (satisfies FR-601, FR-604): A card is cancelled from any column
  - **Given** a card in any column of the board
  - **When** the user cancels it and confirms
  - **Then** the card is no longer on the board

- **BH-602** (satisfies FR-602): Cancelling asks first
  - **Given** the cancel action on a card
  - **When** the user declines the confirmation
  - **Then** the card is unchanged and still in its column

- **BH-603** (satisfies FR-603, FR-628): The reason is kept and shown
  - **Given** a cancellation with a short reason supplied
  - **When** the cancelled card is later viewed
  - **Then** that reason is shown

- **BH-604** (satisfies FR-605): A cancelled card is kept
  - **Given** a cancelled card
  - **When** retained work is read
  - **Then** the card is present rather than deleted

- **BH-605** (satisfies FR-606, FR-639): Cancelling works without a mouse
  - **Given** a board driven by keyboard alone
  - **When** the user cancels a card
  - **Then** every step is reachable and the outcome is conveyed by more than
    colour

- **BH-606** (satisfies FR-607): The cancellation is recorded
  - **Given** a cancelled card
  - **When** its movement history is read
  - **Then** the cancellation appears, attributed to the user

- **BH-607** (satisfies FR-608): Cancelling is not deleting
  - **Given** one cancelled card and one deleted card
  - **When** retained work is read
  - **Then** the cancelled card is present and the deleted card is not

- **BH-608** (satisfies FR-609): A frozen card cannot be cancelled
  - **Given** a card frozen by an unresolved conflict
  - **When** the user attempts to cancel it
  - **Then** the attempt is refused and the conflict is named as the reason

- **BH-609** (satisfies FR-610, FR-626): Cancelling twice withdraws once
  - **Given** a cancelled pointed card
  - **When** it is cancelled again
  - **Then** nothing further changes and exactly one withdrawal is reported

- **BH-610** (satisfies FR-611): The issue is transitioned
  - **Given** a configured cancellation status and an imported card
  - **When** the user cancels it
  - **Then** the issue moves to that status

- **BH-611** (satisfies FR-612): Only status is ever written
  - **Given** any sequence of cancellations
  - **When** the requests issued to the tracker are inspected
  - **Then** none modifies a field other than issue status

- **BH-612** (satisfies FR-613): No configured status still cancels locally
  - **Given** no cancellation status configured
  - **When** the user cancels an imported card
  - **Then** the card is cancelled and the user is told nothing was sent

- **BH-613** (satisfies FR-614): A refused transition still cancels locally
  - **Given** a workflow that refuses the transition
  - **When** the user cancels
  - **Then** the card is cancelled and the refusal is reported with its cause

- **BH-614** (satisfies FR-615): An unreachable tracker still cancels locally
  - **Given** an unreachable tracker
  - **When** the user cancels an imported card
  - **Then** the card is cancelled and the failure is reported

- **BH-615** (satisfies FR-616): A local card contacts nothing
  - **Given** a card the user created themselves
  - **When** they cancel it
  - **Then** no request is issued to the tracker

- **BH-634** (satisfies FR-640): A toggled-off integration still cancels locally
  - **Given** Jira integration turned off
  - **When** the user cancels an imported card
  - **Then** the card is cancelled and the user is told nothing was sent, and no
    request is issued to Jira

- **BH-616** (satisfies FR-617, FR-618): Points report as withdrawn scope
  - **Given** a pointed card committed to the running iteration
  - **When** it is cancelled
  - **Then** its points are reported as scope withdrawn, dated that day

- **BH-617** (satisfies FR-619): The outstanding total falls
  - **Given** a cancelled pointed card
  - **When** the burndown is read
  - **Then** the outstanding total no longer includes those points

- **BH-618** (satisfies FR-620): Cancelled is not completed
  - **Given** a cancelled card
  - **When** completed work is read
  - **Then** the card is absent

- **BH-619** (satisfies FR-621): Commitment does not move
  - **Given** an iteration with a recorded commitment
  - **When** a committed card is cancelled
  - **Then** the commitment is unchanged

- **BH-620** (satisfies FR-622): Withdrawn and added scope stay apart
  - **Given** an iteration with both a cancellation and a mid-iteration addition
  - **When** the report is read
  - **Then** withdrawn and added scope are reported separately

- **BH-621** (satisfies FR-623): An unestimated cancellation withdraws nothing
  - **Given** a cancelled card carrying no estimate
  - **When** points figures are read
  - **Then** it contributes no points and is counted among those excluded

- **BH-622** (satisfies FR-624): The hours still happened
  - **Given** a card with time accrued against it
  - **When** it is cancelled and the time report is read
  - **Then** that time is still reported

- **BH-623** (satisfies FR-625): Uncommitted work withdraws nothing
  - **Given** a pointed card never committed to any iteration
  - **When** it is cancelled and the report is read
  - **Then** no withdrawal is reported

- **BH-624** (satisfies FR-627): Cancelled is distinguishable from finished
  - **Given** cancelled and completed cards retained together
  - **When** the user browses them
  - **Then** the cancelled ones are identifiable without opening them

- **BH-625** (satisfies FR-629, FR-630): A cancelled card comes back
  - **Given** a cancelled card
  - **When** the user restores it
  - **Then** it returns to the column it occupied when cancelled

- **BH-626** (satisfies FR-630): A retired column is not a destination
  - **Given** a cancelled card whose column no longer accepts cards
  - **When** it is restored
  - **Then** it returns to the entry column rather than failing

- **BH-627** (satisfies FR-631): Restoring puts the scope back
  - **Given** a restored card that had been withdrawn
  - **When** the iteration report is read
  - **Then** the withdrawal is reversed

- **BH-628** (satisfies FR-632, FR-633): Restoring writes nothing and shows the gap
  - **Given** a restored imported card whose issue is still cancelled
  - **When** the requests issued are inspected and the card is displayed
  - **Then** nothing was written and the disagreement is visible

- **BH-629** (satisfies FR-634): The status is chosen, not typed
  - **Given** the settings
  - **When** the user sets the cancellation status
  - **Then** they choose from statuses the tracker reports

- **BH-630** (satisfies FR-635): No status configured is a supported state
  - **Given** no cancellation status configured
  - **When** the board runs
  - **Then** it operates normally and reports no error

- **BH-631** (satisfies FR-636): The choice survives a restart
  - **Given** a chosen cancellation status
  - **When** the application restarts
  - **Then** the choice is still in force

- **BH-632** (satisfies FR-637): Settings hold no credential
  - **Given** the settings this feature introduces
  - **When** they are read
  - **Then** none names a token, a password or a secret

- **BH-633** (satisfies FR-638): Cancelling never blocks the board
  - **Given** a slow or failing tracker
  - **When** the user cancels a card
  - **Then** the board stays interactive and the card leaves within its budget

## Verification *(mandatory at FULL tier)*

| ID | Test name | Pins |
|---|---|---|
| TEST-601 | A card is cancelled from any column | BH-601 |
| TEST-602 | Declining the confirmation changes nothing | BH-602 |
| TEST-603 | The cancellation reason is kept and shown | BH-603 |
| TEST-604 | A cancelled card is retained, not deleted | BH-604 |
| TEST-605 | Cancelling is completable by keyboard alone | BH-605 |
| TEST-606 | The cancellation is recorded and attributed | BH-606 |
| TEST-607 | Cancelling is distinct from deleting | BH-607 |
| TEST-608 | A conflicted card refuses cancellation | BH-608 |
| TEST-609 | Cancelling twice reports one withdrawal | BH-609 |
| TEST-610 | The issue moves to the configured status | BH-610 |
| TEST-611 | No Jira write touches a field other than status | BH-611 |
| TEST-612 | No configured status still cancels locally | BH-612 |
| TEST-613 | A refused transition still cancels locally | BH-613 |
| TEST-614 | An unreachable tracker still cancels locally | BH-614 |
| TEST-615 | Cancelling a local card contacts nothing | BH-615 |
| TEST-634 | A toggled-off integration still cancels locally, contacting nothing | BH-634 |
| TEST-616 | Points report as withdrawn scope, dated | BH-616 |
| TEST-617 | Withdrawn points leave the outstanding total | BH-617 |
| TEST-618 | A cancelled card is absent from completed work | BH-618 |
| TEST-619 | Commitment is unchanged by a cancellation | BH-619 |
| TEST-620 | Withdrawn and added scope report separately | BH-620 |
| TEST-621 | An unestimated cancellation withdraws nothing | BH-621 |
| TEST-622 | Time accrued survives cancellation | BH-622 |
| TEST-623 | Uncommitted work withdraws nothing | BH-623 |
| TEST-624 | Cancelled is distinguishable from finished | BH-624 |
| TEST-625 | A cancelled card restores to its old column | BH-625 |
| TEST-626 | A retired column is not a restore destination | BH-626 |
| TEST-627 | Restoring reverses the withdrawal | BH-627 |
| TEST-628 | Restoring writes nothing and shows the gap | BH-628 |
| TEST-629 | The cancellation status is chosen, not typed | BH-629 |
| TEST-630 | No configured status is a supported state | BH-630 |
| TEST-631 | The chosen status survives a restart | BH-631 |
| TEST-632 | Settings name no credential | BH-632 |
| TEST-633 | Cancelling never blocks the board | BH-633 |

## Out of Scope

- Any change to the six-column set, and any new column.
- A cancelled indicator on the card face — a cancelled card is not on the board
  to carry one.
- Any change to how deletion works. Soft deletion stays exactly as it is.
- Cancelling more than one card at a time.
- Writing any Jira field other than issue status.
- Reopening a cancelled issue in Jira on restore.
- Cancelling work that has already reached Done.
