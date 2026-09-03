import eslint from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

import compliantTools from './scripts/eslint/compliant-tools.js';

export default tseslint.config(
  {
    ignores: [
      '**/.svelte-kit/**',
      '**/.turbo/**',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
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
      'compliant-tools/no-engine-browser-globals': 'error',
      'compliant-tools/no-engine-direct-fetch': 'error',
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
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
      },
    },
  },
  {
    files: ['apps/*/dev-server.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly' } },
  },
  {
    files: ['packages/*/test/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        performance: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        URL: 'readonly',
        WebAssembly: 'readonly',
      },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: {
        Blob: 'readonly',
        clearTimeout: 'readonly',
        createImageBitmap: 'readonly',
        document: 'readonly',
        Event: 'readonly',
        File: 'readonly',
        FileList: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLInputElement: 'readonly',
        ImageData: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        Worker: 'readonly',
      },
    },
    rules: { 'svelte/no-navigation-without-resolve': 'off' },
  },
  {
    files: ['lighthouserc.cjs'],
    languageOptions: { globals: { module: 'readonly' } },
  },
);
