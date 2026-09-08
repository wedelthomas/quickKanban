Feature: Tags come from a shared vocabulary
  Tags are reused across cards rather than retyped, so the set stays small
  enough to filter by. A vocabulary that drifts makes slice 4's tag filter
  return nothing.

  Scenario: An existing tag is suggested by prefix
    Given the application is running
    And a card titled "First card" is created with tags "ops, security"
    When tags matching "Op" are requested
    Then the suggestions include "ops"

  Scenario: A second card reuses the same tag rather than creating a duplicate
    Given the application is running
    And a card titled "First card" is created with tags "ops"
    When a card titled "Second card" is created with tags "OPS"
    Then the tag vocabulary contains exactly 1 tag

  Scenario: Suggestions are empty when nothing matches
    Given the application is running
    And a card titled "First card" is created with tags "ops"
    When tags matching "zzz" are requested
    Then there are no suggestions
