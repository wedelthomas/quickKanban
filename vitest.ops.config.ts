import { defineConfig } from 'vitest/config';

// Operational tests drive docker compose: startup, persistence across
// container recreation, loopback binding, documentation. They are slow by
// nature and deliberately kept out of the unit suite.
export default defineConfig({
  test: {
    include: ['tests/ops/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
