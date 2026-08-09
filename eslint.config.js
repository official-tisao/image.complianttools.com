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
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
);
