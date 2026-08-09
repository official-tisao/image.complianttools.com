import { spawnSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface PnpmLicenseEntry {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
  homepage?: string;
}

type PnpmLicenseReport = Record<string, PnpmLicenseEntry[]>;

const allowed = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2',
  'BSD-2-Clause',
  'BSD-3',
  'BSD-3-Clause',
  'IJG',
  'IJG-short',
  'ISC',
  'Zlib',
  '0BSD',
  'MPL-2.0',
  'Unlicense',
  'CC0',
]);
const generatedPath = path.join(process.cwd(), 'docs', 'THIRD-PARTY-LICENSES.md');
const licenceFileName = /^(?:licen[cs]e|copying|notice|readme\.ijg)(?:[._-].*)?$/i;

interface WasmLicenceRecord {
  packageName: string;
  versions: string[];
  files: string[];
  detectedLicences: string[];
}

function licenceOptions(expression: string): string[] {
  return expression
    .replace(/[()]/g, '')
    .split(/\s+OR\s+|\s*\/\s*/i)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAllowed(expression: string): boolean {
  if (!expression || /^SEE LICENSE IN/i.test(expression)) return false;
  return licenceOptions(expression).some((option) => allowed.has(option));
}

async function loadReport(): Promise<PnpmLicenseReport> {
  if (process.env.CT_LICENSE_REPORT) {
    return JSON.parse(await readFile(process.env.CT_LICENSE_REPORT, 'utf8')) as PnpmLicenseReport;
  }
  const command = process.platform === 'win32' ? 'pnpm.CMD' : 'pnpm';
  const result = spawnSync(command, ['licenses', 'list', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(result.stderr || 'pnpm licenses list failed.');
  return JSON.parse(result.stdout) as PnpmLicenseReport;
}

function flatten(report: PnpmLicenseReport): PnpmLicenseEntry[] {
  return Object.values(report)
    .flat()
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.license.localeCompare(right.license),
    );
}

async function inspectPackageDirectory(
  directory: string,
): Promise<{ hasWasm: boolean; licenceFiles: string[]; licenceText: string }> {
  let hasWasm = false;
  const licenceFiles: string[] = [];
  const licenceTexts: string[] = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const item of await readdir(current, { withFileTypes: true })) {
      if (item.name === 'node_modules') continue;
      const absolute = path.join(current, item.name);
      if (item.isDirectory()) pending.push(absolute);
      else if (item.isFile()) {
        if (item.name.endsWith('.wasm')) hasWasm = true;
        if (licenceFileName.test(item.name)) {
          licenceFiles.push(path.relative(directory, absolute).replaceAll('\\', '/'));
          licenceTexts.push(await readFile(absolute, 'utf8'));
        }
      }
    }
  }
  return { hasWasm, licenceFiles: licenceFiles.sort(), licenceText: licenceTexts.join('\n') };
}

const deniedBundledLicencePatterns = [
  /GNU (?:LESSER |AFFERO )?GENERAL PUBLIC LICENSE/i,
  /Server Side Public License/i,
  /Business Source License/i,
  /Creative Commons[^\n]*NonCommercial/i,
  /\bresearch[- ]only\b/i,
  /\bnon-commercial\b/i,
];

