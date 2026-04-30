import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
});
