Feature: What Jira said is recorded, not obeyed
  Slice 3 compares the board against the last known Jira state to work out what
  changed. That state can only be captured as syncs happen, so it is recorded
  now and deliberately read by nothing in this slice.

  Scenario: The issue's status and Jira's own timestamp are recorded
    Given the application is running
    And Jira has an issue "AIHUB-9" with status "In Review" updated at "2026-08-20T09:30:00.000Z"
    When a sync runs
    Then the recorded Jira status for "AIHUB-9" is "In Review"
    And the recorded Jira update time for "AIHUB-9" is "2026-08-20T09:30:00.000Z"
    And the last sync time for "AIHUB-9" is recorded
