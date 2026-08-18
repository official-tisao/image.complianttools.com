import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function load() {
  return {
    licences: await readFile(
      path.resolve(process.cwd(), '..', '..', 'docs', 'THIRD-PARTY-LICENSES.md'),
      'utf8',
    ),
  };
}
