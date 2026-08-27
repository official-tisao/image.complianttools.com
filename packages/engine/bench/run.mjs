import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { inspectImageContainer } from '../dist/index.js';

const benchDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(benchDirectory, '..', 'test', 'fixtures', 'gif-reference');
const historyPath = join(benchDirectory, 'history.json');
const absoluteBudgetMs = 40;
const regressionLimit = 1.1;
const runnerId = process.env.BENCH_RUNNER_ID?.trim() || null;

const fixtureNames = (await readdir(fixtureDirectory))
  .filter((name) => name.endsWith('.gif'))
  .sort();
if (fixtureNames.length === 0) throw new Error('The fixed metadata benchmark corpus is empty.');

const fixtures = await Promise.all(
  fixtureNames.map(async (name) => ({
    name,
    bytes: new Uint8Array(await readFile(join(fixtureDirectory, name))),
  })),
);
const corpusSha256 = createHash('sha256')
  .update(
    fixtures
      .map(({ name, bytes }) => `${name}:${createHash('sha256').update(bytes).digest('hex')}`)
      .join('\n'),
  )
  .digest('hex');

for (let iteration = 0; iteration < 20; iteration += 1)
  for (const fixture of fixtures) inspectImageContainer(fixture.bytes);

const samples = [];
for (let iteration = 0; iteration < 100; iteration += 1) {
  const started = performance.now();
  for (const fixture of fixtures) inspectImageContainer(fixture.bytes);
  samples.push((performance.now() - started) / fixtures.length);
}
samples.sort((left, right) => left - right);
const p95Ms = samples[Math.ceil(samples.length * 0.95) - 1];
const history = JSON.parse(await readFile(historyPath, 'utf8'));
const matching = runnerId
  ? history.results.filter(
      (result) =>
        result.operation === 'metadata-read' &&
        result.runnerId === runnerId &&
        result.corpusSha256 === corpusSha256,
    )
  : [];
const baseline = matching.at(-1);

const report = {
  operation: 'metadata-read',
  fixtureCount: fixtures.length,
  corpusSha256,
  p95Ms: Number(p95Ms.toFixed(3)),
  absoluteBudgetMs,
  runnerId,
  regressionBaselineMs: baseline?.p95Ms ?? null,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (p95Ms > absoluteBudgetMs)
  throw new Error(`Metadata read p95 ${p95Ms.toFixed(3)} ms exceeds ${absoluteBudgetMs} ms.`);
if (runnerId && !baseline && process.env.BENCH_RECORD !== '1')
  throw new Error(`No committed metadata-read baseline exists for pinned runner ${runnerId}.`);
if (baseline && p95Ms > baseline.p95Ms * regressionLimit)
  throw new Error(
    `Metadata read regressed by more than 10% (${baseline.p95Ms} ms to ${p95Ms.toFixed(3)} ms).`,
  );

if (process.env.BENCH_RECORD === '1') {
  if (!runnerId) throw new Error('BENCH_RECORD=1 requires an explicit BENCH_RUNNER_ID.');
  history.results.push({
    operation: 'metadata-read',
    runnerId,
    corpusSha256,
    fixtureCount: fixtures.length,
    p95Ms: report.p95Ms,
    recordedAt: new Date().toISOString(),
  });
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);
}
