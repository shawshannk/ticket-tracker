import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * One flat config for the whole monorepo (spec 09's CI runs a lint stage).
 *
 * Deliberately type-unaware: type errors are already caught by `turbo run typecheck`, which
 * runs the real compiler over every workspace. Duplicating that in ESLint would roughly double
 * CI time to re-find the same problems.
 */
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/drizzle/**', 'e2e/test-results/**', 'e2e/playwright-report/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Underscore-prefixed args are the convention here for deliberately unused params
      // (e.g. TanStack Query's `(_error, _vars, context)` callbacks).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The codebase leans on inference; requiring explicit return types would be noise.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Warn rather than error: two effects here intentionally omit stable setters and are
      // annotated at the call site. Failing CI on them would invite blanket disables.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Nest's DI and Drizzle's builders legitimately produce empty interfaces / any in places.
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/no-empty-object-type': 'off' },
  },
);
