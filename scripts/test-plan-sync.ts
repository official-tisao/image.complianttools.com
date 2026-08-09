import assert from 'node:assert/strict';

import { checkPlanSync } from './check-plan-sync.js';

assert.throws(
  () => checkPlanSync({ changedFiles: ['README.md', 'packages/engine/src/index.ts'] }),
  /README\.md changed without PLAN\.md/,
);
assert.deepEqual(checkPlanSync({ changedFiles: ['README.md', 'PLAN.md'] }), {
  exemptUsed: false,
  readmeChanged: true,
  planChanged: true,
});
assert.deepEqual(
  checkPlanSync({ changedFiles: ['README.md'], commitBody: 'docs: spelling\n\n[plan-exempt]' }),
  { exemptUsed: true, readmeChanged: true, planChanged: false },
);
console.log('Verified README-only failure, PLAN synchronization, and the logged exemption.');