function detectBundledLicences(text: string): string[] {
  const detected = new Set<string>();
  if (/Apache License[\s\S]{0,80}Version 2\.0/i.test(text)) detected.add('Apache-2.0');
  if (/The MIT License|Permission is hereby granted, free of charge/i.test(text))
    detected.add('MIT');
  if (/Independent JPEG Group|\bIJG License\b/i.test(text)) detected.add('IJG');
  if (/\bzlib License\b|This software is provided ['"]as-is['"]/i.test(text)) detected.add('Zlib');
  if (/Redistribution and use in source and binary forms/i.test(text)) {
    detected.add(/Neither the name/i.test(text) ? 'BSD-3-Clause' : 'BSD-2-Clause');
  }
  return [...detected].sort();
}

async function inspectWasmLicences(entries: PnpmLicenseEntry[]): Promise<WasmLicenceRecord[]> {
  const records: WasmLicenceRecord[] = [];
  for (const entry of entries) {
    const files = new Set<string>();
    let licenceText = '';
    let hasWasm = false;
    for (const packagePath of entry.paths) {
      const inspection = await inspectPackageDirectory(packagePath);
      hasWasm ||= inspection.hasWasm;
      licenceText += inspection.licenceText;
      for (const file of inspection.licenceFiles) files.add(file);
    }
    if (!hasWasm) continue;
    if (files.size === 0) {
      throw new Error(
        `Bundled WASM licence gate failed: ${entry.name}@${entry.versions.join(', ')} ships WebAssembly without a LICENSE*, COPYING*, NOTICE*, or README.ijg file.`,
      );
    }
    const deniedPattern = deniedBundledLicencePatterns.find((pattern) => pattern.test(licenceText));
    if (deniedPattern) {
      throw new Error(
        `Bundled WASM licence gate failed: ${entry.name}@${entry.versions.join(', ')} contains denied licence terms matching ${deniedPattern}.`,
      );
    }
    const detectedLicences = detectBundledLicences(licenceText);
    if (detectedLicences.length === 0) {
      throw new Error(
        `Bundled WASM licence gate failed: ${entry.name}@${entry.versions.join(', ')} has legal files, but no allowlisted licence text was recognized.`,
      );
    }
    if (entry.name === '@jsquash/jpeg') {
      for (const required of ['IJG', 'Zlib', 'BSD-3-Clause']) {
        if (!detectedLicences.includes(required)) {
          throw new Error(
            `Bundled WASM licence gate failed: @jsquash/jpeg is missing the required ${required} portion in its bundled licence text.`,
          );
        }
      }
    }
    records.push({
      packageName: entry.name,
      versions: entry.versions,
      files: [...files].sort(),
      detectedLicences,
    });
  }
  return records.sort((left, right) => left.packageName.localeCompare(right.packageName));
}

async function render(
  entries: PnpmLicenseEntry[],
  wasmLicences: WasmLicenceRecord[],
): Promise<string> {
  const assetRows = JSON.parse(
    await readFile(path.join(process.cwd(), 'docs', 'static-assets.json'), 'utf8'),
  ) as Array<{
    path: string;
    license: string;
    sourceUrl: string;
    licenseUrl: string;
    sha256: string;
    dateChecked: string;
  }>;
  const dependencyRows = entries.flatMap((entry) =>
    entry.versions.map(
      (version) =>
        `| \`${entry.name}\` | \`${version}\` | ${entry.license} | ${entry.homepage ? `[source](${entry.homepage})` : '—'} |`,
    ),
  );
  const assets = assetRows.map(
    (asset) =>
      `| \`${asset.path}\` | ${asset.license} | [source](${asset.sourceUrl}) · [licence](${asset.licenseUrl}) | \`${asset.sha256}\` | ${asset.dateChecked} |`,
  );
  const wasmRows = wasmLicences.map(
    (record) =>
      `| \`${record.packageName}\` | ${record.versions.map((version) => `\`${version}\``).join(', ')} | ${record.detectedLicences.join(', ')} | ${record.files.map((file) => `\`${file}\``).join('<br>')} |`,
  );
  return `${[
    '# Third-party licences',
    '',
    '> Generated by `pnpm verify:licenses:write`. Do not edit manually.',
    '',
    '## Required product attributions',
    '',
    'This software is based in part on the work of the Independent JPEG Group.',
    '',
    'The statement above is mandatory product documentation for the IJG-licensed portions of MozJPEG/libjpeg-turbo; it is not an endorsement or advertising claim.',
    '',
    '## Package dependencies',
    '',
    '| Package | Version | Licence | Project |',
    '| --- | --- | --- | --- |',
    ...dependencyRows,
    '',
    '## Bundled WebAssembly licence files',
    '',
    'Package metadata is not treated as sufficient for WASM codecs. The verifier walks each installed package that ships `.wasm` and records its bundled legal files.',
    '',
    '| Package | Version | Detected portions | Bundled legal files |',
    '| --- | --- | --- | --- |',
    ...(wasmRows.length > 0 ? wasmRows : ['| _No bundled WebAssembly packages._ | — | — | — |']),
    '',
    '## Static assets',
    '',
    '| Asset | Licence | Provenance | SHA-256 | Checked |',
    '| --- | --- | --- | --- | --- |',
    ...(assets.length > 0
      ? assets
      : ['| _No third-party static assets registered._ | — | — | — | — |']),
    '',
  ].join('\n')}\n`;
}

const entries = flatten(await loadReport());
const failures = entries.filter((entry) => !isAllowed(entry.license));
if (failures.length > 0) {
  throw new Error(
    `Dependency licence gate failed:\n${failures.map((entry) => `- ${entry.name}@${entry.versions.join(', ')}: ${entry.license || 'missing/unknown'}`).join('\n')}`,
  );
}

if (process.env.CT_LICENSE_REPORT) {
  console.log(`Synthetic licence report passed for ${entries.length} dependencies.`);
  process.exit(0);
}

const wasmLicences = await inspectWasmLicences(entries);
const generated = await render(entries, wasmLicences);
if (process.argv.includes('--write')) {
  await writeFile(generatedPath, generated);
  console.log(
    `Wrote ${path.relative(process.cwd(), generatedPath)} for ${entries.length} dependencies.`,
  );
} else {
  let committed = '';
  try {
    committed = await readFile(generatedPath, 'utf8');
  } catch {
    throw new Error('docs/THIRD-PARTY-LICENSES.md is missing; run pnpm verify:licenses:write.');
  }
  if (committed !== generated) {
    throw new Error('docs/THIRD-PARTY-LICENSES.md is stale; run pnpm verify:licenses:write.');
  }
  console.log(`Verified ${entries.length} dependency licence records.`);
}
