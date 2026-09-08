import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Unit tests only: pure functions, no database, no HTTP. Anything needing
// either belongs in the acceptance or ops suite.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
    },
  },
});
