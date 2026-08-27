Feature: Filtering narrows what I see and nothing else
  A filter that could move a card, reorder a column or edit content would make
  looking at the board a risk. It must be safe to look.

  Background:
    Given the application is running
    And a card titled "Rotate staging certificates" is created
    And a card titled "Draft the quarterly report" is created
    And the board's arrangement is remembered

  Scenario: A filter attempt changes no card and writes no history
    When the board is fetched with a filter parameter
    Then the board's arrangement is unchanged
    And the movement history is empty

  Scenario: The server ignores filter parameters entirely
    # Filtering is applied in the browser (research.md R-1), so the server
    # offers nothing a filter could reach. This asserts that absence: if a
    # filter parameter is ever added server-side, this scenario fails and
    # FR-311 gets re-earned deliberately rather than lost by accident.
    When the board is fetched with a filter parameter
    Then the response contains every card, unfiltered
