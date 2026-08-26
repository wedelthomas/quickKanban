Feature: A Jira card is unmistakable, and resists local change
  Two kinds of card now share the board and the rules governing them differ.
  One is authoritative elsewhere; the other exists only here. The user must
  never have to guess which is which.

  Scenario: An imported card carries its issue key and a link
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    Then the card for issue "AIHUB-1" has source "jira"
    And the card for issue "AIHUB-1" links to Jira

  Scenario: An ad-hoc card carries no issue key
    Given the application is running
    And a card titled "Mine alone" is created
    Then the card has source "local"
    And the card has no issue key

  Scenario: An imported card cannot be deleted
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When the card for issue "AIHUB-1" is deleted
    Then the request is refused with code "DELETE_FORBIDDEN_NON_LOCAL"
    And the board has a card for issue "AIHUB-1"

  Scenario: An imported card's title cannot be edited locally
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When the card for issue "AIHUB-1" is retitled locally to "My own words"
    Then the request is refused with code "EDIT_FORBIDDEN_JIRA_OWNED"
    And the card for issue "AIHUB-1" has title "Summary for AIHUB-1"

  Scenario: An imported card's own fields can still be edited
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When the card for issue "AIHUB-1" is given priority "high" and tags "ops"
    Then the request succeeded
    And the card for issue "AIHUB-1" has priority "high"
