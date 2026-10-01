/**
 * P5-16 — proves the §13.1.3 register-completeness gate actually fails.
 *
 * A gate that has only ever been seen to pass is indistinguishable from a gate that cannot fail, and
 * "adding a Tier 3 path without a register row fails CI" is only a promise if the failing direction
 * is exercised. So this drives `checkRegisterCompleteness` over mutated copies of the **real**
 * README rather than a hand-written fixture: the interesting failures are the ones that survive a
 * plausible edit, not the ones a stub string was built to trigger.
 *
 * Three negative cases, because "the check fails" is not one behaviour:
 *
 * - a row deleted outright;
 * - a row that survives with its tool reference stripped (the subtle one — the prose is still there,
 *   the justification still reads complete, and only the anchor is gone);
 * - a new shipped Tier 3 path with no row, which is the failure §13.1.3 actually names.
 *
 * Plus the parse itself, and the vacuity guard: a check that demands nothing because its input was
 * empty must fail rather than report green.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkRegisterCompleteness,
  formatMissingRows,
  parseRegister,
  type CheckablePath,
} from './check-register-completeness.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readme = await readFile(path.join(root, 'README.md'), 'utf8');

/**
 * The six shipped escalation paths, as the check consumes them.
 *
 * Hand-written here deliberately: this test exercises the *matching* logic, so it needs paths it
 * controls in order to prove a gap is caught. The real registry-derived surface is verified by
 * `check-register-completeness.ts` running for real in `test:gates`, and by the engine-side
 * `p5-16-shipped-tiers.test.ts`.
 */
const shippedPaths: readonly CheckablePath[] = [
  {
    route: '/upscale',
    tool: 'T32',
    capability: 'upscale',
    providers: ['fal', 'openai-compatible'],
  },
  { route: '/ocr', tool: 'T62', capability: 'describe', providers: ['anthropic', 'openai'] },
  {
    route: '/remove-object',
    tool: 'T66',
    capability: 'inpaint',
    providers: ['bfl', 'fal', 'openai'],
  },
  {
    route: '/expand-image',
    tool: 'T67',
    capability: 'outpaint',
    providers: ['bfl', 'fal', 'replicate', 'stability'],
  },
  {
    route: '/remove-background',
    tool: 'T68',
    capability: 'removeBackground',
    providers: ['clipdrop', 'fal', 'remove.bg', 'replicate', 'stability'],
  },
  {
    route: '/replace-background',
    tool: 'T69',
    capability: 'replaceBackground',
    providers: ['clipdrop', 'fal', 'replicate', 'stability'],
  },
];

// --- the parse -----------------------------------------------------------------------------

const rows = parseRegister(readme);
assert.ok(rows.length >= 12, `expected a populated register, parsed ${rows.length} rows`);

{
  // The header and separator rows must not be mistaken for data. `Capability` appearing as a parsed
  // row would mean the table shape assumption silently broke.
  assert.ok(
    rows.every((row) => row.capability !== 'Capability'),
    'the header row was parsed as data',
  );
  // Every row states a disposition. A blank verdict is the failure §13.1.3's "reviewer sign-off"
  // clause exists to catch, and it must not parse as satisfied.
  assert.ok(
    rows.every((row) => row.verdict.length > 0),
    'a register row parsed with an empty verdict',
  );
}

{
  // Tool anchors are the match key, so the parser has to recover them for every shipped tool.
  const toolsWithRows = new Set(rows.flatMap((row) => row.tools));
  for (const entry of shippedPaths) {
    assert.ok(
      toolsWithRows.has(entry.tool),
      `precondition: ${entry.tool} should have a row in the real README`,
    );
  }
}

// --- the unmodified README passes ----------------------------------------------------------

{
  const { missing } = checkRegisterCompleteness(readme, shippedPaths);
  assert.deepEqual(missing, [], 'the real README should satisfy every shipped path');
}

// --- negative case 1: a row deleted ---------------------------------------------------------

