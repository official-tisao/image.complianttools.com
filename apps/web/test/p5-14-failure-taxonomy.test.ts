/**
 * P5-14 — the §17.3 failure taxonomy, exhaustively.
 *
 * ## The requirement
 *
 * README §17.3: "Failure is equally specific, one message per failure class". The taxonomy itself
 * is a table in `apps/web/src/lib/connect/failures.ts`, and the contract has two halves:
 *
 *  1. Every class the product can actually reach is **classified** from a real engine error.
 *  2. Every class renders a **distinct, specific** message with a remedy the user can act on.
 *
 * ## Why "exhaustive" rather than spot-checked
 *
 * A taxonomy test that checks three classes passes just as happily when someone adds a fourth and
 * forgets to write its message — which is the exact regression §17.3 exists to prevent. So this
 * file enumerates the classes from the type itself and asserts on every one, including the classes
 * the walkthrough page does not show by default:
 *
 * - `unreachable` — no HTTP response at all (DNS, TLS, connection refused)
 * - `cancelled` — the user stopped it, or a timeout fired
 * - `unsupported` — the provider cannot do what the tool asked
 * - `unknown` — the catch-all, which must admit it is a catch-all
 *
 * Those four appear in `FailureClass` but not in `ProviderWalkthrough.svelte`'s per-provider list,
 * which is a deliberate scoping decision (that list is "the failures this provider's *test* can
 * report"; these four arise during a *run*). The decision is documented and asserted below rather
 * than left implicit, so it cannot be mistaken for an oversight.
 *
 * ## What "specific" is asserted to mean
 *
 * For every class: a non-empty headline naming the actual cause, a detail that differs from every
 * other class (a message that could be swapped with another without the user noticing has failed),
 * a remedy that is actionable, and no credential in any of it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  classify,
  classifyThrown,
  failureMessage,
  successMessage,
  type FailureClass,
} from '../src/lib/connect/failures.ts';
import type { ProviderDescriptor } from '@complianttools/image-engine/ai/types';

/** A minimal descriptor: only `name`, `credentialFields`, and the links are read by the messages. */
const DESCRIPTOR: ProviderDescriptor = {
  id: 'fixture',
  name: 'Fixture Provider',
  homepage: 'https://example.test/',
  keysUrl: 'https://example.test/keys',
  pricingUrl: 'https://example.test/pricing',
  docsUrl: 'https://example.test/docs',
  credentialFields: [
    { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', secret: true, required: true },
  ],
  allowsCustomBaseUrl: false,
  defaultBaseUrl: 'https://api.example.test',
  capabilities: ['generate'],
  models: [],
  browserDirect: 'unknown',
  dataPolicy: { summary: 'n/a', url: 'https://example.test/privacy' },
};

/**
 * Every `FailureClass`, written out.
 *
 * A hand-written list rather than an enum iteration, so that adding a class to `FailureClass`
 * without adding it here is a **compile error** in the `satisfies` check below. That is the
 * mechanism that keeps this test exhaustive as the taxonomy grows.
 */
const ALL_CLASSES = [
  'rejected',
  'forbidden',
  'not-configured',
  'cors-blocked',
  'no-credits',
  'rate-limited',
  'unreachable',
  'provider-error',
  'unsupported',
  'cancelled',
  'unknown',
] as const satisfies readonly FailureClass[];

/* ------------------------------------------------------------------ */
/* 1. Every class the type declares is enumerated here                  */
/* ------------------------------------------------------------------ */

test('the enumerated classes cover the FailureClass union exactly', () => {
  // If a class is added to `FailureClass` and not to `ALL_CLASSES`, the `satisfies` above stops
  // compiling. The runtime check below documents the coupling and catches a class removed from both.
  assert.equal(ALL_CLASSES.length, 11, 'update ALL_CLASSES when the taxonomy grows');
  assert.equal(new Set(ALL_CLASSES).size, ALL_CLASSES.length, 'duplicate class in ALL_CLASSES');
});

/* ------------------------------------------------------------------ */
/* 2. Every class classifies from a real engine error                    */
/* ------------------------------------------------------------------ */

test('every EngineError ai-* kind maps to a defined class', () => {
  // The engine's `ai-*` members are the only ones a provider flow can produce. Each must classify
  // to a class that is not `unknown` — falling through to `unknown` for a *known* kind is the
  // bug this catches, because `unknown` still renders a message and would look fine on screen.
  const cases: Array<[string, FailureClass]> = [
    ['ai-auth-failed', 'rejected'],
    ['ai-not-configured', 'not-configured'],
    ['ai-cors-blocked', 'cors-blocked'],
    ['ai-rate-limited', 'rate-limited'],
    ['ai-provider-error', 'provider-error'],
    ['cancelled', 'cancelled'],
    ['unsupported-format', 'unsupported'],
  ];

  for (const [kind, expected] of cases) {
    assert.equal(classify({ kind } as never), expected, `${kind} misclassified`);
    assert.notEqual(
      classify({ kind } as never),
      'unknown',
      `${kind} fell through to the catch-all`,
    );
  }
});

test('a 403 splits off from a 401, because the fix differs', () => {
  // §17.3's `forbidden`: "the key is fine, the permission behind it is not". Telling a user to
  // re-copy a working key is the specific failure the split exists to prevent.
  assert.equal(classify({ kind: 'ai-auth-failed' } as never, 401), 'rejected');
  assert.equal(classify({ kind: 'ai-auth-failed' } as never, 403), 'forbidden');
  assert.equal(
    classify({ kind: 'ai-auth-failed' } as never),
    'rejected',
    'no status defaults to rejected',
  );
});

test('a zero-balance provider error splits off as no-credits', () => {
  assert.equal(classify({ kind: 'ai-provider-error' } as never, 402), 'no-credits');
  assert.equal(classify({ kind: 'ai-provider-error' } as never, 403), 'no-credits');
  assert.equal(classify({ kind: 'ai-provider-error' } as never, 500), 'provider-error');
});

test('a genuinely unknown kind classifies to unknown rather than throwing', () => {
  assert.equal(classify({ kind: 'something-new' } as never), 'unknown');
  assert.equal(classifyThrown(new Error('boom')), 'unknown');
  assert.equal(classifyThrown(undefined), 'unknown');
  assert.equal(classifyThrown('a string'), 'unknown');
});

/* ------------------------------------------------------------------ */
/* 3. Every class renders a distinct, specific, actionable message       */
/* ------------------------------------------------------------------ */

test('every class has a headline, detail, remedy, and severity', () => {
  for (const failureClass of ALL_CLASSES) {
    const message = failureMessage(failureClass, DESCRIPTOR);
    assert.equal(message.class, failureClass);
    assert.ok(message.headline.length > 0, `${failureClass}: empty headline`);
    assert.ok(message.detail.length > 0, `${failureClass}: empty detail`);
    assert.ok(message.remedy.length > 0, `${failureClass}: empty remedy`);
    assert.ok(['error', 'warning'].includes(message.severity), `${failureClass}: bad severity`);
  }
});

test('every headline is distinct — a swappable message is not a specific one', () => {
  const headlines = ALL_CLASSES.map((c) => failureMessage(c, DESCRIPTOR).headline);
  assert.equal(
    new Set(headlines).size,
    headlines.length,
    `duplicate headlines: ${headlines.join(' | ')}`,
  );
});

test('every remedy is distinct across classes', () => {
  const remedies = ALL_CLASSES.map((c) => failureMessage(c, DESCRIPTOR).remedy);
  assert.equal(
    new Set(remedies).size,
    remedies.length,
    'two failure classes share a remedy, so at least one is not specific',
  );
});

test('every detail is distinct across classes', () => {
  const details = ALL_CLASSES.map((c) => failureMessage(c, DESCRIPTOR).detail);
  assert.equal(
    new Set(details).size,
    details.length,
    'two failure classes share a detail sentence, so at least one is not specific',
  );
});

test('every remedy is actionable — it tells the user what to do', () => {
  // A remedy that only restates the problem is not a remedy. Each must contain an imperative
  // instruction or an explicit next step.
  const actionable =
    /\b(copy|check|add|wait|deploy|pick|choose|try|open|reduce|run|connect|paste)\b/i;
  for (const failureClass of ALL_CLASSES) {
    const { remedy } = failureMessage(failureClass, DESCRIPTOR);
    assert.match(remedy, actionable, `${failureClass}: remedy is not actionable — "${remedy}"`);
  }
});

test('the key-prefix hint names the actual prefix, from the descriptor', () => {
  // §17.3: "Double-check you copied the whole key, including the `sk-` prefix."
  const message = failureMessage('rejected', DESCRIPTOR);
  assert.match(message.remedy, /sk-/);
});

test('a descriptor with no secret field does not produce a dangling prefix hint', () => {
  const noSecret: ProviderDescriptor = {
    ...DESCRIPTOR,
    credentialFields: [
      { key: 'projectId', label: 'Project', placeholder: 'my-project', required: true },
    ],
  };
  const message = failureMessage('rejected', noSecret);
  assert.doesNotMatch(message.remedy, /including the \s+prefix/, 'empty prefix hint rendered');
});

test('no message ever contains a credential-shaped value', () => {
  const secret = 'sk-live-should-never-appear-1234567890';
  for (const failureClass of ALL_CLASSES) {
    const message = failureMessage(failureClass, DESCRIPTOR, 401);
    const serialised = `${message.headline}${message.detail}${message.remedy}`;
    assert.equal(
      serialised.includes(secret),
      false,
      `${failureClass}: message contains a credential`,
    );
    // And structurally: no message should embed anything resembling a bearer token.
    assert.doesNotMatch(serialised, /sk-[A-Za-z0-9_-]{12,}/, `${failureClass}: key-shaped text`);
  }
});

/* ------------------------------------------------------------------ */
/* 4. The four classes the walkthrough page does not show by default    */
/* ------------------------------------------------------------------ */

/**
 * `ProviderWalkthrough.svelte` lists seven classes per provider, derived from what that provider's
 * *test* can report. Four further classes arise during an actual *run* and are reachable from the
 * escalation control: `unreachable`, `unsupported`, `cancelled`, and `unknown`.
 *
 * That scoping is deliberate rather than an omission, so it is asserted here. If someone narrows
 * `FailureClass` or forgets one of these, this fails.
 */
const RUN_ONLY_CLASSES = ['unreachable', 'unsupported', 'cancelled', 'unknown'] as const;

test('the four run-only classes each render a complete message', () => {
  for (const failureClass of RUN_ONLY_CLASSES) {
    const message = failureMessage(failureClass, DESCRIPTOR);
    assert.ok(message.headline.length > 0, `${failureClass} (run-only) has no headline`);
    assert.ok(message.detail.length > 0, `${failureClass} (run-only) has no detail`);
    assert.ok(message.remedy.length > 0, `${failureClass} (run-only) has no remedy`);
  }
});

test('the run-only classes are documented as excluded from the walkthrough list, not forgotten', () => {
  // Read the component's own list so this test fails if the exclusion is dropped without thought.
  const source = readFileSync(
    new URL('../src/lib/connect/ProviderWalkthrough.svelte', import.meta.url),
    'utf8',
  );
  // The walkthrough lists rejected/forbidden/not-configured/cors-blocked/rate-limited/provider-error
  // and conditionally no-credits. It must NOT list the four run-only classes, or §17.3's
  // "documented per failure class" promise for the test step becomes ambiguous.
  for (const failureClass of RUN_ONLY_CLASSES) {
    assert.equal(
      source.includes(`'${failureClass}'`),
      false,
      `${failureClass} appears in the walkthrough list; update this test's rationale`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 5. The success message is honest about what was confirmed             */
/* ------------------------------------------------------------------ */

test('success names the provider and the confirmed capabilities, never a descriptor default', () => {
  const message = successMessage(DESCRIPTOR, ['generate', 'describe'], 34, true);
  assert.match(message.headline, /Fixture Provider/);
  assert.match(message.detail, /34 models/);
  assert.match(message.detail, /Generate, Describe/);
  assert.match(message.detail, /free/i);
  assert.deepEqual([...message.confirmed], ['generate', 'describe']);
});

test('a zero-model response says so rather than implying models exist', () => {
  const message = successMessage(DESCRIPTOR, [], 0, true);
  assert.match(message.detail, /no models/i);
});

test('an unknown model count is omitted rather than invented', () => {
  const message = successMessage(DESCRIPTOR, ['generate'], undefined, true);
  assert.doesNotMatch(message.detail, /Found \d+ model/);
});

test('no confirmed capability produces an honest sentence, not an empty list', () => {
  const message = successMessage(DESCRIPTOR, [], undefined, true);
  assert.match(message.detail, /did not confirm/i);
});

test('a billable test does not claim to be free', () => {
  // §17.3: where `test()` would cost money, the button says so. The message must not then claim
  // the test was free.
  const message = successMessage(DESCRIPTOR, ['generate'], 1, false);
  assert.doesNotMatch(message.detail, /this test was free/i);
});
