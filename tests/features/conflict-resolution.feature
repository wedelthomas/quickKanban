Feature: Resolving a conflict by choosing a side
  A conflict the user cannot clear is a permanently broken card. Detection
  without resolution makes the board worse than before it noticed.

  Background:
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And the card for issue "AIHUB-1" is moved to the "test" column
    And issue "AIHUB-1"'s last recorded status is "Open"
    And issue "AIHUB-1" changes status to "Development"
    And a sync runs
    And the record of Jira writes so far is set aside

  Scenario: The conflict shows both sides
    When the open conflicts are listed
    Then the conflict names the board column "Test"
    And the conflict shows Jira as "Development"

  Scenario: Keeping the board state transitions Jira and clears the conflict
    When the conflict is resolved by keeping the board state
    Then issue "AIHUB-1" has status "Test" in Jira
    And exactly 0 open conflicts exist
    And the card for issue "AIHUB-1" is in the "test" column

  Scenario: Accepting the Jira state moves the card and clears the conflict
    When the conflict is resolved by accepting the Jira state
    Then the card for issue "AIHUB-1" is in the "in_progress" column
    And exactly 0 open conflicts exist
    And no transition was performed in Jira

  Scenario: The resolution is recorded with the side chosen
    When the conflict is resolved by accepting the Jira state
    Then the conflict was resolved as "accepted_jira"
    And the last movement for issue "AIHUB-1" was caused by sync

  Scenario: A refused transition leaves the conflict standing
    Given issue "AIHUB-1" offers only the transition "Cancel" leading to "Cancelled"
    When the conflict is resolved by keeping the board state
    Then the request is refused with code "NO_LEGAL_TRANSITION"
    And exactly 1 open conflict exists

  Scenario: A resolved card can be dragged again
    Given the conflict is resolved by accepting the Jira state
    When the card for issue "AIHUB-1" is moved to the "test" column
    Then the request succeeded
