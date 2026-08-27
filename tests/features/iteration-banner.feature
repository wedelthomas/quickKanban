Feature: The board tells me which iteration we are in
  Every other artefact at TradeStation is organised around an iteration such as
  "2026 S18". The board was not, so the number had to be looked up elsewhere.

  The guarantee that matters here is not that the banner works. It is that the
  banner cannot break the board: there is no arrangement of the source being
  broken that makes the board less usable than it already is.

  Background:
    Given the application is running

  Scenario: The configured team's sprint is shown, not the other team's
    # Board 1391 is shared by two teams and carries two active sprints per
    # iteration with identical dates — true across all 730 of its closed
    # sprints. Without a team name the banner would show whichever the API
    # happened to return first.
    Given the iteration source reports both teams' sprints for "2026 S18"
    When the iteration is read
    Then the iteration is named "CRM TradeBlazers 2026 S18"
    And the iteration was freshly read

  Scenario: A failing source falls back to what was last read, and says so
    Given the iteration source reports both teams' sprints for "2026 S18"
    And the iteration is read
    When the iteration source becomes unreachable
    And the iteration is read
    Then the iteration is named "CRM TradeBlazers 2026 S18"
    And the iteration is marked as not freshly read

  Scenario: With no source and nothing cached, the dates are estimated and unnamed
    # The ordinal resets at the fiscal year, so counting cadences from an anchor
    # would be wrong every January. An absent number beats a confident wrong one.
    Given the iteration source is unreachable
    When the iteration is read
    Then the iteration is marked as estimated
    And the iteration carries no name

  Scenario: An undated sprint is no result
    # Real, not hypothetical: board 1391's future sprints are named but carry
    # no dates at all.
    Given the iteration source reports a sprint with no dates
    When the iteration is read
    Then the iteration is marked as estimated

  Scenario: A board with no active sprint is no result
    # Also real: board 5600 is a scrum board with zero sprints of any state.
    Given the iteration source reports no active sprints
    When the iteration is read
    Then the iteration is marked as estimated

  Scenario Outline: No failure of the source is ever reported as an error
    Given the iteration source fails with "<kind>"
    When the iteration is read
    Then the request succeeded
    And the board is still fully usable

    Examples:
      | kind         |
      | connectivity |
      | credentials  |
      | rate_limit   |
      | malformed    |
