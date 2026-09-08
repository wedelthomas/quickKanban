Feature: The board keeps itself current
  A board that imports once is a snapshot. Currency is what lets the user trust
  it without thinking about it — and what stops fifty impatient refreshes from
  becoming fifty sequential syncs.

  Scenario: A refresh syncs immediately
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    When a sync runs
    Then the board has a card for issue "AIHUB-1"

  Scenario: Fifty overlapping refreshes produce one sync
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    When 50 refreshes are requested at once
    Then Jira was queried fewer than 50 times
    And the board has a card for issue "AIHUB-1"

  Scenario: The configured interval is what settings say
    Given the application is running
    When the settings are read
    Then the sync interval is 300 seconds

  Scenario: The interval can be changed
    Given the application is running
    When the sync interval is set to 60 seconds
    Then the sync interval is 60 seconds

  Scenario: An absurd interval is refused
    Given the application is running
    When the sync interval is set to 5 seconds
    Then the request is refused with code "VALIDATION_FAILED"

  Scenario: The query can be changed and is the one sent to Jira
    Given the application is running
    And Jira has no issues
    When the query is set to "assignee = currentUser() AND project = AIHUB"
    And a sync runs
    Then Jira was asked "assignee = currentUser() AND project = AIHUB"
