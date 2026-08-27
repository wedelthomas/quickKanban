Feature: Looking something up in the archive
  Months later, the question is when a piece of work finished — or what a
  particular week held. The archive answers by date, because that is how the
  question is asked.

  Background:
    Given the application is running

  Scenario: A range returns only its own days, grouped by completion date
    Given a card titled "Three days back" was archived 3 days ago
    And a card titled "Ten days back" was archived 10 days ago
    And a card titled "Forty days back" was archived 40 days ago
    When the archive is read from 14 days ago to today
    Then the archive lists "Three days back"
    And the archive lists "Ten days back"
    And the archive does not list "Forty days back"
    And the archive groups them under 2 dates

  Scenario: The range is inclusive of its last day
    # A range of one day means that day. Anything else surprises the person who
    # typed the same date twice.
    Given a card titled "Today's work" was archived 0 days ago
    When the archive is read from 0 days ago to today
    Then the archive lists "Today's work"

  Scenario: An archived card keeps its detail
    Given a card titled "Kept everything" with tags "ops, security" was archived 2 days ago
    When the archive is read from 7 days ago to today
    Then the archived card "Kept everything" carries the tags "ops, security"
    And the archived card "Kept everything" carries its completion date

  Scenario: A Jira card that left the query keeps its link and its reason
    # "I finished it" and "it was reassigned away from me" look identical in an
    # archive that does not say which.
    Given Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And issue "AIHUB-1" leaves the query
    And a sync runs
    When the archive is read from 7 days ago to today
    Then the archived card for "AIHUB-1" carries its issue link
    And the archived card for "AIHUB-1" states why it left

  Scenario: An empty range says so rather than returning nothing at all
    When the archive is read from 7 days ago to today
    Then the archive is empty and says so

  Scenario: A backwards range is refused, distinctly from an empty one
    When the archive is read with a range that ends before it starts
    Then the request is refused with code "INVALID_DATE_RANGE"
