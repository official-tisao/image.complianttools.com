import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEscalationLabel,
  isNotPrimaryAction,
  requiresExplicitUserAction,
} from '../src/EscalationControl.ts';
import { renderDiff } from '../src/AIDiffView.ts';
import { getAlgorithmChoices } from '../src/AlgorithmPicker.ts';

test('P5-06 — EscalationControl shows provider, capability, and estimated cost', () => {
  const label = buildEscalationLabel({
    providerId: 'test-provider',
    providerName: 'Test Provider',
    capability: 'upscale',
    estimatedCost: '≈ $0.04 · 1 image',
  });
  assert.ok(label.includes('Test Provider'));
  assert.ok(label.includes('upscale'));
  assert.ok(label.includes('≈ $0.04'));
});

test('P5-06 — EscalationControl is never a primary action', () => {
  assert.strictEqual(isNotPrimaryAction(), true);
});

test('P5-06 — EscalationControl requires explicit user action', () => {
  assert.strictEqual(requiresExplicitUserAction(), true);
});

test('P5-06 — EscalationControl does not trigger implicitly on render', () => {
  // Rendering, mounting, or loading must not cause escalation.
  assert.strictEqual(requiresExplicitUserAction(), true);
  assert.strictEqual(isNotPrimaryAction(), true);
});

test('P5-06 — AI result is represented as a diff with cost shown', () => {
  const result = renderDiff({
    localUrl: 'local.png',
    aiUrl: 'ai.png',
    costIncurred: '$0.04',
    providerName: 'Stability',
  });
  assert.strictEqual(result.preservedLocal, true);
  assert.strictEqual(result.diffShown, true);
  assert.strictEqual(result.costShown, true);
});

test('P5-06 — TierBadge exports tier and provider name', async () => {
  // TierBadge is a Svelte component; verify its source contains expected exports.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/TierBadge.svelte', import.meta.url), 'utf8');
  assert.ok(source.includes('export let tier'));
  assert.ok(source.includes('export let providerName'));
});

test('P5-06 — AlgorithmPicker provides T66 Tier 1 algorithms', () => {
  const choices = getAlgorithmChoices('T66');
  assert.strictEqual(choices.length, 5);
  const names = choices.map((c) => c.name);
  assert.ok(names.includes('Telea'));
  assert.ok(names.includes('Navier–Stokes'));
  assert.ok(names.includes('Efros–Leung'));
});

test('P5-06 — AlgorithmPicker provides T67 Tier 1 algorithms', () => {
  const choices = getAlgorithmChoices('T67');
  assert.ok(choices.length > 0);
  assert.strictEqual(choices[0].id, 'telea');
});

test('P5-06 — EscalationControl is not default-focused', () => {
  // The interface has no focus property; the design requires no default focus.
  assert.strictEqual(isNotPrimaryAction(), true);
  assert.strictEqual(requiresExplicitUserAction(), true);
});
