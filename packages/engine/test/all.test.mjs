/**
 * The node:test half of the engine suite.
 *
 * Every `.test.mjs` file must be imported here. The engine `test` script runs this runner and then
 * invokes vitest with every `.test.mjs` excluded, so vitest deliberately skips this whole
 * half — a file in this directory that nobody imports below never runs, and it reports nothing:
 * no failure, no warning, just a test that silently stopped existing.
 *
 * That is not hypothetical. `p5-11-contract`, `ai-transport-p5-02`, and `p5-04-csp-security` were
 * all absent from this list, so the adapter contracts for Stability/BFL/fal.ai, the whole transport
 * redaction suite, and the CSP-header check were written but never executed by `pnpm test`. This
 * file is therefore the single source of truth for the `.mjs` half, and
 * `mjs-suite-registration.test.mjs` asserts that every `.test.mjs` here is registered.
 */
import './capabilities.test.mjs';
import './credential-leak.test.mjs';
import './worker-pool.test.mjs';
import './batch.test.mjs';
import './recipe-share.test.mjs';
import './ai-transport-p5-02.test.mjs';
import './p5-04-csp-security.test.mjs';
import './mjs-suite-registration.test.mjs';
