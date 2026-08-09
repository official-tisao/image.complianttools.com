import { readFile } from 'node:fs/promises';

import conventional from '@commitlint/config-conventional';
import lint from '@commitlint/lint';

const messageFile = process.argv[2];
const message = messageFile
  ? await readFile(messageFile, 'utf8')
  : await new Promise((resolve, reject) => {
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => (input += chunk));
      process.stdin.on('end', () => resolve(input));
      process.stdin.on('error', reject);
    });

const report = await lint(message.trim(), conventional.rules, {
  defaultIgnores: true,
  helpUrl: 'https://www.conventionalcommits.org/',
});

for (const problem of [...report.errors, ...report.warnings]) {
  console.error(
    `${problem.level === 2 ? 'error' : 'warning'}: ${problem.message} [${problem.name}]`,
  );
}

if (!report.valid) process.exitCode = 1;
