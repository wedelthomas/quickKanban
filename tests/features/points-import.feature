Feature: Story points import from Jira, and stay locally editable
  A card's estimate is already written down in Jira. Re-typing it would be
  the same duplicate bookkeeping the board exists to remove — but the number
  is also the one figure this board is allowed to correct locally, because
  the local value is what the rest of the reporting surface trusts (FR-518).

  Background:
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"

  Scenario: An issue carrying a point value imports onto the card
    Given Jira reports issue "AIHUB-1" with story points 5
    When a sync runs
    Then the card for issue "AIHUB-1" has points 5

  Scenario: An empty points field imports as unpointed
    Given Jira reports issue "AIHUB-1" with no story points
    When a sync runs
    Then the card for issue "AIHUB-1" is unpointed

  Scenario: A zero points field imports as pointed-at-zero
    Given Jira reports issue "AIHUB-1" with story points 0
    When a sync runs
    Then the card for issue "AIHUB-1" has points 0

  Scenario: A local override diverges visibly from the imported value
    Given Jira reports issue "AIHUB-1" with story points 5
    And a sync runs
    When the card for issue "AIHUB-1" is given local points 8
    Then the card for issue "AIHUB-1" has points 8
    And the card for issue "AIHUB-1" diverges in points from Jira

  Scenario: A local override survives every later sync
    Given Jira reports issue "AIHUB-1" with story points 5
    And a sync runs
    When the card for issue "AIHUB-1" is given local points 8
    And a sync runs
    Then the card for issue "AIHUB-1" has points 8

  Scenario: Nothing about points is ever written to Jira
    Given Jira reports issue "AIHUB-1" with story points 5
    And a sync runs
    When the card for issue "AIHUB-1" is given local points 8
    And a sync runs
    Then no transition was performed in Jira
