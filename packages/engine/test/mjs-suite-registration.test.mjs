/**
 * P5-16 — the `.mjs` suite registration guard.
 *
 * ## Why this file exists
 *
 * The engine runs its tests with `node test/all.test.mjs`, then invokes vitest with every
 * `.test.mjs` file excluded. That means a `.test.mjs` file is skipped by vitest *by design*, and it
 * only runs if some other file imports it. `all.test.mjs` is the only importer.
 *
 * So a new `.mjs` test — or an existing one whose import line is deleted in a refactor — vanishes
 * from the suite entirely, with no failing assertion and no warning. That is not a theoretical
 * hazard: `p5-11-contract.test.mjs` (the adapter contracts for Stability, BFL, and fal.ai),
 * `ai-transport-p5-02.test.mjs` (the entire transport redaction suite), and
 * `p5-04-csp-security.test.mjs` were all present and all unimported, so `pnpm test` reported
 * success while running none of them.
 *
 * This test closes that hole structurally: it enumerates `*.test.mjs` from disk and fails if any
 * one is absent from `all.test.mjs`. Adding a `.mjs` test now fails CI until it is registered, and
 * deleting a registration fails CI too.
 *
 * It uses `node:fs` rather than the engine's own source because the thing under test is the shape
 * of the test directory, which no amount of unit-testing the engine would cover.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, 'all.test.mjs');

/**
 * The runner itself.
 *
 * It matches the `.test.mjs` glob but is the entry point rather than a test, so requiring it to be
 * imported would be both impossible (it is what does the importing) and wrong.
 */
const RUNNER_NAME = path.basename(RUNNER);

/** Every `.test.mjs` in this directory that is a test rather than the runner. */
function mjsTestFiles() {
  return fs
    .readdirSync(HERE)
    .filter((name) => name.endsWith('.test.mjs') && name !== RUNNER_NAME)
    .sort();
}

/** The set of modules `all.test.mjs` imports. */
function registeredModules() {
  const source = fs.readFileSync(RUNNER, 'utf8');
  const registered = new Set();
  for (const match of source.matchAll(/import\s+'\.\/([^']+)'/g)) {
    registered.add(match[1]);
  }
  return registered;
}

test('every .test.mjs file is registered in all.test.mjs', () => {
  const registered = registeredModules();
  const orphans = mjsTestFiles().filter((name) => !registered.has(name));

  assert.deepEqual(
    orphans,
    [],
    `These .test.mjs files exist but nothing imports them, so vitest skips them AND node never ` +
      `runs them — they are dead tests that report success. Add an import line to all.test.mjs.\n` +
      `Runner: ${RUNNER}`,
  );
});

test('all.test.mjs registers nothing that does not exist', () => {
  // The inverse guard: a stale import is a typo that fails at load with a confusing module error,
  // and a deleted file that is still imported breaks the whole runner rather than one test.
  const present = new Set(mjsTestFiles());
  const missing = [...registeredModules()].filter((name) => !present.has(name));
  assert.deepEqual(
    missing,
    [],
    `all.test.mjs imports modules that do not exist: ${missing.join(', ')}`,
  );
});

test('the suite is not trivially empty', () => {
  // If a rename or a bad glob ever empties the directory, the two tests above would both pass on
  // an empty set. A floor makes "no orphans" an actual statement about a real suite.
  const files = mjsTestFiles();
  assert.ok(
    files.length >= 8,
    `Expected the node:test suite to hold at least 8 files, found ${files.length}: ${files.join(', ')}`,
  );
});
