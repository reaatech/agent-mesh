import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/e2e/**/*.test.ts'],
      exclude: ['node_modules', 'dist', 'coverage', 'infra'],
    },
  }),
);
