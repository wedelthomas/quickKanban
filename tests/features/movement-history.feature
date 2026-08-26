Feature: Recording what moved and when
  Nothing in this slice displays the history. It is written now because it
  cannot be reconstructed later: a record not written on the day a card moved
  is lost permanently, and slice 4's archive and standup summary both read it.

  Scenario: A column change appends one record
    Given the application is running
    And a card titled "Track me" is created
    When the card is moved to the "in_progress" column at position 1
    Then the card has 1 history record
    And the last record moved it from "backlog" to "in_progress"
    And the last record was caused by the user
    And the last record has a time

  Scenario: Each column change appends its own record
    Given the application is running
    And a card titled "Busy card" is created
    When the card is moved to the "in_progress" column at position 1
    And the card is moved to the "test" column at position 1
    And the card is moved to the "done" column at position 1
    Then the card has 3 history records
    And the records read "backlog>in_progress, in_progress>test, test>done"

  Scenario: Reordering within a column writes no record
    Given the application is running
    And cards titled "A, B, C" are created in the "backlog" column
    When card "C" is moved to the "backlog" column at position 1
    Then card "C" has no history records

  Scenario: A move that changes nothing writes no record
    Given the application is running
    And cards titled "A, B, C" are created in the "backlog" column
    When card "B" is moved to the "backlog" column at position 2
    Then card "B" has no history records

  Scenario: Earlier records are never rewritten
    Given the application is running
    And a card titled "Unchanged history" is created
    When the card is moved to the "blocked" column at position 1
    And the first record is remembered
    And the card is moved to the "test" column at position 1
    Then the card has 2 history records
    And the first record is unchanged

  Scenario: History outlives the card it describes
    Given the application is running
    And a card titled "Doomed but logged" is created
    When the card is moved to the "in_progress" column at position 1
    And the card is moved to the "done" column at position 1
    And the card is deleted
    Then the card has 2 history records

  Scenario: A refused move writes no record
    Given the application is running
    And a card titled "Nowhere bound" is created
    When the card is moved to column 99 at position 1
    Then the card has no history records
