import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiagnosticBundle, createSafeLogger, safeErrorMessage } from '../dist/index.js';

test('credential values cannot reach logs, errors, or diagnostic bundles', () => {
  const credentials = ['sk-test-super-secret', 'relay-token-secret'];
  const logs = [];
  const logger = createSafeLogger((message) => logs.push(message), credentials);
  logger({ authorization: `Bearer ${credentials[0]}`, relay: credentials[1] });
  const error = safeErrorMessage(`Provider rejected ${credentials[0]}`, credentials);
  const diagnostic = createDiagnosticBundle({
    appVersion: '0.0.0',
    engineVersion: '0.0.0',
    operation: 'encode',
    errorKind: 'ai-auth-failed',
    capabilities: { webGpu: false },
    credentials,
  });

  const outputs = [...logs, error, diagnostic].join('\n');
  for (const credential of credentials) assert.equal(outputs.includes(credential), false);
  assert.match(outputs, /\[redacted\]/);
  assert.equal(diagnostic.includes('credentials'), false);
});