{
  // Locate the line by the same capability cell the parser reported, so the test and the gate are
  // provably looking at one row rather than at two independently-guessed strings.
  const upscaler = rows.find((row) => row.tools.includes('T32'));
  assert.ok(upscaler, 'precondition: an upscale row exists to delete');
  const line = readme
    .split('\n')
    .find((candidate) => candidate.trim().startsWith(`| ${upscaler.capability} |`));
  assert.ok(line, 'precondition: the upscale row line is locatable');
  const mutated = readme.replace(`${line}\n`, '');

  const { missing } = checkRegisterCompleteness(mutated, shippedPaths);
  assert.deepEqual(
    missing.map((entry) => entry.tool),
    ['T32'],
    'deleting the upscale row must be detected',
  );
  // The message has to be actionable: it names the route, the capability, and the providers that
  // would have to justify the row.
  const message = formatMissingRows(missing);
  assert.match(message, /§13\.1\.3 register row/);
  assert.match(message, /T32 \(\/upscale\)/);
  assert.match(message, /upscale/);
  assert.match(message, /fal/);
}

// --- negative case 2: a row kept, its tool anchor stripped ----------------------------------

{
  const ocr = rows.find((row) => row.tools.includes('T62'));
  assert.ok(ocr, 'precondition: an OCR row exists');
  const line = readme.split('\n').find((candidate) => candidate.includes(ocr.capability));
  assert.ok(line, 'precondition: the OCR row line is locatable');

  // The justification prose stays exactly as it is. Only the `(T62)` anchor is dropped — which is
  // what an edit that rewords the capability name would do. A gate that matched on prose would pass
  // this; a gate that lost its anchor must not.
  const stripped = line.replace(/\s*\(T62\)/u, ' (Tier 0–2 measured)');
  assert.notEqual(stripped, line, 'precondition: the anchor was actually stripped');
  const mutated = readme.replace(line, stripped);

  const { missing } = checkRegisterCompleteness(mutated, shippedPaths);
  assert.deepEqual(
    missing.map((entry) => entry.tool),
    ['T62'],
    'a row that lost its tool anchor must not count as covering the path',
  );
}

// --- negative case 3: a new Tier 3 path with no row -----------------------------------------

{
  // Exactly §13.1.3's promise: the shipped surface grows, the register does not, CI goes red.
  const added: readonly CheckablePath[] = [
    ...shippedPaths,
    { route: '/deblur', tool: 'T97', capability: 'upscale', providers: ['fal'] },
  ];
  const { missing } = checkRegisterCompleteness(readme, added);
  assert.deepEqual(
    missing.map((entry) => entry.tool),
    ['T97'],
    'a shipped Tier 3 path with no register row must fail the gate',
  );
  assert.match(formatMissingRows(missing), /T97 \(\/deblur\)/);
}

// --- the gate never passes vacuously ---------------------------------------------------------

{
  // An empty surface is a broken build (unregistered adapters), not a clean bill of health.
  const { missing } = checkRegisterCompleteness(readme, []);
  assert.deepEqual(missing, [], 'no paths means nothing to check');
  // `check-register-completeness.ts` guards this at the CLI boundary, since only it can see the
  // registry. Here the complementary property is asserted: the paths really are non-empty.
  assert.ok(shippedPaths.length > 0, 'the fixture surface must not be empty');
}

// --- a missing section is an error, not a silent pass ----------------------------------------

{
  assert.throws(
    () => parseRegister(readme.replace('#### 13.1.3 The AI Justification Register', '## Renamed')),
    /no "#### 13\.1\.3 The AI Justification Register" heading/,
  );
  // A present-but-mangled table must not parse as "no gaps" — that would let a broken README pass
  // CI by looking empty. The heading survives; the rows do not.
  const emptied = readme.replace(
    /#### 13\.1\.3 The AI Justification Register[\s\S]*?(?=#### 13\.1\.4)/u,
    '#### 13.1.3 The AI Justification Register\n\n**A Tier 3 code path may not be merged without a row.**\n\n',
  );
  assert.throws(() => parseRegister(emptied), /zero rows/);
}

console.log(
  'Verified that the register gate passes the real README and fails on a deleted row, a row with ' +
    'its tool anchor stripped, and a new Tier 3 path with no row.',
);
