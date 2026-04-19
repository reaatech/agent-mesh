import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'coverage', 'infra'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules',
        'dist',
        'coverage',
        'infra',
        '**/*.d.ts',
        '**/*.config.ts',
        'tests/**/*.ts',
        'src/index.ts',
        'src/observability/otel.ts',
        'src/observability/index.ts',
        'src/types/index.ts',
        'src/config/env.ts',
        'src/session/firestoreClient.ts',
        'src/mcp-server/orchestrator.mcp.ts',
        'eslint.config.mjs',
      ],
      thresholds: {
        global: {
          statements: 79,
          branches: 79,
          functions: 79,
          lines: 79,
        },
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
