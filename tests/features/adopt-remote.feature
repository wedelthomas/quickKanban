Feature: Changes made in Jira reach my board
  Sync that only pushes is not sync. If the board can drift from Jira in one
  direction the user must re-check Jira, which defeats the point.

  Scenario: A remote-only change moves the card
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When issue "AIHUB-1" changes status to "Development"
    And a sync runs
    Then the card for issue "AIHUB-1" is in the "in_progress" column

  Scenario: The movement is attributed to sync, not to the user
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When issue "AIHUB-1" changes status to "Development"
    And a sync runs
    Then the last movement for issue "AIHUB-1" was caused by sync

  Scenario: Neither side changed, so nothing happens
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When a sync runs
    Then the card for issue "AIHUB-1" is in the "backlog" column
    And no transition was performed in Jira
