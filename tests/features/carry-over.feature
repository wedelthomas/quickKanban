Feature: Chronic carry-over is visible
  Work that slips from iteration to iteration is the thing most worth noticing
  and least worth having to go looking for. So the count sits on the card face,
  where it will be seen, rather than in a report that gets opened occasionally.

  The count measures one continuous stretch of being committed but unfinished.
  A lifetime tally of every boundary a card ever crossed would only grow; this
  says "this has slipped three times running", which is a prompt to act.

  Background:
    Given the application is running

  Scenario: A card committed and unfinished counts one boundary
    Given a card titled "Rewrite the runbook" is created
    And the card "Rewrite the runbook" is moved to "In Progress"
    And the iteration source reports both teams' sprints for "2026 S17"
    And the iteration is read
    When the iteration source reports both teams' sprints for "2026 S18"
    And the iteration is read
    Then the card "Rewrite the runbook" has carried through 1 iteration

  Scenario: Two boundaries count twice
    Given a card titled "Rewrite the runbook" is created
    And the card "Rewrite the runbook" is moved to "In Progress"
    And the iteration source reports both teams' sprints for "2026 S16"
    And the iteration is read
    And the iteration source reports both teams' sprints for "2026 S17"
    And the iteration is read
    When the iteration source reports both teams' sprints for "2026 S18"
    And the iteration is read
    Then the card "Rewrite the runbook" has carried through 2 iterations

  Scenario: Reading the same iteration twice counts nothing
    # Resolution runs on every board load. Each one must not be mistaken for a
    # fortnight passing.
    Given a card titled "Rewrite the runbook" is created
    And the card "Rewrite the runbook" is moved to "In Progress"
    And the iteration source reports both teams' sprints for "2026 S17"
    And the iteration is read
    When the iteration is read
    Then the card "Rewrite the runbook" has carried through 0 iterations

  Scenario: Finishing the work clears the count
    Given a card titled "Rewrite the runbook" is created
    And the card "Rewrite the runbook" is moved to "In Progress"
    And the iteration source reports both teams' sprints for "2026 S17"
    And the iteration is read
    And the iteration source reports both teams' sprints for "2026 S18"
    And the iteration is read
    When the card "Rewrite the runbook" is moved to "Done"
    And the iteration source reports both teams' sprints for "2026 S19"
    And the iteration is read
    Then the card "Rewrite the runbook" has carried through 0 iterations

  Scenario: Withdrawing the commitment clears the count
    Given a card titled "Rewrite the runbook" is created
    And the card "Rewrite the runbook" is moved to "In Progress"
    And the iteration source reports both teams' sprints for "2026 S17"
    And the iteration is read
    And the iteration source reports both teams' sprints for "2026 S18"
    And the iteration is read
    When the card "Rewrite the runbook" is moved to "Backlog"
    And the iteration is read
    Then the card "Rewrite the runbook" has carried through 0 iterations

  Scenario: Unfinished cards survive the boundary in place
    Given a card titled "Still going" is created
    And the card "Still going" is moved to "Test"
    And the iteration source reports both teams' sprints for "2026 S17"
    And the iteration is read
    When the iteration source reports both teams' sprints for "2026 S18"
    And the iteration is read
    Then the card "Still going" is in "Test"
