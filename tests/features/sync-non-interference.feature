Feature: Sync disturbs nothing it does not own
  The board is the user's own arrangement in this slice. Sync records what Jira
  said and acts on none of it, and it must never touch a card Jira does not own.

  Scenario: Sync leaves a card where the user put it
    Given the application is running
    And Jira has the issues "AIHUB-1"
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "test" column
    And issue "AIHUB-1" changes status to "In Progress"
    And a sync runs
    Then the card for issue "AIHUB-1" is in the "test" column

  Scenario: Twenty syncs leave ad-hoc cards untouched
    Given the application is running
    And cards titled "A, B, C" are created in the "backlog" column
    And card "B" is moved to the "test" column at position 1
    And Jira has the issues "AIHUB-1"
    When 20 further syncs run
    Then the ad-hoc card "A" is in the "backlog" column
    And the ad-hoc card "C" is in the "backlog" column
    And the ad-hoc card "B" is in the "test" column

  Scenario: Nothing is written to Jira
    Given the application is running
    And Jira has the issues "AIHUB-1"
    When a sync runs
    Then no write request was issued to Jira
