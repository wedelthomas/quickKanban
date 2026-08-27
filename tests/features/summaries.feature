Feature: Summaries over a day and over a week
  The board's byproduct, turned into the thing the user would otherwise
  assemble by hand each morning.

  Background:
    Given the application is running

  Scenario: A daily summary reports what moved and where things stand
    Given a card titled "Rotate certificates" is created
    And the card titled "Rotate certificates" is moved to the "in_progress" column
    And a card titled "Waiting on legal" is created
    And the card titled "Waiting on legal" is moved to the "blocked" column
    When a "daily" summary is generated
    Then the summary lists "Rotate certificates" as moved
    And the summary lists "Rotate certificates" as in progress
    And the summary lists "Waiting on legal" as blocked

  Scenario: A weekly summary reaches back seven days, and a daily one does not
    Given a card titled "Last Tuesday's work" is created
    And the card titled "Last Tuesday's work" moved to "in_progress" 4 days ago
    When a "daily" summary is generated
    Then the summary does not list "Last Tuesday's work" as moved
    When a "weekly" summary is generated
    Then the summary lists "Last Tuesday's work" as moved

  Scenario: A weekly summary includes work completed and since archived
    # The case the weekly summary exists for. A week's work that vanished from
    # the report because it was tidied away would make it useless for the one
    # conversation it serves.
    Given a card titled "Finished and filed" is created
    And the card titled "Finished and filed" moved to "done" 2 days ago
    # Shortening the window rather than ageing the card further: the movement
    # has to stay inside the seven-day period for the summary to be about it.
    And the archive window is set to 1 days
    When archival runs
    Then the card titled "Finished and filed" is archived
    When a "weekly" summary is generated
    Then the summary lists "Finished and filed" as moved

  Scenario: A deleted card drops out of the summary, unlike an archived one
    Given a card titled "Mistake" is created
    And the card titled "Mistake" is moved to the "in_progress" column
    And the card titled "Mistake" is deleted
    When a "weekly" summary is generated
    Then the summary does not list "Mistake" as moved

  Scenario: A sync-caused movement is marked as coming from Jira
    Given Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And issue "AIHUB-1" changes status to "Development"
    And a sync runs
    When a "daily" summary is generated
    Then the summary marks the movement of "AIHUB-1" as coming from Jira

  Scenario: Generating twenty summaries changes nothing at all
    Given a card titled "Rotate certificates" is created
    And the card titled "Rotate certificates" is moved to the "in_progress" column
    And the board's arrangement is remembered
    And the history is remembered
    When 20 summaries are generated
    Then the board's arrangement is unchanged
    And the history is unchanged
