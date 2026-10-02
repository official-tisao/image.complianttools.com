/**
 * Proves `check-local-tool-inventory.ts` still fails when it should.
 *
 * The inventory check is otherwise only ever exercised against the tree as it stands, where every
 * case passes. A bug that made it skip the route check, miscount the AI-only set, or ignore a
 * deleted tool would therefore stay invisible until a real drift shipped — and the failure mode is
 * exactly the one Gate 5 cares about: a wrong number published on /connect-ai while the gate stays
 * green.
 *
 * So each case builds a synthetic inventory and asserts the check's verdict on it. These run on
 * every change to the check, need no browser, no provider, and no credentials.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const command = process.platform === 'win32' ? 'pnpm.CMD' : 'pnpm';
const REPO_ROOT = process.cwd();
const REAL_CSV = path.join(REPO_ROOT, 'feature-audit.csv');

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Run the check against a given CSV, returning its exit status and combined output. */
function runCheck(csvPath: string) {
  const result = spawnSync(command, ['exec', 'tsx', 'scripts/check-local-tool-inventory.ts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, CT_AUDIT_CSV: csvPath },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** Copy the real inventory into a temp file so a case can mutate one line without touching it. */
function copyRealCsv(): string {
  const dir = makeTempDir('local-tool-inventory-');
  const target = path.join(dir, 'feature-audit.csv');
  copyFileSync(REAL_CSV, target);
  return target;
}

/** Replace a whole line in a copied CSV, matched by its `T##` id. */
function rewriteToolRow(csvPath: string, id: string, transform: (line: string) => string): void {
  const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith(`FEATURE,${id},`));
  assert.notEqual(at, -1, `no ${id} row in the copied inventory`);
  lines[at] = transform(lines[at] as string);
  writeFileSync(csvPath, lines.join('\n'));
}

try {
  // 1. The real tree passes. If this fails, the shipped inventory has genuinely drifted.
  const real = runCheck(REAL_CSV);
  assert.equal(real.status, 0, `The shipped inventory must pass its own check: ${real.output}`);
  assert.match(real.output, /78 fully working with no provider/);

  // 2. A fourth AI-only tool must break the published figure. This is the drift the whole check
  //    exists to catch: a new provider-dependent route added without reconciling 78 of 81.
  const fourthAiOnly = copyRealCsv();
  rewriteToolRow(fourthAiOnly, 'T72', (line) => line.replace(',Batch & dev,', ',AI-only,'));
  const drifted = runCheck(fourthAiOnly);
  assert.notEqual(drifted.status, 0, 'A fourth AI-only tool must fail the inventory check.');
  assert.match(
    drifted.output,
    /disagrees with itself|workingWithoutKey/,
    'The failure must name the count mismatch, not fail obscurely.',
  );

  // 3. Re-categorising a tool as AI-only without adding its route must fail. The two independent
  //    derivations (the CSV category and the /ai route directory) exist precisely to catch this:
  //    editing the CSV alone must not be able to change the published number.
  const categoryOnly = copyRealCsv();
  rewriteToolRow(categoryOnly, 'T68', (line) => line.replace(',Cutout/fill,', ',AI-only,'));
  const categoryDrift = runCheck(categoryOnly);
  assert.notEqual(
    categoryDrift.status,
    0,
    'Re-categorising a tool without adding its route must fail.',
  );
  assert.match(categoryDrift.output, /disagrees with itself/);

  // 4. A tool whose route directory does not exist must fail. A page deleted from the app but left
  //    in the inventory would otherwise still be counted as "fully working".
  //    T01's Name field is `Image Converter /convert`, followed by more comma-separated columns, so
  //    the substitution targets that field rather than end-of-line.
  const missingRoute = copyRealCsv();
  rewriteToolRow(missingRoute, 'T01', (line) =>
    line.replace('Image Converter /convert,', 'Image Converter /convert-nonexistent,'),
  );
  const routeDrift = runCheck(missingRoute);
  assert.notEqual(routeDrift.status, 0, 'A tool pointing at a missing route must fail the check.');
  assert.match(routeDrift.output, /\+page\.svelte does not exist/);

  // 5. A tool removed from the inventory must fail the count, rather than quietly making the
  //    denominator smaller and the ratio look fine.
  const fewer = copyRealCsv();
  {
    const lines = readFileSync(fewer, 'utf8').split(/\r?\n/);
    const at = lines.findIndex((line) => line.startsWith('FEATURE,T81,'));
    assert.notEqual(at, -1, 'T81 row missing from the copied inventory');
    lines.splice(at, 1);
    writeFileSync(fewer, lines.join('\n'));
  }
  const countDrift = runCheck(fewer);
  assert.notEqual(countDrift.status, 0, 'An inventory with 80 tools must fail the check.');
  assert.match(countDrift.output, /lists 80 FEATURE rows/);

  console.log(
    'Verified the local-tool inventory gate: the shipped inventory passes, and a fourth AI-only ' +
      'tool, a category edit without a matching route, a missing route directory, and a removed ' +
      'tool each fail it.',
  );
} finally {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
}
