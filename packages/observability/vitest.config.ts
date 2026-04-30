import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    env: {
      GOOGLE_CLOUD_PROJECT: 'test-project',
      API_KEY: 'test-key',
      NODE_ENV: 'test',
    },
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
});
