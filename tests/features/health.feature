Feature: Health reflects real readiness
  The container healthcheck reads this endpoint, so it must report on the data
  store rather than on the process being alive. A board that answers "ok" while
  unable to store anything is worse than one that is plainly down.

  Scenario: Health reports unhealthy when the data store is unreachable
    Given the application is running
    And the data store is unreachable
    When the health check is called
    Then the health check reports unhealthy
    And the response names the data store as the failing dependency

  Scenario: Health reports ok when the data store is reachable
    Given the application is running
    When the health check is called
    Then the health check reports ok
