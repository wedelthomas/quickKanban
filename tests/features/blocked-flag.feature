Feature: Blocked is a state my card carries, not a place it goes
  A blocked card is still in test, or still in development. Moving it to a
  Blocked column threw that away and spent a sixth of the board's width doing
  it. TradeStation's own Jira models blocked as a field set on issues whose
  status is Development, Test or Open — orthogonal to status, exactly as here.

  Background:
    Given the application is running
    And a card titled "Waiting on the security review" is created
    And a card titled "Nothing is stopping this one" is created

  Scenario: A card can be marked blocked wherever it actually is
    When the card "Waiting on the security review" is moved to "Test"
    And the card "Waiting on the security review" is marked blocked
    Then the card "Waiting on the security review" is blocked
    And the card "Waiting on the security review" is in "Test"

  Scenario: Blocked annotates, it does not freeze
    # Unlike an unresolved conflict, which does freeze a card (FR-228). A
    # blocked card the user cannot move would trap work in the column it got
    # stuck in, which is the opposite of the point.
    Given the card "Waiting on the security review" is marked blocked
    When the card "Waiting on the security review" is moved to "PO Review"
    Then the card "Waiting on the security review" is in "PO Review"
    And the card "Waiting on the security review" is blocked

  Scenario: Clearing the flag leaves the card where it is
    Given the card "Waiting on the security review" is marked blocked
    And the card "Waiting on the security review" is moved to "In Progress"
    When the card "Waiting on the security review" is marked not blocked
    Then the card "Waiting on the security review" is not blocked
    And the card "Waiting on the security review" is in "In Progress"

  Scenario: The summary groups by the flag, not by a column
    # The Blocked column no longer holds anything, so a summary that grouped by
    # it would report an empty list forever (FR-415).
    Given the card "Waiting on the security review" is moved to "Test"
    And the card "Waiting on the security review" is marked blocked
    When a "daily" summary is generated
    Then the summary's blocked group contains "Waiting on the security review"
    And the summary's in-progress group does not contain "Waiting on the security review"

  Scenario: A blocked card is reported once, not in two groups
    # Blocked and in-progress were mutually exclusive by construction until the
    # restructure. A card in both would be read out twice at standup.
    Given the card "Waiting on the security review" is moved to "In Progress"
    And the card "Waiting on the security review" is marked blocked
    When a "daily" summary is generated
    Then the summary's blocked group contains "Waiting on the security review"
    And the summary's in-progress group does not contain "Waiting on the security review"

  Scenario: The retired column cannot be reached
    # The migration empties it; this stops anything refilling it. Verified
    # against the running board before the guard existed, where the move
    # answered 200 and the card vanished from the board entirely (FR-402).
    When the card "Nothing is stopping this one" is moved to the retired Blocked column
    Then the move is refused because the column was retired
    And the card "Nothing is stopping this one" is still on the board
