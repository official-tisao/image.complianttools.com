import eslint from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

import compliantTools from './scripts/eslint/compliant-tools.js';

export default tseslint.config(
  {
    ignores: [
      '**/.svelte-kit/**',
      '**/.lvgl/**',
      '**/.turbo/**',
      '**/.venv/**',
      '**/venv/**',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      'apps/web/static/ocr-runtime/**',
      '**/test-results/**',
      '**/fixtures/lint/**',
      'saas-template/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,svelte}'],
    plugins: { 'compliant-tools': compliantTools },
    rules: {
      'compliant-tools/no-dangerous-dom': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'svelte/no-at-html-tags': 'error',
      // A leading underscore marks a binding that exists only to be discarded -- most often a
      // destructured property being stripped from an object. Without this the convention the
      // source already uses is silently unenforced, and `const { a: _a, ...rest }` fails lint.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: [
      'packages/engine/src/**/*.{js,mjs,ts}',
      'packages/engine/fixtures/lint/**/*.{js,mjs,ts}',
    ],
    rules: {
      'compliant-tools/no-engine-browser-globals': 'error',
      'compliant-tools/no-engine-direct-fetch': 'error',
    },
  },
  {
    files: [
      'scripts/**/*.{js,mjs,cjs,ts}',
      'packages/*/bench/**/*.{js,mjs,cjs,ts}',
      'packages/*/test/**/*.{js,mjs,cjs,ts}',
      'e2e/**/*.{js,mjs,cjs,ts}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: [
      'apps/web/src/**/*.{js,mjs,ts,svelte}',
      'packages/engine/src/**/*.{js,mjs,ts}',
      'packages/engine/fixtures/lint/**/*.{js,mjs,ts}',
      'packages/ui/src/**/*.{js,mjs,ts,svelte}',
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'apps/relay/**/*.{js,mjs,cjs,ts}',
      'packages/cli/**/*.{js,mjs,cjs,ts}',
      'packages/extension/**/*.{js,mjs,cjs,ts}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    files: [
      '*.config.{js,mjs,cjs,ts}',
      'apps/*/dev-server.mjs',
      'packages/*/scripts/**/*.{js,mjs,cjs}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/*/dev-server.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly' } },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: {
        ...globals.browser,
      },
    },
    rules: { 'svelte/no-navigation-without-resolve': 'off' },
  },
  {
    files: ['lighthouserc.cjs'],
    languageOptions: { globals: globals.node },
  },
);
