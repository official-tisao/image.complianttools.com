/**
 * P5-16 — the §13.1.3 register-completeness check (README §22.4).
 *
 * > **Register completeness** — A test enumerates every adapter capability referenced by any tool and
 * > asserts each has a row in the §13.1.3 register. **Adding a Tier 3 path without a register row
 * > fails CI** — this is what makes P11 structural rather than cultural.
 *
 * The surface being checked comes from `shippedTier3Paths()`, which reads the engine's live adapter
 * registry and the shipped route → capability map. Nothing here is a list someone typed and compared
 * against another list someone typed: adding an adapter that declares a capability, or adding an
 * escalation route, changes what this demands with no edit to this file.
 *
 * Rows are matched against the tool number (`T32`, `T67`, …) wherever the README supplies one, which
 * is what makes a *deleted* row detectable rather than merely absent. Matching on capability
 * *prose* would be the alternative and is rejected: §13.1.3 deliberately describes failures at
 * length and the descriptions get edited, so prose would make the gate flap on documentation edits
 * while still missing a row that merely dropped its parenthetical.
 *
 * Pure and importable so the negative test can drive it over a synthetic README: see
 * `test-register-completeness-gate.ts`.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The register heading from README §13.1.3. Section numbering is the anchor, not the title prose. */
const REGISTER_HEADING = '#### 13.1.3 The AI Justification Register';

/** The heading of the paragraph that closes the table, used to bound the parse. */
const REGISTER_END_HEADING = '#### 13.1.4';

/** One parsed row of the §13.1.3 table. */
export interface RegisterRow {
  /** The row's first cell, e.g. `**Upscale** (T32; T70 is pixel-art-only)`. */
  readonly capability: string;
  /** Every `T<digits>` token in the first cell, e.g. `['T32', 'T70']`. */
  readonly tools: readonly string[];
  /** The row's verdict cell, which must state a disposition rather than leave it implicit. */
  readonly verdict: string;
}

/** One shipped Tier 3 path, as the check needs it. Kept structural so this file owns no engine type. */
export interface CheckablePath {
  readonly route: string;
  readonly tool: string;
  readonly capability: string;
  /**
   * Provider ids declaring this capability, carried through only so a failure can name what needs
   * justifying. It is deliberately not part of matching: which providers exist is not what makes a
   * register row required, and matching on it would let a provider rename re-scope the gate.
   */
  readonly providers?: readonly string[];
}

/** A shipped path with no register row. */
export interface MissingRegisterRow {
  readonly tool: string;
  readonly route: string;
  readonly capability: string;
  /** Provider ids declaring this capability, so the message names what needs justifying. */
  readonly providers: readonly string[];
}

export interface RegisterCheckResult {
  readonly missing: readonly MissingRegisterRow[];
  /** Every row parsed out of §13.1.3. Exposed so the negative test can assert on the parse itself. */
  readonly rows: readonly RegisterRow[];
}

/**
 * Parse the §13.1.3 register table out of a README.
 *
 * Bounded by the two section headings so a later table with the same shape cannot be mistaken for
 * the register, and so an unrelated edit elsewhere in a 300 KB document cannot break the parse.
 */
export function parseRegister(readme: string): RegisterRow[] {
  const start = readme.indexOf(REGISTER_HEADING);
  if (start === -1) {
    throw new Error(`README.md has no "${REGISTER_HEADING}" heading.`);
  }
  const end = readme.indexOf(REGISTER_END_HEADING, start);
  const section = end === -1 ? readme.slice(start) : readme.slice(start, end);

  const rows: RegisterRow[] = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 5) continue; // header and separator rows are shorter or non-data
    const [capability, , , , verdict] = cells as [string, string, string, string, string];
    // The header row's first cell is the literal word "Capability"; a data row is never that.
    if (capability === 'Capability' || !capability.includes('**')) continue;
    rows.push({
      capability,
      tools: capability.match(/T\d+/gu) ?? [],
      verdict,
    });
  }
  if (rows.length === 0) {
    throw new Error('The §13.1.3 register parsed as zero rows; the table shape must have changed.');
  }
  return rows;
}

/**
 * Every shipped Tier 3 path missing its register row.
 *
 * A path is satisfied when *any* register row names its tool. Several rows cover more than one tool
 * — the OCR row is one row for T62, and the segment row covers T27's assist — so "some row names
 * T62" is the correct test, not "there are six rows".
 */
export function checkRegisterCompleteness(
  readme: string,
  paths: readonly CheckablePath[],
): RegisterCheckResult {
  const rows = parseRegister(readme);
  const toolsWithRows = new Set(rows.flatMap((row) => row.tools));

  const missing = paths
    .filter((path) => !toolsWithRows.has(path.tool))
    .map((path) => ({
      tool: path.tool,
      route: path.route,
      capability: path.capability,
      providers: (path.providers ?? []).slice(),
    }));

  return { missing, rows };
}

/**
 * Turn the result into the operator-facing error.
 *
 * Names each gap with its route, its capability, and the providers that would have to justify it,
 * because "register incomplete" alone sends the reader back to grep a 300 KB README.
 */
export function formatMissingRows(missing: readonly MissingRegisterRow[]): string {
  const lines = missing.map(
    (entry) =>
      `  ${entry.tool} (${entry.route}) escalates to "${entry.capability}"` +
      (entry.providers.length > 0
        ? `, served by ${entry.providers.join(', ')}, and has no §13.1.3 register row.`
        : ' and has no §13.1.3 register row.'),
  );
  return [
    `README §13.1.3 is missing ${missing.length} register row${missing.length === 1 ? '' : 's'}.`,
    'A Tier 3 code path may not be merged without one (README §13.1.3, PLAN P5-16).',
    ...lines,
  ].join('\n');
}

/** Read the shipped Tier 3 paths from the engine. */
async function loadShippedPaths(root: string): Promise<readonly CheckablePath[]> {
  // Imported from the engine's built output by relative path, because the workspace root does not
  // depend on the engine package — only the engine's own scripts and the web app do. The adapter
  // registrations must run first or the registry answers "nothing is shipped".
  const engineDist = path.join(root, 'packages', 'engine', 'dist');
  await import(pathToFileURL(path.join(engineDist, 'ai', 'adapters', 'index.js')).href);
  // Typed as the engine's own `ShippedTier3Path` rather than as `CheckablePath`, so the rename from
  // `declaredProviders` to `providers` below is a real, checked mapping instead of a cast that
  // silently disagrees with the engine about the field name.
  const tiers = (await import(
    pathToFileURL(path.join(engineDist, 'ai', 'shipped-tiers.js')).href
  )) as {
    shippedTier3Paths(): readonly {
      route: string;
      tool: string;
      capability: string;
      declaredProviders: readonly string[];
    }[];
  };
  return tiers.shippedTier3Paths().map((entry) => ({
    route: entry.route,
    tool: entry.tool,
    capability: entry.capability,
    providers: entry.declaredProviders,
  }));
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  const paths = await loadShippedPaths(root);

  if (paths.length === 0) {
    // Never pass vacuously: a check that demands nothing because its input was empty is worse than
    // no check, because it reports green over a broken build.
    throw new Error(
      'No shipped Tier 3 paths were found. The engine adapter registry is empty, so this check ' +
        'would pass without proving anything.',
    );
  }

  const { missing, rows } = checkRegisterCompleteness(readme, paths);
  if (missing.length > 0) throw new Error(formatMissingRows(missing));

  console.log(
    `REGISTER_COMPLETE_OK ${paths.length} shipped Tier 3 paths, ${rows.length} §13.1.3 rows`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
