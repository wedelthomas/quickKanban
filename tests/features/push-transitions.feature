Feature: Moving a card updates Jira
  This is what turns the board from a view into a tool. The user drags a card
  and Jira agrees, without them opening Jira.

  Scenario: A move into a mapped column transitions the issue
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "test" column
    Then issue "AIHUB-1" has status "Test" in Jira
    And the recorded Jira status for "AIHUB-1" is "Test"

  Scenario: The transition is matched by destination, not by its own name
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And issue "AIHUB-1" offers the transition "Pass" leading to "PO Approve"
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "po_review" column
    Then issue "AIHUB-1" has status "PO Approve" in Jira

  Scenario: Moving an ad-hoc card tells Jira nothing
    Given the application is running
    And a card titled "Mine alone" is created
    When the card is moved to the "test" column at position 1
    Then no transition was performed in Jira

  Scenario: A move to the column the issue already matches writes nothing
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    When the card for issue "AIHUB-1" is moved to the "backlog" column
    Then no transition was performed in Jira

  Scenario: Turning Jira integration off stops moves from transitioning the issue
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And Jira integration is turned off
    When the card for issue "AIHUB-1" is moved to the "test" column
    Then no transition was performed in Jira
