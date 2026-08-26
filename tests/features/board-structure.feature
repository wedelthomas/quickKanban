Feature: The board has six fixed columns
  The columns are the user's workflow, decided once. Nothing in the interface
  offers to change them, because a configurable board would make the Jira
  status mapping in slice 3 dynamic for no present benefit.

  Scenario: Board presents six fixed columns in order
    Given the application is running
    When the board is requested
    Then the board has exactly 6 columns
    And the columns are in the order "backlog, in_progress, blocked, test, po_review, done"
    And every column is present even when it holds no cards
