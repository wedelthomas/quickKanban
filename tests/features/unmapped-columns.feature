Feature: Columns I have not mapped stay mine
  Blocked has no equivalent in most Jira workflows. Parking a card there should
  change the board without telling Jira something untrue.

  Scenario: Moving into an unmapped column changes the board only
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "blocked" column
    Then the card for issue "AIHUB-1" is in the "blocked" column
    And issue "AIHUB-1" has status "Open" in Jira
    And no transition was performed in Jira

  Scenario: A card parked in an unmapped column is not pushed by a later sync
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And the card for issue "AIHUB-1" is moved to the "blocked" column
    When a sync runs
    Then no transition was performed in Jira
    And the card for issue "AIHUB-1" is in the "blocked" column

  Scenario: An inbound status no column maps to leaves the card alone
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When issue "AIHUB-1" changes status to "Cancelled"
    And a sync runs
    Then the card for issue "AIHUB-1" is in the "backlog" column

  # Found by the live check against real Jira, not by any fixture. PMO-11976's
  # real status is "In Progress"; the column it was imported into is mapped to
  # "Development", because a column can be mapped to only one status. The board
  # read that as "the user moved this card" and tried to transition a real
  # issue nobody had touched.
  Scenario: An issue whose status is a synonym of its column's mapping is left alone
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "In Progress"
    And a sync runs
    Then the card for issue "AIHUB-1" is in the "in_progress" column
    When a sync runs
    Then no transition was performed in Jira
    And the card for issue "AIHUB-1" is in the "in_progress" column
