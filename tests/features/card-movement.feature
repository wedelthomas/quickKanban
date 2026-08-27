Feature: Moving work across the board
  A board that cannot express progress is a list. Moves must persist, and a
  move that changes nothing must write nothing — otherwise the movement
  history fills with noise that slice 4's summary would then report.

  Scenario: A card moves to another column and stays there
    Given the application is running
    And a card titled "Start this" is created
    When the card is moved to the "in_progress" column at position 1
    Then the move is reported as applied
    And the card is in the "in_progress" column

  Scenario: A card can be moved through every column
    Given the application is running
    And a card titled "Travelling card" is created
    When the card is moved to the "in_progress" column at position 1
    And the card is moved to the "test" column at position 1
    And the card is moved to the "test" column at position 1
    And the card is moved to the "po_review" column at position 1
    And the card is moved to the "done" column at position 1
    Then the card is in the "done" column

  Scenario: Reordering within a column persists
    Given the application is running
    And cards titled "A, B, C" are created in the "backlog" column
    When card "C" is moved to the "backlog" column at position 1
    Then the "backlog" column holds the cards "C, A, B"

  Scenario: Moving a card to the position it already holds changes nothing
    Given the application is running
    And cards titled "A, B, C" are created in the "backlog" column
    When card "B" is moved to the "backlog" column at position 2
    Then the move is reported as not applied
    And the "backlog" column holds the cards "A, B, C"

  Scenario: Moving to an unknown column is refused
    Given the application is running
    And a card titled "Nowhere bound" is created
    When the card is moved to column 99 at position 1
    # COLUMN_NOT_FOUND rather than VALIDATION_FAILED since slice 5. Which
    # columns exist stopped being a literal range in the schema and became a
    # question for the database, so the refusal now says what is actually wrong.
    # columnNotFound had been defined but never thrown until then.
    Then the request is refused with code "COLUMN_NOT_FOUND"

  Scenario: Moving an unknown card is refused
    Given the application is running
    When an unknown card is moved to the "test" column at position 1
    Then the request is refused with code "CARD_NOT_FOUND"

  Scenario: A move past the end of a column lands the card last
    Given the application is running
    And cards titled "A, B, C" are created in the "backlog" column
    When card "A" is moved to the "backlog" column at position 99
    Then the "backlog" column holds the cards "B, C, A"

  Scenario: Positions stay contiguous after a card leaves a column
    Given the application is running
    And cards titled "A, B, C" are created in the "backlog" column
    When card "B" is moved to the "test" column at position 1
    Then the "backlog" column holds the cards "A, C"
    And the "backlog" column positions are contiguous from one
