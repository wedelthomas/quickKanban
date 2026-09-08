Feature: Work that leaves the query does not vanish
  An issue gets closed, or reassigned to someone else, and stops matching the
  query. Silent disappearance is indistinguishable from a bug, and it destroys
  the movement history slice 4 depends on.

  Scenario: An issue leaving the query is archived, not deleted
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When issue "AIHUB-1" leaves the query
    And a sync runs
    Then the card for issue "AIHUB-1" is not on the board
    And the card for issue "AIHUB-1" is archived
    And the card for issue "AIHUB-1" records why it left

  Scenario: The archival is attributed to sync, not to the user
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When issue "AIHUB-1" leaves the query
    And a sync runs
    Then the last movement for issue "AIHUB-1" was caused by sync

  Scenario: A returning issue restores its own card rather than a duplicate
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And issue "AIHUB-1" leaves the query
    And a sync runs
    When issue "AIHUB-1" matches the query again
    And a sync runs
    Then the board has a card for issue "AIHUB-1"
    And exactly 1 card exists for issue "AIHUB-1"

  Scenario: Ad-hoc cards are never archived by a sync
    Given the application is running
    And a card titled "Mine alone" is created
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When issue "AIHUB-1" leaves the query
    And a sync runs
    Then the ad-hoc card "Mine alone" is in the "backlog" column
