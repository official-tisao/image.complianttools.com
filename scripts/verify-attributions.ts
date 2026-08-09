import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { renderLicensesPage } from '../apps/web/licenses-page.mjs';
import { assertRequiredAttributions } from './lib/attributions.js';

const markdown = await readFile(
  path.join(process.cwd(), 'docs', 'THIRD-PARTY-LICENSES.md'),
  'utf8',
);
assertRequiredAttributions(markdown, renderLicensesPage(markdown));
console.log(
  'Verified mandatory IJG attribution in the licence register and rendered /licenses page.',
);
