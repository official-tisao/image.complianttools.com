/**
 * Gate 5 — the "78 of 81 tools work with no provider" claim, proved from the inventory.
 *
 * ## What was claimed and what was actually true
 *
 * PLAN.md's Gate 5 checklist says: *"Removing every configured provider leaves 78 of 81 tools fully
 * working — tested."* Three separate places asserted the figure:
 *
 * - `apps/web/src/lib/connect/content.ts` — `LOCAL_TOOL_COUNT = { total: 81, workingWithoutKey: 78,
 *   needsProvider: 3 }`
 * - `README.md` §17.7 and the release notes
 * - PLAN.md itself
 *
 * **No test derived any of it.** The 81 existed only as prose and as a `category` cell in
 * `feature-audit.csv`; nothing reconciled the CSV against the route inventory, and nothing checked
 * that the three provider-dependent tools are the only three. A fourth AI-only tool could have been
 * added and the number would have stayed 78, still green.
 *
 * ## What this checks
 *
 * 1. `feature-audit.csv` parses, and its tool ids are exactly `T01`–`T81` with no gaps or
 *    duplicates. The denominator is derived, never hard-coded.
 * 2. The provider-dependent tools are derived from the CSV's own `AI-only` category, then checked
 *    against `TIER3_SURFACE` and the shipped `/ai/*` routes. Two independent derivations agreeing
 *    is what makes the number trustworthy.
 * 3. Every local tool's route actually exists on disk. A tool whose page was deleted would
 *    otherwise still be counted as "fully working".
 * 4. The arithmetic holds: `total - needsProvider === workingWithoutKey`, and that value matches the
 *    figure the UI publishes.
 *
 * This is the deterministic half of the claim. The *behavioural* half — that each of the 78
 * produces a local result with no provider request — is `e2e/gate5-local-tools.spec.ts`, which
 * drives the real routes in a real browser.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

/**
 * Overridable so the gate test can point this at a synthetic inventory and assert that a drifted one
 * actually fails. Same shape as `verify-route-budgets.ts`'s `CT_BUILD_DIR` override.
 */
const AUDIT_CSV = process.env.CT_AUDIT_CSV
  ? path.resolve(process.env.CT_AUDIT_CSV)
  : path.join(REPO_ROOT, 'feature-audit.csv');

const ROUTES_DIR = process.env.CT_ROUTES_DIR
  ? path.resolve(process.env.CT_ROUTES_DIR)
  : path.join(REPO_ROOT, 'apps', 'web', 'src', 'routes');

const EXPECTED_TOTAL = 81;

/** Split one CSV line, honouring double-quoted fields that contain commas. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

interface AuditRow {
  readonly type: string;
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly status: string;
}

/**
 * Parse the audit CSV into rows.
 *
 * `Type` is `FEATURE`, `BUG`, or `Header`. Within `FEATURE`, the `ID` column holds three kinds of
 * row that are **not** Appendix A tools:
 *
 * - `FMT-*` — format-family summaries (§5 groups), not tools
 * - `P0`…`P7` — phase markers
 * - `T01`…`T81` — the actual tool catalog
 *
 * Only `T`-prefixed ids are tools. Filtering on the id shape rather than on the `Type` column is what
 * makes the denominator correct: taking every `FEATURE` row yields 94, which is neither the catalog
 * nor any published figure.
 */
function parseAudit(csv: string): AuditRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  assert.ok(lines.length > 1, 'feature-audit.csv has no data rows');

  const header = splitCsvLine(lines[0] as string).map((h) => h.trim());
  const index = (name: string): number => {
    const at = header.indexOf(name);
    assert.notEqual(at, -1, `feature-audit.csv is missing the "${name}" column`);
    return at;
  };
  const typeAt = index('Type');
  const idAt = index('ID');
  const nameAt = index('Name');
  const categoryAt = index('Category');
  const statusAt = index('Status');

  return lines.slice(1).map((line) => {
    const fields = splitCsvLine(line);
    return {
      type: (fields[typeAt] ?? '').trim(),
      id: (fields[idAt] ?? '').trim(),
      name: (fields[nameAt] ?? '').trim(),
      category: (fields[categoryAt] ?? '').trim(),
      status: (fields[statusAt] ?? '').trim(),
    };
  });
}

/** The route a tool's name carries, e.g. "Image Converter /convert" -> "/convert". */
function routeOf(name: string): string | undefined {
  const match = name.match(/\s(\/[A-Za-z0-9/_-]+)\s*$/);
  return match?.[1];
}

