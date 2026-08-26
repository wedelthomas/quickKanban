Feature: Disagreements are surfaced, never guessed
  Silent resolution either discards a decision the user made or clobbers a
  teammate's. Both are unrecoverable in the way that matters: nobody learns it
  happened.

  Conflicts are rarer than they might sound, because moving a card transitions
  Jira immediately — the two are normally kept in step. Divergence accumulates
  only when a push failed and the board is left ahead of Jira, which is the
  state each scenario below sets up.

  Background:
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And the card for issue "AIHUB-1" is moved to the "test" column
    And issue "AIHUB-1"'s last recorded status is "Open"

  Scenario: Divergent changes raise a conflict without moving or writing
    When issue "AIHUB-1" changes status to "Development"
    And a sync runs
    Then the card for issue "AIHUB-1" is in conflict
    And the card for issue "AIHUB-1" is in the "test" column

  Scenario: Convergent changes raise nothing
    When issue "AIHUB-1" changes status to "Test"
    And a sync runs
    Then the card for issue "AIHUB-1" is not in conflict

  Scenario: Later syncs leave a conflicted card alone
    Given issue "AIHUB-1" changes status to "Development"
    And a sync runs
    When 20 further syncs run
    Then the card for issue "AIHUB-1" is in the "test" column
    And the card for issue "AIHUB-1" is in conflict

  Scenario: A second remote change updates the conflict rather than duplicating it
    Given issue "AIHUB-1" changes status to "Development"
    And a sync runs
    When issue "AIHUB-1" changes status to "PO Approve"
    And a sync runs
    Then exactly 1 open conflict exists
    And the conflict shows Jira as "PO Approve"

  Scenario: A conflicted card cannot be dragged
    Given issue "AIHUB-1" changes status to "Development"
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "po_review" column
    Then the request is refused with code "CARD_CONFLICTED"

  Scenario: An issue leaving the query closes its conflict as moot
    Given issue "AIHUB-1" changes status to "Development"
    And a sync runs
    When issue "AIHUB-1" leaves the query
    And a sync runs
    Then exactly 0 open conflicts exist
