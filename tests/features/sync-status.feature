Feature: Knowing whether sync is working
  A silently broken sync is worse than no sync, because the user keeps trusting
  a board that stopped updating. Failure has to be visible, and it must not
  take the board down with it.

  Scenario: A successful sync records when it succeeded
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    When a sync runs
    Then the sync status reports a last success

  Scenario: A failure keeps the previous success visible
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When Jira is unreachable
    And a sync runs
    Then the sync status reports the last run as "failed"
    And the sync status still reports a last success

  Scenario: A later success clears the failure
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And Jira is unreachable
    And a sync runs
    When Jira is reachable again
    And a sync runs
    Then the sync status reports the last run as "succeeded"

  Scenario: Rejected credentials read differently from lost connectivity
    Given the application is running
    And Jira rejects the credentials
    When a sync runs
    Then the sync failure kind is "credentials"

  Scenario: Lost connectivity reads as connectivity
    Given the application is running
    And Jira is unreachable
    When a sync runs
    Then the sync failure kind is "connectivity"

  Scenario: A failed sync changes nothing and blocks nothing
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And a card titled "Still working" is created
    When Jira is unreachable
    And a sync runs
    Then the board has a card for issue "AIHUB-1"
    And the ad-hoc card "Still working" is in the "backlog" column
    And a card titled "Created during an outage" is created
    And the ad-hoc card "Created during an outage" is in the "backlog" column

  Scenario: With no Jira configured the board still works
    Given the application is running without Jira configured
    Then the sync status reports Jira as not configured
    And a card titled "Works without Jira" is created
    And the ad-hoc card "Works without Jira" is in the "backlog" column

  Scenario: Requesting a sync without Jira is refused clearly
    Given the application is running without Jira configured
    When a sync runs
    Then the request is refused with code "JIRA_NOT_CONFIGURED"
