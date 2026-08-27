Feature: Finished work leaves the board without being lost
  Done grows without bound otherwise, and a board nobody opens is worse than no
  board. Nothing here deletes anything.

  Background:
    Given the application is running

  Scenario: Only a card past the window is taken
    Given a card titled "Long finished" arrived in Done 10 days ago
    And a card titled "Just finished" arrived in Done 2 days ago
    When archival runs
    Then the card titled "Long finished" is archived
    And the card titled "Just finished" is on the board
    And the run archived 1 card

  Scenario: The window is measured from the most recent arrival in Done
    # Reached Done weeks ago, was dragged out, and came back yesterday. It is
    # one day old, not thirty.
    Given a card titled "Reopened" arrived in Done 30 days ago
    And the card titled "Reopened" left Done and returned 1 day ago
    When archival runs
    Then the card titled "Reopened" is on the board

  Scenario: A card created directly in Done is measured from its creation
    Given a card titled "Straight to Done" was created in Done 10 days ago
    When archival runs
    Then the card titled "Straight to Done" is archived

  Scenario: Changing the window changes what leaves
    Given a card titled "Five days old" arrived in Done 5 days ago
    When archival runs
    Then the card titled "Five days old" is on the board
    When the archive window is set to 3 days
    And archival runs
    Then the card titled "Five days old" is archived

  Scenario: A conflicted card is never archived, however old
    Given Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And the card for issue "AIHUB-1" arrived in Done 90 days ago
    And the card for issue "AIHUB-1" has an unresolved conflict
    When archival runs
    Then the card for issue "AIHUB-1" is on the board
    And the run archived 0 cards
    And the run skipped 1 conflicted card

  Scenario: An archived card is retained, not deleted
    Given a card titled "Long finished" arrived in Done 10 days ago
    When archival runs
    Then the card titled "Long finished" is archived
    And the card titled "Long finished" still exists in storage

  Scenario: Archival is recorded with the system as the actor
    Given a card titled "Long finished" arrived in Done 10 days ago
    When archival runs
    Then the last history record for "Long finished" is an archival by the system

  Scenario: Running twice archives nothing twice
    Given a card titled "Long finished" arrived in Done 10 days ago
    When archival runs
    And archival runs
    Then the run archived 0 cards