const audit = parseAudit(fs.readFileSync(AUDIT_CSV, 'utf8'));

// Only `T`-prefixed ids are Appendix A tools. The other FEATURE rows are format families (`FMT-*`)
// and phase markers (`P0`…`P7`), which are audit bookkeeping, not the catalog.
const tools = audit.filter((row) => row.type === 'FEATURE' && /^T\d{2}$/.test(row.id));

// The excluded non-tool rows are asserted to still be present, so a future edit that deletes or
// renames them is noticed here rather than silently changing what this check filters.
const nonToolFeatureRows = audit.filter(
  (row) => row.type === 'FEATURE' && !/^T\d{2}$/.test(row.id),
);

/* ------------------------------------------------------------------ */
/* 1. The inventory itself is well-formed                                */
/* ------------------------------------------------------------------ */

const ids = tools.map((tool) => tool.id);
assert.equal(
  new Set(ids).size,
  ids.length,
  `duplicate tool ids in feature-audit.csv: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`,
);

// The non-tool FEATURE rows must still be there: if `FMT-*` or `P*` rows disappear, the filter above
// would look correct while the file had quietly lost content.
assert.ok(
  nonToolFeatureRows.length > 0,
  'feature-audit.csv no longer contains any non-tool FEATURE rows (FMT-*/P*); this check filters ' +
    'them out, so their absence means the file changed shape and this script needs revisiting',
);

assert.equal(
  tools.length,
  EXPECTED_TOTAL,
  `feature-audit.csv lists ${tools.length} FEATURE rows, expected ${EXPECTED_TOTAL}. ` +
    'The 78-of-81 claim is derived from this count, so a drifted inventory must fail here rather ' +
    'than silently change the published figure.',
);

// T01..T81 contiguous. A gap means a tool was removed without reconciling the audit.
const numeric = ids.map((id) => Number.parseInt(id.replace(/^T/, ''), 10));
const expectedIds = Array.from({ length: EXPECTED_TOTAL }, (_, i) => i + 1);
assert.deepEqual(
  numeric,
  expectedIds,
  'feature-audit.csv tool ids are not the contiguous range T01..T81',
);

/* ------------------------------------------------------------------ */
/* 2. The provider-dependent set, derived rather than declared           */
/* ------------------------------------------------------------------ */

// Source A: the CSV's own category.
const aiOnlyFromCsv = tools.filter((tool) => tool.category === 'AI-only');

// Source B: the routes under /ai, which exist only for provider-dependent tools.
const aiDir = path.join(ROUTES_DIR, 'ai');
const aiRoutes = fs
  .readdirSync(aiDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `/ai/${entry.name}`)
  .sort();

// Source C: any tool whose route is under /ai, regardless of how the CSV categorised it.
const aiOnlyFromRoutes = tools.filter((tool) => routeOf(tool.name)?.startsWith('/ai/'));

assert.equal(
  aiOnlyFromCsv.length,
  aiOnlyFromRoutes.length,
  `feature-audit.csv disagrees with itself: ${aiOnlyFromCsv.length} rows say "AI-only" but ` +
    `${aiOnlyFromRoutes.length} tools have an /ai/* route. A tool marked local but served from ` +
    '/ai would break the 78-of-81 claim in one direction; the reverse breaks it in the other.',
);

assert.deepEqual(
  aiOnlyFromCsv.map((tool) => tool.id).sort(),
  aiOnlyFromRoutes.map((tool) => tool.id).sort(),
  'the tools categorised "AI-only" are not the tools served from /ai',
);

assert.deepEqual(
  [...new Set(aiOnlyFromCsv.map((tool) => routeOf(tool.name)).filter(Boolean))].sort(),
  aiRoutes,
  `the /ai routes on disk (${aiRoutes.join(', ')}) do not match the AI-only tools in the CSV`,
);

/* ------------------------------------------------------------------ */
/* 3. Every local tool's route exists                                    */
/* ------------------------------------------------------------------ */

const localTools = tools.filter((tool) => tool.category !== 'AI-only');

/**
 * T76 is "CLI & Library" and has no web route by design — it ships as `packages/cli` and the
 * engine itself. It is the one tool in the catalog that is not a page, so it is named here rather
 * than excluded by a pattern: an exclusion rule that grew quietly would let a second routeless tool
 * in unnoticed, which is exactly the failure this check exists to catch.
 */
const ROUTELESS_TOOL_IDS = new Set(['T76']);

const routeless = localTools.filter(
  (tool) => routeOf(tool.name) === undefined && !ROUTELESS_TOOL_IDS.has(tool.id),
);

