Feature: Capturing ad-hoc work
  Work that never gets a Jira ticket still takes real hours. Capturing it has
  to be fast enough to do mid-conversation, and complete enough to be worth
  looking at afterwards.

  Scenario: A card is created into Backlog
    Given the application is running
    When a card titled "Rotate staging certificates" is created
    Then the card appears in the "backlog" column
    And the card is at the top of that column

  Scenario: A blank title is rejected
    Given the application is running
    When a card is created with the title "   "
    Then the request is refused with code "TITLE_REQUIRED"
    And the board has no cards

  Scenario: Priority defaults to Medium
    Given the application is running
    When a card titled "Unprioritised work" is created
    Then the card has priority "medium"

  Scenario: An explicit priority is kept
    Given the application is running
    When a card titled "Urgent thing" is created with priority "high"
    Then the card has priority "high"

  Scenario: Tags are trimmed and deduplicated
    Given the application is running
    When a card titled "Tagged work" is created with tags "Ops, ops , security"
    Then the card carries exactly the tags "ops, security"

  Scenario: A card carries everything the face must show
    Given the application is running
    When a card titled "Full card" is created with priority "high", due date "2026-12-01" and tags "ops, security"
    Then the card has priority "high"
    And the card has due date "2026-12-01"
    And the card carries exactly the tags "ops, security"
    And the card has source "local"

  Scenario: Duplicate titles are allowed
    Given the application is running
    When a card titled "Follow up with Ops" is created
    And a card titled "Follow up with Ops" is created
    Then the board has 2 cards
