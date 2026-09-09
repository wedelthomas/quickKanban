Feature: Cancelling work that is not going to happen
  A third ending, alongside finishing it and deleting it. Cancelling takes a
  card off the board immediately, keeps it, and records why.

  Background:
    Given the application is running

  Scenario: A card is cancelled from any column
    Given a card titled "Descoped feature" is created
    And the card is moved to the "in_progress" column at position 1
    When the card is cancelled with reason "No longer needed"
    Then the board has no cards

  Scenario: Declining the confirmation changes nothing
    Given a card titled "Reconsidering" is created
    When cancelling the card is attempted with an empty reason
    Then the request is refused with code "VALIDATION_FAILED"
    And the board has 1 card

  Scenario: The reason is kept and shown
    Given a card titled "Explained departure" is created
    When the card is cancelled with reason "Replaced by a better approach"
    Then the cancelled card's reason is "Replaced by a better approach"

  Scenario: A cancelled card is retained, not deleted
    Given a card titled "Retained" is created
    When the card is cancelled with reason "test"
    Then the cancelled card is retrievable

  Scenario: The cancellation is recorded and attributed
    Given a card titled "Recorded" is created
    When the card is cancelled with reason "test"
    Then the card has 1 history record
    And the last record was attributed to the user

  Scenario: Cancelling is distinct from deleting
    Given a card titled "Cancelled one" is created
    And a card titled "Deleted one" is created
    When the card titled "Cancelled one" is cancelled with reason "test"
    And the card titled "Deleted one" is deleted
    Then the cancelled card titled "Cancelled one" is retrievable
    And the card titled "Deleted one" is not retrievable

  Scenario: A conflicted card refuses cancellation
    Given Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And the card for issue "AIHUB-1" is moved to the "test" column
    And issue "AIHUB-1" changes status to "Development"
    And a sync runs
    When the card for issue "AIHUB-1" is cancelled with reason "test"
    Then the request is refused with code "CARD_CONFLICTED"

  Scenario: Cancelling an already-cancelled card has no further effect
    Given a card titled "Cancel twice" is created
    When the card is cancelled with reason "first"
    And the card is cancelled again with reason "second"
    Then the card has 1 history record
    And the cancelled card's reason is "first"
