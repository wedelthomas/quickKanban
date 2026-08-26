Feature: Overdue begins the day after the due date
  A card due today is work for today, not work that is late. Treating it as
  overdue would cry wolf every morning.

  Scenario: A card due today is not overdue
    Given the application is running
    When a card titled "Due today" is created with a due date of today
    Then the card is not marked overdue

  Scenario: A card due yesterday is overdue
    Given the application is running
    When a card titled "Due yesterday" is created with a due date of yesterday
    Then the card is marked overdue

  Scenario: A card with no due date is never overdue
    Given the application is running
    When a card titled "No due date" is created
    Then the card is not marked overdue