assert.deepEqual(
  routeless.map((tool) => `${tool.id} ${tool.name}`),
  [],
  'every non-AI-only tool must name a route, unless it is a declared routeless tool. ' +
    'A tool with no route cannot be "fully working" through the browser, and a new one appearing ' +
    'here means the catalog and the route inventory have diverged.',
);

// And the named exception must actually still be routeless, so the exception cannot outlive its
// reason: if T76 ever gains a route, this fails and the id comes out of the set.
for (const id of ROUTELESS_TOOL_IDS) {
  const tool = tools.find((t) => t.id === id);
  assert.ok(tool, `ROUTELESS_TOOL_IDS names ${id}, which is not in the audit`);
  assert.equal(
    routeOf(tool.name),
    undefined,
    `${id} is declared routeless but its audit name now carries a route. Remove it from ` +
      'ROUTELESS_TOOL_IDS so its route is verified like every other tool.',
  );
}

for (const tool of localTools) {
  const route = routeOf(tool.name);
  // The declared routeless tools were checked above; there is no directory to verify for them.
  if (route === undefined) continue;
  // `/convert/png-to-webp` is a nested route; every other tool is one level deep.
  const segments = route.split('/').filter(Boolean);
  const routeDir = path.join(ROUTES_DIR, ...segments);
  assert.ok(
    fs.existsSync(path.join(routeDir, '+page.svelte')),
    `${tool.id} (${tool.name}) claims route ${route} but apps/web/src/routes/${segments.join('/')}/+page.svelte does not exist`,
  );
}

/* ------------------------------------------------------------------ */
/* 4. The arithmetic, and the figure the UI publishes                     */
/* ------------------------------------------------------------------ */

const needsProvider = aiOnlyFromCsv.length;
const workingWithoutKey = tools.length - needsProvider;

assert.equal(
  workingWithoutKey,
  EXPECTED_TOTAL - 3,
  `derived ${workingWithoutKey} local tools, expected ${EXPECTED_TOTAL - 3}`,
);

// The published figure must equal the derived one. `LOCAL_TOOL_COUNT` is what /connect-ai renders,
// so a drift here would mean the site states a number its own inventory contradicts.
const contentSource = fs.readFileSync(
  path.join(REPO_ROOT, 'apps', 'web', 'src', 'lib', 'connect', 'content.ts'),
  'utf8',
);
const readCount = (key: string): number => {
  const match = contentSource.match(new RegExp(`${key}:\\s*(\\d+)`));
  assert.ok(match, `LOCAL_TOOL_COUNT.${key} not found in content.ts`);
  return Number.parseInt(match[1] as string, 10);
};

assert.equal(
  readCount('total'),
  tools.length,
  'LOCAL_TOOL_COUNT.total does not match the audited tool count',
);
assert.equal(
  readCount('workingWithoutKey'),
  workingWithoutKey,
  'LOCAL_TOOL_COUNT.workingWithoutKey does not match the derived local-tool count',
);
assert.equal(
  readCount('needsProvider'),
  needsProvider,
  'LOCAL_TOOL_COUNT.needsProvider does not match the derived AI-only tool count',
);

/* ------------------------------------------------------------------ */
/* 5. The escalation tools are a subset of the local tools               */
/* ------------------------------------------------------------------ */

const shippedTiers = fs.readFileSync(
  path.join(REPO_ROOT, 'packages', 'engine', 'src', 'ai', 'shipped-tiers.ts'),
  'utf8',
);
const escalationRoutes = [...shippedTiers.matchAll(/route:\s*'([^']+)'/g)].map(
  (m) => m[1] as string,
);
const escalationTools = tools.filter((tool) => escalationRoutes.includes(routeOf(tool.name) ?? ''));

assert.equal(
  escalationTools.length,
  escalationRoutes.length,
  'every escalation route must map to exactly one tool in the audit',
);

for (const tool of escalationTools) {
  assert.notEqual(
    tool.category,
    'AI-only',
    `${tool.id} is an escalation tool and must be locally complete, but the audit calls it AI-only`,
  );
}

console.log(
  `Verified Gate 5 inventory: ${tools.length} tools (T01-T81 contiguous), ` +
    `${needsProvider} provider-dependent (${aiOnlyFromCsv.map((t) => t.id).join(', ')}), ` +
    `${workingWithoutKey} fully working with no provider. Every local tool's route exists on disk, ` +
    `and the figure published in content.ts matches the derived one.`,
);
