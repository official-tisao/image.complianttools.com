import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface StaticAssetRecord {
  path: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  sha256: string;
  dateChecked: string;
}

const root = process.cwd();
const staticRoot = path.join(root, 'apps', 'web', 'static');
const registerPath = path.join(root, 'docs', 'static-assets.json');
const allowedLicenses = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2',
  'BSD-2-Clause',
  'BSD-3',
  'BSD-3-Clause',
  'ISC',
  'Zlib',
  '0BSD',
  'MPL-2.0',
  'Unlicense',
  'CC0',
]);

const toPosix = (value: string) => value.split(path.sep).join('/');

// First-party deployment config is not a third-party licensable asset and has no
// source/licence URL; it is excluded from the register walk rather than registered.
const deploymentConfigFiles = new Set(['_headers', '_redirects', '_routes.json']);

async function walk(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [absolute];
    }),
  );
  return files.flat();
}

function validateRecord(record: StaticAssetRecord): void {
  const required = ['path', 'sourceUrl', 'license', 'licenseUrl', 'sha256', 'dateChecked'] as const;
  for (const field of required) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      throw new Error(
        `Static asset register row ${record.path || '<unknown>'} is missing ${field}.`,
      );
    }
  }
  if (!allowedLicenses.has(record.license)) {
    throw new Error(
      `Static asset ${record.path} uses denied or unknown licence ${record.license}.`,
    );
  }
  if (!/^https:\/\//.test(record.sourceUrl) || !/^https:\/\//.test(record.licenseUrl)) {
    throw new Error(`Static asset ${record.path} must use HTTPS source and licence URLs.`);
  }
  if (!/^[a-f0-9]{64}$/.test(record.sha256)) {
    throw new Error(`Static asset ${record.path} has an invalid SHA-256 value.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.dateChecked)) {
    throw new Error(`Static asset ${record.path} has an invalid dateChecked value.`);
  }
}

/**
 * Files we author ourselves that configure the host rather than ship content. They carry no
 * third-party licence, and the register deliberately requires an HTTPS source and licence URL --
 * which we could only supply for these by inventing provenance that does not exist.
 *
 * This list is an explicit set of names, not a pattern, so that a genuine third-party asset cannot
 * slip past the gate by being dropped in with a plausible-looking filename.
 */
const firstPartyControlFiles = new Set(['.gitkeep', '_headers', '_redirects']);

export async function verifyStaticAssets(): Promise<void> {
  const register = JSON.parse(await readFile(registerPath, 'utf8')) as StaticAssetRecord[];
  const rows = new Map<string, StaticAssetRecord>();
  for (const record of register) {
    validateRecord(record);
    if (rows.has(record.path))
      throw new Error(`Duplicate static asset register row: ${record.path}.`);
    rows.set(record.path, record);
  }

  const files = (await walk(staticRoot)).filter(
    (file) => !firstPartyControlFiles.has(path.basename(file)),
  );
  for (const absolute of files) {
    const relative = toPosix(path.relative(root, absolute));
    const record = rows.get(relative);
    if (!record) throw new Error(`Unregistered static asset: ${relative}.`);
    const digest = createHash('sha256')
      .update(await readFile(absolute))
      .digest('hex');
    if (digest !== record.sha256) {
      throw new Error(
        `Static asset hash mismatch for ${relative}: expected ${record.sha256}, got ${digest}.`,
      );
    }
    rows.delete(relative);
  }

  if (rows.size > 0) {
    throw new Error(
      `Static asset register references missing files: ${[...rows.keys()].join(', ')}.`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyStaticAssets();
  console.log('Static asset register verified.');
}
