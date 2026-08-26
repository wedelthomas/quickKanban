Feature: A refused move fails loudly and safely
  Against real workflows most moves have no legal transition, so refusal is
  ordinary operation. What matters is that the card never stays moved while
  Jira disagrees, and that the user is told which of four things happened.

  Scenario: No legal transition
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And issue "AIHUB-1" offers only the transition "Cancel" leading to "Cancelled"
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "test" column
    Then the request is refused with code "NO_LEGAL_TRANSITION"
    And the card for issue "AIHUB-1" is in the "backlog" column
    And no transition was performed in Jira
    And the card for issue "AIHUB-1" has no history records

  Scenario: The mapped status does not exist in this workflow
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And issue "AIHUB-1" offers no transitions at all
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "test" column
    Then the request is refused with code "STALE_MAPPING"
    And the card for issue "AIHUB-1" is in the "backlog" column

  Scenario: The transition wants fields the board does not hold
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And issue "AIHUB-1" offers the transition "To Test" leading to "Test" requiring fields
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "test" column
    Then the request is refused with code "TRANSITION_NEEDS_FIELDS"
    And the card for issue "AIHUB-1" is in the "backlog" column

  Scenario: Jira cannot be reached
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And Jira is unreachable
    When the card for issue "AIHUB-1" is moved to the "test" column
    Then the request is refused with code "DATABASE_UNAVAILABLE"
    And the card for issue "AIHUB-1" is in the "backlog" column
