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
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
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
