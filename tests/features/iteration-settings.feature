Feature: I can point the board at my own team's calendar
  Every default here was read from the live Jira and is correct today. This
  story is insurance: when a Jira administrator renumbers a field, or the user
  changes team, the fix should be a settings edit rather than a release.

  Background:
    Given the application is running

  Scenario: Changing the team switches which sprint the banner reports
    # Board 1391 carries both teams' sprints for the same iteration with
    # identical dates, so this is the setting that decides which name is shown.
    Given the iteration source reports both teams' sprints for "2026 S18"
    And the iteration is read
    And the iteration is named "CRM TradeBlazers 2026 S18"
    When the "iterationTeamName" setting is changed to "MDS"
    And the iteration is read
    Then the iteration is named "MDS 2026 S18"

  Scenario: Settings survive a restart
    When the "iterationTeamName" setting is changed to "MDS"
    And the application is restarted
    Then the "iterationTeamName" setting is "MDS"

  Scenario: A cadence outside the plausible range is refused
    When the "iterationCadenceDays" setting is changed to 0
    Then the request is refused with code "VALIDATION_FAILED"

  Scenario: A working day set with nothing in it is refused
    # An empty working week would make "days remaining" permanently zero.
    When the working days are set to nothing
    Then the request is refused with code "VALIDATION_FAILED"

  Scenario: A working day that ends before it starts is refused
    When the working hours are set to start at 17 and end at 9
    Then the request is refused with code "VALIDATION_FAILED"

  Scenario: A field identifier that is not a Jira custom field is refused
    When the "jiraFieldBlocked" setting is changed to "not_a_field"
    Then the request is refused with code "VALIDATION_FAILED"

  Scenario: Settings never expose a credential
    When the settings are read
    Then no setting mentions a token, a password or a secret
