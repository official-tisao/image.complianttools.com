import assert from 'node:assert/strict';

import { ESLint } from 'eslint';
import eslintConfig from '../eslint.config.js';

const expectedFailures = new Map([
  ['packages/engine/fixtures/lint/dangerous-dom.ts', 'compliant-tools/no-dangerous-dom'],
  ['packages/engine/fixtures/lint/browser-global.ts', 'compliant-tools/no-engine-browser-globals'],
  ['packages/engine/fixtures/lint/direct-fetch.ts', 'compliant-tools/no-engine-direct-fetch'],
  ['packages/ui/fixtures/lint/raw-html.svelte', 'svelte/no-at-html-tags'],
]);

// Drop only the repository-wide ignore block so the intentionally invalid fixtures are linted.
const eslint = new ESLint({
  ignore: false,
  overrideConfigFile: true,
  overrideConfig: eslintConfig.slice(1),
});

for (const [file, expectedRule] of expectedFailures) {
  const [result] = await eslint.lintFiles(file);
  assert(result, `ESLint returned no result for ${file}`);
  const receivedRules = result.messages.map(({ ruleId }) => ruleId);
  assert(
    receivedRules.includes(expectedRule),
    `${file} must fail ${expectedRule}; received ${receivedRules.join(', ')}`,
  );
}

console.log(`Verified ${expectedFailures.size} failing lint fixtures.`);
