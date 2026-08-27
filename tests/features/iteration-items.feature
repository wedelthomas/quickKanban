Feature: I commit work to this iteration
  Iteration Items holds what I have committed to, placed there by me. Not by
  Jira: only one of the twelve issues assigned to this user carries a sprint at
  all, so deriving membership from Jira would leave the column almost empty and
  the feature useless.

  The column has no Jira status mapping, which is the mechanism slice 3 built
  for Blocked. Committing to work is a decision, not a status, so there is
  nothing in any Jira workflow it could honestly map to.

  Background:
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs

  Scenario: Moving a Jira card in changes the board and tells Jira nothing
    When the card for issue "AIHUB-1" is moved to the "iteration_items" column
    Then the card for issue "AIHUB-1" is in the "iteration_items" column
    And issue "AIHUB-1" has status "Open" in Jira
    And no transition was performed in Jira

  Scenario: A later sync leaves committed work where it was put
    Given the card for issue "AIHUB-1" is moved to the "iteration_items" column
    When a sync runs
    Then the card for issue "AIHUB-1" is in the "iteration_items" column
    And no transition was performed in Jira

  Scenario: Sync never places a card there on the user's behalf
    # The fixture deliberately carries a sprint on the issue. Production code
    # must stay ignorant of the sprint field — reading it onto cards is out of
    # scope for this slice — so the assertion is negative: nothing happens.
    Given issue "AIHUB-1" is in the sprint matching the current iteration
    When a sync runs
    Then the card for issue "AIHUB-1" is in the "backlog" column

  Scenario: A local card can be committed too
    Given a card titled "Write the incident review" is created
    When the card "Write the incident review" is moved to "Iteration Items"
    Then the card "Write the incident review" is in "Iteration Items"
    And no transition was performed in Jira
