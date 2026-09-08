Feature: Correcting and removing cards
  Titles get mistyped, dates turn out to be different, and requests evaporate.
  Deletion is soft: an ad-hoc card exists nowhere else, so a mis-click must not
  be the end of it, and the movement history needs a card to point at.

  Scenario: Every editable attribute persists
    Given the application is running
    And a card titled "Original title" is created
    When the card is edited to title "Corrected title", description "Now with detail", priority "high", due date "2026-12-01" and tags "ops, security"
    Then the card has title "Corrected title"
    And the card has description "Now with detail"
    And the card has priority "high"
    And the card has due date "2026-12-01"
    And the card carries exactly the tags "ops, security"

  Scenario: Removing every tag is valid
    Given the application is running
    And a card titled "Tagged" is created with tags "ops, security"
    When the card's tags are cleared
    Then the card carries no tags

  Scenario: Clearing the title is refused and the previous title stands
    Given the application is running
    And a card titled "Keep me" is created
    When the card is edited to title "   "
    Then the request is refused with code "TITLE_REQUIRED"
    And the stored card still has title "Keep me"

  Scenario: An edit that changes nothing at all is refused
    Given the application is running
    And a card titled "Untouched" is created
    When the card is edited with no fields
    Then the request is refused with code "VALIDATION_FAILED"

  Scenario: A deleted card leaves the board but its record is retained
    Given the application is running
    And a card titled "Delete me" is created
    When the card is deleted
    Then the board has no cards
    And the card's record is still in storage

  Scenario: Deleting an unknown card is refused
    Given the application is running
    When an unknown card is deleted
    Then the request is refused with code "CARD_NOT_FOUND"

  Scenario: A Jira-sourced card cannot be deleted
    Given the application is running
    And a Jira-sourced card titled "JIRA-1 Something upstream" exists in storage
    When that Jira-sourced card is deleted
    Then the request is refused with code "DELETE_FORBIDDEN_NON_LOCAL"
    And the stored card still has title "JIRA-1 Something upstream"

  Scenario: A deleted card's position is freed for the cards behind it
    Given the application is running
    And cards titled "A, B, C" are created in the "backlog" column
    When card "B" is deleted
    Then the "backlog" column holds the cards "A, C"
    And the "backlog" column positions are contiguous from one
