Feature: Assigned Jira work appears on the board
  A meaningful share of the user's work does live in Jira. It should arrive on
  the board without retyping, and arriving twice is as bad as not arriving.

  Scenario: Matching issues become Backlog cards
    Given the application is running
    And Jira has the issues "AIHUB-1, AIHUB-2, AIHUB-3"
    When a sync runs
    Then the "backlog" column holds 3 cards
    And the board has a card for issue "AIHUB-1"

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
