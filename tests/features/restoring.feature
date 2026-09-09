Feature: Finding a cancelled story, and undoing it
  Cancelling is a decision, and decisions get revisited. The user needs to
  see what was cancelled and why, and to put one back if they were wrong.

  Background:
    Given the application is running

  Scenario: Cancelled and completed cards are distinguishable without opening them
    Given a card titled "Finished normally" arrived in Done 10 days ago
    And a card titled "Called off" is created
    And archival runs
    When the card titled "Called off" is cancelled with reason "No longer needed"
    Then the archive shows "Finished normally" as not cancelled
    And the archive shows "Called off" as cancelled with reason "No longer needed"

  Scenario: A cancelled card restores to its original column
    Given a card titled "Reinstated" is created
    And the card is moved to the "in_progress" column at position 1
    And the card is cancelled with reason "test"
    When the card is restored
    Then the card is in the "in_progress" column

  Scenario: A retired column is not a restore destination
    Given a card titled "From a retired column" is created
    And the card is cancelled with reason "test"
    And the card's cancelled-from column is set to the retired Blocked column
    When the card is restored
    Then the card is in the "backlog" column

  Scenario: Restoring writes nothing to Jira and shows the disagreement
    Given Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And a cancellation status of "Cancelled" is configured
    And issue "AIHUB-1" offers the transition "Cancel" leading to "Cancelled"
    And the card for issue "AIHUB-1" is cancelled with reason "test"
    And the record of Jira writes so far is set aside
    When the card for issue "AIHUB-1" is restored
    Then no transition was performed in Jira
    And the card for issue "AIHUB-1" diverges from Jira in its cancellation status
