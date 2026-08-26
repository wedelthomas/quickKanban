import { defineConfig } from 'vitest/config';

/**
 * Contract tests: the real Jira adapter against recorded response shapes,
 * served by an in-process HTTP interceptor.
 *
 * Separate from the unit suite because these exercise the HTTP layer — status
 * codes, headers, pagination, malformed bodies — rather than pure logic. They
 * still contact nothing: NFR-23 forbids any test in the standard suite from
 * reaching live Jira.
 */
export default defineConfig({
  test: {
    include: ['tests/contract/**/*.test.ts'],
    environment: 'node',
  },
});
