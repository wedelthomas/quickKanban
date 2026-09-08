Feature: The column mapping is mine to set
  Which Jira status a column stands for is a decision about someone's own
  workflow, not something this board is entitled to fix in advance.

  Background:
    Given the application is running

  Scenario: A column mapped from Jira's own statuses starts pushing
    Given Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When the "iteration_items" column is mapped to "Development"
    And the card for issue "AIHUB-1" is moved to the "iteration_items" column
    Then issue "AIHUB-1" has status "Development" in Jira

  Scenario: A column whose mapping is removed stops pushing
    Given Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When the "test" column's mapping is removed
    And the card for issue "AIHUB-1" is moved to the "test" column
    Then the card for issue "AIHUB-1" is in the "test" column
    And no transition was performed in Jira

  Scenario: Both changes survive being read back from storage
    When the "iteration_items" column is mapped to "Development"
    And the "test" column's mapping is removed
    And the mapping is read back
    Then the "iteration_items" column maps to "Development"
    And the "test" column maps to nothing

  Scenario: Only statuses Jira reports are offered
    Given Jira reports the statuses "Open, Development, Test, PO Approve, Done"
    When the offered statuses are read
    Then "Development" is among them
    And "Invented Status" is not among them

  Scenario: Two columns sharing a status resolve to the first in board order
    Given Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And the "iteration_items" column is mapped to "Test"
    When issue "AIHUB-1" changes status to "Test"
    And a sync runs
    # Blocked is position 3, Test is position 4 — the earlier column wins.
    Then the card for issue "AIHUB-1" is in the "iteration_items" column
