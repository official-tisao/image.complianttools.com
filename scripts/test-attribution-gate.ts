import assert from 'node:assert/strict';

import { renderLicensesPage } from '../apps/web/licenses-page.mjs';
import { assertRequiredAttributions, ijgAttribution } from './lib/attributions.js';

const validMarkdown = `This software is based in part on the work of the ${ijgAttribution}.`;
assert.doesNotThrow(() =>
  assertRequiredAttributions(validMarkdown, renderLicensesPage(validMarkdown)),
);
assert.throws(
  () => assertRequiredAttributions('Attribution removed', renderLicensesPage(validMarkdown)),
  /THIRD-PARTY-LICENSES\.md is missing/,
);
assert.throws(
  () => assertRequiredAttributions(validMarkdown, renderLicensesPage('Attribution removed')),
  /rendered \/licenses page is missing/,
);

console.log('Verified that removing either mandatory IJG attribution fails the gate.');
