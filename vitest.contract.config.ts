import { defineConfig } from 'vitest/config';

/**
 * Contract tests: the real Jira adapter against recorded response shapes,
 * served by an in-process HTTP interceptor.
 *
 * Separate from the unit suite because these exercise the HTTP layer — status
 * codes, headers, pagination, malformed bodies — rather than pure logic. They
 * still contact nothing: NFR-23 forbids any test in the standard suite from
 * reaching live Jira.
 *
 * Since slice 5 some of these build the real app against the real test
 * database, so files must not run in parallel: two of them racing to apply
 * migrations to one database fails on CREATE TABLE IF NOT EXISTS, which is a
 * race rather than a conflict and reports as neither.
 */
export default defineConfig({
  test: {
    include: ['tests/contract/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
