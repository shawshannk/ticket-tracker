import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests hit a real Postgres (see docker-compose.yml) and run in one process
// so concurrent-allocation assertions aren't confused by parallel test files.
export default defineConfig({
  // Vitest transforms with esbuild, which does not emit `design:paramtypes`. Nest's DI reads
  // exactly that metadata, so a test which boots the app (auth.int-spec) fails with
  // "Cannot read properties of undefined" on every injected dependency. SWC emits it.
  // Handler-level int-specs construct their subjects by hand and never needed this.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: { target: 'es2021', parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } },
    }),
  ],
  test: {
    include: ['src/**/*.int-spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
