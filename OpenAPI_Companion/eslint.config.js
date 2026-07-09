import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

// Flat config (ESLint 9). Enforces the coding standard in
// planning/16_CODING_STANDARD.md (strict TS, no `any`, no unused vars).
export default tseslint.config(
  { ignores: ['dist', 'share', 'coverage', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node maintenance scripts (e.g. icon generation) run under plain Node.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // React-specific rules only apply to the UI/source tree.
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Entry points legitimately mix a component with bootstrap side effects.
    files: ['src/popup/main.tsx', 'src/content/index.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Playwright fixtures use empty-object destructuring and a `use()` callback.
    files: ['tests/**/*.{ts,tsx}'],
    rules: { 'no-empty-pattern': 'off' },
  },
  prettier,
)
