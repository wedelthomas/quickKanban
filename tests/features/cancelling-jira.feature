Feature: The cancellation reaches Jira
  The user's team reads Jira, not this board. Whatever happens on the
  tracker's side, the local cancellation already succeeded — this feature
  is only about what else the user is told.

  Background:
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs

  Scenario: The issue moves to the configured status
    Given a cancellation status of "Cancelled" is configured
    And issue "AIHUB-1" offers the transition "Cancel" leading to "Cancelled"
    When the card for issue "AIHUB-1" is cancelled with reason "test"
    Then the card for issue "AIHUB-1" is cancelled locally
    And issue "AIHUB-1" was transitioned to "Cancelled"

  Scenario: No configured status still cancels locally
    Given no cancellation status is configured
    When the card for issue "AIHUB-1" is cancelled with reason "test"
    Then the card for issue "AIHUB-1" is cancelled locally
    And the response says nothing was sent to Jira
    And no transition was performed in Jira

  Scenario: A workflow that refuses the transition still cancels locally
    Given a cancellation status of "Cancelled" is configured
    And issue "AIHUB-1" offers no transitions at all
    When the card for issue "AIHUB-1" is cancelled with reason "test"
    Then the card for issue "AIHUB-1" is cancelled locally
    And the response reports the Jira refusal with its cause

  Scenario: An unreachable tracker still cancels locally
    Given a cancellation status of "Cancelled" is configured
    And Jira is unreachable
    When the card for issue "AIHUB-1" is cancelled with reason "test"
    Then the card for issue "AIHUB-1" is cancelled locally
    And the response reports the Jira failure

  Scenario: A local card contacts nothing
    Given a cancellation status of "Cancelled" is configured
    And a card titled "Mine alone" is created
    When the card titled "Mine alone" is cancelled with reason "test"
    Then no transition was performed in Jira

  Scenario: Jira integration turned off still cancels locally
    Given a cancellation status of "Cancelled" is configured
    And Jira integration is turned off
    When the card for issue "AIHUB-1" is cancelled with reason "test"
    Then the card for issue "AIHUB-1" is cancelled locally
    And the response says nothing was sent to Jira
    And no transition was performed in Jira
