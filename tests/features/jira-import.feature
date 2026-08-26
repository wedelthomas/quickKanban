Feature: Assigned Jira work appears on the board
  A meaningful share of the user's work does live in Jira. It should arrive on
  the board without retyping, and arriving twice is as bad as not arriving.

  Scenario: Issues are placed in the column their status maps to
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And Jira also has an issue "AIHUB-2" with status "Development"
    And Jira also has an issue "AIHUB-3" with status "Test"
    When a sync runs
    Then the card for issue "AIHUB-1" is in the "backlog" column
    And the card for issue "AIHUB-2" is in the "in_progress" column
    And the card for issue "AIHUB-3" is in the "test" column

  Scenario: An unrecognised status falls back to Backlog
    Given the application is running
    And Jira has an issue "AIHUB-9" with status "Awaiting Interstellar Approval"
    When a sync runs
    Then the card for issue "AIHUB-9" is in the "backlog" column

  Scenario: A second sync creates no duplicate
    Given the application is running
    And Jira has the issues "AIHUB-1"
    When a sync runs
    And 20 further syncs run
    Then the board has 1 card

  Scenario: A changed summary updates the card title
    Given the application is running
    And Jira has the issues "AIHUB-1"
    And a sync runs
    When issue "AIHUB-1" is retitled "Now called something else"
    And a sync runs
    Then the card for issue "AIHUB-1" has title "Now called something else"

  Scenario: An empty result is a successful sync
    Given the application is running
    And Jira has no issues
    When a sync runs
    Then the sync succeeded
    And the board has no cards

  Scenario: The configured query is the one sent to Jira
    Given the application is running
    And Jira has no issues
    When a sync runs
    Then Jira was asked the default query
