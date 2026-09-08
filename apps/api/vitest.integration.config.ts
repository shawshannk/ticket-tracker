import { defineConfig } from 'vitest/config';

// Integration tests hit a real Postgres (see docker-compose.yml) and run in one process
// so concurrent-allocation assertions aren't confused by parallel test files.
export default defineConfig({
  test: {
    include: ['src/**/*.int-spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
