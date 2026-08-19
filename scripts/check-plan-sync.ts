import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface PlanSyncInput {
  changedFiles: readonly string[];
  commitBody?: string;
}

export interface PlanSyncResult {
  exemptUsed: boolean;
  readmeChanged: boolean;
  planChanged: boolean;
}

export function checkPlanSync(input: PlanSyncInput): PlanSyncResult {
  const normalized = input.changedFiles.map((file) => file.replaceAll('\\', '/'));
  const readmeChanged = normalized.includes('README.md');
  const planChanged = normalized.includes('PLAN.md');
  const exemptUsed =
    readmeChanged && !planChanged && /\[plan-exempt\]/i.test(input.commitBody ?? '');
  if (readmeChanged && !planChanged && !exemptUsed) {
    throw new Error(
      'README.md changed without PLAN.md. Update the plan or document [plan-exempt].',
    );
  }
  return { exemptUsed, readmeChanged, planChanged };
}

function gitChangedFiles(base: string | undefined): string[] {
  const args = base
    ? ['diff', '--name-only', `${base}...HEAD`]
    : ['diff', '--name-only', 'HEAD^', 'HEAD'];
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Unable to determine changed files.');
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

async function githubContext(): Promise<{ base?: string; body?: string }> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return {};
  const event = JSON.parse(await readFile(eventPath, 'utf8')) as {
    before?: string;
    pull_request?: { base?: { sha?: string }; body?: string };
    head_commit?: { message?: string };
  };
  const base = event.pull_request?.base?.sha ?? event.before;
  const body = event.pull_request?.body ?? event.head_commit?.message;
  return { ...(base === undefined ? {} : { base }), ...(body === undefined ? {} : { body }) };
}

async function main(): Promise<void> {
  const context = await githubContext();
  const changedFiles = process.env.PLAN_SYNC_CHANGED_FILES
    ? process.env.PLAN_SYNC_CHANGED_FILES.split(/\r?\n/).filter(Boolean)
    : gitChangedFiles(context.base);
  const commitBody = process.env.PLAN_SYNC_COMMIT_BODY ?? context.body;
  const result = checkPlanSync({
    changedFiles,
    ...(commitBody === undefined ? {} : { commitBody }),
  });
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) await appendFile(outputPath, `plan_exempt_used=${String(result.exemptUsed)}\n`);
  if (result.exemptUsed && process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      '### Plan-sync exemption used\n\n`README.md` changed without `PLAN.md`; `[plan-exempt]` was recorded.\n',
    );
  }
  console.log(
    result.exemptUsed
      ? 'Plan-sync passed with a recorded exemption.'
      : 'Plan-sync verification passed.',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
