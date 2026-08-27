Feature: Blockers my team recorded in Jira reach my board
  The blocker is already written down. Re-typing it is the kind of duplicate
  bookkeeping this product exists to remove.

  What is not negotiable is who decides. Jira's opinion arrives; the board's
  opinion wins. And the disagreement is shown rather than adjudicated: unlike a
  status conflict, being wrong here costs one click, so freezing the card over
  it would spend attention on something the user can fix by looking at it.

  Background:
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"

  Scenario: An issue Jira reports as blocked arrives blocked
    Given Jira reports issue "AIHUB-1" as blocked
    When a sync runs
    Then the card for issue "AIHUB-1" is blocked

  Scenario: An issue Jira reports as clear arrives clear
    Given Jira reports issue "AIHUB-1" as not blocked
    When a sync runs
    Then the card for issue "AIHUB-1" is not blocked

  Scenario: Clearing the flag locally survives every later sync
    # A sync that silently re-blocked the card would overrule the user's
    # decision every five minutes, which is worse than not importing at all.
    Given Jira reports issue "AIHUB-1" as blocked
    And a sync runs
    When the card for issue "AIHUB-1" is marked not blocked locally
    And a sync runs
    Then the card for issue "AIHUB-1" is not blocked
    And the card for issue "AIHUB-1" diverges from Jira

  Scenario: A diverging card still moves
    # Not a conflict. FR-419 is explicit that this must not freeze the card.
    Given Jira reports issue "AIHUB-1" as blocked
    And a sync runs
    And the card for issue "AIHUB-1" is marked not blocked locally
    When the card for issue "AIHUB-1" is moved to the "iteration_items" column
    Then the card for issue "AIHUB-1" is in the "iteration_items" column

  Scenario: The divergence disappears when Jira comes round
    Given Jira reports issue "AIHUB-1" as blocked
    And a sync runs
    And the card for issue "AIHUB-1" is marked not blocked locally
    When Jira reports issue "AIHUB-1" as not blocked
    And a sync runs
    Then the card for issue "AIHUB-1" does not diverge from Jira
    And the card for issue "AIHUB-1" is not blocked

  Scenario: A change Jira makes is adopted when the board was agreeing
    Given Jira reports issue "AIHUB-1" as not blocked
    And a sync runs
    When Jira reports issue "AIHUB-1" as blocked
    And a sync runs
    Then the card for issue "AIHUB-1" is blocked
    And the card for issue "AIHUB-1" does not diverge from Jira

  Scenario: Nothing about blocked is ever written to Jira
    Given Jira reports issue "AIHUB-1" as blocked
    And a sync runs
    When the card for issue "AIHUB-1" is marked not blocked locally
    And a sync runs
    Then no transition was performed in Jira
